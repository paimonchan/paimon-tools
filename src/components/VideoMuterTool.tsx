/**
 * VideoMuterTool - remove the audio track from a video, in-browser.
 *
 * Lazy-loaded ref tool. Uses ffmpeg.wasm (single-threaded core) to strip
 * audio with `-an -c:v copy` — video is stream-copied, never re-encoded.
 * Gate (per proposal 014): H.264 video only; input already silent → disable.
 * 100% client-side.
 */

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Loader2, VolumeX, X } from 'lucide-react'

import { formatBytes } from '../engine/video-slice'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'
import ResultPreview from './ResultPreview'

// ── Constants ─────────────────────────────────────────

const ACCEPT_VIDEO = 'video/mp4,.mp4,.mov'

type Status = 'idle' | 'ok' | 'error' | 'processing'

/** Retry dynamic import — GH Pages swaps assets during deploy (~40s window). */
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

export default function VideoMuterTool() {
  const toast = useToast()

  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<{
    duration: number
    size: number
    hasAudio: boolean
    codec: string | null
  } | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [mutePhase, setMutePhase] = useState<'loading' | 'muting'>('muting')
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  // ── Support ─────────────────────────────────────────
  const [supported, setSupported] = useState(true)
  useEffect(() => {
    setSupported(typeof WebAssembly !== 'undefined')
  }, [])

  // ── Handlers ────────────────────────────────────────
  const onSelect = async (f: File | null | undefined) => {
    if (!f) return
    if (!/\.(mp4|mov)$/i.test(f.name) && !f.type.startsWith('video/')) {
      toast.push('Please choose an MP4 or MOV video.', { variant: 'error' })
      return
    }
    setStatus('processing')
    setError(null)
    setResult(null)
    try {
      const { inspectVideo, detectVideoCodec } = await loadVideoMedia()
      const vi = await inspectVideo(f)
      if (!vi.hasVideo) {
        setError('That file has no playable video track.')
        setStatus('error')
        return
      }
      const codec = await detectVideoCodec(f)
      setFile(f)
      setMeta({
        duration: vi.duration,
        size: vi.size,
        hasAudio: vi.hasAudio,
        codec,
      })
      setStatus('ok')
      toast.push(`${vi.name} loaded`, { variant: 'success' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  const clear = () => {
    setFile(null)
    setMeta(null)
    setStatus('idle')
    setError(null)
    setProgress(0)
    toast.push('Cleared', { variant: 'info' })
  }

  // ── Derived state ───────────────────────────────────
  const hasAudio = meta?.hasAudio ?? false
  const isCodecOk = meta?.codec === 'h264'
  const canMute = !!file && !!meta && status === 'ok' && hasAudio && isCodecOk && !processing

  // Estimate: output ≈ video stream only (audio stripped ≈ 20–40% smaller).
  const estimateBytes =
    meta && hasAudio && isCodecOk
      ? Math.round(meta.size * 0.35)
      : null

  // ── Mute ────────────────────────────────────────────
  const handleMute = async () => {
    if (!canMute || !file) return
    setProcessing(true)
    setStatus('processing')
    setError(null)
    setProgress(0)
    try {
      const { muteVideo } = await loadVideoMedia()
      const result = await muteVideo(file, {
        onProgress: (p) => setProgress(p),
        onPhase: (ph) => setMutePhase(ph),
      })
      const dot = file.name.lastIndexOf('.')
      const base = dot > 0 ? file.name.slice(0, dot) : file.name
      const filename = `${base}-muted.mp4`
      setResult({ blob: result.blob, filename })
      setStatus('ok')
      toast.push(
        `Muted · ${formatBytes(result.size)} · audio removed — check preview`,
        { variant: 'success' },
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      toast.push(`Mute failed: ${msg}`, { variant: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  const phaseLabel =
    mutePhase === 'loading'
      ? 'Preparing ffmpeg engine…'
      : `Muting… ${Math.round(progress * 100)}%`

  // ── Render ──────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_VIDEO}
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0])}
      />

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-3 pt-3">
        <div className="flex items-center gap-2">
          <VolumeX className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Video Muter</span>
          {meta && (
            <span className="text-[11px] text-ink-500">
              · {meta.duration.toFixed(1)}s
            </span>
          )}
        </div>
        <button
          onClick={clear}
          disabled={!file}
          className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-red-400 transition-colors disabled:opacity-40 disabled:hover:text-ink-400"
        >
          <VolumeX className="h-3 w-3 rotate-45" /> Clear
        </button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-3 pb-3">
        {!supported ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md rounded-lg border border-ink-700 bg-ink-900/40 p-6 text-center">
              <X className="mx-auto mb-3 h-8 w-8 text-ink-500" />
              <p className="text-sm text-ink-300">
                Your browser doesn't support <strong>WebAssembly</strong>, which this tool
                requires. Try the latest Chrome, Edge, Safari, or Firefox.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e: DragEvent<HTMLInputElement>) => {
                e.preventDefault()
                setDragging(false)
                onSelect(e.dataTransfer.files?.[0])
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  inputRef.current?.click()
                }
              }}
              className={`flex flex-1 min-h-[10rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center transition-all ${
                file
                  ? 'border-ink-600 bg-ink-800/30'
                  : dragging
                    ? 'border-honey-400 bg-honey-400/5 scale-[1.01]'
                    : 'border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30'
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                  file ? 'border-ink-600 bg-ink-800/60' : 'border-ink-700 bg-ink-800/50'
                }`}
              >
                <VolumeX className="h-[18px] w-[18px] text-honey-400" />
              </div>
              {file && meta ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="max-w-[20rem] truncate text-xs text-ink-200">
                    {file.name}
                  </span>
                  <span className="text-[10px] text-ink-500">
                    {formatBytes(meta.size)} · {meta.duration.toFixed(1)}s
                  </span>
                  {/* Status badge */}
                  <span
                    className={`mt-0.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] ${
                      !hasAudio
                        ? 'bg-ink-700 text-ink-400'
                        : !isCodecOk
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-emerald-500/15 text-emerald-400'
                    }`}
                  >
                    {!hasAudio
                      ? 'Already silent — no audio'
                      : !isCodecOk
                        ? `Codec: ${meta.codec?.toUpperCase() ?? '?'} — only H.264 supported`
                        : 'Audio track: will be removed'}
                  </span>
                  {estimateBytes && (
                    <span className="text-[10px] text-ink-500">
                      {formatBytes(meta.size)} → est. {formatBytes(estimateBytes)}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-sm text-ink-200">
                    Drop an MP4/MOV video to remove its audio
                  </div>
                  <div className="max-w-[18rem] text-[10px] leading-snug text-ink-500">
                    The video stream is kept losslessly (stream-copied, never re-encoded).
                    Supports H.264 video.
                  </div>
                </>
              )}
            </div>

            {/* Error */}
            {error && status === 'error' && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                {error}
              </div>
            )}

            {/* Mute button */}
            <div className="mt-auto">
              <button
                onClick={handleMute}
                disabled={!canMute}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-500 transition-all active:scale-95 ${
                  canMute
                    ? 'bg-honey-500 text-ink-950 hover:bg-honey-400'
                    : 'cursor-not-allowed bg-ink-800 text-ink-500'
                }`}
                aria-disabled={!canMute}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {phaseLabel}
                  </>
                ) : (
                  <>
                    <VolumeX className="h-4 w-4" />
                    {!file
                      ? 'Mute & Download'
                      : !hasAudio
                        ? 'Already silent'
                        : !isCodecOk
                          ? 'Unsupported codec'
                          : 'Mute & Download'}
                  </>
                )}
              </button>
            </div>

            {result ? (
              <ResultPreview
                kind={processing ? 'loading' : 'video'}
                blob={processing ? undefined : result.blob}
                filename={result.filename}
                phaseLabel={processing ? (mutePhase === 'loading' ? 'Preparing engine…' : `Muting… ${Math.round(progress)}%`) : undefined}
                hint="Video kept losslessly (stream-copied), audio removed."
                reRunLabel="Mute again"
                onReRun={() => { setResult(null); handleMute() }}
              />
            ) : null}
          </div>
        )}
      </div>

      <StatusBar
        inputChars={file?.size ?? 0}
        outputChars={estimateBytes ?? 0}
        wasmLabel="ffmpeg.wasm"
        status={status === 'processing' ? 'processing' : !file ? 'empty' : error ? 'error' : 'ok'}
        error={error}
        durationMs={null}
      />
    </div>
  )
}