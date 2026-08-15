/**
 * video-merge.ts - pure logic for the Video Merger tool.
 *
 * Zero React, zero DOM, zero browser API. Only pure functions for spec
 * detection, mismatch classification, filename sanitising, and concat-list
 * building. The ffmpeg.wasm integration lives in lib/video-media.ts.
 */

/** A comparable fingerprint of a media stream, captured from the browser. */
export interface VideoSpec {
  /** video codec name, lowercase (e.g. 'h264') */
  videoCodec: string
  /** pixel format (e.g. 'yuv420p') */
  pixFmt: string
  width: number
  height: number
  /** frames per second, as a fraction numerator/denominator */
  fpsNum: number
  fpsDen: number
  /** display orientation in degrees (0/90/180/270) */
  rotation: number
  /** audio codec name (e.g. 'aac') or '' when no audio track */
  audioCodec: string
  sampleRate: number
  channels: number
}

/** One file the user queued to merge. */
export interface MergableFile {
  /** original user-facing filename */
  name: string
  /** stream fingerprint */
  spec: VideoSpec
  /** duration in seconds */
  duration: number
  /** raw size in bytes (used for RAM estimate + guards) */
  size: number
}

/** A single field that differs between two videos, with the two values. */
export interface SpecMismatch {
  /** human label of the field, e.g. "resolution" */
  field: string
  /** value seen in the baseline (first) file */
  baseline: string
  /** value seen in this file */
  actual: string
}

/** Result of checking a set of files for lossless-concat compatibility. */
export type SpecCheck =
  | { ok: true; baseline: VideoSpec; totalDuration: number; totalSize: number }
  | { ok: false; mismatches: Record<string, SpecMismatch[]> }

/**
 * Compare all files against the first (baseline) file and report every field
 * that differs. Only fields where ANY file diverges from the baseline are
 * returned, keyed by the offending file's index.
 */
export function checkCompatibility(files: MergableFile[]): SpecCheck {
  if (files.length === 0) {
    return { ok: false, mismatches: {} }
  }
  const baseline = files[0].spec
  const totalDuration = files.reduce((s, f) => s + f.duration, 0)
  const totalSize = files.reduce((s, f) => s + f.size, 0)

  const fieldDiff = (field: string, a: string, b: string) => a !== b

  /** Gather mismatches per file index. */
  const byFile: Record<string, SpecMismatch[]> = {}
  for (let i = 1; i < files.length; i++) {
    const s = files[i].spec
    const diffs: SpecMismatch[] = []
    if (fieldDiff('video codec', baseline.videoCodec, s.videoCodec)) {
      diffs.push(compare('video codec', baseline.videoCodec, s.videoCodec))
    }
    if (fieldDiff('pixel format', baseline.pixFmt, s.pixFmt)) {
      diffs.push(compare('pixel format', baseline.pixFmt, s.pixFmt))
    }
    if (fieldDiff('resolution', res(baseline), res(s))) {
      diffs.push(compare('resolution', res(baseline), res(s)))
    }
    if (fieldDiff('frame rate', fps(baseline), fps(s))) {
      diffs.push(compare('frame rate', fps(baseline), fps(s)))
    }
    if (fieldDiff('rotation', `${baseline.rotation}deg`, `${s.rotation}deg`)) {
      diffs.push(compare('rotation', `${baseline.rotation}deg`, `${s.rotation}deg`))
    }
    if (fieldDiff('audio codec', orNone(baseline.audioCodec), orNone(s.audioCodec))) {
      diffs.push(compare('audio codec', orNone(baseline.audioCodec), orNone(s.audioCodec)))
    }
    if (fieldDiff('sample rate', rate(baseline.sampleRate), rate(s.sampleRate))) {
      diffs.push(compare('sample rate', rate(baseline.sampleRate), rate(s.sampleRate)))
    }
    if (fieldDiff('channels', `${baseline.channels}`, `${s.channels}`)) {
      diffs.push(compare('channels', `${baseline.channels}`, `${s.channels}`))
    }
    if (diffs.length) byFile[String(i)] = diffs
  }

  return Object.keys(byFile).length
    ? { ok: false, mismatches: byFile }
    : { ok: true, baseline, totalDuration, totalSize }

  function compare(field: string, a: string, b: string): SpecMismatch {
    return { field, baseline: a, actual: b }
  }
  function res(s: VideoSpec) {
    return `${s.width}x${s.height}`
  }
  function fps(s: VideoSpec) {
    return s.fpsDen === 0 ? '(variable)' : `${s.fpsNum}/${s.fpsDen}`
  }
  function orNone(c: string) {
    return c || 'none'
  }
  function rate(r: number) {
    return r ? `${r} Hz` : 'none'
  }
}

/** True when every field we can read is populated (enough to judge compat). */
export function isSpecUsable(s: VideoSpec | undefined): boolean {
  if (!s) return false
  return s.width > 0 && s.height > 0 && !!s.videoCodec
}

/**
 * Build a safe, ASCII, flat filename for writing a user file into the wasm FS.
 * Strips path separators, quotes and spaces so the concat demuxer can parse
 * the list file without escaping surprises. Deterministic + run-unique via idx.
 */
export function sanitizeFsName(original: string, idx: number): string {
  const base = (original || '').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'clip'
  return `clip_${String(idx).padStart(2, '0')}_${base}.mp4`
}

/**
 * Default output filename for a merge. Derives from the FIRST input clip's base
 * name (much more useful than the old generic `merged-<timestamp>.mp4`, and it
 * stays stable across the Merger->Mixer chain). Falls back to `merged.mp4`.
 */
export function makeMergedFilename(firstInputName: string, count: number): string {
  const safe = (firstInputName || '').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '_').trim()
  const base = safe || 'merged'
  const suffix = count > 2 ? `-${count}` : ''
  return `${base}-merged${suffix}.mp4`
}
