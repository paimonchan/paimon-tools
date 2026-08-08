/**
 * video-slice.ts — pure logic for the Video Slicer tool.
 *
 * Zero React, zero DOM, zero browser API. Only pure functions for time
 * formatting, range validation, and filename derivation. The ffmpeg.wasm
 * integration lives in lib/video-media.ts (browser I/O).
 */

/** A validated trim range in seconds. start < end, all >= 0. */
export interface TrimRange {
  start: number
  end: number
}

/** Result of validating a proposed trim range against a duration. */
export type RangeValidation =
  | { ok: true; range: TrimRange }
  | { ok: false; error: string }

/**
 * Validate a [start, end] range (seconds) against a known duration.
 * Returns ok:true with a clamped range, or a human-readable error.
 */
export function validateRange(start: number, end: number, duration: number): RangeValidation {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(duration) || duration <= 0) {
    return { ok: false, error: 'Missing or invalid video duration.' }
  }
  if (start < 0) return { ok: false, error: 'Start time cannot be negative.' }
  if (end <= start) return { ok: false, error: 'End time must be after start time.' }
  if (start >= duration) return { ok: false, error: 'Start time is beyond the video end.' }
  // Clamp end to duration so the UI can't request past the end.
  const clampedEnd = Math.min(end, duration)
  return { ok: true, range: { start, end: clampedEnd } }
}

/** Format seconds as HH:MM:SS (or MM:SS when < 1 hour). */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** Parse "MM:SS", "HH:MM:SS", or "123.5" (seconds) into seconds. Returns NaN on garbage. */
export function parseTime(text: string): number {
  const t = text.trim()
  if (!t) return NaN
  // Plain seconds, e.g. "12.5" or "90"
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  // Colon-separated MM:SS or HH:MM:SS
  const parts = t.split(':')
  if (parts.length === 2 && parts.every((p) => /^\d+(\.\d+)?$/.test(p))) {
    return Number(parts[0]) * 60 + Number(parts[1])
  }
  if (parts.length === 3 && parts.every((p) => /^\d+(\.\d+)?$/.test(p))) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
  }
  return NaN
}

/** Derive an output filename for a trimmed clip. */
export function makeSliceFilename(sourceName: string, start: number, end: number): string {
  const base = (sourceName || 'video').replace(/\.[^.]+$/, '') || 'video'
  const a = formatTime(start).replace(/:/g, '-') || '0'
  const b = formatTime(end).replace(/:/g, '-') || 'end'
  return `${base}-slice-${a}-${b}.mp4`
}

/** Human-readable file size. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes
  let i = -1
  do {
    v /= 1024
    i++
  } while (v >= 1024 && i < units.length - 1)
  return `${v.toFixed(1)} ${units[i]}`
}