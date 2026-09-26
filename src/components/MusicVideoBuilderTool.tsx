/**
 * MusicVideoBuilderTool - one cover video looped under a playlist of music.
 *
 * The output is an MP4 cut to the length of the playlist, plus the YouTube
 * chapter list for the description. Chapters matter because YouTube only ever
 * reads them from the description text, so generating that block is half the
 * job — the other half is validating it against YouTube's rules before upload,
 * since a list that breaks them is ignored silently.
 *
 * The cover video is never re-encoded (`-c:v copy`): looping costs no quality
 * and almost no time. 100% client-side.
 */

import { useMemo, useRef, useState, type DragEvent } from 'react'
import { ArrowDown, ArrowUp, Check, Copy, ListMusic, Loader2, Music, Trash2, X } from 'lucide-react'

import { formatBytes, formatTime } from '../engine/video-slice'
import {
  AUDIO_BITRATE_OPTIONS,
  DEFAULT_AUDIO_BITRATE,
  buildChapterText,
  computeChapters,
  computeLoopCount,
  estimateMvSize,
  estimatePeakMemory,
  formatStamp,
  makeMvFilename,
  needsHourFormat,
  totalTrackSeconds,
  validateChapters,
} from '../engine/music-video'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'
import ResultPreview from './ResultPreview'

// ── Constants ─────────────────────────────────────────

const ACCEPT_COVER = 'video/*'
const ACCEPT_MUSIC = 'audio/*,.mp3,.m4a,.aac,.wav,.opus,.ogg,.flac'

/** Long covers make short loops pointless; this is a sanity bound, not a rule. */
const MAX_TRACKS = 60

type Status = 'idle' | 'ok' | 'error' | 'processing'

interface CoverMeta {
  duration: number
  width: number | null
  height: number | null
  size: number
}

interface Track {
  id: string
  file: File
  name: string
  duration: number
  size: number
}

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

let trackSeq = 0

// ── Component ─────────────────────────────────────────

