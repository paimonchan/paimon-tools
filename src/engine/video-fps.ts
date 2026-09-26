/**
 * video-fps.ts — pure logic for the Video FPS Reducer tool.
 *
 * Zero React, zero DOM, zero browser API. Frame-rate maths and honest size/time
 * estimates. The ffmpeg.wasm call itself lives in lib/video-media.ts.
 *
 * Lowering the frame rate CANNOT stream-copy: once frames are dropped, every
 * surviving frame has to be re-derived and encoded again. So this is a re-encode
 * tool like the Resizer — but with a different purpose. It exists to make a clip
 * play lighter, apply a cinematic 24, or bring two clips onto the same rate so
 * the Merger's lossless concat will accept them. It is deliberately NOT a shrink
 * tool: see estimateFpsSize for the measured numbers.
 *
 * Output frame rate only ever goes DOWN. Repeating frames cannot invent detail
 * that was never captured, it just inflates the file.
 */

import { BITS_PER_PIXEL } from './video-resize'

export interface FpsTarget {
  id: string
  label: string
  fps: number
  note: string
}

/** Common deliverable frame rates, highest first. */
export const FPS_TARGETS: FpsTarget[] = [
  { id: '120', label: '120 fps', fps: 120, note: 'High-frame-rate — for a 240 fps source' },
  { id: '60', label: '60 fps', fps: 60, note: 'Smooth motion — gameplay, sport' },
  { id: '50', label: '50 fps', fps: 50, note: 'PAL smooth (Europe)' },
  { id: '30', label: '30 fps', fps: 30, note: 'Standard — the usual target' },
  { id: '25', label: '25 fps', fps: 25, note: 'PAL standard (Europe)' },
  { id: '24', label: '24 fps', fps: 24, note: 'Cinematic film look' },
  { id: '15', label: '15 fps', fps: 15, note: 'Choppy, but very light to play' },
  { id: '10', label: '10 fps', fps: 10, note: 'Near-slideshow' },
]

/**
 * A target is only offered when it is genuinely BELOW the source.
 *
 * The 29.97 / 59.94 trap: those sources are *lower* than their nominal 30 / 60,
 * so "30 fps" must not be offered for a 29.97 source — that would duplicate
 * frames and grow the file while claiming to reduce it. The 0.97 tolerance
 * keeps drop-frame rates on the correct side of the comparison.
 */
export function isTargetUsable(targetFps: number, sourceFps: number): boolean {
  if (!(sourceFps > 0) || !(targetFps > 0)) return false
  return targetFps < sourceFps * 0.97
}

/** Targets that would actually lower this source's rate. */
export function usableFpsTargets(sourceFps: number): FpsTarget[] {
  return FPS_TARGETS.filter((t) => isTargetUsable(t.fps, sourceFps))
}

/**
 * Which target to preselect: the one closest to HALF the source rate.
 *
 * Halving is what people mean by "reduce the frame rate" — 120 → 60, 60 → 30,
 * 50 → 25 — so a tool that defaulted a 120 fps clip to 30 would look like it
 * ignored the obvious answer. Nearest-to-half also absorbs NTSC drift: a 119.88
 * source halves to 59.94, and 60 is still the closest preset.
 *
 * Ties go to the higher rate (the list is ordered highest-first and the
 * comparison is strict), so 25 fps — whose half, 12.5, is not a preset — lands
 * on 15 rather than 10. Halving by default is consistent and one click to undo.
 */
export function defaultFpsTarget(sourceFps: number, usable = usableFpsTargets(sourceFps)): FpsTarget | null {
  if (usable.length === 0) return null
  const half = sourceFps / 2
  let best = usable[0]
  for (const t of usable) {
    if (Math.abs(t.fps - half) < Math.abs(best.fps - half)) best = t
  }
  return best
}

/**
 * "30 fps" / "29.97 fps" / "23.98 fps". NTSC rates are rarely round numbers,
 * so integers print bare and everything else keeps two decimals.
 */
