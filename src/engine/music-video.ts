/**
 * music-video.ts — pure logic for the Music Video Builder tool.
 *
 * Zero React, zero DOM, zero browser API. Chapter generation and validation,
 * loop maths, and honest size estimates.
 *
 * The tool loops one cover video under a playlist of music tracks and cuts the
 * result to the length of the playlist. Chapters are the point of the output:
 * YouTube reads them from the video DESCRIPTION, never from inside the file, so
 * the text block produced here is the actual deliverable for the upload.
 */

/** One track in the playlist, in play order. */
export interface TrackInfo {
  /** Original file name, used as the chapter title. */
  name: string
  durationSec: number
}

export interface ChapterStamp {
  title: string
  start: number
  end: number
}

export const AUDIO_BITRATE_OPTIONS = [
  { value: 128, label: '128 kbps', note: 'Smallest file — fine for most music' },
  { value: 192, label: '192 kbps', note: 'Recommended balance' },
  { value: 256, label: '256 kbps', note: 'Highest quality, biggest file' },
]

export const DEFAULT_AUDIO_BITRATE = 192

/**
 * YouTube's documented rules for manual chapters. All four must hold or the
 * whole list is silently ignored — YouTube gives no error.
 * https://support.google.com/youtube/answer/9884579
 */
export const MIN_CHAPTERS = 3
export const MIN_CHAPTER_SECONDS = 10

/** ffmpeg holds inputs + output in MEMFS, so the projected output matters most. */
export const MEMORY_SOFT_BYTES = 512 * 1024 * 1024
export const MEMORY_HARD_BYTES = 1024 * 1024 * 1024

/** Sum of every track's length — this is the music video's duration. */
export function totalTrackSeconds(tracks: TrackInfo[]): number {
  return tracks.reduce((sum, t) => sum + t.durationSec, 0)
}

/**
 * Turn the playlist into chapters. Starts are cumulative, so chapter N starts
 * exactly where N-1 ends and the last chapter ends at the total runtime.
 */
export function computeChapters(tracks: TrackInfo[]): ChapterStamp[] {
  let cursor = 0
  return tracks.map((t) => {
    const start = cursor
    const end = cursor + t.durationSec
    cursor = end
    return { title: stripExtension(t.name), start, end }
  })
}

/**
 * How many times to repeat the cover: the video must be at least as long as the
 * playlist, and ffmpeg's `-stream_loop` counts *extra* repeats (0 = play once).
 * A cover longer than the playlist needs none — the output is cut instead.
 */
export function computeLoopCount(totalSec: number, coverSec: number): number {
  if (!coverSec || coverSec <= 0 || !totalSec || totalSec <= 0) return 0
  return Math.max(0, Math.ceil(totalSec / coverSec) - 1)
}

/**
 * A YouTube chapter timestamp. Whole seconds only, hours only when the video
 * passes the hour mark — the short form is what nearly everyone wants.
 */
export function formatStamp(seconds: number, withHours: boolean): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  if (withHours || h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

/** True when the total runtime reaches an hour, which changes the stamp format. */
export function needsHourFormat(totalSec: number): boolean {
  return totalSec >= 3600
}

/**
 * The ready-to-paste description block. Deliberately nothing but the stamps:
 * YouTube parses these lines, and stripping anything else removes a way to get
 * the list rejected.
 */
export function buildChapterText(chapters: ChapterStamp[]): string {
  const withHours = needsHourFormat(chapters.at(-1)?.end ?? 0)
  return chapters.map((c) => `${formatStamp(c.start, withHours)} ${c.title}`).join('\n')
}

export interface ChapterIssue {
  kind: 'too-few' | 'short-track' | 'not-zero'
  /** Playlist position (1-based) when the issue is about one track. */
  position?: number
  message: string
}

/**
 * Check the playlist against YouTube's rules while the user is still in the
 * tool, rather than letting them find out after uploading. Every failure here
 * is silent on YouTube's side, which is exactly why it belongs up front.
 */
export function validateChapters(chapters: ChapterStamp[]): ChapterIssue[] {
  const issues: ChapterIssue[] = []
  if (chapters.length === 0) return issues

  if (Math.floor(chapters[0].start) !== 0) {
    issues.push({
      kind: 'not-zero',
      message: 'The first chapter must start at 0:00 — the playlist always does, so this is a bug.',
    })
  }

  if (chapters.length < MIN_CHAPTERS) {
    issues.push({
      kind: 'too-few',
      message: `YouTube needs at least ${MIN_CHAPTERS} chapters. With ${chapters.length}, your description list will be ignored.`,
    })
  }

  chapters.forEach((c, i) => {
    if (c.end - c.start < MIN_CHAPTER_SECONDS) {
      issues.push({
        kind: 'short-track',
        position: i + 1,
        message: `Track ${i + 1} (${c.title}) is under ${MIN_CHAPTER_SECONDS}s — YouTube will drop that chapter.`,
      })
    }
  })

  return issues
}

/**
 * Projected output size for a stream-copied loop.
 *
 * The video is copied, never re-encoded, so it costs the same bytes per second
 * as the cover: size × (total / coverDuration). The audio is re-encoded at the
 * chosen bitrate. Returned as a range, because container overhead and muxer
 * behaviour vary.
 */
export function estimateMvSize(opts: {
  coverBytes: number
  coverDurationSec: number
  totalSec: number
  audioBitrateK: number
}): { low: number; high: number; expected: number } | null {
  const { coverBytes, coverDurationSec, totalSec, audioBitrateK } = opts
  if (!coverBytes || !coverDurationSec || !totalSec) return null
  const videoBytes = coverBytes * (totalSec / coverDurationSec)
  const audioBytes = (audioBitrateK * 1024 * totalSec) / 8
  const expected = videoBytes + audioBytes
  return { expected, low: expected * 0.85, high: expected * 1.25 }
}

/** Inputs + output all sit in MEMFS at once, so the peak is the sum. */
export function estimatePeakMemory(inputBytes: number, outputBytes: number): number {
  return inputBytes + outputBytes
}

export function memoryVerdict(peakBytes: number): 'ok' | 'warn' | 'block' {
  if (peakBytes >= MEMORY_HARD_BYTES) return 'block'
  if (peakBytes >= MEMORY_SOFT_BYTES) return 'warn'
  return 'ok'
}

/** `cover-loop.mp4` → `cover-loop-mv.mp4`. */
export function makeMvFilename(coverName: string): string {
  return `${stripExtension(coverName)}-mv.mp4`
}

/** Track title for a chapter: the file name without its extension. */
export function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '').trim() || name
}
