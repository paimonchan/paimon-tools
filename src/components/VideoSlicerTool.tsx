/**
 * VideoSlicerTool — lossless video slicing in the browser.
 *
 * Lazy-loaded ref tool. Uses ffmpeg.wasm (single-threaded core) to losslessly
 * trim an MP4 to a [start, end] range via `-c copy` (stream copy, no re-encode,
 * no quality loss). 100% client-side, video never leaves the device.
 *
 * Flow: drop file → inspect (duration) → preview <video> → set A/B via slider
 * or "set current" → Download (lossless stream copy).
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  Clapperboard,
  Download,
  FileVideo,
  Loader2,
  Pause,
  Play,
  Rewind,
  Scissors,
  Square,
  Video,
  Volume2,
} from 'lucide-react'

import {
  formatTime,
  parseTime,
  validateRange,
  makeSliceFilename,
  formatBytes,
  type TrimRange,
} from '../engine/video-slice'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'
import ResultPreview from './ResultPreview'

// ── Constants ─────────────────────────────────────────

const ACCEPT = 'video/mp4,.mp4,.mov'
const LS_RANGE = 'video-slice-range'

type Status = 'idle' | 'ok' | 'error' | 'processing'

interface VideoInfo {
  name: string
  size: number
  duration: number
  width: number | null
  height: number | null
  hasVideo: boolean
  hasAudio: boolean
}

function loadPersistedRange(): Partial<TrimRange> | null {
  try {
    const raw = localStorage.getItem(`paimon.${LS_RANGE}`)
    return raw ? (JSON.parse(raw) as Partial<TrimRange>) : null
  } catch {
    return null
  }
}

/**
 * Dynamic-import helper with a small retry. GitHub Pages swaps static assets
 * during deployment (~40s window); a module fetch can transiently fail mid-swap
 * even though the file is fine a second later. Retrying avoids surfacing a
 * misleading "Failed to fetch dynamically imported module" to the user.
 */
async function loadVideoMedia() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await import('../lib/video-media')
    } catch (err) {
      if (attempt >= 2) throw err
      await new Promise((r) => setTimeout(r, 800 * attempt))
    }
  }
}

// ── Component ─────────────────────────────────────────

