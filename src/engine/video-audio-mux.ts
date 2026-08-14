/**
 * video-audio-mux.ts - pure logic for the Video Audio Mixer tool.
 *
 * Zero React, zero DOM, zero browser API. Pure functions for mux mode
 * selection, audio codec classification, filename derivation, and output
 * size estimates. Mirrors the pattern used by video-merge/video-audio.
 */

export type MuxAudioMode = 'copy' | 'transcode'

/** Audio codecs we can stream-copy into an MP4 with full confidence.
 * Restricted to AAC (the well-tested, universally-playable case). Other
 * formats (MP3, Opus, WAV, FLAC…) are transcoded to AAC so the video stays
 * lossless and output remains reliable. */
export const MP4_COPYABLE_AUDIO_CODECS = new Set(['aac'])

/**
 * Decide the mux mode from the detected audio codec of the input audio file.
 * If the audio is already copy-compatible with an MP4 container we can do a
 * fully lossless copy; otherwise we must transcode to AAC.
 */
export function resolveMuxMode(audioCodec: string | null): MuxAudioMode {
  if (audioCodec && MP4_COPYABLE_AUDIO_CODECS.has(audioCodec.toLowerCase())) {
    return 'copy'
  }
  return 'transcode'
}

export interface MuxInputStats {
  videoDurationSec: number
  audioDurationSec: number
  videoSizeBytes: number
  audioSizeBytes: number
}

export interface MuxEstimate {
  /** Which input is shorter and thus limits the output via -shortest. */
  shorter: 'video' | 'audio'
  durationSec: number
  /** Estimated output size (bytes). */
  sizeBytes: number
}

/**
 * Estimate the muxed output. Video stream is preserved (size ≈ video size);
 * audio is either copied (≈ audio size) or re-encoded to AAC (estimate).
 * Output duration = shortest of the two inputs.
 */
export function estimateMux(stats: MuxInputStats): MuxEstimate {
  const shorter =
    stats.videoDurationSec <= stats.audioDurationSec ? 'video' : 'audio'
  const durationSec = Math.min(stats.videoDurationSec, stats.audioDurationSec)

  // Conservatively estimate AAC output for a mono 44.1k stream at 128 kbps.
  const audioOutBytes =
    durationSec > 0 ? Math.round((128 * 1000 * durationSec) / 8) : 0
  const sizeBytes = stats.videoSizeBytes + audioOutBytes

  return { shorter, durationSec, sizeBytes }
}

/** Human size formatter (shared with the audio extractor). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const val = bytes / 1024 ** i
  return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${units[i]}`
}

/** Default output filename: "<video-base>-mixed.mp4". */
export function makeMuxFilename(videoName: string): string {
  const dot = videoName.lastIndexOf('.')
  const base = dot > 0 ? videoName.slice(0, dot) : videoName
  return `${base}-mixed.mp4`
}