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

/** True when the browser can run ffmpeg.wasm (needs WebAssembly). */
export function isVideoSlicerSupported(): boolean {
  return typeof WebAssembly !== 'undefined'
}

/** Paths to the ffmpeg core static assets (served from public/, fetched on demand).
 *  paimonchan.github.io is a user site served at the root, so absolute root paths
 *  work in both dev (localhost:5199/ffmpeg-core/) and prod (paimonchan.github.io/). */
const CORE_JS = '/ffmpeg-core/ffmpeg-core.js'
const CORE_WASM = '/ffmpeg-core/ffmpeg-core.wasm'

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
): Promise<TrimResult> {
  const started = performance.now()
  const ffmpeg = await getFFmpeg()

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