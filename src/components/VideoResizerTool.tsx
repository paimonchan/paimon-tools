/**
 * VideoResizerTool - downscale a video's resolution, in-browser.
 *
 * Lazy-loaded ref tool, and the only video tool here that re-encodes: changing
 * resolution means decoding every frame, scaling it and encoding it again with
 * libx264. The wasm core is single-threaded (GitHub Pages can't send the
 * COOP/COEP headers SharedArrayBuffer needs), so this is slow — roughly 2-3x
 * the clip length. The UI therefore sets expectations up front with a size and
 * time estimate instead of leaving the user staring at a spinner.
 * 100% client-side.
 */

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Loader2, Scaling, X } from 'lucide-react'

import { formatBytes } from '../engine/video-slice'
import {
  QUALITY_MODES,
  RESOLUTION_PRESETS,
  computeTargetSize,
  encodingFor,
  estimateResizeSeconds,
  estimateResizeSize,
  formatEstimate,
  makeResizeFilename,
  type ResizeQuality,
} from '../engine/video-resize'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'
import ResultPreview from './ResultPreview'

// ── Constants ─────────────────────────────────────────

const ACCEPT_VIDEO = 'video/mp4,.mp4,.mov'

/** Above this, warn hard: the encode will feel broken-slow. */
const SLOW_SECONDS = 60

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

interface VideoMeta {
  duration: number
  size: number
  width: number
  height: number
}

// ── Component ─────────────────────────────────────────

