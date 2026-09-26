/**
 * VideoFpsReducerTool - lower a video's frame rate, in-browser.
 *
 * Lazy-loaded ref tool. Dropping frames is not something you can stream-copy —
 * every surviving frame has to be re-encoded — so like the Resizer this is a
 * real encode, just a shorter one (fewer output frames means less work).
 *
 * Two things the UI refuses to be vague about:
 *   1. The clip keeps its duration and speed. This drops frames; it does not
 *      make slow motion.
 *   2. Frame rate is a weak lever for file size (measured: −23% for half the
 *      frames). When shrinking is the goal, the Resizer does far better, and
 *      the panel says so with a link rather than letting the user find out.
 *
 * 100% client-side: the file never leaves the browser.
 */

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Gauge, Loader2, X } from 'lucide-react'

import { formatBytes } from '../engine/video-slice'
import {
  FPS_SAVING_COPY,
  defaultFpsTarget,
  estimateFpsSeconds,
  estimateFpsSize,
  formatFps,
  makeFpsFilename,
  usableFpsTargets,
} from '../engine/video-fps'
import { formatEstimate } from '../engine/video-resize'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'
import ResultPreview from './ResultPreview'

// ── Constants ─────────────────────────────────────────

const ACCEPT_VIDEO = 'video/mp4,.mp4,.mov'

type Status = 'idle' | 'ok' | 'error' | 'processing'
type Phase = 'idle' | 'loading' | 'probing' | 'encoding'

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

