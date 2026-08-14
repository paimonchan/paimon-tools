/**
 * VideoMergerTool — combine multiple videos into one, losslessly in-browser.
 *
 * Lazy-loaded ref tool. Uses ffmpeg.wasm (single-threaded core) to losslessly
 * concatenate MP4s that share the same stream specs via the concat demuxer:
 *   -f concat -safe 0 -i concat_list.txt -c copy -fflags +genpts
 * (stream copy, no re-encode). 100% client-side, videos never leave device.
 *
 * Flow: drop ≥2 files → probe specs (lazy wasm) → show per-file spec + detect
 * mismatch → if all match, Merge (lossless concat). Mismatch blocks the merge
 * with a clear field-level explanation.
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  ArrowUp,
  ArrowDown,
  Combine,
  Download,
  FileVideo,
  Loader2,
  Merge,
  Video,
  X,
} from 'lucide-react'

import {
  checkCompatibility,
  sanitizeFsName,
} from '../engine/video-merge'
import type { SpecMismatch, VideoSpec } from '../engine/video-merge'
import { formatBytes } from '../engine/video-slice'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'

// ── Constants ─────────────────────────────────────────

const ACCEPT = 'video/mp4,.mp4,.mov'
const LS_ORDER = 'video-merge-order'
/** Soft warning / hard block thresholds (total input bytes) — see DEC-015. */
const SOFT_SIZE_LIMIT = 512 * 1024 * 1024
const HARD_SIZE_LIMIT = 1024 * 1024 * 1024

type Status = 'idle' | 'ok' | 'error' | 'processing'
type MergePhase = 'loading' | 'probing' | 'writing' | 'concatenating'

interface QueuedFile {
  file: File
  spec: VideoSpec | null
  mismatch: SpecMismatch[] | null
}

/** Same helper the slicer uses — imported from engine (pure). */

// ── Component ─────────────────────────────────────────