export default function VideoResizerTool() {
  const toast = useToast()

  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'detecting' | 'encoding'>('encoding')
  const [shortSide, setShortSide] = useState<number | null>(null)
  const [quality, setQuality] = useState<ResizeQuality>('balanced')
  const [result, setResult] = useState<{ blob: Blob; filename: string; audioMode: string } | null>(
    null,
  )

  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  // ── Support ─────────────────────────────────────────
  const [supported, setSupported] = useState(true)
  useEffect(() => {
    setSupported(typeof WebAssembly !== 'undefined')
  }, [])

  // ── Derived ─────────────────────────────────────────
  const sourceShortSide = meta ? Math.min(meta.width, meta.height) : null

  /** Presets that would actually shrink this file (no upscaling). */
  const usablePresets = useMemo(
    () =>
      RESOLUTION_PRESETS.filter(
        (p) => sourceShortSide === null || p.shortSide < sourceShortSide,
      ),
    [sourceShortSide],
  )

  const target =
    meta && shortSide !== null ? computeTargetSize(meta.width, meta.height, shortSide) : null
  const outputSize = target?.ok ? { width: target.width, height: target.height } : null

  const encoding = encodingFor(quality)

  const sizeEstimate = outputSize
    ? estimateResizeSize(outputSize.width, outputSize.height, 30, meta?.duration ?? 0, encoding.crf)
    : null

  const secondsEstimate = outputSize
    ? estimateResizeSeconds(meta?.duration ?? 0, quality, outputSize.width, outputSize.height)
    : 0

  const isSlow = secondsEstimate > SLOW_SECONDS
  const ready = !!file && !!meta && !!outputSize && status !== 'processing' && !processing

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
      const { inspectVideo } = await loadVideoMedia()
      const vi = await inspectVideo(f)
      if (!vi.hasVideo) {
        setError('That file has no playable video track.')
        setStatus('error')
        return
      }
      const width = vi.width ?? 0
      const height = vi.height ?? 0
      setFile(f)
      setMeta({ duration: vi.duration, size: vi.size, width, height })

      // Preselect the largest preset that still shrinks the video (usually 720p
      // for a 1080p source) so the common case needs no clicks.
      const auto = RESOLUTION_PRESETS.find(
        (p) => p.shortSide < Math.min(width, height) && p.shortSide <= 720,
      )
      setShortSide(auto ? auto.shortSide : null)
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
    setResult(null)
    setShortSide(null)
    toast.push('Cleared', { variant: 'info' })
  }

  // ── Resize ──────────────────────────────────────────
  const handleResize = async () => {
    if (!ready || !file || !meta || !outputSize || shortSide === null) return
    setProcessing(true)
    setStatus('processing')
    setError(null)
    setProgress(0)
    try {
      const { resizeVideo } = await loadVideoMedia()
      const out = await resizeVideo(file, {
        width: outputSize.width,
        height: outputSize.height,
        preset: encoding.preset,
        crf: encoding.crf,
        onProgress: (p) => setProgress(p),
        onPhase: (ph) => setPhase(ph),
      })
      const filename = makeResizeFilename(file.name, shortSide)
      setResult({ blob: out.blob, filename, audioMode: out.audioMode })
      setStatus('ok')
      const saved = meta.size > 0 ? Math.round((1 - out.size / meta.size) * 100) : 0
      toast.push(
        `Resized to ${outputSize.width}×${outputSize.height} · ${formatBytes(out.size)}${
          saved > 0 ? ` · ${saved}% smaller` : ''
        } — check preview`,
        { variant: 'success' },
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      toast.push(`Resize failed: ${msg}`, { variant: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  // Remaining-seconds estimate from real progress once encoding is underway.
  const remainingLabel = (() => {
    if (phase === 'loading') return 'Preparing ffmpeg engine…'
    if (phase === 'detecting') return 'Reading audio…'
    const pct = Math.round(progress * 100)
    if (progress > 0.05 && secondsEstimate > 0) {
      const left = Math.max(1, Math.round((secondsEstimate * (1 - progress)) / 1))
      return `Encoding… ${pct}% · ${formatEstimate(left)} left`
    }
    return `Encoding… ${pct}%`
  })()

  const audioHint =
    result?.audioMode === 'copy'
      ? 'Audio copied untouched.'
      : result?.audioMode === 'aac'
        ? 'Audio re-encoded to AAC.'
        : 'Source had no audio.'

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
          <Scaling className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Video Resizer</span>
          {meta && (
            <span className="text-[11px] text-ink-500">
              · {meta.duration.toFixed(1)}s · {meta.width}×{meta.height}
            </span>
          )}
        </div>
        <button
          onClick={clear}
          disabled={!file}
          className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-red-400 transition-colors disabled:opacity-40 disabled:hover:text-ink-400"
        >
          <X className="h-3 w-3" /> Clear
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
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
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
              className={`flex flex-1 min-h-[9rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center transition-all ${
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
                <Scaling className="h-[18px] w-[18px] text-honey-400" />
              </div>
              {file && meta ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="max-w-[20rem] truncate text-xs text-ink-200">{file.name}</span>
                  <span className="text-[10px] text-ink-500">
                    {meta.width}×{meta.height} · {formatBytes(meta.size)} ·{' '}
                    {meta.duration.toFixed(1)}s
                  </span>
                  {outputSize && (
                    <span className="mt-0.5 inline-block rounded-full bg-honey-500/15 px-2.5 py-0.5 text-[10px] text-honey-300">
                      → {outputSize.width}×{outputSize.height}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-sm text-ink-200">Drop an MP4/MOV video to shrink</div>
                  <div className="max-w-[20rem] text-[10px] leading-snug text-ink-500">
                    Downscales the resolution and re-encodes the video, which makes the file
                    much smaller. This is a real re-encode — slower than our other video tools.
                  </div>
                </>
              )}
            </div>

            {/* Settings */}
            {meta && !processing && (
              <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-500 uppercase tracking-wider text-ink-500">
                    Resolution
                  </span>
                  <div className="inline-flex flex-wrap gap-1">
                    {RESOLUTION_PRESETS.map((p) => {
                      const usable = usablePresets.some((u) => u.id === p.id)
                      const active = shortSide === p.shortSide
                      return (
                        <button
                          key={p.id}
                          onClick={() => usable && setShortSide(p.shortSide)}
                          disabled={!usable}
                          title={
                            usable
                              ? p.note
                              : `Source is already ${sourceShortSide}p or smaller — can't upscale`
                          }
                          className={`rounded-md border px-2.5 py-1 text-[11px] font-500 transition-colors ${
                            active
                              ? 'border-honey-400/50 bg-honey-400/15 text-honey-200'
                              : usable
                                ? 'border-ink-700 text-ink-400 hover:text-ink-200'
                                : 'cursor-not-allowed border-ink-800 text-ink-600'
                          }`}
                        >
                          {p.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-500 uppercase tracking-wider text-ink-500">
                    Quality
                  </span>
                  <div className="inline-flex flex-wrap gap-1">
                    {QUALITY_MODES.map((q) => (
                      <button
                        key={q.id}
                        onClick={() => setQuality(q.id)}
                        title={q.note}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-500 transition-colors ${
                          quality === q.id
                            ? 'border-honey-400/50 bg-honey-400/15 text-honey-200'
                            : 'border-ink-700 text-ink-400 hover:text-ink-200'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>

                {outputSize && sizeEstimate ? (
                  <div className="text-[11px] text-ink-400">
                    Output ≈ <span className="text-ink-200">{formatBytes(sizeEstimate.low)}</span>
                    {' – '}
                    <span className="text-ink-200">{formatBytes(sizeEstimate.high)}</span>
                    {' · '}
                    <span className="text-ink-300">{formatEstimate(secondsEstimate)}</span>
                    <span className="text-ink-600"> (rough — depends on the footage)</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-ink-500">
                    Pick a resolution smaller than {sourceShortSide}p.
                  </div>
                )}

                {isSlow && (
                  <p className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-amber-300">
                    <strong>Heavy job:</strong> this {Math.round(meta.duration)}s video needs a
                    full re-encode and will take {formatEstimate(secondsEstimate)}. Longer clips
                    take proportionally longer — trimming it first with{' '}
                    <a href="/video-slice/" className="underline hover:text-amber-200">
                      Video Slicer
                    </a>{' '}
                    is much faster.
                  </p>
                )}
              </div>
            )}

            {/* Error */}
            {error && status === 'error' && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                {error}
              </div>
            )}

            {/* Resize button */}
            <div className="mt-auto">
              <button
                onClick={handleResize}
                disabled={!ready}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-500 transition-all active:scale-95 ${
                  ready
                    ? 'bg-honey-500 text-ink-950 hover:bg-honey-400'
                    : 'cursor-not-allowed bg-ink-800 text-ink-500'
                }`}
                aria-disabled={!ready}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {remainingLabel}
                  </>
                ) : (
                  <>
                    <Scaling className="h-4 w-4" />
                    {!file
                      ? 'Resize & Download'
                      : !outputSize
                        ? 'Pick a smaller resolution'
                        : `Resize to ${outputSize.width}×${outputSize.height}`}
                  </>
                )}
              </button>
            </div>

            {result ? (
              <ResultPreview
                kind="video"
                blob={result.blob}
                filename={result.filename}
                hint={`Resized to ${outputSize?.width}×${outputSize?.height} · ${audioHint}`}
                reRunLabel="Resize again"
                onReRun={() => {
                  setResult(null)
                  handleResize()
                }}
              />
            ) : null}
          </div>
        )}
      </div>

      <StatusBar
        inputChars={file?.size ?? 0}
        outputChars={result?.blob.size ?? sizeEstimate?.high ?? 0}
        wasmLabel="ffmpeg.wasm"
        status={status === 'processing' ? 'processing' : !file ? 'empty' : error ? 'error' : 'ok'}
        error={error}
        durationMs={null}
      />
    </div>
  )
}
