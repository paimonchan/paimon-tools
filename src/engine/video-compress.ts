/**
 * video-compress.ts — pure logic for the Video Compressor tool.
 *
 * Zero React, zero DOM, zero browser API. Budget maths and honest estimates;
 * the two ffmpeg.wasm passes live in lib/video-media.ts.
 *
 * What this tool can and cannot do — the difference is the whole point:
 *
 *   IT CAN hit a size you name (25 MB for an email, 16 MB for WhatsApp)
 *   instead of making you guess at a resolution or a quality preset.
 *
 *   IT CANNOT add quality. Measured here: re-encoding a 147 kbps clip as
 *   mathematically lossless (51x the bitrate) left it at SSIM 0.9115 against
 *   the original — exactly the same as the low-bitrate source, +0.0000. The
 *   bits were discarded at the first encode; no later pass can invent them.
 *   So a target at or above the source size is a warning, not a feature.
 *
 * Two passes are genuinely needed. One pass cannot know how many bits the
 * footage wants, so it either blows the budget (measured +9.8% over) or lands
 * far under it. Pass 1 writes the stats, pass 2 spends them.
 */

import { estimateFpsSeconds } from './video-fps'

export type CompressMode = 'size' | 'bitrate'
export type CompressAudioMode = 'copy' | 'aac' | 'none'

export interface CompressSource {
  durationSec: number
  sizeBytes: number
  width: number | null
  height: number | null
  /** source frame rate — only used for the time estimate and the quality smell test */
  fps: number
  /** measured from the container; 0 when it could not be read */
  videoKbps: number
  audioKbps: number
  /** lowercase, or '' when the container has no audio track */
  audioCodec: string
  hasAudio: boolean
}

export interface CompressPlan {
  audioMode: CompressAudioMode
  /** what the audio will cost per second, kbps */
  audioKbps: number
  /** what we ask x264 for, kbps — for a shrink this already includes the headroom */
  videoKbps: number
  /** video + audio — the whole output, kbps */
  totalKbps: number
  targetBytes: number
  /**
   * 'down' shrinks toward a ceiling; 'up' re-encodes at a floor the platform
   * demands. The two differ in more than sign — see RAISE_HONESTY_COPY.
   */
  direction: 'down' | 'up'
  /** the budget cannot hold even a minimum video stream plus audio */
  impossible: boolean
  /** bits per pixel per frame at the planned rate — the quality smell test */
  bpp: number
  /** plain-language warnings to show verbatim, in order of importance */
  notes: string[]
}

/**
 * Leave 4% of the video budget unspent. Measured in this app's wasm core on a
 * 4.0s 720p30 clip: plain `-b:v` landed +9.8% over the budget, while `-b:v` at
 * 96% with -maxrate/-bufsize caps landed 1.0% UNDER. Under is the side that
 * matters — a file that misses a 16 MB limit by 2% still cannot be sent.
 */
const HEADROOM = 0.96

/** Audio never takes more than this share of the budget. */
const AUDIO_SHARE = 0.25

/** Bitrates to fall back to when the source audio is too expensive to keep. */
const AUDIO_LADDER = [128, 96, 64, 48]

/** Below this the picture is unrecognisable, so the target is refused outright. */
const MIN_VIDEO_KBPS = 40

export interface QuickTarget {
  id: string
  label: string
  bytes: number
  note: string
}

const MB = 1024 * 1024

/**
 * Ready-made targets, filtered to the ones that would actually shrink THIS
 * file. Offering "10 MB" for an 8 MB clip would be nonsense, so it is not
 * offered — the same reason the FPS Reducer hides rates that are not below the
 * source.
 */
export function quickTargets(sourceBytes: number): QuickTarget[] {
  const all: QuickTarget[] = [
    { id: 'half', label: 'Half the size', bytes: Math.round(sourceBytes / 2), note: 'Halve it exactly' },
    { id: '10', label: '10 MB', bytes: 10 * MB, note: 'Discord (free tier)' },
    { id: '16', label: '16 MB', bytes: 16 * MB, note: 'WhatsApp' },
    { id: '25', label: '25 MB', bytes: 25 * MB, note: 'Most email limits' },
    { id: '100', label: '100 MB', bytes: 100 * MB, note: 'Telegram-friendly' },
  ]
  return all.filter((t) => t.bytes > 0 && t.bytes < sourceBytes)
}

