/**
 * video-frame.ts - browser I/O for the Video Frame Grabber tool.
 *
 * Canvas seeks + frame grabs. 100% wasm-free: a native <video> seek + seeked
 * event + canvas.drawImage + toBlob is enough (spike-verified Aug 2026 — NO
 * play() needed, and rVFC does NOT fire after a passive seek, so the last-frame
 * path relies on seeking to duration, not requestVideoFrameCallback).
 *
 * Layer note: engine/ holds the pure filename helpers; this file is the
 * browser I/O adapter (canvas/DOM allowed, no React).
 */

import { frameMime, type FrameFormat } from '../engine/video-frame'

/**
 * Seek a <video> to a given time and resolve once the seek completes.
 * Fires reliably without calling play() (spike-verified).
 */
export function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    // In case seeked already fired / is not going to fire (edge), resolve anyway.
    video.addEventListener('seeked', onSeeked)
    // Clamp to the valid range.
    const t = Math.min(Math.max(0, time), Number.isFinite(video.duration) ? video.duration : time)
    video.currentTime = t
    // Safety: resolve after a timeout if seeked never fires on this element.
    setTimeout(() => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }, 1500)
  })
}

/**
 * Draw the currently-presented frame of a <video> onto a fresh canvas and
 * encode it as a Blob (PNG or JPEG). Returns null if no video frame is
 * available yet.
 */
export function grabFrame(
  video: HTMLVideoElement,
  fmt: FrameFormat,
  quality = 0.92,
): Promise<Blob | null> {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return Promise.resolve(null)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(video, 0, 0, w, h)

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      frameMime(fmt),
      fmt === 'jpeg' ? quality : undefined,
    )
  })
}

/**
 * Grab the LAST presented frame of a video by seeking to its duration.
 * Spike-verified: seeking to exact duration clamps to the last frame, fires
 * `seeked`, and drawImage yields a non-blank frame — without calling play().
 */
export async function grabLastFrame(
  video: HTMLVideoElement,
  fmt: FrameFormat,
  quality = 0.92,
): Promise<Blob | null> {
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  if (!duration) return null
  await seekTo(video, duration)
  return grabFrame(video, fmt, quality)
}
