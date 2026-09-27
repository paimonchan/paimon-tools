/**
 * VideoCompressorTool - hit a target file size, in-browser.
 *
 * The rest of the video family shrinks by proxy: the Resizer drops resolution,
 * the FPS Reducer drops frames, and both leave you to guess what came out. This
 * one takes the size you actually need — the 16 MB WhatsApp ceiling, the 25 MB
 * email limit — and does a real two-pass encode to land under it.
 *
 * What the UI refuses to be vague about:
 *   1. Compressing cannot add quality, only remove it. A file already under the
 *      target is called out instead of quietly made bigger.
 *   2. The output is at MOST the target. Simple footage lands well under it,
 *      because bits are only spent where the picture asks for them.
 *
 * 100% client-side: the file never leaves the browser.
 */

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { ChevronsDownUp, Loader2, X } from 'lucide-react'

import { formatBytes } from '../engine/video-slice'
import {
  COMPRESS_HONESTY_COPY,
  RAISE_HONESTY_COPY,
  estimateCompressBytes,
  estimateCompressSeconds,
  formatKbps,
  formatMbForInput,
  makeCompressFilename,
  planCompression,
  quickTargets,
  targetBytesFromKbps,
  targetBytesFromMb,
  type CompressMode,
  type CompressSource,
} from '../engine/video-compress'
import { formatEstimate } from '../engine/video-resize'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'
import ResultPreview from './ResultPreview'

const ACCEPT_VIDEO = 'video/mp4,.mp4,.mov'
const MB = 1024 * 1024

type Status = 'idle' | 'ok' | 'error' | 'processing'
type Phase = 'idle' | 'loading' | 'probing' | 'pass1' | 'pass2' | 'encoding'

interface VideoMeta {
  duration: number
  size: number
  width: number
  height: number
}

interface ProbeInfo {
  videoKbps: number
  audioKbps: number
  audioCodec: string
  hasAudio: boolean
  fps: number
}

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