export default function VideoSlicerTool() {
  const toast = useToast()

  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [trimPhase, setTrimPhase] = useState<'loading' | 'slicing'>('loading')
  const [isPlaying, setIsPlaying] = useState(false)
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null)

  // Trim range (seconds). Default [0, 0]; resolved against duration once loaded.
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [startText, setStartText] = useState('00:00')
  const [endText, setEndText] = useState('00:00')

  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [cutPreviewOpen, setCutPreviewOpen] = useState(false)

  // ── Supported? ──────────────────────────────────────
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    // ffmpeg.wasm needs WebAssembly (not WebCodecs). Check fast before importing.
    setSupported(typeof WebAssembly !== 'undefined')
  }, [])

  // ── Load a file ─────────────────────────────────────
  const handleFile = useCallback(
    async (f: File | null | undefined) => {
      if (!f) return
      const isVideo = /\.(mp4|mov)$/i.test(f.name) || f.type.startsWith('video/')
      if (!isVideo) {
        toast.push('Please choose an MP4 or MOV video file.', { variant: 'error' })
        return
      }
      setStatus('processing')
      setError(null)
      setResult(null)
      setProcessing(true)
      try {
        const { inspectVideo } = await loadVideoMedia()
        const meta = await inspectVideo(f)
        if (!meta.hasVideo) {
          setError('No playable video track found in this file.')
          setStatus('error')
          setProcessing(false)
          return
        }

        // Revoke previous preview URL
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        const url = URL.createObjectURL(f)

        setFile(f)
        setInfo(meta)
        setPreviewUrl(url)
        // Default range: try persisted, else full video
        const persisted = loadPersistedRange()
        const s = persisted && typeof persisted.start === 'number' ? persisted.start : 0
        const e = persisted && typeof persisted.end === 'number' ? persisted.end : meta.duration
        setStart(Math.min(s, meta.duration))
        setEnd(Math.min(e, meta.duration))
        setStartText(formatTime(Math.min(s, meta.duration)))
        setEndText(formatTime(Math.min(e, meta.duration)))
        setStatus('ok')
        setError(null)
        toast.push(`${meta.name} loaded · ${formatBytes(meta.size)}`, { variant: 'success' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setStatus('error')
        toast.push(msg, { variant: 'error' })
      } finally {
        setProcessing(false)
      }
    },
    [previewUrl, toast],
  )

  // ── Range setters ───────────────────────────────────
  const clipToDuration = (v: number) => (info ? Math.max(0, Math.min(v, info.duration)) : v)

  const handleStartSlider = (v: number) => {
    const val = clipToDuration(v)
    setStart(val)
    setStartText(formatTime(val))
  }
  const handleEndSlider = (v: number) => {
    const val = clipToDuration(v)
    setEnd(val)
    setEndText(formatTime(val))
  }

  const handleStartTextChange = (t: string) => {
    setStartText(t)
    const n = parseTime(t)
    if (!Number.isNaN(n)) setStart(clipToDuration(n))
  }
  const handleEndTextChange = (t: string) => {
    setEndText(t)
    const n = parseTime(t)
    if (!Number.isNaN(n)) setEnd(clipToDuration(n))
  }

  const setStartFromCurrent = () => {
    const t = videoRef.current?.currentTime ?? 0
    const val = clipToDuration(t)
    setStart(val)
    setStartText(formatTime(val))
    toast.push(`Start set to ${formatTime(val)}`, { variant: 'info' })
  }
  const setEndFromCurrent = () => {
    const t = videoRef.current?.currentTime ?? 0
    const val = clipToDuration(t)
    setEnd(val)
    setEndText(formatTime(val))
    toast.push(`End set to ${formatTime(val)}`, { variant: 'info' })
  }

  // Persist range on change
  useEffect(() => {
    if (!info) return
    try {
      localStorage.setItem(`paimon.${LS_RANGE}`, JSON.stringify({ start, end }))
    } catch {
      /* ignore */
    }
  }, [start, end, info])

  // Keep end >= start when start moves past end
  useEffect(() => {
    if (info && start >= end && end > 0) {
      setEnd(Math.min(info.duration, start + 1))
      setEndText(formatTime(Math.min(info.duration, start + 1)))
    }
  }, [start, end, info])

  // ── Preview controls ────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play()
    } else {
      v.pause()
    }
  }
  const seekToStart = () => {
    const v = videoRef.current
    if (v) v.currentTime = start
  }
  const seekToEnd = () => {
    const v = videoRef.current
    if (v) v.currentTime = end - 0.05
  }
  const toggleCutPreview = () => {
    const v = videoRef.current
    const next = !cutPreviewOpen
    if (v) v.currentTime = start
    if (next) {
      v?.play()
    } else {
      v?.pause()
    }
    setCutPreviewOpen(next)
  }

  // When previewing a cut, stop playback at the B (end) boundary so the user
  // sees exactly the sliced range, not the whole video.
  const handlePreviewTimeUpdate = () => {
    if (!cutPreviewOpen) return
    const v = videoRef.current
    if (v && v.currentTime >= end) {
      v.pause()
      setCutPreviewOpen(false)
      setIsPlaying(false)
    }
  }

  // ── Lossless export ─────────────────────────────────
  const handleExport = async () => {
    if (!file || !info || processing) return
    const validation = validateRange(start, end, info.duration)
    if (!validation.ok) {
      toast.push(validation.error, { variant: 'error' })
      return
    }
    const { range } = validation
    setProcessing(true)
    setStatus('processing')
    setError(null)
    setProgress(0)
    try {
      const { trimVideo } = await loadVideoMedia()
      setTrimPhase('loading')
      const result = await trimVideo(
        file,
        range.start,
        range.end,
        (p) => setProgress(p),
        (phase) => setTrimPhase(phase),
      )
      const filename = makeSliceFilename(file.name, range.start, range.end)
      setResult({ blob: result.blob, filename })
      setStatus('ok')
      toast.push(`Sliced · ${formatBytes(result.size)} · lossless — check preview`, {
        variant: 'success',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      toast.push(`Slice failed: ${msg}`, { variant: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  // ── Drag & drop ─────────────────────────────────────
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  // ── Lossless flag ──────────────────────────────────
  const isLossless = info ? true : false

  // ── Render ──────────────────────────────────────────
  const rangeValid = info ? validateRange(start, end, info.duration).ok : false
  const selectedSecs = info && rangeValid ? end - start : 0

  return (
    <div className="flex h-full flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0])}
      />

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-3 pt-3">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Video Slicer</span>
          {info && (
            <span className="text-[11px] text-ink-500">
              · {info.width && info.height ? `${info.width}×${info.height} ` : ''}
              {formatBytes(info.size)}
              {info.hasAudio && <span className="ml-1 inline-flex items-center gap-0.5"><Volume2 className="h-2.5 w-2.5" />audio</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-honey-300 transition-colors"
          >
            <FileVideo className="h-3 w-3" /> Open
          </button>
          <button
            onClick={() => {
              setFile(null)
              setInfo(null)
              if (previewUrl) URL.revokeObjectURL(previewUrl)
              setPreviewUrl(null)
              setResult(null)
              setError(null)
              setStatus('idle')
              toast.push('Cleared', { variant: 'info' })
            }}
            disabled={!file}
            className="rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-red-400 transition-colors disabled:opacity-40 disabled:hover:text-ink-400"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-3 pb-3">
        {!supported ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md rounded-lg border border-ink-700 bg-ink-900/40 p-6 text-center">
              <Video className="mx-auto mb-3 h-8 w-8 text-ink-500" />
              <p className="text-sm text-ink-300">
                Your browser doesn't support <strong>WebAssembly</strong>, which lossless video
                slicing requires. Try the latest Chrome, Edge, Safari, or Firefox.
              </p>
            </div>
          </div>
        ) : !file ? (
          /* Drop zone / placeholder */
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            className={`m-3 flex h-[calc(100%-1.5rem)] min-h-[18rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 text-center transition-all ${
              dragging
                ? 'border-honey-400 bg-honey-400/5 scale-[1.01]'
                : 'border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30'
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-ink-700 bg-ink-800/50">
              <Scissors className="h-6 w-6 text-honey-400" />
            </div>
            <div className="text-sm">
              <span className="text-ink-200">Drop an MP4 video</span>
              <span className="text-ink-500"> or </span>
              <span className="text-honey-300 underline-offset-2 hover:underline">browse</span>
            </div>
            <div className="max-w-xs text-xs text-ink-500">
              <strong className="text-emerald-400">Lossless</strong> — trims are stream-copied, no
              re-encode, no quality loss. Handled 100% on your device.
            </div>
          </div>
        ) : (
          /* Loaded video: preview + range + export */
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* Preview */}
            <div className="flex items-center justify-center overflow-hidden rounded-lg border border-ink-800 bg-black/40">
              <video
                ref={videoRef}
                src={previewUrl ?? undefined}
                className="max-h-[38vh] w-full object-contain"
                controls={false}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onTimeUpdate={handlePreviewTimeUpdate}
              />
            </div>

            {/* Transport controls */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={seekToStart}
                title="Seek to start (A)"
                className="flex items-center gap-1 rounded-md border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 hover:text-honey-300 transition-colors"
              >
                <Rewind className="h-3 w-3" /> A
              </button>
              <button
                onClick={togglePlay}
                title={isPlaying ? 'Pause' : 'Play'}
                className="flex items-center gap-1 rounded-md border border-ink-700 px-3 py-1 text-[11px] text-ink-200 hover:text-honey-300 transition-colors"
              >
                {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                onClick={seekToEnd}
                title="Seek to end (B)"
                className="flex items-center gap-1 rounded-md border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 hover:text-honey-300 transition-colors"
              >
                B <Rewind className="h-3 w-3 rotate-180" />
              </button>
              <button
                onClick={toggleCutPreview}
                title={cutPreviewOpen ? 'Stop preview' : 'Preview the sliced range'}
                className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                  cutPreviewOpen
                    ? 'border-honey-500/60 bg-honey-500/20 text-honey-300'
                    : 'border-ink-700 text-ink-300 hover:text-honey-300'
                }`}
              >
                {cutPreviewOpen ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {cutPreviewOpen ? 'Stop' : 'Preview cut'}
              </button>
            </div>

            {/* Range controls */}
            <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-ink-500">
                <span>Trim range</span>
                <span className="font-mono text-ink-300">
                  {formatTime(start)} — {formatTime(end)}
                  {rangeValid && <span className="ml-2 text-honey-300">{formatTime(selectedSecs)}</span>}
                </span>
              </div>

              {/* Start row */}
              <div className="flex items-center gap-2 py-1">
                <span className="w-4 text-center text-[11px] font-700 text-honey-400">A</span>
                <input
                  type="range"
                  min={0}
                  max={info ? Math.floor(info.duration) : 0}
                  step={0.1}
                  value={Math.floor(start)}
                  onChange={(e) => handleStartSlider(Number(e.target.value))}
                  className="flex-1 accent-honey-400"
                />
                <input
                  type="text"
                  value={startText}
                  onChange={(e) => handleStartTextChange(e.target.value)}
                  onBlur={() => setStartText(formatTime(start))}
                  className="w-20 rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] text-ink-200 focus:border-honey-500/60 focus:outline-none"
                  aria-label="Start time"
                />
                <button
                  onClick={setStartFromCurrent}
                  title="Set start from current playback position"
                  className="rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400 hover:text-honey-300 transition-colors"
                >
                  set A
                </button>
              </div>

              {/* End row */}
              <div className="flex items-center gap-2 py-1">
                <span className="w-4 text-center text-[11px] font-700 text-honey-400">B</span>
                <input
                  type="range"
                  min={0}
                  max={info ? Math.floor(info.duration) : 0}
                  step={0.1}
                  value={Math.floor(end)}
                  onChange={(e) => handleEndSlider(Number(e.target.value))}
                  className="flex-1 accent-honey-400"
                />
                <input
                  type="text"
                  value={endText}
                  onChange={(e) => handleEndTextChange(e.target.value)}
                  onBlur={() => setEndText(formatTime(end))}
                  className="w-20 rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] text-ink-200 focus:border-honey-500/60 focus:outline-none"
                  aria-label="End time"
                />
                <button
                  onClick={setEndFromCurrent}
                  title="Set end from current playback position"
                  className="rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400 hover:text-honey-300 transition-colors"
                >
                  set B
                </button>
              </div>

              {/* Error */}
              {error && status === 'error' && (
                <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
                  {error}
                </div>
              )}

              {/* Export */}
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleExport}
                  disabled={!rangeValid || processing}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-500 transition-all active:scale-95 ${
                    rangeValid && !processing
                      ? 'bg-honey-500 text-ink-950 hover:bg-honey-400'
                      : 'cursor-not-allowed bg-ink-800 text-ink-500'
                  }`}
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Slice
                    </>
                  )}
                </button>
                <div className="hidden h-5 items-center gap-1.5 sm:flex sm:items-center">
                  {processing ? (
                    trimPhase === 'loading' ? (
                      <span className="text-[11px] text-ink-400">
                        Preparing ffmpeg engine… <Loader2 className="inline h-3 w-3 animate-spin" />
                      </span>
                    ) : (
                      <span className="text-[11px] text-honey-400">
                        Slicing… {Math.round(progress * 100)}%
                      </span>
                    )
                  ) : (
                    <span className="hidden text-[11px] text-emerald-400/80 sm:flex sm:items-center sm:gap-1">
                      <Scissors className="h-3 w-3" />
                      {isLossless ? 'lossless' : ''}
                    </span>
                  )}
                </div>
              </div>

              {result ? (
                <ResultPreview
                  key={result.filename + result.blob.size}
                  kind={processing ? 'loading' : 'video'}
                  blob={processing ? undefined : result.blob}
                  filename={result.filename}
                  phaseLabel={processing ? (trimPhase === 'loading' ? 'Preparing engine…' : `Slicing… ${Math.round(progress * 100)}%`) : undefined}
                  hint="Range is stream-copied losslessly (no re-encode)."
                  reRunLabel="Slice again"
                  onReRun={() => { setResult(null); handleExport() }}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>

      <StatusBar
        inputChars={info ? info.size : 0}
        outputChars={info ? Math.round(selectedSecs) : 0}
        status={status === 'processing' ? 'processing' : !file ? 'empty' : error ? 'error' : 'ok'}
        error={error}
        durationMs={null}
      />
    </div>
  )
}