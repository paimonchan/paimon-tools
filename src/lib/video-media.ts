/**
 * video-media.ts — browser I/O for the Video Slicer tool.
 *
 * Uses ffmpeg.wasm (@ffmpeg/ffmpeg, single-threaded core) to do LOSSESS
 * trimming of a video to a [start, end] range. Lossless because we pass
 * `-c copy` to ffmpeg: it copies the already-encoded packets (H.264/AAC)
 * without decoding or re-encoding, so the output is bit-perfect and tiny.
 *
 * Performance / lazy-load strategy (the whole point of this module):
 *   - `inspectVideo` reads duration from a native <video> element — NO wasm
 *     is loaded just to preview metadata. The 30MB ffmpeg core is only fetched
 *     once the user actually clicks "Download".
 *   - `trimVideo` lazily `import()`s @ffmpeg/ffmpeg and loads the core wasm
 *     from `public/ffmpeg-core/` on demand via `toBlobURL` (fetch + cache).
 *     Because the core lives in `public/` as a static asset fetched at runtime,
 *     it is NOT part of any JS bundle and is never `modulepreload`'d — zero
 *     impact on initial load, other pages, or SEO.
 *
 * NOTE: GitHub Pages sends no COOP/COEP headers, so SharedArrayBuffer is
 * disabled and the multithreaded core (@ffmpeg/core-mt) can't run. We use the
 * single-threaded @ffmpeg/core instead. Lossless `-c copy` doesn't need heavy
 * compute, so single-threading is fine.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { ProgressEventCallback } from '@ffmpeg/ffmpeg'

// Core wasm/js as URL assets. Vite resolves these to the correct path in both
// dev and the built site (including the `/paimon-tools/` subpath), so no
// hardcoded absolute path is needed. The core is only fetched at runtime on
// the first trim — never `modulepreload`'d, never in any initial bundle.
import coreJsUrl from '../lib/ffmpeg-core/ffmpeg-core.js?url'
import coreWasmUrl from '../lib/ffmpeg-core/ffmpeg-core.wasm?url'

export interface VideoFileInfo {
  duration: number // seconds
  name: string
  size: number // bytes
  width: number | null
  height: number | null
  hasVideo: boolean
  hasAudio: boolean
}

export interface TrimResult {
  blob: Blob
  size: number // bytes
  durationMs: number // how long the trim took
}

/** Phase of the trim, so the UI can show a clear indicator during the wasm download. */
export type TrimPhase = 'loading' | 'slicing'

/** True when the browser can run ffmpeg.wasm (needs WebAssembly). */
export function isVideoSlicerSupported(): boolean {
  return typeof WebAssembly !== 'undefined'
}

/** Paths to the ffmpeg core assets — resolved by Vite to the correct URL. */
const CORE_JS = coreJsUrl
const CORE_WASM = coreWasmUrl

let ffmpegPromise: Promise<FFmpeg> | null = null

/**
 * Lazily create + load a single shared FFmpeg instance. The 30MB core wasm is
 * fetched (and memory-cached via toBlobURL) only on the first call, i.e. the
 * first time the user downloads a slice.
 */
function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg()
      // toBlobURL fetches the core and caches it in memory so the huge wasm
      // isn't re-downloaded on every slice.
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(CORE_JS, 'text/javascript'),
        toBlobURL(CORE_WASM, 'application/wasm'),
      ])
      await ffmpeg.load({ coreURL, wasmURL })
      return ffmpeg
    })()
  }
  return ffmpegPromise
}

/**
 * Read lightweight metadata from a video File using a native <video> element.
 * Fast and wasm-free — no ffmpeg core is loaded for previewing.
 * Throws a user-friendly Error on invalid files.
 */