export function targetBytesFromMb(mb: number): number {
  return Math.round(mb * MB)
}

/**
 * A byte count as a value to put in the MB input box. Rounding "half of 930 KB"
 * to one decimal gave 0.5 MB (512 KB) — 10% off the thing the user meant. Small
 * files get more precision so the default really is half.
 */
export function formatMbForInput(bytes: number): string {
  const mb = bytes / MB
  if (mb >= 10) return mb.toFixed(0)
  if (mb >= 1) return mb.toFixed(1)
  return mb.toFixed(2)
}

export function targetBytesFromKbps(kbps: number, durationSec: number): number {
  if (!(kbps > 0) || !(durationSec > 0)) return 0
  return Math.round((kbps * 1000 * durationSec) / 8)
}

/** "3.8 Mbps" / "720 kbps" — video streams are quoted in both units. */
export function formatKbps(kbps: number): string {
  if (!(kbps > 0)) return '—'
  if (kbps >= 1000) return `${Number((kbps / 1000).toFixed(1))} Mbps`
  return `${Math.round(kbps)} kbps`
}

/**
 * Work out exactly what to ask ffmpeg for.
 *
 * The budget is a total (video + audio) because that is what the user's size
 * limit is about. Audio is paid first: copying it costs whatever the source
 * track already costs, and if that is more than a quarter of the budget we
 * re-encode it at the highest rung of the ladder that fits. Everything left
 * goes to the picture, minus the measured headroom.
 */
export function planCompression(src: CompressSource, targetBytes: number): CompressPlan {
  const notes: string[] = []
  // A target at or above the current size is the "raise it" direction: the user
  // is satisfying a floor, not shrinking. Same arithmetic, opposite intent.
  const direction: 'down' | 'up' = targetBytes >= src.sizeBytes ? 'up' : 'down'
  const floor: CompressPlan = {
    audioMode: 'none',
    audioKbps: 0,
    videoKbps: 0,
    totalKbps: 0,
    targetBytes,
    direction,
    impossible: true,
    bpp: 0,
    notes: ['That target does not leave room for a video stream.'],
  }
  if (!(src.durationSec > 0) || !(targetBytes > 0)) return floor

  const budgetKbps = (targetBytes * 8) / src.durationSec / 1000

  // 1. Audio first — it is the part we cannot shrink by encoding smarter.
  let audioMode: CompressAudioMode = 'none'
  let audioKbps = 0
  if (src.hasAudio) {
    const sourceAudio = src.audioKbps > 0 ? src.audioKbps : 128
    if (direction === 'up') {
      // Nothing is scarce when raising, so the track is kept as it is.
      audioMode = src.audioCodec === 'aac' ? 'copy' : 'aac'
      audioKbps = audioMode === 'copy' ? sourceAudio : 128
    } else {
      const audioCeiling = budgetKbps * AUDIO_SHARE
      if (src.audioCodec === 'aac' && sourceAudio <= audioCeiling) {
        audioMode = 'copy'
        audioKbps = sourceAudio
      } else {
        audioMode = 'aac'
        audioKbps = AUDIO_LADDER.find((r) => r <= audioCeiling) ?? AUDIO_LADDER[AUDIO_LADDER.length - 1]
        if (src.audioCodec === 'aac' && sourceAudio > audioCeiling) {
          notes.push(
            `The audio track alone (${formatKbps(sourceAudio)}) would eat the whole budget, so it is re-encoded at ${audioKbps} kbps.`,
          )
        }
      }
    }
  }

  // 2. Raising is a different job from shrinking: there is a floor to hold, not
  //    a ceiling to respect. x264 will not spend bits a simple picture does not
  //    want — measured here, a static clip asked for 4000 kbps came out at
  //    18 kbps, and even -minrate did not move it (16 kbps). Only CBR padding
  //    actually delivers the number, which is why lib/video-media.ts adds
  //    nal-hrd=cbr for this direction. That padding is filler, and the UI says
  //    so rather than implying the picture improves.
  if (direction === 'up') {
    const videoKbps = Math.max(MIN_VIDEO_KBPS, Math.round(budgetKbps - audioKbps))
    const bpp =
      src.width && src.height && src.fps > 0
        ? (videoKbps * 1000) / (src.width * src.height * src.fps)
        : 0
    return {
      audioMode,
      audioKbps,
      videoKbps,
      totalKbps: videoKbps + audioKbps,
      targetBytes,
      direction,
      impossible: false,
      bpp,
      notes: [
        'Raising the bitrate cannot put detail back — the extra bytes are filler. It is for meeting a platform minimum, not for sharpening the picture.',
        'The stream is padded to hold the floor (CBR), so the output lands near the number you asked for — measured 93–116% of the target here, with short clips overshooting most (overshooting is the safe side for a minimum).',
      ],
    }
  }

  // 3. Everything else belongs to the picture.
  const videoKbps = Math.round((budgetKbps - audioKbps) * HEADROOM)
  const impossible = videoKbps < MIN_VIDEO_KBPS
  if (impossible) {
    return {
      ...floor,
      audioMode,
      audioKbps,
      notes: [
        ...notes,
        `A ${formatKbps(budgetKbps)} total budget leaves nothing for the picture after audio. Ask for a bigger target, or a shorter clip.`,
      ],
    }
  }

  const bpp =
    src.width && src.height && src.fps > 0
      ? (videoKbps * 1000) / (src.width * src.height * src.fps)
      : 0

  // 4. Say the uncomfortable things out loud. A target at or above the current
  //    size never reaches here — that is the 'up' direction, handled above.
  if (targetBytes > src.sizeBytes * 0.75) {
    notes.push(
      'That is only slightly under the current size, so expect a real quality cost for a small saving. Frame rate or resolution would be the cheaper lever.',
    )
  }
  if (bpp > 0 && bpp < 0.03) {
    notes.push(
      `At ${formatKbps(videoKbps)} the picture gets roughly ${bpp.toFixed(3)} bits per pixel per frame — visibly rough. Lower the target size or shrink the resolution first.`,
    )
  }

  return {
    audioMode,
    audioKbps,
    videoKbps,
    totalKbps: videoKbps + audioKbps,
    targetBytes,
    direction,
    impossible: false,
    bpp,
    notes,
  }
}

