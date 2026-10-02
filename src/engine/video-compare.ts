/**
 * video-compare.ts — pure logic for the Video Compare tool.
 *
 * Nothing here touches the DOM: pixel maths, frame-pairing rules, offset-scan
 * planning, timeline bucketing and label helpers. The browser half (decoders,
 * the gated paint loop, transport) lives in lib/video-compare.ts.
 *
 * Why these numbers matter: a comparison is only honest if both pictures are the
 * SAME frame. Two <video> elements playing side by side drift (measured: mean
 * 23 ms, max 33 ms, out of half-a-frame lock in 55 of 79 samples), which is why
 * the stage gates repaints on matching mediaTime and why this module measures the
 * difference at all — the metric is what turns "looks similar" into a number.
 */

// ── Types ─────────────────────────────────────────────

export type CompareMode = 'side-by-side' | 'swipe' | 'difference' | 'overlay' | 'blink'

/** How the two clips' positions are matched when their frame rates differ. */
export type PairingMode = 'frame' | 'time'

export interface FrameMetrics {
  /** Mean squared error over RGB, 0-255 scale. */
  mse: number
  /** Peak signal-to-noise ratio in dB. Infinity when the frames are identical. */
  psnr: number
  /** Mean absolute difference per channel, 0-255. */
  meanAbs: number
  /** Fraction of pixels differing by more than a small threshold, 0-1. */
  diffFraction: number
  /** Sampling size the metric ran at. */
  sampleWidth: number
  sampleHeight: number
}

export interface TimelinePoint {
  /** Seconds into the clip. */
  t: number
  psnr: number
}

export interface PaneSpec {
  videoCodec?: string
  profile?: string
  width?: number
  height?: number
  fpsLabel?: string
  frameCount?: number
  videoKbps?: number
  audioCodec?: string
  audioChannels?: string
  sampleRate?: number
  audioKbps?: number
  durationSec?: number
  container?: string
}

// ── Pixel maths ───────────────────────────────────────

/**
 * Compare two RGBA buffers of identical size. Also returns the fraction of
 * pixels past `threshold`, which is what makes a difference view legible: "74%
 * of pixels changed" says more than a single averaged number.
 */
export function compareBuffers(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 8,
): FrameMetrics {
  const pixels = Math.min(a.length, b.length) / 4
  let se = 0
  let ae = 0
  let far = 0
  for (let i = 0; i < pixels * 4; i += 4) {
    let pixelFar = false
    for (let k = 0; k < 3; k++) {
      const d = a[i + k] - b[i + k]
      const ad = d < 0 ? -d : d
      se += d * d
      ae += ad
      if (ad > threshold) pixelFar = true
    }
    if (pixelFar) far++
  }
  const samples = pixels * 3
  const mse = samples ? se / samples : 0
  return {
    mse: round(mse, 3),
    psnr: mse === 0 ? Infinity : round(10 * Math.log10((255 * 255) / mse), 2),
    meanAbs: round(samples ? ae / samples : 0, 2),
    diffFraction: pixels ? round(far / pixels, 4) : 0,
    sampleWidth: width,
    sampleHeight: height,
  }
}

/** Candidate offsets to try when hunting for the true sync between two takes. */
export function offsetCandidates(rangeSec = 0.4, stepSec = 0.05): number[] {
  const out: number[] = []
  for (let o = -rangeSec; o <= rangeSec + 1e-9; o += stepSec) out.push(round(o, 3))
  return out
}

/** Pick the offset with the lowest error — the best alignment available. */
export function bestOffset(results: { offset: number; mse: number }[]): { offset: number; mse: number } | null {
  if (!results.length) return null
  return results.reduce((best, r) => (r.mse < best.mse ? r : best), results[0])
}

/** Mean PSNR over a timeline, ignoring infinite (identical) samples. */
export function averagePsnr(points: TimelinePoint[]): number | null {
  const finite = points.filter((p) => Number.isFinite(p.psnr))
  if (!finite.length) return null
  return round(finite.reduce((a, p) => a + p.psnr, 0) / finite.length, 2)
}

/**
 * Bucket a PSNR timeline into fixed slices so the chart shows WHERE the damage
 * is — the minimum in each slice — rather than an average that hides a bad
 * three seconds.
 */
export function bucketWorst(points: TimelinePoint[], duration: number, buckets = 60): number[] {
  const out = new Array<number>(buckets).fill(NaN)
  if (!duration) return out
  const values = new Array<number[]>(buckets)
  for (const p of points) {
    const i = Math.min(buckets - 1, Math.max(0, Math.floor((p.t / duration) * buckets)))
    if (!values[i]) values[i] = []
    if (Number.isFinite(p.psnr)) values[i].push(p.psnr)
  }
  for (let i = 0; i < buckets; i++) {
    const v = values[i]
    if (v && v.length) out[i] = Math.min(...v)
  }
  return out
}

// ── Pairing ───────────────────────────────────────────

/**
 * How to keep two clips together: by frame index when the frame rates match
 * (so an identical encode lines up frame for frame), by time otherwise. Saying
 * which rule is active is the point — silently guessing is what makes a
 * comparison untrustworthy.
 */
export function pairingMode(fpsA: number | null, fpsB: number | null): PairingMode {
  if (!fpsA || !fpsB) return 'time'
  return Math.abs(fpsA - fpsB) < 0.01 ? 'frame' : 'time'
}

export function pairingLabel(mode: PairingMode): string {
  return mode === 'frame'
    ? 'Paired by frame index — same frame rate, so frame N matches frame N'
    : 'Paired by time — the frame rates differ, so each side shows its own frame at this moment'
}

// ── Labels ────────────────────────────────────────────

export const COMPARE_MODES: { id: CompareMode; label: string; hint: string }[] = [
  { id: 'side-by-side', label: 'Side by side', hint: 'Both clips at once, letterboxed to fit.' },
  { id: 'swipe', label: 'Swipe', hint: 'Drag the divider to wipe one over the other.' },
  { id: 'difference', label: 'Difference', hint: 'Bright pixels are where the two encodings disagree.' },
  { id: 'overlay', label: 'Overlay', hint: 'Blend one over the other with adjustable opacity.' },
  { id: 'blink', label: 'Blink A/B', hint: 'Flip between the clips to catch what changed.' },
]

export function psnrLabel(psnr: number): string {
  if (!Number.isFinite(psnr)) return 'identical'
  if (psnr >= 45) return `${psnr} dB — visually identical`
  if (psnr >= 35) return `${psnr} dB — hard to tell apart`
  if (psnr >= 28) return `${psnr} dB — noticeable on close inspection`
  if (psnr >= 20) return `${psnr} dB — clear quality loss`
  return `${psnr} dB — heavily degraded`
}

export function percent(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

/** Snapshot filename derived from both inputs. */
export function makeCompareFilename(nameA: string, nameB: string, mode: CompareMode, ext = 'png'): string {
  const clean = (s: string) => (s || 'clip').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 40)
  return `${clean(nameA)}-vs-${clean(nameB)}-${mode}.${ext}`
}

/** Side-by-side is the only mode where one canvas holds both pictures whole. */
export function isCompositeMode(mode: CompareMode): boolean {
  return mode === 'side-by-side' || mode === 'swipe' || mode === 'difference' || mode === 'overlay'
}

function round(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}