export default function VideoFpsReducerTool() {
  const toast = useToast()

  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  /** Read from the container by ffmpeg — the browser cannot report frame rate. */
  const [sourceFps, setSourceFps] = useState<number | null>(null)
  const [sourceFpsLabel, setSourceFpsLabel] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [phase, setPhase] = useState<Phase>('idle')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [targetFps, setTargetFps] = useState<number | null>(null)
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
  const targets = useMemo(
    () => (sourceFps === null ? [] : usableFpsTargets(sourceFps)),
    [sourceFps],
  )

  const sizeEstimate =
    meta && sourceFps !== null && targetFps !== null
      ? estimateFpsSize(meta.width, meta.height, sourceFps, targetFps, meta.duration)
      : null

  const secondsEstimate =
    meta && targetFps !== null ? estimateFpsSeconds(meta.duration, targetFps, meta.width, meta.height) : 0

  const ready = !!file && !!meta && targetFps !== null && !processing

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
    setSourceFps(null)
    setSourceFpsLabel('')
    setTargetFps(null)
    try {
      const { inspectVideo, probeMergeSpecs } = await loadVideoMedia()
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

      // The frame rate is only knowable from the container itself, so this
      // loads the wasm core — the same cost the Merger pays on drop.
      setPhase('loading')
      const specs = await probeMergeSpecs([f], () => setPhase('probing'))
      const spec = specs[0]
      if (!spec || !spec.fpsNum) {
        // Still usable: no target can be offered, so say so plainly.
        setSourceFps(0)
        setError(
          "Couldn't read this file's frame rate, so there is nothing to reduce. Try MP4 or MOV.",
        )
        setStatus('error')
        return
      }
      const fps = spec.fpsNum / spec.fpsDen
      setSourceFps(fps)
      setSourceFpsLabel(formatFps(spec.fpsNum, spec.fpsDen))

      // Preselect half the source rate — what people mean by "reduce the frame
      // rate" (120 → 60, 60 → 30), so the common case needs no clicks.
      const usable = usableFpsTargets(fps)
      const preferred = defaultFpsTarget(fps, usable)
      setTargetFps(preferred ? preferred.fps : null)
      setStatus('ok')
      toast.push(`${vi.name} loaded · ${formatFps(spec.fpsNum, spec.fpsDen)}`, {
        variant: 'success',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    } finally {
      setPhase('idle')
    }
  }

  const clear = () => {
    setFile(null)
    setMeta(null)
    setSourceFps(null)
    setSourceFpsLabel('')
    setStatus('idle')
    setError(null)
    setProgress(0)
    setTargetFps(null)
    setResult(null)
    toast.push('Cleared', { variant: 'info' })
  }

  // ── Convert ─────────────────────────────────────────
  const handleReduce = async () => {
    if (!ready || !file || !meta || targetFps === null) return
    setProcessing(true)
    setStatus('processing')
    setError(null)
    setProgress(0)
    try {
      const { reduceFps } = await loadVideoMedia()
      const out = await reduceFps(file, {
        targetFps,
        onProgress: (p) => setProgress(p),
        onPhase: (ph) => setPhase(ph === 'loading' ? 'loading' : ph === 'detecting' ? 'probing' : 'encoding'),
      })
      const filename = makeFpsFilename(file.name, targetFps)
      setResult({ blob: out.blob, filename, audioMode: out.audioMode })
      setStatus('ok')
      const saved = meta.size > 0 ? Math.round((1 - out.size / meta.size) * 100) : 0
      toast.push(
        `${targetFps} fps · ${formatBytes(out.size)}${
          saved > 0 ? ` · ${saved}% smaller` : ''
        } — same length, check preview`,
        { variant: 'success' },
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      toast.push(`Frame rate change failed: ${msg}`, { variant: 'error' })
    } finally {
      setProcessing(false)
      setPhase('idle')
    }
  }

  const remainingLabel = (() => {
    if (phase === 'loading') return 'Preparing ffmpeg engine…'
    if (phase === 'probing') return 'Reading audio…'
    const pct = Math.round(progress * 100)
    if (progress > 0.05 && secondsEstimate > 0) {
      const left = Math.max(1, Math.round(secondsEstimate * (1 - progress)))
      return `Encoding… ${pct}% · ${formatEstimate(left)} left`
    }
    return `Encoding… ${pct}%`
  })()

  const busyLabel =
    phase === 'loading'
      ? 'Preparing ffmpeg engine…'
      : phase === 'probing'
        ? 'Reading frame rate…'
        : 'Reading video…'

  const audioHint =
    result?.audioMode === 'copy'
      ? 'audio copied untouched'
      : result?.audioMode === 'aac'
        ? 'audio re-encoded to AAC'
        : 'source had no audio'

  const savingsLine =
    result && meta && meta.size > 0
      ? ` ${Math.round((1 - result.blob.size / meta.size) * 100)}% smaller than the original.`
      : ''

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
          <Gauge className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Video FPS Reducer</span>
          {meta && (
            <span className="text-[11px] text-ink-500">
              · {meta.duration.toFixed(1)}s · {meta.width}×{meta.height}
              {sourceFpsLabel ? ` · ${sourceFpsLabel}` : ''}
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
                {status === 'processing' ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin text-honey-400" />
                ) : (
                  <Gauge className="h-[18px] w-[18px] text-honey-400" />
                )}
              </div>
              {file && meta ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="max-w-[20rem] truncate text-xs text-ink-200">{file.name}</span>
                  <span className="text-[10px] text-ink-500">
                    {meta.width}×{meta.height} · {formatBytes(meta.size)} ·{' '}
                    {meta.duration.toFixed(1)}s
                    {sourceFpsLabel ? ` · ${sourceFpsLabel}` : ''}
                  </span>
                  {targetFps !== null && sourceFps !== null && sourceFps > 0 && (
                    <span className="mt-0.5 inline-block rounded-full bg-honey-500/15 px-2.5 py-0.5 text-[10px] text-honey-300">
                      → {targetFps} fps · same length
                    </span>
                  )}
                  {status === 'processing' && (
                    <span className="text-[10px] text-ink-400">{busyLabel}</span>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-sm text-ink-200">Drop an MP4/MOV video to reduce its fps</div>
                  <div className="max-w-[22rem] text-[10px] leading-snug text-ink-500">
                    Drops frames so the clip plays lighter — the length and the speed stay exactly
                    the same. The picture is re-encoded, so this takes a moment.
                  </div>
                </>
              )}
            </div>

            {/* Settings */}
            {meta && sourceFps !== null && !processing && (
              <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
                {targets.length === 0 ? (
                  <div className="text-[11px] text-ink-400">
                    This clip is already at or below the lowest preset, so there is nothing left to
                    drop. (Measured {sourceFpsLabel || 'an unreadable rate'}.)
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-500 uppercase tracking-wider text-ink-500">
                        Frame rate
                      </span>
                      <div className="inline-flex flex-wrap gap-1">
                        {targets.map((t) => {
                          const active = targetFps === t.fps
                          return (
                            <button
                              key={t.id}
                              onClick={() => setTargetFps(t.fps)}
                              title={t.note}
                              className={`rounded-md border px-2.5 py-1 text-[11px] font-500 transition-colors ${
                                active
                                  ? 'border-honey-400/50 bg-honey-400/15 text-honey-200'
                                  : 'border-ink-700 text-ink-400 hover:text-ink-200'
                              }`}
                            >
                              {t.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {sizeEstimate && targetFps !== null ? (
                      <div className="text-[11px] text-ink-400">
                        <span className="text-ink-200">{sourceFpsLabel}</span>
                        {' → '}
                        <span className="text-ink-200">{targetFps} fps</span>
                        {'. Output ≈ '}
                        <span className="text-ink-200">{formatBytes(sizeEstimate.low)}</span>
                        {' – '}
                        <span className="text-ink-200">{formatBytes(sizeEstimate.high)}</span>
                        {' · '}
                        <span className="text-ink-300">{formatEstimate(secondsEstimate)}</span>
                        <span className="text-ink-600"> (rough — depends on the footage)</span>
                      </div>
                    ) : null}

                    <p className="mt-2 text-[10px] leading-snug text-ink-500">
                      Duration and speed stay exactly the same — frames are dropped, nothing is
                      slowed down. The picture is re-encoded (not lossless); the audio is not
                      touched.
                    </p>

                    {/* Frame rate is a weak lever for size, and saying so here is
                        cheaper than letting the user discover it after the encode. */}
                    <p className="mt-2 rounded-md border border-ink-700 bg-ink-800/40 px-2.5 py-1.5 text-[10px] leading-snug text-ink-400">
                      {FPS_SAVING_COPY}{' '}
                      <a href="/video-resize/" className="underline hover:text-ink-200">
                        Video Resizer
                      </a>
                      . Or shrink this clip first, then drop its frame rate.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Error */}
            {error && status === 'error' && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                {error}
              </div>
            )}

            {/* Action */}
            <div className="mt-auto">
              <button
                onClick={handleReduce}
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
                    <Gauge className="h-4 w-4" />
                    {!file
                      ? 'Reduce frame rate'
                      : sourceFps === null
                        ? 'Reading frame rate…'
                        : targets.length === 0
                          ? 'Already at the lowest rate'
                          : targetFps !== null
                            ? `Drop to ${targetFps} fps`
                            : 'Pick a frame rate'}
                  </>
                )}
              </button>
            </div>

            {result ? (
              <ResultPreview
                kind="video"
                blob={result.blob}
                filename={result.filename}
                hint={`${targetFps} fps · same ${meta?.duration.toFixed(1)}s length · ${audioHint}`}
                reRunLabel="Convert again"
                onReRun={() => {
                  setResult(null)
                  handleReduce()
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