export default function MusicVideoBuilderTool() {
  const toast = useToast()

  const [cover, setCover] = useState<File | null>(null)
  const [coverMeta, setCoverMeta] = useState<CoverMeta | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [bitrate, setBitrate] = useState(DEFAULT_AUDIO_BITRATE)

  const [status, setStatus] = useState<Status>('idle')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'loading' | 'preparing' | 'encoding'>('preparing')
  const [result, setResult] = useState<{ blob: Blob; filename: string; hint: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const coverInputRef = useRef<HTMLInputElement>(null)
  const musicInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState<'cover' | 'music' | null>(null)

  // ── Derived ─────────────────────────────────────────
  const trackInfos = useMemo(
    () => tracks.map((t) => ({ name: t.name, durationSec: t.duration })),
    [tracks],
  )
  const totalSec = useMemo(() => totalTrackSeconds(trackInfos), [trackInfos])
  const chapters = useMemo(() => computeChapters(trackInfos), [trackInfos])
  const chapterText = useMemo(() => buildChapterText(chapters), [chapters])
  const issues = useMemo(() => validateChapters(chapters), [chapters])
  const loopCount = coverMeta ? computeLoopCount(totalSec, coverMeta.duration) : 0

  const inputBytes = (coverMeta?.size ?? 0) + tracks.reduce((s, t) => s + t.size, 0)
  const sizeEstimate =
    coverMeta && totalSec > 0
      ? estimateMvSize({
          coverBytes: coverMeta.size,
          coverDurationSec: coverMeta.duration,
          totalSec,
          audioBitrateK: bitrate,
        })
      : null
  const peakBytes = estimatePeakMemory(inputBytes, sizeEstimate?.expected ?? 0)

  const ready = !!cover && !!coverMeta && tracks.length > 0 && totalSec > 0 && !processing

  // ── Handlers ────────────────────────────────────────
  const onSelectCover = async (f: File | null | undefined) => {
    if (!f) return
    setStatus('processing')
    setError(null)
    setResult(null)
    try {
      const { inspectVideo } = await loadVideoMedia()
      const info = await inspectVideo(f)
      if (!info.hasVideo) {
        setError(`${f.name} has no video stream — the cover needs to be a video file.`)
        setStatus('error')
        return
      }
      if (!info.duration) {
        setError(`Couldn't read the length of ${f.name}. Is it a playable video?`)
        setStatus('error')
        return
      }
      setCover(f)
      setCoverMeta({
        duration: info.duration,
        width: info.width,
        height: info.height,
        size: f.size,
      })
      setStatus('ok')
      toast.push(`${f.name} · ${info.duration.toFixed(1)}s loaded`, { variant: 'success' })
    } catch {
      setError(`This browser can't read ${f.name}. Try an MP4 (H.264) cover.`)
      setStatus('error')
    }
  }

  const onSelectMusic = async (files: FileList | File[] | null | undefined) => {
    if (!files) return
    const list = Array.from(files)
    if (!list.length) return
    if (tracks.length + list.length > MAX_TRACKS) {
      toast.push(`Up to ${MAX_TRACKS} tracks — that's a very long playlist.`, { variant: 'error' })
      return
    }
    setStatus('processing')
    setError(null)
    setResult(null)
    try {
      const { inspectAudio } = await loadVideoMedia()
      const added: Track[] = []
      const failed: string[] = []
      for (const f of list) {
        const info = await inspectAudio(f)
        if (!info.duration) {
          failed.push(f.name)
          continue
        }
        added.push({
          id: `t${++trackSeq}`,
          file: f,
          name: f.name,
          duration: info.duration,
          size: f.size,
        })
      }
      if (added.length) {
        setTracks((prev) => [...prev, ...added])
        toast.push(
          added.length === 1 ? `${added[0].name} added` : `${added.length} tracks added`,
          { variant: 'success' },
        )
      }
      if (failed.length) {
        setError(
          `Couldn't read ${failed.length === 1 ? 'this file' : 'these files'}: ${failed.join(', ')}. ` +
            `They may not be playable audio.`,
        )
        setStatus('error')
      } else {
        setStatus('ok')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  const move = (index: number, dir: -1 | 1) => {
    setTracks((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setResult(null)
  }

  const removeTrack = (index: number) => {
    setTracks((prev) => prev.filter((_, i) => i !== index))
    setResult(null)
  }

  const clearAll = () => {
    setCover(null)
    setCoverMeta(null)
    setTracks([])
    setResult(null)
    setError(null)
    setStatus('idle')
    setCopied(false)
    toast.push('Cleared', { variant: 'info' })
  }

  const copyChapters = async () => {
    if (!chapterText) return
    try {
      await navigator.clipboard.writeText(chapterText)
      setCopied(true)
      toast.push('Chapter list copied — paste it into the YouTube description', {
        variant: 'success',
      })
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.push('Could not access the clipboard — select the text and copy it manually.', {
        variant: 'error',
      })
    }
  }

  // ── Build ───────────────────────────────────────────
  const handleBuild = async () => {
    if (!ready || !cover || !coverMeta || !tracks.length) return
    setProcessing(true)
    setStatus('processing')
    setError(null)
    try {
      const { buildMusicVideo } = await loadVideoMedia()
      const out = await buildMusicVideo({
        cover,
        coverDurationSec: coverMeta.duration,
        tracks: tracks.map((t) => ({ name: t.name, file: t.file, durationSec: t.duration })),
        chapters,
        audioBitrateK: bitrate,
        title: cover.name.replace(/\.[a-z0-9]{1,5}$/i, ''),
        loopCount,
        onPhase: (p) => setPhase(p),
      })
      setResult({
        blob: out.blob,
        filename: makeMvFilename(cover.name),
        hint: `${tracks.length} tracks · ${formatTime(totalSec)} · ${formatBytes(out.size)}`,
      })
      setStatus('ok')
      toast.push(`${formatTime(totalSec)} music video ready — check preview`, {
        variant: 'success',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      toast.push(`Build failed: ${msg}`, { variant: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  const phaseLabel = (() => {
    if (phase === 'loading') return 'Preparing ffmpeg engine…'
    if (phase === 'preparing') return 'Reading your files…'
    return 'Building the music video…'
  })()

  // ── Render ──────────────────────────────────────────
  const dropzone = (
    kind: 'cover' | 'music',
    label: string,
    hint: string,
    Icon: typeof Music,
    filled: string | null,
  ) => (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(kind)
      }}
      onDragLeave={() => setDragging(null)}
      onDrop={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setDragging(null)
        if (kind === 'cover') onSelectCover(e.dataTransfer.files?.[0])
        else onSelectMusic(e.dataTransfer.files)
      }}
      onClick={() => (kind === 'cover' ? coverInputRef : musicInputRef).current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          ;(kind === 'cover' ? coverInputRef : musicInputRef).current?.click()
        }
      }}
      className={`flex min-h-[7rem] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 text-center transition-all ${
        processing ? 'pointer-events-none opacity-50' : 'cursor-pointer'
      } ${
        filled
          ? 'border-ink-600 bg-ink-800/30'
          : dragging === kind
            ? 'border-honey-400 bg-honey-400/5'
            : 'border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30'
      }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
          filled ? 'border-ink-600 bg-ink-800/60' : 'border-ink-700 bg-ink-800/50'
        }`}
      >
        <Icon className="h-4 w-4 text-honey-400" />
      </div>
      <div className="text-[10px] font-500 uppercase tracking-wider text-ink-500">{label}</div>
      {filled ? (
        <span className="max-w-[18rem] truncate text-xs text-ink-200">{filled}</span>
      ) : (
        <div className="max-w-[16rem] text-[10px] leading-snug text-ink-500">{hint}</div>
      )}
    </div>
  )

  const withHours = needsHourFormat(totalSec)

  return (
    <div className="flex h-full flex-col">
      <input
        ref={coverInputRef}
        type="file"
        accept={ACCEPT_COVER}
        className="hidden"
        onChange={(e) => {
          onSelectCover(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={musicInputRef}
        type="file"
        accept={ACCEPT_MUSIC}
        multiple
        className="hidden"
        onChange={(e) => {
          onSelectMusic(e.target.files)
          e.target.value = ''
        }}
      />

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-3 pt-3">
        <div className="flex items-center gap-2">
          <ListMusic className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Music Video Builder</span>
          {tracks.length > 0 && (
            <span className="text-[11px] text-ink-500">
              · {tracks.length} tracks · {formatTime(totalSec)}
            </span>
          )}
        </div>
        <button
          onClick={clearAll}
          disabled={!cover && !tracks.length}
          className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 transition-colors hover:text-red-400 disabled:opacity-40 disabled:hover:text-ink-400"
        >
          <X className="h-3 w-3" /> Clear
        </button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3 pb-3">
        <div className="grid gap-3 md:grid-cols-2">
          {dropzone('cover', 'Cover video', 'Drop the clip to loop (MP4, H.264…)', Music, cover?.name ?? null)}
          {dropzone(
            'music',
            'Playlist',
            'Drop your music files — select several at once, or add in batches',
            ListMusic,
            tracks.length ? `${tracks.length} track${tracks.length === 1 ? '' : 's'} queued` : null,
          )}
        </div>

        {/* Playlist + chapters */}
        {tracks.length > 0 && (
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Playlist */}
            <div className="rounded-lg border border-ink-800 bg-ink-900/40">
              <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5">
                <span className="text-[10px] font-500 uppercase tracking-wider text-ink-500">
                  Playlist order
                </span>
                <span className="text-[10px] text-ink-600">
                  {formatTime(totalSec)} total
                </span>
              </div>
              <ul className="max-h-[16rem] overflow-y-auto">
                {tracks.map((t, i) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 border-b border-ink-800/60 px-2 py-1.5 last:border-0"
                  >
                    <span className="w-5 shrink-0 text-right font-mono text-[10px] text-ink-600">
                      {i + 1}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-honey-300">
                      {formatStamp(chapters[i]?.start ?? 0, withHours)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink-200" title={t.name}>
                      {t.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-ink-500">
                      {formatTime(t.duration)}
                    </span>
                    <span className="flex shrink-0 items-center">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0 || processing}
                        className="rounded p-1 text-ink-500 hover:text-ink-200 disabled:opacity-25 disabled:hover:text-ink-500"
                        title="Move up"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === tracks.length - 1 || processing}
                        className="rounded p-1 text-ink-500 hover:text-ink-200 disabled:opacity-25 disabled:hover:text-ink-500"
                        title="Move down"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => removeTrack(i)}
                        disabled={processing}
                        className="rounded p-1 text-ink-500 hover:text-red-400 disabled:opacity-25"
                        title="Remove"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Chapters */}
            <div className="rounded-lg border border-ink-800 bg-ink-900/40">
              <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5">
                <span className="text-[10px] font-500 uppercase tracking-wider text-ink-500">
                  YouTube chapters
                </span>
                <button
                  onClick={copyChapters}
                  className="flex items-center gap-1 rounded border border-ink-700 px-2 py-0.5 text-[10px] text-ink-300 hover:border-honey-500/50 hover:text-honey-300"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="max-h-[16rem] overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-300">
                {chapterText}
              </pre>
              <p className="border-t border-ink-800 px-3 py-1.5 text-[10px] leading-snug text-ink-500">
                Paste this into the video description on YouTube. Chapters only work from the
                description — YouTube does not read the ones inside the file.
              </p>
            </div>
          </div>
        )}

        {/* Validation */}
        {issues.length > 0 && (
          <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2">
            <p className="mb-1 text-[10px] font-500 uppercase tracking-wider text-amber-300">
              YouTube will ignore part of this list
            </p>
            <ul className="space-y-0.5">
              {issues.map((issue, i) => (
                <li key={i} className="text-[10px] leading-snug text-amber-200/90">
                  • {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Options + estimate */}
        <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-500 uppercase tracking-wider text-ink-500">
              Audio quality
            </span>
            <div className="inline-flex flex-wrap gap-1">
              {AUDIO_BITRATE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => {
                    setBitrate(o.value)
                    setResult(null)
                  }}
                  disabled={processing}
                  title={o.note}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    bitrate === o.value
                      ? 'border-honey-400/50 bg-honey-400/15 text-honey-200'
                      : 'border-ink-700 text-ink-400 hover:text-ink-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {coverMeta && totalSec > 0 ? (
            <div className="space-y-0.5 text-[11px] text-ink-400">
              <div>
                {coverMeta.width && coverMeta.height
                  ? `${coverMeta.width}×${coverMeta.height} cover`
                  : 'Cover'}{' '}
                · {coverMeta.duration.toFixed(1)}s · looped{' '}
                <span className="text-ink-200">
                  {loopCount === 0 ? 'once (cover is long enough)' : `${loopCount + 1}×`}
                </span>{' '}
                · output <span className="text-ink-200">{formatTime(totalSec)}</span>
              </div>
              {sizeEstimate && (
                <div>
                  output ≈{' '}
                  <span className="text-ink-200">{formatBytes(sizeEstimate.low)}</span>
                  {' – '}
                  <span className="text-ink-200">{formatBytes(sizeEstimate.high)}</span>
                  <span className="text-ink-600">
                    {' '}
                    (video copied as-is, so it scales with the cover's bitrate)
                  </span>
                </div>
              )}
              <div className="text-ink-600">
                Process time is short — the video is never re-encoded. ≈
                {formatBytes(peakBytes)} is held in memory at once while it builds.
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-ink-500">
              {cover ? 'Add your music tracks to set the length.' : 'Drop a cover video to begin.'}
            </div>
          )}
        </div>

        {error && status === 'error' && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            {error}
          </div>
        )}

        {/* Build */}
        <div className="mt-auto pt-1">
          <button
            onClick={handleBuild}
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
                {phaseLabel}
              </>
            ) : (
              <>
                <ListMusic className="h-4 w-4" />
                {!cover
                  ? 'Build music video'
                  : !tracks.length
                    ? 'Add music tracks'
                    : `Build ${formatTime(totalSec)} music video`}
              </>
            )}
          </button>
        </div>

        {result ? (
          <ResultPreview
            kind="video"
            blob={result.blob}
            filename={result.filename}
            hint={result.hint}
            reRunLabel="Build again"
            onReRun={() => {
              setResult(null)
              handleBuild()
            }}
          />
        ) : null}
      </div>

      <StatusBar
        inputChars={inputBytes}
        outputChars={result?.blob.size ?? 0}
        wasmLabel="ffmpeg.wasm"
        status={processing ? 'processing' : status === 'error' ? 'error' : result ? 'ok' : 'empty'}
        error={error}
        durationMs={null}
      />
    </div>
  )
}
