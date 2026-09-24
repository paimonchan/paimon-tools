/**
 * image-video.ts — pure logic for the Image to Video tool.
 *
 * Zero React, zero DOM, zero browser API. Canvas geometry, encoding presets and
 * honest size/time estimates. The canvas + ffmpeg work lives in
 * lib/video-media.ts (browser I/O).
 *
 * The shape of this tool, and why: a still image is looped for the length of an
 * audio track. Because the picture never changes, the frame RATE is the only
 * lever that matters — measured at 1080p for a 30s video: 1 fps = 4.9s,
 * 5 fps = 18.4s, 30 fps = 103.5s, with output size effectively unchanged
 * (0.54 vs 0.70 MB). So low frame rates are the default here, not a compromise.
 */

import { formatEstimate } from './video-resize'

export type FitMode = 'fit' | 'fill'

export interface ResolutionPreset {
  id: string
  label: string
  width: number
  height: number
  note: string
}

/** Canvas sizes are fixed and even, so H.264 + yuv420p is always happy. */
export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: '1080p', label: '1080p', width: 1920, height: 1080, note: 'Full HD, landscape' },
  { id: '720p', label: '720p', width: 1280, height: 720, note: 'HD, landscape' },
  { id: '480p', label: '480p', width: 854, height: 480, note: 'SD, landscape' },
  { id: 'vertical-1080', label: '1080p vertical', width: 1080, height: 1920, note: 'Vertical — TikTok, Reels, Shorts' },
  { id: 'vertical-720', label: '720p vertical', width: 720, height: 1280, note: 'Vertical, smaller' },
]

export interface FitOption {
  id: FitMode
  label: string
  note: string
}

export const FIT_MODES: FitOption[] = [
  { id: 'fit', label: 'Fit', note: 'Show the whole image, pad the edges with black' },
  { id: 'fill', label: 'Fill', note: 'Fill the frame edge to edge, crop what overflows' },
]

export interface FpsOption {
  value: number
  label: string
  note: string
}

/**
 * Frame rates, with the measured cost at 1080p. A still image gains nothing
 * from a high frame rate — it only costs encoding time.
 */
export const FPS_OPTIONS: FpsOption[] = [
  { value: 5, label: '5 fps', note: 'Recommended — 5x faster than 30fps, same file size' },
  { value: 1, label: '1 fps', note: 'Fastest — 21x faster than 30fps, ideal for a still photo' },
  { value: 15, label: '15 fps', note: 'Middle ground between speed and smoothness' },
  { value: 30, label: '30 fps', note: 'Standard video rate — much slower, no visual gain for a photo' },
]

export const DEFAULT_FPS = 5

/**
 * How to draw a source image onto a fixed-size canvas.
 *
 * - fit:  draw the whole image scaled down, centred, leaving background bars
 * - fill: crop the source to the canvas aspect so it covers edge to edge
 */
export interface DrawPlan {
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
}

export function computeDrawPlan(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: FitMode,
): DrawPlan | null {
  if (!srcWidth || !srcHeight || !targetWidth || !targetHeight) return null

  if (fit === 'fill') {
    // Scale up until the image covers the canvas, then crop the overflow —
    // expressed as a source rectangle mapped onto the full canvas.
    const scale = Math.max(targetWidth / srcWidth, targetHeight / srcHeight)
    const sw = targetWidth / scale
    const sh = targetHeight / scale
    return {
      sx: (srcWidth - sw) / 2,
      sy: (srcHeight - sh) / 2,
      sw,
      sh,
      dx: 0,
      dy: 0,
      dw: targetWidth,
      dh: targetHeight,
    }
  }

  // fit: whole image, centred, bars on the shorter axis.
  const scale = Math.min(targetWidth / srcWidth, targetHeight / srcHeight)
  const dw = srcWidth * scale
  const dh = srcHeight * scale
  return {
    sx: 0,
    sy: 0,
    sw: srcWidth,
    sh: srcHeight,
    dx: (targetWidth - dw) / 2,
    dy: (targetHeight - dh) / 2,
    dw,
    dh,
  }
}

// ── Estimates (calibrated against real encodes in this app's wasm core) ────

/**
 * Encode time as a multiple of the audio length, at a 1080p canvas. Anchors
 * measured on a deliberately weak 2-vCPU machine, so they are a conservative
 * upper bound (a normal laptop is faster).
 */
const TIME_FACTOR_AT_1080P: Array<{ fps: number; factor: number }> = [
  { fps: 1, factor: 0.163 },
  { fps: 5, factor: 0.613 },
  { fps: 30, factor: 3.45 },
]

const REFERENCE_PIXELS = 1920 * 1080

function timeFactor(fps: number): number {
  const a = TIME_FACTOR_AT_1080P
  if (fps <= a[0].fps) return a[0].factor
  if (fps >= a[a.length - 1].fps) return a[a.length - 1].factor
  for (let i = 0; i < a.length - 1; i++) {
    const lo = a[i]
    const hi = a[i + 1]
    if (fps >= lo.fps && fps <= hi.fps) {
      const t = (fps - lo.fps) / (hi.fps - lo.fps)
      return lo.factor + (hi.factor - lo.factor) * t
    }
  }
  return a[a.length - 1].factor
}

export function estimateImageVideoSeconds(
  durationSec: number,
  fps: number,
  width: number,
  height: number,
): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || !width || !height) return 0
  const pixelFactor = Math.max(0.5, Math.pow((width * height) / REFERENCE_PIXELS, 0.6))
  return durationSec * timeFactor(fps) * pixelFactor
}

/** Bits per pixel per frame for near-static H.264 content, measured. */
const VIDEO_BPP = 0.0011
const AAC_KBPS = 128

export interface SizeEstimate {
  low: number
  high: number
}

/**
 * Output size band. For a still image the audio dominates completely — the
 * video track is one keyframe plus skipped frames — so the estimate is the
 * audio payload plus a small per-frame overhead, shown as a range because it
 * depends on how detailed the photo is.
 */
export function estimateImageVideoSize(opts: {
  audioBytes: number
  audioCopied: boolean
  durationSec: number
  fps: number
  width: number
  height: number
}): SizeEstimate | null {
  const { audioBytes, audioCopied, durationSec, fps, width, height } = opts
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null
  const audio = audioCopied
    ? Math.max(0, audioBytes)
    : (AAC_KBPS * 1000 * durationSec) / 8
  const video = (width * height * fps * durationSec * VIDEO_BPP) / 8
  const total = audio + video
  return { low: Math.round(total * 0.8), high: Math.round(total * 1.5) }
}

/** Re-exported so the component has one place for duration formatting. */
export { formatEstimate }

/** Output filename: "<image-base>-1080p.mp4". */
export function makeImageVideoFilename(imageName: string, presetId: string): string {
  const base = (imageName || 'image').replace(/\.[^.]+$/, '') || 'image'
  return `${base}-${presetId}.mp4`
}