export default function VideoMergerTool() {
  const toast = useToast()

  const [files, setFiles] = useState<QueuedFile[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [mergePhase, setMergePhase] = useState<MergePhase>('loading')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [probed, setProbed] = useState(false)

  // ── Support ─────────────────────────────────────────
  const [supported, setSupported] = useState(true)
  useEffect(() => {
    setSupported(typeof WebAssembly !== 'undefined')
  }, [])

  // ── Add files ───────────────────────────────────────
  const addFiles = useCallback(
    async (incoming: FileList | File[] | null) => {
      if (!incoming || incoming.length === 0) return
      const list = Array.from(incoming)
      // Only keep MP4/MOV video files.
      const ok = list.filter(
        (f) => /\.(mp4|mov)$/i.test(f.name) || f.type.startsWith('video/'),
      )
      const rejected = list.length - ok.length
      if (rejected > 0) {
        toast.push(`${rejected} non-video file(s) ignored.`, { variant: 'info' })
      }
      if (ok.length === 0) {
        toast.push('Please choose MP4 or MOV video files.', { variant: 'error' })
        return
      }

      setStatus('processing')
      setError(null)

      // Probe every new file's full spec (loads ffmpeg core lazily if needed).
      try {
        const { probeMergeSpecs } = await import('../lib/video-media')
        setMergePhase('probing')
        const newFiles = [...files]
        const startIdx = newFiles.length

        // Probe the NEW files (incoming) — sequential inside probeMergeSpecs.
        const specs = await probeMergeSpecs(ok.map((f) => f))
        const queued = ok.map((f, i) => ({
          file: f,
          spec: specs[i],
          mismatch: null as SpecMismatch[] | null,
        }))

        // Keep existing files, then append new ones.
        const all = [...newFiles, ...queued].filter((x) => x.spec !== null)
        const removed = (newFiles.length + queued.length) - all.length
        setFiles(all)

        if (all.length < 2) {
          setStatus('ok')
          setProbed(true)
          if (removed > 0 || queued.some((q) => !q.spec)) {
            toast.push('Some files could not be read as video.', { variant: 'error' })
            setError('One or more files could not be read as MP4/MOV video.')
            setStatus('error')
          } else {
            toast.push('Add at least 2 videos to merge.', { variant: 'info' })
          }
          return
        }

        // Re-run compatibility over the whole list (in case a new file causes it).
        classify(all, startIdx)
        setProbed(true)
        setStatus('ok')
        toast.push(`${queued.length} video(s) added · ${startIdx ? 'order preserved' : ''}`, {
          variant: 'success',
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setStatus('error')
        toast.push(`Could not read videos: ${msg}`, { variant: 'error' })
      } finally {
        setProcessing(false)
      }
    },
    [files, toast],
  )

  const classify = useCallback(
    (list: QueuedFile[], changedFromIdx = 0) => {
      // Build MergableFile[] for the engine check.
      const mergable = list.map((q) => ({
        name: q.file.name,
        spec: q.spec!,
        duration: 0,
        size: q.file.size,
      }))
      const check = checkCompatibility(mergable)
      const next = list.map((q, i) => {
        if (i < changedFromIdx) return q
        let mismatch: SpecMismatch[] | null = null
        if (check.ok === false) mismatch = check.mismatches[String(i)] ?? null
        return { ...q, mismatch }
      })
      setFiles(next)
      return check
    },
    [],
  )

  // ── Mutations ───────────────────────────────────────
  const removeAt = (i: number) => {
    const next = files.filter((_, idx) => idx !== i)
    setFiles(next)
    if (next.length < 2) {
      setProbed(false)
      setStatus('ok')
    } else {
      classify(next)
    }
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= files.length) return
    // Reorder and re-classify (mismatch is keyed by index → must refresh).
    const next = [...files]
    ;[next[i], next[j]] = [next[j], next[i]]
    setFiles(next)
    classify(next)
  }

  // Persist the file order (names only) so a reload can hint the order.
  useEffect(() => {
    try {
      localStorage.setItem(`paimon.${LS_ORDER}`, JSON.stringify(files.map((f) => f.file.name)))
    } catch {
      /* ignore */
    }
  }, [files])

  // ── Merge ───────────────────────────────────────────
  const isReady = files.length >= 2 && files.every((f) => f.spec && !f.mismatch)

  const handleMerge = async () => {
    if (!isReady || processing) return
    setProcessing(true)
    setStatus('processing')
    setError(null)
    setProgress(0)
    try {
      const { mergeVideos, downloadBlob } = await import('../lib/video-media')
      const input = files.map((q, i) => ({
        file: q.file,
        fsName: sanitizeFsName(q.file.name, i),
      }))
      const result = await mergeVideos(
        input,
        (p) => setProgress(p),
        (phase) => setMergePhase(phase),
      )
      const filename = `merged-${Date.now()}.mp4`
      downloadBlob(result.blob, filename)
      setStatus('ok')
      toast.push(`Merged ${files.length} videos · ${formatBytes(result.size)} · lossless`, {
        variant: 'success',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      toast.push(`Merge failed: ${msg}`, { variant: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  const clearAll = () => {
    setFiles([])
    setStatus('idle')
    setError(null)
    setProbed(false)
    setProgress(0)
    toast.push('Cleared', { variant: 'info' })
  }

  // ── Derived ─────────────────────────────────────────
  const totalSize = files.reduce((s, f) => s + f.file.size, 0)
  const totalDuration = files.reduce((s, f) => s + (f.spec ? 0 : 0), 0) // duration not probed; show count
  const memEstimate = totalSize * 2 // input + output (DEC-015)
  const overSoft = totalSize > SOFT_SIZE_LIMIT
  const overHard = totalSize > HARD_SIZE_LIMIT
  const mismatchCount = files.filter((f) => f.mismatch).length

  // Spec badge for a file, or the mismatch reason.
  const specLabel = (q: QueuedFile): string => {
    const s = q.spec
    if (!s) return 'unreadable'
    const res = `${s.width}×${s.height}`
    const fps =
      s.fpsDen !== 0 && s.fpsNum !== 0
        ? `${(s.fpsNum / s.fpsDen).toFixed(2).replace(/\.00$/, '')}fps`
        : 'var'
    return `${res} · ${fps} · ${s.videoCodec}${s.audioCodec ? ` · ${s.audioCodec}` : ''}`
  }

  const phaseLabel =
    mergePhase === 'loading'
      ? 'Preparing ffmpeg engine…'
      : mergePhase === 'probing'
        ? 'Reading video specs…'
        : mergePhase === 'writing'
          ? 'Writing files…'
          : `Concatenating… ${Math.round(progress * 100)}%`

  // ── Render ──────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)}
      />

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-3 pt-3">
        <div className="flex items-center gap-2">
          <Merge className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Video Merger</span>
          {files.length > 0 && (
            <span className="text-[11px] text-ink-500">
              · {files.length} video{files.length > 1 ? 's' : ''} · {formatBytes(totalSize)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-honey-300 transition-colors"
          >
            <FileVideo className="h-3 w-3" /> Add
          </button>
          <button
            onClick={clearAll}
            disabled={files.length === 0}
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
                merging requires. Try the latest Chrome, Edge, Safari, or Firefox.
              </p>
            </div>
          </div>
        ) : files.length === 0 ? (
          /* Drop zone / placeholder */
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer.files)
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            className={`m-1 flex h-full min-h-[18rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 text-center transition-all ${
              dragging
                ? 'border-honey-400 bg-honey-400/5 scale-[1.01]'
                : 'border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30'
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-ink-700 bg-ink-800/50">
              <Combine className="h-6 w-6 text-honey-400" />
            </div>
            <div className="text-sm">
              <span className="text-ink-200">Drop 2+ videos here</span>
              <span className="text-ink-500"> or </span>
              <span className="text-honey-300 underline-offset-2 hover:underline">browse</span>
            </div>
            <div className="max-w-xs text-xs text-ink-500">
              Videos must share the same <strong>resolution, frame rate &amp; codec</strong> to
              merge losslessly. Handled 100% on your device — never uploaded.
            </div>
          </div>
        ) : (
          /* Loaded files: list + merge */
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* File list */}
            <div className="rounded-lg border border-ink-800 bg-ink-900/40">
              <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5 text-[11px] text-ink-500">
                <span>Videos · merge in listed order</span>
                {overHard ? (
                  <span className="text-red-400">too large to merge in-browser</span>
                ) : overSoft ? (
                  <span className="text-amber-400">large — may use a lot of memory</span>
                ) : null}
              </div>
              <ul className="divide-y divide-ink-800/60">
                {files.map((q, i) => {
                  const bad = !!q.mismatch
                  const match = !!q.spec && !q.mismatch
                  return (
                    <li
                      key={i}
                      className={`flex items-center gap-2 px-3 py-2 ${
                        bad ? 'border-l-2 border-red-500/60 bg-red-500/5' : ''
                      }`}
                    >
                      <span className="w-5 shrink-0 text-center font-mono text-[11px] text-ink-500">
                        #{i + 1}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs text-ink-200">{q.file.name}</span>
                        <span
                          className={`text-[10px] font-mono ${
                            bad ? 'text-red-400' : match ? 'text-emerald-400/80' : 'text-ink-500'
                          }`}
                        >
                          {specLabel(q)}
                          {bad && q.mismatch && (
                            <span className="font-normal text-red-300">
                              {' '}
                              — {q.mismatch.map((m) => `${m.field} ${m.baseline}≠${m.actual}`).join('; ')}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          aria-label={`Move ${q.file.name} up`}
                          title="Move up"
                          className="rounded border border-ink-700 p-1 text-ink-400 hover:text-honey-300 disabled:opacity-30 disabled:hover:text-ink-400"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === files.length - 1}
                          aria-label={`Move ${q.file.name} down`}
                          title="Move down"
                          className="rounded border border-ink-700 p-1 text-ink-400 hover:text-honey-300 disabled:opacity-30 disabled:hover:text-ink-400"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeAt(i)}
                          aria-label={`Remove ${q.file.name}`}
                          title="Remove"
                          className="rounded border border-ink-700 p-1 text-ink-400 hover:text-red-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* Mismatch banner */}
            {mismatchCount > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                <span className="font-semibold">⛔ Videos don't match — can't merge losslessly.</span>{' '}
                Highlighted file(s) differ from the first one (resolution / frame rate / codec).
                Remove or replace them to enable lossless merge.
              </div>
            )}

            {/* Memory estimate */}
            {files.length > 0 && !overHard && (
              <div className="flex items-center gap-1.5 px-1 text-[10px] text-ink-500">
                <span className={overSoft ? 'text-amber-400' : ''}>
                  ~{formatBytes(memEstimate)} in-browser memory needed
                  {overSoft && ' — consider removing files on a low-RAM device'}
                </span>
              </div>
            )}

            {/* Error */}
            {error && status === 'error' && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                {error}
              </div>
            )}

            {/* Merge */}
            <div className="mt-auto flex items-center gap-3">
              <button
                onClick={handleMerge}
                disabled={!isReady || processing || overHard}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-500 transition-all active:scale-95 ${
                  isReady && !processing && !overHard
                    ? 'bg-honey-500 text-ink-950 hover:bg-honey-400'
                    : 'cursor-not-allowed bg-ink-800 text-ink-500'
                }`}
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Combine className="h-4 w-4" />
                )}
                {processing ? phaseLabel : isReady ? 'Merge & Download' : 'Merge'}
              </button>
            </div>
          </div>
        )}
      </div>

      <StatusBar
        inputChars={totalSize}
        outputChars={files.length}
        status={status === 'processing' ? 'processing' : files.length === 0 ? 'empty' : error ? 'error' : 'ok'}
        error={error}
        durationMs={null}
      />
    </div>
  )
}