export default function VideoCompressorTool() {
  const toast = useToast()

  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  const [probe, setProbe] = useState<ProbeInfo | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [phase, setPhase] = useState<Phase>('idle')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [mode, setMode] = useState<CompressMode>('size')
  /** Kept as text so a half-typed number never snaps to something else. */
  const [sizeMb, setSizeMb] = useState('')
  const [kbps, setKbps] = useState('')
  const [result, setResult] = useState<{
    blob: Blob
    filename: string
    targetBytes: number
    audioMode: string
    direction: 'down' | 'up'
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const [supported, setSupported] = useState(true)
  useEffect(() => {
    setSupported(typeof WebAssembly !== 'undefined')
  }, [])

  // ── Derived ─────────────────────────────────────────
  const src: CompressSource | null = useMemo(() => {
    if (!meta || !probe) return null
    return {
      durationSec: meta.duration,
      sizeBytes: meta.size,
      width: meta.width || null,
      height: meta.height || null,
      fps: probe.fps,
      videoKbps: probe.videoKbps,
      audioKbps: probe.audioKbps,
      audioCodec: probe.audioCodec,
      hasAudio: probe.hasAudio,
    }
  }, [meta, probe])

  const targetBytes = useMemo(() => {
    if (!meta) return 0
    if (mode === 'size') {
      const mb = Number(sizeMb)
      return mb > 0 ? targetBytesFromMb(mb) : 0
    }
    const rate = Number(kbps)
    return rate > 0 ? targetBytesFromKbps(rate, meta.duration) : 0
  }, [mode, sizeMb, kbps, meta])

  const plan = src && targetBytes > 0 ? planCompression(src, targetBytes) : null
  const direction: 'down' | 'up' = plan?.direction ?? 'down'
  const chips = meta ? quickTargets(meta.size) : []
  const ready = !!file && !!plan && !plan.impossible && targetBytes > 0 && !processing
  const bytesEstimate =
    targetBytes > 0 ? estimateCompressBytes(targetBytes, direction) : null
  const secondsEstimate =
    meta && probe
      ? estimateCompressSeconds(meta.duration, probe.fps, meta.width, meta.height, direction)
      : 0

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
    setProbe(null)
    setProgress(0)
    try {
      const { inspectVideo, probeCompressSource } = await loadVideoMedia()
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
      // Bitrates only exist in the container, so this loads the wasm core —
      // the same cost the Merger and the FPS Reducer pay on drop.
      setPhase('loading')
      const p = await probeCompressSource(f)

      // A stream rate the container would not state is derived from the total
      // file size, which is honest enough for a budget and beats showing "—".
      let videoKbps = p.videoKbps
      if (!videoKbps && vi.duration > 0) {
        videoKbps = Math.max(0, Math.round((vi.size * 8) / vi.duration / 1000) - p.audioKbps)
      }
      const fps = p.fpsDen > 0 ? p.fpsNum / p.fpsDen : 30
      setProbe({
        videoKbps,
        audioKbps: p.audioKbps,
        audioCodec: p.audioCodec,
        hasAudio: p.hasAudio,
        fps,
      })

      // Default to half the file — the one target that always makes sense and
      // needs no thinking about the platform's ceiling.
      const half = vi.size / 2
      setMode('size')
      setSizeMb(formatMbForInput(half))
      setKbps(String(Math.max(1, Math.round((videoKbps * 0.5) / 50) * 50)))
      setStatus('ok')
      toast.push(`${vi.name} loaded · ${formatBytes(vi.size)}`, { variant: 'success' })
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
    setProbe(null)
    setStatus('idle')
    setError(null)
    setProgress(0)
    setSizeMb('')
    setKbps('')
    setResult(null)
    toast.push('Cleared', { variant: 'info' })
  }

  // ── Compress ────────────────────────────────────────
  const handleCompress = async () => {
    if (!ready || !file || !meta || !plan || targetBytes <= 0) return
    setProcessing(true)
    setStatus('processing')
    setError(null)
    setProgress(0)
    try {
      const { compressVideo } = await loadVideoMedia()
      const out = await compressVideo(file, {
        videoKbps: plan.videoKbps,
        audioKbps: plan.audioKbps,
        audioMode: plan.audioMode,
        targetBytes,
        direction: plan.direction,
        onProgress: (p) => setProgress(p),
        onPhase: (ph) =>
          setPhase(ph === 'loading' ? 'loading' : ph === 'probing' ? 'probing' : ph),
      })
      const value = mode === 'size' ? Number(sizeMb) : Number(kbps)
      const filename = makeCompressFilename(file.name, mode, value)
      setResult({
        blob: out.blob,
        filename,
        targetBytes,
        audioMode: out.audioMode,
        direction: out.direction,
      })
      setStatus('ok')
      if (out.direction === 'up') {
        // Never phrase this as an improvement: the picture is untouched and the
        // extra bytes are padding.
        toast.push(
          `${formatBytes(out.size)} — padded to hold ${formatKbps(plan.totalKbps)} (filler, picture unchanged)`,
          { variant: 'success' },
        )
      } else {
        const delta = ((out.size - targetBytes) / targetBytes) * 100
        toast.push(
          `${formatBytes(out.size)} — ${
            delta <= 0 ? `${Math.abs(delta).toFixed(1)}% under` : `${delta.toFixed(1)}% over`
          } your ${formatBytes(targetBytes)} target`,
          { variant: delta <= 0 ? 'success' : 'info' },
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      toast.push(`Compression failed: ${msg}`, { variant: 'error' })
    } finally {
      setProcessing(false)
      setPhase('idle')
    }
  }

  const busyLabel =
    phase === 'loading'
      ? 'Preparing ffmpeg engine…'
      : phase === 'probing'
        ? 'Reading bitrate…'
        : phase === 'encoding'
          ? 'Encoding at the target rate…'
          : phase === 'pass1'
            ? 'Pass 1 of 2 — analysing the footage…'
            : phase === 'pass2'
              ? 'Pass 2 of 2 — encoding…'
              : 'Reading video…'

  const remainingLabel = (() => {
    if (phase === 'loading') return 'Preparing ffmpeg engine…'
    if (phase === 'probing') return 'Reading bitrate…'
    const passLabel =
      phase === 'encoding' ? 'single pass' : phase === 'pass2' ? 'pass 2/2' : 'pass 1/2'
    const pct = Math.round(progress * 100)
    if (progress > 0.05 && secondsEstimate > 0) {
      const left = Math.max(1, Math.round(secondsEstimate * (1 - progress)))
      return `Encoding… ${passLabel} · ${pct}% · ${formatEstimate(left)} left`
    }
    return `Encoding… ${passLabel} · ${pct}%`
  })()

  const audioHint =
    result?.audioMode === 'copy'
      ? 'audio copied untouched'
      : result?.audioMode === 'aac'
        ? 'audio re-encoded to AAC'
        : 'no audio in the output'

  /**
   * The result line has to mean different things per direction: shrinking is
   * judged by how far under the ceiling it landed, raising by how close it got
   * to the floor (and never as an improvement).
   */
  const resultHint = (() => {
    if (!result || !meta) return ''
    const dur = meta.duration > 0 ? meta.duration : 1
    const achieved = Math.round((result.blob.size * 8) / dur / 1000)
    const asked = Math.round((result.targetBytes * 8) / dur / 1000)
    if (result.direction === 'up') {
      return `${formatKbps(achieved)} vs ${formatKbps(asked)} asked · picture unchanged · ${audioHint}`
    }
    const delta = ((result.blob.size - result.targetBytes) / result.targetBytes) * 100
    return `${delta <= 0 ? `${Math.abs(delta).toFixed(1)}% under` : `${delta.toFixed(1)}% over`} the ${formatBytes(result.targetBytes)} target · ${audioHint}`
  })()

  const sourceRate = probe
    ? [probe.videoKbps > 0 ? `${formatKbps(probe.videoKbps)} video` : null,
       probe.hasAudio ? `${formatKbps(probe.audioKbps)} audio` : 'no audio']
        .filter(Boolean)
        .join(' · ')
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
          <ChevronsDownUp className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Video Compressor</span>
          {meta && (
            <span className="text-[11px] text-ink-500">
              · {meta.duration.toFixed(1)}s · {meta.width}×{meta.height} · {formatBytes(meta.size)}
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
                  <ChevronsDownUp className="h-[18px] w-[18px] text-honey-400" />
                )}
              </div>
              {file && meta ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="max-w-[20rem] truncate text-xs text-ink-200">{file.name}</span>
                  <span className="text-[10px] text-ink-500">
                    {meta.width}×{meta.height} · {formatBytes(meta.size)} ·{' '}
                    {meta.duration.toFixed(1)}s
                  </span>
                  {sourceRate && (
                    <span className="text-[10px] text-ink-500">source: {sourceRate}</span>
                  )}
                  {plan && !plan.impossible && targetBytes > 0 && (
                    <span className="mt-0.5 inline-block rounded-full bg-honey-500/15 px-2.5 py-0.5 text-[10px] text-honey-300">
                      → ≤ {formatBytes(targetBytes)}
                    </span>
                  )}
                  {status === 'processing' && (
                    <span className="text-[10px] text-ink-400">{busyLabel}</span>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-sm text-ink-200">Drop an MP4/MOV video to compress</div>
                  <div className="max-w-[22rem] text-[10px] leading-snug text-ink-500">
                    Name the size you need — a chat limit, an email ceiling — and it does a
                    two-pass encode to land under it. Ask for a bigger size or a higher bitrate
                    instead and it pads the stream up to hold that floor. Either way the picture is
                    re-encoded on your device, so it takes a moment.
                  </div>
                </>
              )}
            </div>

            {/* Settings */}
            {meta && probe && !processing && (
              <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
                {/* Mode */}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-500 uppercase tracking-wider text-ink-500">
                    Target
                  </span>
                  <div className="inline-flex rounded-md border border-ink-700 p-0.5">
                    {(
                      [
                        { id: 'size' as CompressMode, label: 'File size' },
                        { id: 'bitrate' as CompressMode, label: 'Bitrate' },
                      ]
                    ).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        className={`rounded px-2.5 py-1 text-[11px] font-500 transition-colors ${
                          mode === m.id
                            ? 'bg-honey-400/15 text-honey-200'
                            : 'text-ink-400 hover:text-ink-200'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      value={mode === 'size' ? sizeMb : kbps}
                      onChange={(e) =>
                        mode === 'size' ? setSizeMb(e.target.value) : setKbps(e.target.value)
                      }
                      inputMode="decimal"
                      className="w-24 rounded-md border border-ink-700 bg-ink-950/60 px-2 py-1 text-[11px] text-ink-100 outline-none focus:border-honey-500/60"
                    />
                    <span className="text-[11px] text-ink-400">
                      {mode === 'size' ? 'MB' : 'kbps'}
                    </span>
                  </div>
                </div>

                {/* Quick targets */}
                {mode === 'size' && chips.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {chips.map((c) => {
                      const active = Math.round(targetBytes / 1024) === Math.round(c.bytes / 1024)
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSizeMb(formatMbForInput(c.bytes))}
                          title={c.note}
                          className={`rounded-md border px-2.5 py-1 text-[11px] font-500 transition-colors ${
                            active
                              ? 'border-honey-400/50 bg-honey-400/15 text-honey-200'
                              : 'border-ink-700 text-ink-400 hover:text-ink-200'
                          }`}
                        >
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* The plan */}
                {plan && targetBytes > 0 ? (
                  <div className="text-[11px] text-ink-400">
                    <span className="text-ink-200">{formatBytes(meta.size)}</span>
                    {' → '}
                    {direction === 'up' ? (
                      <span className="text-ink-200">≥ {formatKbps(plan.totalKbps)}</span>
                    ) : (
                      <span className="text-ink-200">≤ {formatBytes(targetBytes)}</span>
                    )}
                    {plan.impossible ? (
                      <span className="text-ink-500"> — not enough room for a video stream.</span>
                    ) : (
                      <>
                        {'. Picture '}
                        <span className="text-ink-200">{formatKbps(plan.videoKbps)}</span>
                        {', audio '}
                        <span className="text-ink-200">
                          {plan.audioMode === 'none' ? 'none' : formatKbps(plan.audioKbps)}
                        </span>
                        {plan.audioMode === 'copy' ? ' (copied)' : plan.audioMode === 'aac' ? ' (re-encoded)' : ''}
                        {'. Output '}
                        <span className="text-ink-200">
                          {bytesEstimate ? formatBytes(bytesEstimate.low) : '—'}
                        </span>
                        {' – '}
                        <span className="text-ink-200">
                          {direction === 'up'
                            ? formatBytes(bytesEstimate?.high ?? targetBytes)
                            : `≤ ${formatBytes(targetBytes)}`}
                        </span>
                        {' · '}
                        <span className="text-ink-300">{formatEstimate(secondsEstimate)}</span>
                        <span className="text-ink-600">
                          {direction === 'up' ? ' (single pass, CBR padding)' : ' (two passes)'}
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-ink-500">Enter a target to see the plan.</div>
                )}

                {/* Warnings, verbatim from the engine */}
                {plan?.notes.map((n) => (
                  <p
                    key={n}
                    className="mt-2 rounded-md border border-honey-600/30 bg-honey-500/5 px-2.5 py-1.5 text-[10px] leading-snug text-honey-200/90"
                  >
                    {n}
                  </p>
                ))}

                <p className="mt-2 text-[10px] leading-snug text-ink-500">
                  {direction === 'up' ? RAISE_HONESTY_COPY : COMPRESS_HONESTY_COPY}
                  {direction === 'down' ? (
                    <>
                      {' '}
                      The output is <strong>at most</strong> your target — simple footage can land
                      well under it, because bits are only spent where the picture asks for them.
                    </>
                  ) : null}
                </p>

                <p className="mt-2 rounded-md border border-ink-700 bg-ink-800/40 px-2.5 py-1.5 text-[10px] leading-snug text-ink-400">
                  A very tight target on a big frame is cheaper to reach by shrinking the picture
                  first —{' '}
                  <a href="/video-resize/" className="underline hover:text-ink-200">
                    Video Resizer
                  </a>{' '}
                  then compress, or drop frames with{' '}
                  <a href="/video-fps/" className="underline hover:text-ink-200">
                    Video FPS Reducer
                  </a>
                  .
                </p>
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
                onClick={handleCompress}
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
                    <ChevronsDownUp className="h-4 w-4" />
                    {!file
                      ? 'Compress video'
                      : !probe
                        ? 'Reading bitrate…'
                        : !targetBytes
                          ? 'Enter a target'
                          : plan?.impossible
                            ? 'Target too small'
                            : direction === 'up'
                              ? `Re-encode at ${formatKbps(plan?.totalKbps ?? 0)}`
                              : `Compress to ≤ ${formatBytes(targetBytes)}`}
                  </>
                )}
              </button>
            </div>

            {result ? (
              <ResultPreview
                kind="video"
                blob={result.blob}
                filename={result.filename}
                hint={resultHint}
                reRunLabel="Compress again"
                onReRun={() => {
                  setResult(null)
                  handleCompress()
                }}
              />
            ) : null}
          </div>
        )}
      </div>

      <StatusBar
        inputChars={file?.size ?? 0}
        outputChars={result?.blob.size ?? 0}
        wasmLabel="ffmpeg.wasm"
        status={status === 'processing' ? 'processing' : !file ? 'empty' : error ? 'error' : 'ok'}
        error={error}
        durationMs={null}
      />
    </div>
  )
}