export function formatFps(fpsNum: number, fpsDen: number): string {
  if (!(fpsNum > 0) || !(fpsDen > 0)) return 'unknown'
  const fps = fpsNum / fpsDen
  const text = Number.isInteger(fps) ? String(fps) : String(Number(fps.toFixed(2)))
  return `${text} fps`
}

/**
 * Output size band (bytes) for a frame-rate change at CRF 23.
 *
 * Calibrated against real encodes of a high-motion 720p clip in this app's
 * single-threaded wasm core (1280x720, 6.0s, 60fps source):
 *
 *   60 fps (re-encode, rate unchanged)  2.15 MB
 *   30 fps                              1.66 MB   −23% for half the frames
 *   24 fps                              1.46 MB   −32%
 *   15 fps                              1.18 MB   −45% for a quarter of them
 *
 * Removing half the frames does NOT halve the file. At a fixed CRF every
 * surviving frame simply gets a bigger bit budget, so the saving follows a power
 * law (exponent ≈ 0.37 measured across those three points), not a proportion.
 * A linear claim here would be a lie the user could check in five seconds.
 *
 * Resolution remains the far bigger lever — at the same CRF, 720p→360p cut 81%
 * on the same clip — so the UI points at Video Resizer when size is the goal.
 */
const FPS_SIZE_EXPONENT = 0.37

export interface SizeEstimate {
  low: number
  high: number
}

export function estimateFpsSize(
  width: number,
  height: number,
  sourceFps: number,
  targetFps: number,
  durationSec: number,
  crf = 23,
): SizeEstimate | null {
  if (!width || !height || !durationSec || durationSec <= 0) return null
  const src = sourceFps > 0 && sourceFps <= 240 ? sourceFps : 30
  const dst = targetFps > 0 && targetFps <= 240 ? targetFps : src
  const bpp = BITS_PER_PIXEL[crf] ?? BITS_PER_PIXEL[23]
  const sameRate = (width * height * bpp * src * durationSec) / 8
  const bytes = sameRate * Math.pow(dst / src, FPS_SIZE_EXPONENT)
  return { low: Math.round(bytes * 0.5), high: Math.round(bytes * 2) }
}

/**
 * Seconds the re-encode will take. Factors are ×duration measured on a
 * deliberately weak 2-vCPU machine (a conservative upper bound; a normal laptop
 * is usually 2-3x faster).
 *
 * Fewer output frames means strictly less work, so unlike the Resizer the
 * estimate must move with the target rate — measured on that same 720p clip:
 * 60fps took 22.6s, 30fps 12.9s, 15fps 8.2s, i.e. roughly fps^0.78.
 */
const TIME_FACTOR_AT_720P_60FPS = 3.8
const FPS_TIME_EXPONENT = 0.78
const REFERENCE_PIXELS = 1280 * 720

export function estimateFpsSeconds(
  durationSec: number,
  targetFps: number,
  width: number,
  height: number,
): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || !width || !height) return 0
  const fpsFactor = Math.pow(Math.max(1, targetFps) / 60, FPS_TIME_EXPONENT)
  const pixelFactor = Math.max(0.5, Math.pow((width * height) / REFERENCE_PIXELS, 0.6))
  return durationSec * TIME_FACTOR_AT_720P_60FPS * fpsFactor * pixelFactor
}

/**
 * Resolution matters far more than frame rate for file size. Both figures come
 * from this app's own benchmarks at the same CRF, and the UI shows the contrast
 * so nobody converts frames expecting the file to halve.
 */
export const FPS_SAVING_COPY =
  'Dropping the frame rate saves less than you would expect — about a fifth for half the frames. Video Resizer cuts far more if the goal is a smaller file.'

/** Input/output filename: "<base>-30fps.mp4". */
export function makeFpsFilename(sourceName: string, targetFps: number): string {
  const base = (sourceName || 'video').replace(/\.[^.]+$/, '') || 'video'
  return `${base}-${targetFps}fps.mp4`
}
