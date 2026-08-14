/**
 * video-audio.ts - pure logic for the Video Audio Extractor tool.
 *
 * Zero React, zero DOM, zero browser API. Only pure functions for format
 * definitions, bitrate presets, filename derivation and output-size estimates.
 */

export type AudioExtractMode = 'copy' | 'convert'

export interface AudioFormat {
  id: string
  /** Display label shown in the UI. */
  label: string
  /** Output file extension (no dot). */
  ext: string
  /** ffmpeg audio codec name, or null for stream-copy (Jalur A). */
  codec: string | null
  /** The `-f` container format, or null to let ffmpeg infer from extension. */
  container: string | null
  /** Available bitrate presets (kbps) for this format. */
  bitrates: number[]
  defaultBitrate: number
}

/** Supported extract output formats. First = default (lossless copy). */
export const AUDIO_FORMATS: AudioFormat[] = [
  {
    id: 'm4a-lossless',
    label: 'M4A (lossless, as-is)',
    ext: 'm4a',
    codec: null, // stream copy
    container: 'ipod',
    bitrates: [],
    defaultBitrate: 0,
  },
  {
    id: 'mp3',
    label: 'MP3',
    ext: 'mp3',
    codec: 'libmp3lame',
    container: null,
    bitrates: [128, 192, 320],
    defaultBitrate: 192,
  },
  {
    id: 'm4a-aac',
    label: 'M4A (AAC)',
    ext: 'm4a',
    codec: 'aac',
    container: 'ipod',
    bitrates: [128, 192, 256],
    defaultBitrate: 192,
  },
  {
    id: 'opus',
    label: 'Opus',
    ext: 'opus',
    codec: 'libopus',
    container: null,
    bitrates: [96, 128, 192],
    defaultBitrate: 128,
  },
  {
    id: 'vorbis',
    label: 'Vorbis (Ogg)',
    ext: 'ogg',
    codec: 'libvorbis',
    container: 'ogg',
    bitrates: [96, 128, 192],
    defaultBitrate: 128,
  },
]

export function formatById(id: string): AudioFormat | undefined {
  return AUDIO_FORMATS.find((f) => f.id === id)
}

export function defaultFormat(): AudioFormat {
  return AUDIO_FORMATS[0]
}

/** Estimated output size (bytes) for a given duration (s) and bitrate (kbps). */
export function estimateAudioSize(durationSec: number, bitrateKbits: number): number {
  // bits = bitrate_kbps * 1000 * duration; bytes = bits / 8.
  return Math.round((bitrateKbits * 1000 * Math.max(0, durationSec)) / 8)
}

/** Format a size in bytes into a human string (e.g. "2.1 MB"). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const val = bytes / 1024 ** i
  return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${units[i]}`
}

/** Derive the output filename from the source name + format. */
export function makeAudioFilename(sourceName: string, format: AudioFormat): string {
  const dot = sourceName.lastIndexOf('.')
  const base = dot > 0 ? sourceName.slice(0, dot) : sourceName
  // Mode copy keeps semantic "name" for audio; convert/index-suffixed.
  return `${base}.${format.ext}`
}