export async function inspectVideo(file: File): Promise<VideoFileInfo> {
  // Probe support for common codecs via a hidden <video>.
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    const duration = await new Promise<number>((resolve, reject) => {
      const onLoaded = () => {
        const d = video.duration
        if (Number.isFinite(d) && d > 0) resolve(d)
        else reject(new Error('Could not read the video duration.'))
      }
      video.addEventListener('loadedmetadata', onLoaded, { once: true })
      video.addEventListener('error', () => reject(new Error('This file is not a valid video.')), {
        once: true,
      })
      video.src = url
    })

    const width = video.videoWidth || null
    const height = video.videoHeight || null

    return {
      duration,
      name: file.name,
      size: file.size,
      width,
      height,
      hasVideo: duration > 0,
      hasAudio: true, // we can't cheaply detect audio without the core; assume yes
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Losslessly trim a video to [start, end] seconds and return a new MP4 Blob.
 * Uses ffmpeg `-ss <start> -to <end> -c copy` (stream copy, no re-encode).
 */
export async function trimVideo(
  file: File,
  start: number,
  end: number,
  onProgress?: (progress: number) => void,
  onPhase?: (phase: TrimPhase) => void,
): Promise<TrimResult> {
  const started = performance.now()
  onPhase?.('loading')

  // Load (or get cached) ffmpeg core — this may download the ~30MB wasm on the
  // first call. The UI shows a clear "preparing engine" state during this.
  const ffmpeg = await getFFmpeg()
  onPhase?.('slicing')

  // Report progress from ffmpeg's progress events.
  const progressCb: ProgressEventCallback = ({ progress: p }) => {
    onProgress?.(Math.min(1, Math.max(0, p)))
  }
  if (onProgress) ffmpeg.on('progress', progressCb)

  try {
    const inputName = 'input.mp4'
    const outputName = 'output.mp4'
    await ffmpeg.writeFile(inputName, await fetchFile(file))

    // -c copy = lossless stream copy. -ss before -i seeks fast in the file.
    await ffmpeg.exec([
      '-ss',
      formatTime(start),
      '-i',
      inputName,
      '-c',
      'copy',
      '-t',
      formatTime(end - start),
      outputName,
    ])

    const data = await ffmpeg.readFile(outputName)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' })

    await Promise.all([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)])

    return {
      blob,
      size: blob.size,
      durationMs: performance.now() - started,
    }
  } finally {
    if (onProgress) ffmpeg.off('progress', progressCb)
  }
}

/** Format seconds as ffmpeg HH:MM:SS.mmm (with leading zeros). */
function formatTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${sec.toFixed(3).padStart(6, '0')}`
}

// ── Video Merger (multi-file lossless concat) ──────────────────────────────

import { sanitizeFsName } from '../engine/video-merge'
import type { VideoSpec } from '../engine/video-merge'

export interface MergeResult {
  blob: Blob
  size: number
  durationMs: number
}

export type MergePhase = 'loading' | 'probing' | 'writing' | 'concatenating'

/**
 * Probe a file's full stream spec via ffmpeg `-i` (no output). Parses the
 * stderr log to extract codec / pixel format / resolution / fps / rotation /
 * audio codec / sample rate / channels. Returns null if the video stream
 * can't be read, so callers can block rather than blindly concat.
 *
 * NOTE: this loads the ffmpeg core (the ~30MB wasm) if not already cached.
 */
async function probeSpec(
  ffmpeg: FFmpeg,
  file: File,
  fsName: string,
): Promise<VideoSpec | null> {
  await ffmpeg.deleteFile(fsName).catch(() => {})
  await ffmpeg.writeFile(fsName, await fetchFile(file))

  const logLines: string[] = []
  const onLog = ({ type, message }: { type: string; message: string }) => {
    if (type === 'stderr' && message) logLines.push(message)
  }
  ffmpeg.on('log', onLog)
  try {
    // `-i` alone prints stream info then exits non-zero (no output) — expected.
    await ffmpeg.exec(['-i', fsName])
  } catch {
    /* expected */
  } finally {
    ffmpeg.off('log', onLog)
  }
  await ffmpeg.deleteFile(fsName).catch(() => {})

  const text = logLines.join('\n')

  // Isolate the video and audio stream lines for reliable parsing.
  const videoLine = text.match(/Stream.*?: Video: .*/)![0] ?? ''
  const audioLine = text.match(/Stream.*?: Audio: .*/)?.[0] ?? ''

  // Video line: "... Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 640x360 [SAR ...], 68 kb/s, 30 fps"
  const codecMatch = videoLine.match(/Video:\s*(\w+)/)
  // Matches "...yuv420p(progressive), 640x360..." — tolerate optional comma/space.
  const pixMatch = videoLine.match(/Video:.*?,\s*(\w+)(?:\([^)]*\))?[\s,]*(\d+)x(\d+)/)
  const fpsMatch = videoLine.match(/,\s*(\d+(?:\/\d+)?)\s*fps/)

  // Audio line: "... Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s"
  const audioMatch = audioLine.match(/Audio:\s*(\w+)/)
  const sampleRateMatch = audioLine.match(/(\d+)\s*Hz/)
  const channelMatch =
    audioLine.match(/(\d+)\s*channels?/) ||
    audioLine.match(/Audio:.*?,\s*\d+\s*Hz,\s*\d+\s*,\s*(\d+)\s*channels?/) ||
    audioLine.match(/Audio:.*?,\s*(?:stereo|mono)/)

  // Rotation is usually carried in stream metadata following the video line.
  const rotateMatch = text.match(/rotate\s*:\s*(-?\d+)/)
  const rotation = rotateMatch ? Math.abs(Number(rotateMatch[1]) % 360) : 0

  const codec = codecMatch?.[1]?.toLowerCase()
  if (!codec || !pixMatch || !fpsMatch) return null

  const [fpsNum, fpsDen] = parseFps(fpsMatch[1])
  // Channel value is either a number ("2 channels") or a layout word ("stereo"/"mono").
  const channelVal = channelMatch?.[1]?.toLowerCase()
  const channels =
    channelVal == null || /^\d+$/.test(channelVal) === false && channelVal !== 'mono'
      ? 2
      : channelVal === 'mono'
        ? 1
        : Number(channelVal)

  return {
    videoCodec: codec,
    pixFmt: pixMatch[1],
    width: Number(pixMatch[2]),
    height: Number(pixMatch[3]),
    fpsNum,
    fpsDen,
    rotation,
    audioCodec: audioMatch?.[1]?.toLowerCase() || '',
    sampleRate: sampleRateMatch ? Number(sampleRateMatch[1]) : 0,
    channels,
  }
}

function parseFps(raw: string | undefined): [number, number] {
  if (!raw) return [0, 0]
  if (raw.includes('/')) {
    const [n, d] = raw.split('/')
    return [Number(n) || 0, Number(d) || 0]
  }
  return [Number(raw) || 0, 1]
}

/**
 * Probe the full stream spec of each file (loads the ffmpeg core lazily).
 * Returns specs aligned to `files`; a null entry means that file's video
 * stream couldn't be read.
 */
export async function probeMergeSpecs(
  files: File[],
  onPhase?: (phase: MergePhase) => void,
): Promise<(VideoSpec | null)[]> {
  const ffmpeg = await getFFmpeg()
  onPhase?.('probing')
  // ffmpeg.wasm can run only ONE exec at a time and shares a single log
  // handler, so probes MUST be sequential (never Promise.all).
  const specs: (VideoSpec | null)[] = []
  for (let i = 0; i < files.length; i++) {
    specs.push(await probeSpec(ffmpeg, files[i], sanitizeFsName(files[i].name, i)))
  }
  return specs
}

/**
 * Losslessly concatenate videos that have already been confirmed compatible
 * (same spec). Builds a concat list in the FFmpeg memfs and runs
 * `-f concat -safe 0 -i list.txt -c copy -fflags +genpts`.
 *
 * Assumes the caller has already called `probeMergeSpecs` (so the core is
 * loaded) — this function refuses to start unless files are non-empty.
 */
export async function mergeVideos(
  files: { file: File; fsName: string }[],
  onProgress?: (progress: number) => void,
  onPhase?: (phase: MergePhase) => void,
): Promise<MergeResult> {
  if (files.length === 0) {
    throw new Error('No files to merge.')
  }
  const started = performance.now()
  onPhase?.('loading')
  const ffmpeg = await getFFmpeg()
  onPhase?.('writing')

  const inputNames: string[] = []

  const progressCb: ProgressEventCallback = ({ progress: p }) => {
    onProgress?.(Math.min(1, Math.max(0, p)))
  }
  if (onProgress) ffmpeg.on('progress', progressCb)

  try {
    // 1. Write every file into the memfs (safe, flat, ASCII names).
    for (const f of files) {
      await ffmpeg.writeFile(f.fsName, await fetchFile(f.file))
      inputNames.push(f.fsName)
    }

    // 2. Build the concat list (single-quoted file paths, one per line).
    const listBody = inputNames.map((n) => `file '${n}'`).join('\n') + '\n'
    await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(listBody))

    // 3. Lossless concat: stream-copy, regenerate pts for continuity.
    onPhase?.('concatenating')
    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat_list.txt',
      '-c', 'copy',
      '-fflags', '+genpts',
      'output.mp4',
    ])

    const data = await ffmpeg.readFile('output.mp4')
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' })

    return {
      blob,
      size: blob.size,
      durationMs: performance.now() - started,
    }
  } finally {
    if (onProgress) ffmpeg.off('progress', progressCb)
    // Clean the memfs after (success or failure) so RAM doesn't leak.
    await Promise.all(
      [...inputNames, 'concat_list.txt', 'output.mp4'].map((n) =>
        ffmpeg.deleteFile(n).catch(() => {}),
      ),
    )
  }
}



// ── Video Audio Extractor ───────────────────────────────────────────────

export type AudioExtractPhase = 'loading' | 'extracting'

export interface ExtractAudioResult {
  blob: Blob
  size: number
  durationMs: number
}

export interface ExtractAudioOptions {
  /** 'copy' = lossless stream copy (as-is); 'convert' = re-encode. */
  mode: 'copy' | 'convert'
  /** ffmpeg audio codec for convert mode (e.g. 'libmp3lame', 'aac'). */
  codec?: string
  /** Bitrate (kbps) for convert mode. */
  bitrateK?: number
  /** Output container `-f` hint, or undefined to infer from extension. */
  container?: string
  /** Output extension (no dot) — e.g. 'mp3', 'm4a', 'opus'. */
  ext: string
  onProgress?: (progress: number) => void
  onPhase?: (phase: AudioExtractPhase) => void
}

/**
 * Extract the audio track from a video, 100% client-side via ffmpeg.wasm.
 *
 * - mode 'copy': `-vn -c:a copy` → lossless, no re-encode, quality identical.
 * - mode 'convert': `-vn -c:a <codec> -b:a <k>k` → re-encode to another format.
 *
 * `-vn` drops the video stream. Loads the ffmpeg core lazily if not already
 * cached (the ~30MB wasm is only fetched when extraction is requested).
 */
export async function extractAudio(
  file: File,
  opts: ExtractAudioOptions,
): Promise<ExtractAudioResult> {
  const { onProgress, onPhase, mode, codec, bitrateK, container, ext } = opts
  const started = performance.now()
  onPhase?.('loading')
  const ffmpeg = await getFFmpeg()
  onPhase?.('extracting')

  const fsName = 'input_extract.mp4'
  const outName = `output_extract.${ext}`
  const progressCb: ProgressEventCallback = ({ progress: p }) => {
    onProgress?.(Math.min(1, Math.max(0, p)))
  }
  if (onProgress) ffmpeg.on('progress', progressCb)

  try {
    await ffmpeg.writeFile(fsName, await fetchFile(file))

    const args = ['-i', fsName, '-vn']
    if (mode === 'copy') {
      args.push('-c:a', 'copy')
      if (container) args.push('-f', container)
    } else {
      args.push('-c:a', codec || 'aac')
      if (bitrateK) args.push('-b:a', `${bitrateK}k`)
      if (container) args.push('-f', container)
    }
    args.push(outName)

    await ffmpeg.exec(args)

    const data = await ffmpeg.readFile(outName)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/mp4' })

    return {
      blob,
      size: blob.size,
      durationMs: performance.now() - started,
    }
  } finally {
    if (onProgress) ffmpeg.off('progress', progressCb)
    await Promise.all(
      [fsName, outName].map((n) => ffmpeg.deleteFile(n).catch(() => {})),
    )
  }
}

// ── Video Audio Mixer ─────────────────────────────────────────────────────

export type MuxPhase = 'loading' | 'detecting' | 'muxing'

export interface MuxResult {
  blob: Blob
  size: number
  durationMs: number
}

export interface MuxInput {
  video: File
  audio: File
}

/**
 * Detect the audio codec of a file (used to decide lossless-copy vs transcode).
 * Returns the codec name lowercased, or null if unreadable / no audio.
 * The audio file may be pure audio (no video stream), so we parse the audio
 * line independently of any video stream.
 */
export async function detectAudioCodec(file: File): Promise<string | null> {
  const ffmpeg = await getFFmpeg()
  const fsName = 'detect_audio.bin'
  await ffmpeg.deleteFile(fsName).catch(() => {})
  await ffmpeg.writeFile(fsName, await fetchFile(file))

  const logLines: string[] = []
  const onLog = ({ type, message }: { type: string; message: string }) => {
    if (type === 'stderr' && message) logLines.push(message)
  }
  ffmpeg.on('log', onLog)
  try {
    await ffmpeg.exec(['-i', fsName]) // errors (no output) — expected
  } catch {
    /* expected */
  } finally {
    ffmpeg.off('log', onLog)
  }
  await ffmpeg.deleteFile(fsName).catch(() => {})

  const audioLine = logLines.join('\n').match(/Stream.*?: Audio: .*/)?.[0] ?? ''
  const match = audioLine.match(/Audio:\s*(\w+)/)
  return match ? match[1].toLowerCase() : null
}

/**
 * Mux an audio track onto a video, 100% client-side via ffmpeg.wasm.
 *
 * - audio codec copy-compatible (e.g. AAC): fully lossless
 *   `-map 0:v -map 1:a -c:v copy -c:a copy -shortest`
 * - otherwise: video preserved, audio transcoded to AAC
 *   `-map 0:v -map 1:a -c:v copy -c:a aac -b:a <k>k -shortest`
 *
 * `-map` is explicit so ffmpeg always takes the video from source 0 and the
 * audio from source 1 (never picks the wrong track from the video file).
 */
export async function muxAudioToVideo(
  input: MuxInput,
  opts: {
    mode: 'copy' | 'transcode'
    aacBitrateK?: number
    onProgress?: (progress: number) => void
    onPhase?: (phase: MuxPhase) => void
  },
): Promise<MuxResult> {
  const { onProgress, onPhase, mode, aacBitrateK } = opts
  const started = performance.now()
  onPhase?.('loading')
  const ffmpeg = await getFFmpeg()
  onPhase?.('muxing')

  const vName = 'mux_in_video.mp4'
  const aName = 'mux_in_audio.bin'
  const outName = 'mux_out.mp4'
  const progressCb: ProgressEventCallback = ({ progress: p }) => {
    onProgress?.(Math.min(1, Math.max(0, p)))
  }
  if (onProgress) ffmpeg.on('progress', progressCb)

  try {
    await ffmpeg.writeFile(vName, await fetchFile(input.video))
    await ffmpeg.writeFile(aName, await fetchFile(input.audio))

    const args = ['-i', vName, '-i', aName, '-map', '0:v', '-map', '1:a']
    if (mode === 'copy') {
      args.push('-c:v', 'copy', '-c:a', 'copy')
    } else {
      args.push('-c:v', 'copy', '-c:a', 'aac')
      if (aacBitrateK) args.push('-b:a', `${aacBitrateK}k`)
    }
    args.push('-shortest', outName)

    await ffmpeg.exec(args)

    const data = await ffmpeg.readFile(outName)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' })

    return {
      blob,
      size: blob.size,
      durationMs: performance.now() - started,
    }
  } finally {
    if (onProgress) ffmpeg.off('progress', progressCb)
    await Promise.all(
      [vName, aName, outName].map((n) => ffmpeg.deleteFile(n).catch(() => {})),
    )
  }
}

// ── Video Muter (remove audio track) ──────────────────────────────────────

/**
 * Detect the video codec of a file (used to gate H.264-only in Video Muter).
 * Returns lowercased codec name, or null if no video stream found.
 * Uses ffmpeg `-i` parsing (same kernel as probeSpec).
 */
export async function detectVideoCodec(file: File): Promise<string | null> {
  const ffmpeg = await getFFmpeg()
  const fsName = 'detect_vid.bin'
  await ffmpeg.deleteFile(fsName).catch(() => {})
  await ffmpeg.writeFile(fsName, await fetchFile(file))

  const logLines: string[] = []
  const onLog = ({ type, message }: { type: string; message: string }) => {
    if (type === 'stderr' && message) logLines.push(message)
  }
  ffmpeg.on('log', onLog)
  try {
    await ffmpeg.exec(['-i', fsName])
  } catch {
    /* expected — ffmpeg exits non-zero when listing streams */
  } finally {
    ffmpeg.off('log', onLog)
  }
  await ffmpeg.deleteFile(fsName).catch(() => {})

  const videoLine = logLines.join('\n').match(/Stream.*?: Video: .*/)?.[0] ?? ''
  const match = videoLine.match(/Video:\s*(\w+)/)
  return match ? match[1].toLowerCase() : null
}

export type MutePhase = 'loading' | 'muting'

export interface MuteResult {
  blob: Blob
  size: number
  durationMs: number
}

/**
 * Remove the audio track from a video, keeping the video stream losslessly
 * intact (stream-copied, never re-encoded).
 *
 *   ffmpeg -i in.mp4 -an -c:v copy out.mp4
 *
 * `-an` disables the audio recording, so the output has no audio stream at
 * all (a silent video). Loads the ffmpeg core lazily if not already cached.
 */
export async function muteVideo(
  file: File,
  opts: {
    onProgress?: (progress: number) => void
    onPhase?: (phase: MutePhase) => void
  } = {},
): Promise<MuteResult> {
  const { onProgress, onPhase } = opts
  const started = performance.now()
  onPhase?.('loading')
  const ffmpeg = await getFFmpeg()
  onPhase?.('muting')

  const fsName = 'mute_in.mp4'
  const outName = 'mute_out.mp4'
  const progressCb: ProgressEventCallback = ({ progress: p }) => {
    onProgress?.(Math.min(1, Math.max(0, p)))
  }
  if (onProgress) ffmpeg.on('progress', progressCb)

  try {
    await ffmpeg.writeFile(fsName, await fetchFile(file))
    await ffmpeg.exec(['-i', fsName, '-an', '-c:v', 'copy', outName])

    const data = await ffmpeg.readFile(outName)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' })

    return {
      blob,
      size: blob.size,
      durationMs: performance.now() - started,
    }
  } finally {
    if (onProgress) ffmpeg.off('progress', progressCb)
    await Promise.all(
      [fsName, outName].map((n) => ffmpeg.deleteFile(n).catch(() => {})),
    )
  }
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after a tick so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}