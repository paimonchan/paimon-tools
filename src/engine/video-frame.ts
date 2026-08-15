/**
 * video-frame.ts - pure logic for the Video Frame Grabber tool.
 *
 * Zero React, zero DOM, zero browser API. Only pure helpers for output
 * filenames. The browser canvas/seek grab lives in lib/video-frame.ts.
 */

/** Recognized output image formats selectable in the tool. */
export type FrameFormat = 'png' | 'jpeg'

/** Extension for a frame format. */
export function frameExt(fmt: FrameFormat): string {
  return fmt === 'png' ? 'png' : 'jpg'
}

/** MIME type for a frame format. */
export function frameMime(fmt: FrameFormat): string {
  return fmt === 'png' ? 'image/png' : 'image/jpeg'
}

/** Format a seconds value as HH:MM:SS (or M:SS) for the frame filename. */
export function formatTimeForFilename(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hh > 0 ? `${pad(hh)}-${pad(mm)}-${pad(ss)}` : `${mm}-${pad(ss)}`
}

/**
 * Default output filename for a frame grabbed at a specific time:
 * "<video-base>-frame-<TIME>.<ext>".
 */
export function makeFrameFilename(videoName: string, timeSeconds: number, fmt: FrameFormat): string {
  const dot = videoName.lastIndexOf('.')
  const base = dot > 0 ? videoName.slice(0, dot) : videoName
  return `${base}-frame-${formatTimeForFilename(timeSeconds)}.${frameExt(fmt)}`
}

/**
 * Default output filename for the LAST-frame grab:
 * "<video-base>-last-frame.<ext>".
 */
export function makeLastFrameFilename(videoName: string, fmt: FrameFormat): string {
  const dot = videoName.lastIndexOf('.')
  const base = dot > 0 ? videoName.slice(0, dot) : videoName
  return `${base}-last-frame.${frameExt(fmt)}`
}