/**
 * What the output will actually weigh.
 *
 * Shrinking: "at most the target". The budget is a ceiling, while simple
 * footage (a talking head on a static background) comes out well under it,
 * because bits are only spent where the picture asks for them.
 *
 * Raising: the floor is padded with CBR filler, so the output lands on the
 * number from either side — measured 93–116% of the request (a 4.0s clip asked
 * for 4000 kbps delivered 4654).
 */
export function estimateCompressBytes(
  targetBytes: number,
  direction: 'down' | 'up',
): { low: number; high: number } {
  if (direction === 'up') {
    return { low: Math.round(targetBytes * 0.9), high: Math.round(targetBytes * 1.2) }
  }
  return { low: Math.round(targetBytes * 0.45), high: targetBytes }
}

/**
 * Seconds the encode will take. Shrinking runs the two passes the Resizer/FPS
 * model already covers; raising needs only one, because CBR padding does not
 * read a stats file — so it is half the wait for the same length.
 */
export function estimateCompressSeconds(
  durationSec: number,
  fps: number,
  width: number,
  height: number,
  direction: 'down' | 'up',
): number {
  const passes = direction === 'up' ? 1 : 2
  return passes * estimateFpsSeconds(durationSec, fps, width, height)
}

/** Input/output filename: "<base>-12mb.mp4" / "<base>-2500kbps.mp4". */
export function makeCompressFilename(
  sourceName: string,
  mode: CompressMode,
  value: number,
): string {
  const base = (sourceName || 'video').replace(/\.[^.]+$/, '') || 'video'
  const tag = mode === 'size' ? `${value}mb` : `${Math.round(value)}kbps`
  return `${base}-${tag}.mp4`
}

/**
 * The one honest sentence this tool has to lead with when shrinking. Every
 * other video tool here saves something; this one trades quality for size and
 * cannot do the reverse in either direction.
 */
export const COMPRESS_HONESTY_COPY =
  'Compressing trades picture quality for a smaller file — it can shrink, never sharpen. A file that is already below your target gains nothing.'

/**
 * The same sentence for the other direction, where the honest answer is even
 * blunter: bits can be added, detail cannot.
 */
export const RAISE_HONESTY_COPY =
  'Raising the bitrate cannot bring detail back — the extra bytes are filler, and the picture stays exactly as it was. It exists to satisfy a minimum bitrate a platform or spec demands, nothing more.'
