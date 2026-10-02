/**
 * VideoMetadataTool — read everything a video file knows about itself.
 *
 * Two tiers, one tool (proposal 022 / DEC-021):
 *   [1] INSTANT — the MP4/MOV box table is parsed straight off the file's bytes.
 *       No ffmpeg, no download, no upload. The frame count and the per-stream
 *       bitrates come out exact, because the sample table is summed rather than
 *       trusted.
 *   [2] DEEP — `ffmpeg -i`, for what a box table cannot carry (pixel format,
 *       SAR/DAR, colour info, subtitle and attachment streams, chapters, every
 *       container tag). Loads the shared ffmpeg core (~9.9 MB over the wire,
 *       once per session) only when the user asks for it.
 *
 * The point of the split: the most common question ("why won't the Merger take
 * this clip?") is answerable instantly, on a page whose whole value is being
 * cheap to open.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Clock, Cpu, FileSearch, Loader2, RefreshCw, X } from 'lucide-react'

import { formatBytes } from '../engine/video-slice'
import {
  BOX_TIER_LIMITS,
  buildDeepGroups,
  buildInstantGroups,
  groupsToJson,
  groupsToText,
  parseFfmpegLog,
  type MetaGroup,
} from '../engine/video-metadata'
import { readBoxMetadata, type BoxReadResult } from '../lib/video-metadata'
import { readVideoLog } from '../lib/video-media'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'

// ── Constants ─────────────────────────────────────────

const ACCEPT_VIDEO = 'video/*,.mp4,.mov,.m4v,.m4a,.webm,.mkv,.avi,.3gp'

type Status = 'idle' | 'ok' | 'error' | 'processing'
type View = 'box' | 'deep'

/** Approximate one-time cost of the deep read, measured from the live asset. */
const CORE_LABEL = '~9.9 MB'

// ── Component ─────────────────────────────────────────

