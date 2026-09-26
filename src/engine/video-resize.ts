/**
 * video-resize.ts — pure logic for the Video Resizer tool.
 *
 * Zero React, zero DOM, zero browser API. Resolution maths, encoding presets,
 * and honest size/time estimates. The ffmpeg.wasm call itself lives in
 * lib/video-media.ts (browser I/O).
 *
 * Unlike every other video tool in this app, resizing CANNOT stream-copy: the
 * frames must be decoded, scaled and re-encoded. That makes it the heaviest
 * operation here, so the estimates below matter for the UX.
 */

export type ResizeQuality = 'smallest' | 'balanced' | 'quality'

export interface ResolutionPreset {
  id: string
  label: string
  /** Target length of the SHORTER side, in pixels — works for landscape and portrait. */
  shortSide: number
  note: string
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: '1080', label: '1080p', shortSide: 1080, note: 'Full HD' },
  { id: '720', label: '720p', shortSide: 720, note: 'HD' },
  { id: '480', label: '480p', shortSide: 480, note: 'SD — much smaller' },
  { id: '360', label: '360p', shortSide: 360, note: 'Tiny — messaging' },
]

export interface QualityMode {
  id: ResizeQuality
  label: string
  note: string
}

export const QUALITY_MODES: QualityMode[] = [
  { id: 'balanced', label: 'Balanced', note: 'Recommended — big savings, still crisp' },
  { id: 'smallest', label: 'Smallest', note: 'Maximum compression, slightly softer' },
  { id: 'quality', label: 'High quality', note: 'Sharper, noticeably slower' },
]

export interface EncodingSettings {
  preset: string
  crf: number
}

/**
 * Quality → x264 settings. Every option uses veryfast or slower: `ultrafast`
 * was benchmarked at roughly the same speed but produced files ~7x larger, so
 * it defeats the point of a shrink tool.
 */
export function encodingFor(quality: ResizeQuality): EncodingSettings {
  switch (quality) {
    case 'smallest':
      return { preset: 'veryfast', crf: 32 }
    case 'quality':
      return { preset: 'faster', crf: 23 }
    case 'balanced':
    default:
      return { preset: 'veryfast', crf: 28 }
  }
}

export type TargetResolution =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: 'upscale' | 'invalid' }

/** H.264 needs even dimensions (yuv420p chroma is 2x2 subsampled). */
function roundEven(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

/**
 * Work out the output size for a requested short-side length, preserving the
 * source aspect ratio. Never upscales: a video already smaller than the target
 * returns ok:false so the UI can disable that option.
 */
export function computeTargetSize(
  srcWidth: number,
  srcHeight: number,
  shortSide: number,
): TargetResolution {
  if (!srcWidth || !srcHeight || !shortSide || srcWidth <= 0 || srcHeight <= 0) {
    return { ok: false, reason: 'invalid' }
  }
  const srcShort = Math.min(srcWidth, srcHeight)
  if (shortSide >= srcShort) return { ok: false, reason: 'upscale' }
  const scale = shortSide / srcShort
  return {
    ok: true,
    width: roundEven(srcWidth * scale),
    height: roundEven(srcHeight * scale),
  }
}

/**
 * Output bitrate model for x264, in bits per pixel per frame, by CRF.
 * Calibrated against real encodes of a high-motion 1080p30 clip in this app's
 * single-threaded ffmpeg.wasm core. Content-dependent, so callers should show
 * a range rather than a single number.
 */
const BITS_PER_PIXEL: Record<number, number> = {
  23: 0.08,
  28: 0.028,
  32: 0.018,
}

/** Shared with the FPS Reducer, which estimates at a fixed CRF. */
export { BITS_PER_PIXEL }

export interface SizeEstimate {
  low: number
  high: number
}

/**
 * Rough output size band (bytes) for a re-encode. Deliberately a range: the
 * real size swings with motion and detail, so a single figure would be a lie.
 */
export function estimateResizeSize(
  width: number,
  height: number,
  fps: number,
  durationSec: number,
  crf: number,
): SizeEstimate | null {
  if (!width || !height || !durationSec || durationSec <= 0) return null
  const safeFps = fps > 0 && fps <= 240 ? fps : 30
  const bpp = BITS_PER_PIXEL[crf] ?? 0.04
  const bytes = (width * height * bpp * safeFps * durationSec) / 8
  return { low: Math.round(bytes * 0.5), high: Math.round(bytes * 2) }
}

/**
 * How long the re-encode will take, in seconds. Factors are ×duration measured
 * on a deliberately weak 2-vCPU machine (this is a conservative upper bound —
 * a normal laptop is usually 2-3x faster).
 */
const TIME_FACTOR_AT_720P: Record<ResizeQuality, number> = {
  smallest: 2.6,
  balanced: 2.7,
  quality: 4.0,
}

const REFERENCE_PIXELS = 1280 * 720

export function estimateResizeSeconds(
  durationSec: number,
  quality: ResizeQuality,
  width: number,
  height: number,
): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || !width || !height) return 0
  // Smaller frames encode faster, but decoding the source costs the same either
  // way, hence the 0.5 floor.
  const pixelFactor = Math.max(0.5, Math.pow((width * height) / REFERENCE_PIXELS, 0.6))
  return durationSec * TIME_FACTOR_AT_720P[quality] * pixelFactor
}

/** Human-friendly duration for an estimate: "≈45s" / "≈6 min" / "≈1h 20m". */
export function formatEstimate(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  if (seconds < 90) return `≈${Math.round(seconds)}s`
  const minutes = seconds / 60
  if (minutes < 60) return `≈${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `≈${h}h ${m}m` : `≈${h}h`
}

/** Input/output filename: "<base>-720p.mp4". */
export function makeResizeFilename(sourceName: string, targetShortSide: number): string {
  const base = (sourceName || 'video').replace(/\.[^.]+$/, '') || 'video'
  return `${base}-${targetShortSide}p.mp4`
}