export default function VideoMetadataTool() {
  const toast = useToast()

  const [file, setFile] = useState<File | null>(null)
  const [box, setBox] = useState<BoxReadResult | null>(null)
  const [deep, setDeep] = useState<MetaGroup[] | null>(null)
  const [view, setView] = useState<View>('box')
  const [readPhase, setReadPhase] = useState<null | 'loading' | 'reading'>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<File | null>(null)
  useEffect(() => {
    fileRef.current = file
  }, [file])

  // ── Handlers ────────────────────────────────────────
  const onSelect = useCallback(
    async (f: File | null | undefined) => {
      if (!f) return
      if (!f.type.startsWith('video/') && !/\.(mp4|mov|m4v|m4a|webm|mkv|avi|3gp)$/i.test(f.name)) {
        toast.push('Please choose a video or audio file.', { variant: 'error' })
        return
      }
      setFile(f)
      setBox(null)
      setDeep(null)
      setView('box')
      setError(null)
      try {
        // Instant tier — no wasm, no network. A read failure is not an error
        // here: it just means the deep read is the way in.
        const result = await readBoxMetadata(f)
        setBox(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [toast],
  )

  const deepRead = useCallback(async () => {
    const f = fileRef.current
    if (!f || readPhase) return
    setError(null)
    setReadPhase('loading')
    try {
      const log = await readVideoLog(f, (phase) => setReadPhase(phase))
      const info = parseFfmpegLog(log)
      if (!info.streams.length && !info.container) {
        throw new Error('ffmpeg could not read this file — it may be corrupt or not a media file.')
      }
      setDeep(buildDeepGroups(info, f.size))
      setView('deep')
      toast.push('Full read complete — ffmpeg report added.', { variant: 'success' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.push(`Full read failed: ${msg}`, { variant: 'error' })
    } finally {
      setReadPhase(null)
    }
  }, [readPhase, toast])

  const clear = useCallback(() => {
    setFile(null)
    setBox(null)
    setDeep(null)
    setView('box')
    setError(null)
    toast.push('Cleared', { variant: 'info' })
  }, [toast])

  // ── Derived ─────────────────────────────────────────
  const groups = useMemo<MetaGroup[]>(() => {
    if (view === 'deep' && deep) return deep
    if (file && box?.meta) return buildInstantGroups({ name: file.name, size: file.size, meta: box.meta })
    return []
  }, [view, deep, file, box])

  const hasInstant = !!box?.meta
  const readoutText = useMemo(
    () =>
      file
        ? groupsToText(`Video metadata — ${file.name}`, groups) +
          `\n\nsource: ${view === 'deep' ? 'ffmpeg -i' : 'MP4 box table (no wasm)'}`
        : '',
    [file, groups, view],
  )

  const copyReadout = useCallback(async () => {
    if (!readoutText) return
    try {
      await navigator.clipboard.writeText(readoutText)
      toast.push('Metadata copied as text', { variant: 'success' })
    } catch {
      toast.push('Could not access the clipboard.', { variant: 'error' })
    }
  }, [readoutText, toast])

  const copyJson = useCallback(async () => {
    if (!file) return
    try {
      await navigator.clipboard.writeText(groupsToJson(view === 'deep' ? 'ffmpeg' : 'box', groups))
      toast.push('Metadata copied as JSON', { variant: 'success' })
    } catch {
      toast.push('Could not access the clipboard.', { variant: 'error' })
    }
  }, [file, groups, view, toast])

  // Keyboard: ⌘⇧C copy, Esc clear — the convention shared by the other tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        void copyReadout()
      } else if (e.key === 'Escape' && fileRef.current) {
        clear()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copyReadout, clear])

  const busy = readPhase !== null
  const showReadout = !!file && groups.length > 0
  const sourceLabel = view === 'deep' ? `ffmpeg.wasm · ${CORE_LABEL}` : `box table · ${box ? box.bytesRead.toLocaleString() : 0} B read`

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-3 pt-3">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Video Metadata</span>
          {file && (
            <span className="text-[11px] text-ink-500">
              {formatBytes(file.size)}
              {box?.meta ? ` · ${box.meta.tracks.length} track${box.meta.tracks.length === 1 ? '' : 's'}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showReadout && (
            <>
              <button
                onClick={copyReadout}
                className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 transition-colors hover:text-honey-300"
                title="Copy as text (⌘⇧C)"
              >
                Copy text
              </button>
              <button
                onClick={copyJson}
                className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 transition-colors hover:text-honey-300"
              >
                Copy JSON
              </button>
            </>
          )}
          <button
            onClick={clear}
            disabled={!file}
            className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 transition-colors hover:text-red-400 disabled:opacity-40 disabled:hover:text-ink-400"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-3 pb-3">
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
            void onSelect(e.dataTransfer.files?.[0])
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
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center transition-all ${
            file ? 'border-ink-700/60 py-3' : 'min-h-[10rem] flex-1 border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30'
          } ${dragging ? 'scale-[1.01] border-honey-400 bg-honey-400/5' : ''}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_VIDEO}
            className="hidden"
            onChange={(e) => void onSelect(e.target.files?.[0])}
          />
          {file ? (
            <div className="flex max-w-full flex-col items-center gap-0.5">
              <span className="max-w-[22rem] truncate text-xs text-ink-200">{file.name}</span>
              <span className="text-[10px] text-ink-500">
                {formatBytes(file.size)} · {sourceLabel}
              </span>
            </div>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink-700 bg-ink-800/50">
                <FileSearch className="h-[18px] w-[18px] text-honey-400" />
              </div>
              <span className="text-sm font-500 text-ink-200">Drop a video to inspect</span>
              <span className="text-[11px] text-ink-500">
                Container, codecs, resolution, frame rate, frame count, bitrates and tags —
                read straight from the file&apos;s own index. MP4/MOV needs no ffmpeg at all.
              </span>
            </>
          )}
        </div>

        {/* Readout */}
        {showReadout && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {/* Tier switch */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-md border border-ink-800 bg-ink-900/40 p-0.5">
                <button
                  onClick={() => setView('box')}
                  disabled={!hasInstant}
                  className={`rounded px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${
                    view === 'box' ? 'bg-honey-500/15 text-honey-300' : 'text-ink-400 hover:text-ink-200'
                  }`}
                >
                  Box table{busy ? '' : ' · instant'}
                </button>
                <button
                  onClick={() => setView('deep')}
                  disabled={!deep}
                  className={`rounded px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${
                    view === 'deep' ? 'bg-honey-500/15 text-honey-300' : 'text-ink-400 hover:text-ink-200'
                  }`}
                >
                  ffmpeg report
                </button>
              </div>
              <button
                onClick={() => void deepRead()}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md border border-honey-500/40 bg-honey-500/10 px-2.5 py-1 text-[11px] font-500 text-honey-300 transition-colors hover:bg-honey-500/20 disabled:cursor-not-allowed disabled:border-ink-700 disabled:bg-ink-800 disabled:text-ink-500"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {readPhase === 'loading'
                  ? `Loading ffmpeg core (${CORE_LABEL})…`
                  : readPhase === 'reading'
                    ? 'Reading with ffmpeg…'
                    : deep
                      ? 'Re-read with ffmpeg'
                      : `Full read with ffmpeg (${CORE_LABEL})`}
              </button>
            </div>

            {/* Groups */}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-ink-800 bg-ink-900/30">
              <div className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-2">
                {groups.map((group) => (
                  <section key={group.title} className="rounded-md border border-ink-800/80 bg-ink-900/40">
                    <h3 className="border-b border-ink-800/80 px-3 py-1.5 text-[11px] font-600 tracking-wide text-honey-300 uppercase">
                      {group.title}
                    </h3>
                    <dl className="divide-y divide-ink-800/50">
                      {group.rows.map((row) => (
                        <div key={`${group.title}:${row.label}`} className="flex items-start gap-3 px-3 py-1.5">
                          <dt className="w-[38%] shrink-0 text-[11px] text-ink-500">{row.label}</dt>
                          <dd
                            className={`min-w-0 flex-1 text-[11px] break-words text-ink-200 ${row.mono ? 'font-mono' : ''}`}
                          >
                            {row.value}
                            {row.note && <span className="ml-1 text-[10px] text-ink-600">({row.note})</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            </div>

            {/* Honesty footer */}
            {view === 'box' ? (
              <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-ink-500">
                <Cpu className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Read from the file&apos;s own box table — nothing was decoded or uploaded, and no
                  ffmpeg core was downloaded. Not in a box table:{' '}
                  {BOX_TIER_LIMITS.join(', ')}. Use the full read for those.
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-ink-500">
                <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Full ffmpeg report — the same view the encoding tools work from. The core stays
                  cached for this session, so other tools reuse it.
                </span>
              </p>
            )}
          </div>
        )}

        {/* Non-MP4: explain instead of showing an empty panel */}
        {file && !hasInstant && !busy && !error && (
          <div className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-3 text-xs text-ink-300">
            <p className="mb-1">
              {box?.reason ?? 'This file has no MP4/MOV index box to read.'}
            </p>
            <p className="text-[11px] text-ink-500">
              The instant read works on MP4 and MOV only. ffmpeg can read the rest — press{' '}
              <span className="text-honey-300">Full read with ffmpeg</span> above.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">{error}</div>
        )}
      </div>

      <StatusBar
        inputChars={file?.size ?? 0}
        outputChars={file?.size ?? 0}
        status={busy ? 'processing' : !file ? 'empty' : error ? 'error' : 'ok'}
        error={error}
        durationMs={null}
        wasmLabel={view === 'deep' || deep ? 'ffmpeg.wasm' : 'wasm-free'}
      />
    </div>
  )
}