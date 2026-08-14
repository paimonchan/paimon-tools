/**
 * VideoAudioMixerTool - mux an audio track onto a video, in-browser.
 *
 * Lazy-loaded ref tool. Uses ffmpeg.wasm (single-threaded core) to take a
 * video + an audio file and produce one MP4:
 *   - audio codec copy-compatible (AAC): fully lossless
 *     -map 0:v -map 1:a -c:v copy -c:a copy -shortest
 *   - otherwise: video preserved, audio transcoded to AAC
 *   -map 0:v -map 1:a -c:v copy -c:a aac -b:a k -shortest
 * The video stream is never re-encoded. 100% client-side.
 */

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import {
  Clapperboard,
  FileVideo,
  Loader2,
  Music,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react'

import {
  estimateMux,
  formatBytes,
  makeMuxFilename,
  resolveMuxMode,
} from '../engine/video-audio-mux'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'

// ── Constants ─────────────────────────────────────────

const ACCEPT_VIDEO = 'video/mp4,.mp4,.mov'
const ACCEPT_AUDIO = 'audio/*,.mp3,.m4a,.aac,.opus,.ogg,.wav,.flac'

type Status = 'idle' | 'ok' | 'error' | 'processing'

interface LoadedVideo {
  file: File
  duration: number
  size: number
}

interface LoadedAudio {
  file: File
  codec: string | null
  duration: number
  size: number
}

/** Retry dynamic import — GH Pages swaps assets during deploy (~40s window). */
async function loadVideoMedia() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await import('../lib/video-media')
    } catch (err) {
      if (attempt >= 2) throw err
      await new Promise((r) => setTimeout(r, 800 * attempt))
    }
  }
}

/** Read audio duration (seconds) via a native <audio> element, no wasm. */
function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = new Audio()
    el.preload = 'metadata'
    const done = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(el.duration) ? el.duration : 0)
    }
    el.onloadedmetadata = () => done()
    el.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    el.src = url
  })
}

// ── Component ─────────────────────────────────────────

export default function VideoAudioMixerTool() {
  const toast = useToast()

  const [video, setVideo] = useState<LoadedVideo | null>(null)
  const [audio, setAudio] = useState<LoadedAudio | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [muxPhase, setMuxPhase] = useState<'loading' | 'detecting' | 'muxing'>('detecting')
  const [aacBitrateK, setAacBitrateK] = useState(192)

  const videoInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState<'video' | 'audio' | null>(null)

  // ── Support ─────────────────────────────────────────
  const [supported, setSupported] = useState(true)
  useEffect(() => {
    setSupported(typeof WebAssembly !== 'undefined')
  }, [])

  // ── Handlers ────────────────────────────────────────
  const onSelectVideo = async (f: File | null | undefined) => {
    if (!f) return
    if (!/\.(mp4|mov)$/i.test(f.name) && !f.type.startsWith('video/')) {
      toast.push('Please choose an MP4 or MOV video.', { variant: 'error' })
      return
    }
    setStatus('processing')
    setError(null)
    try {
      const { inspectVideo } = await loadVideoMedia()
      const meta = await inspectVideo(f)
      if (!meta.hasVideo) {
        setError('That file has no playable video track.')
        setStatus('error')
        return
      }
      setVideo({ file: f, duration: meta.duration, size: meta.size })
      setStatus('ok')
      toast.push(`Video: ${meta.name}`, { variant: 'success' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  const onSelectAudio = async (f: File | null | undefined) => {
    if (!f) return
    setStatus('processing')
    setError(null)
    try {
      const { detectAudioCodec } = await loadVideoMedia()
      setMuxPhase('detecting')
      const codec = await detectAudioCodec(f)
      if (!codec) {
        setError('No audio track found in that file.')
        setStatus('error')
        return
      }
      setAudio({ file: f, codec, duration: await getAudioDuration(f), size: f.size })
      setStatus('ok')
      toast.push(`Audio: ${f.name} (${codec})`, { variant: 'success' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  const clear = () => {
    setVideo(null)
    setAudio(null)
    setStatus('idle')
    setError(null)
    setProgress(0)
    toast.push('Cleared', { variant: 'info' })
  }

  // ── Derived ─────────────────────────────────────────
  const detectedMode = audio ? resolveMuxMode(audio.codec) : 'transcode'
  const isLosslessCopy = detectedMode === 'copy'
  const ready = !!video && !!audio && !processing
  const estimate = video && audio
    ? estimateMux({
        videoDurationSec: video.duration,
        audioDurationSec: audio.duration,
        videoSizeBytes: video.size,
        audioSizeBytes: audio.size,
      })
    : null

  const handleMix = async () => {
    if (!ready) return
    setProcessing(true)
    setStatus('processing')
    setError(null)
    setProgress(0)
    try {
      const { muxAudioToVideo, downloadBlob } = await loadVideoMedia()
      const result = await muxAudioToVideo(
        { video: video!.file, audio: audio!.file },
        {
          mode: isLosslessCopy ? 'copy' : 'transcode',
          aacBitrateK: isLosslessCopy ? undefined : aacBitrateK,
          onProgress: (p) => setProgress(p),
          onPhase: (ph) => setMuxPhase(ph),
        },
      )
      const filename = makeMuxFilename(video!.file.name)
      downloadBlob(result.blob, filename)
      setStatus('ok')
      toast.push(
        `Downloaded ${filename} · ${formatBytes(result.size)} · ${
          isLosslessCopy ? 'lossless' : 'video preserved'
        }`,
        { variant: 'success' },
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      toast.push(`Mix failed: ${msg}`, { variant: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  // ── Dropzone renderer ───────────────────────────────
  const dropzone = (
    kind: 'video' | 'audio',
    label: string,
    hint: string,
    accept: string,
    inputRef: React.RefObject<HTMLInputElement | null>,
    file: LoadedVideo | LoadedAudio | null,
    onSelect: (f: File | null | undefined) => void,
    icon: React.ReactNode,
  ) => (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(kind)
      }}
      onDragLeave={() => setDragging(null)}
      onDrop={(e: DragEvent<HTMLInputElement>) => {
        e.preventDefault()
        setDragging(null)
        onSelect(e.dataTransfer.files?.[0])
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      className={`group flex min-h-[8.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center transition-all ${
        file
          ? 'border-ink-600 bg-ink-800/30'
          : dragging === kind
            ? 'border-honey-400 bg-honey-400/5 scale-[1.01]'
            : 'border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30'
      }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
          file ? 'border-ink-600 bg-ink-800/60' : 'border-ink-700 bg-ink-800/50'
        }`}
      >
        {icon}
      </div>
      {file ? (
        <div className="flex min-w-0 flex-col items-center">
          <span className="max-w-full truncate text-xs text-ink-200">{kind === 'video'
              ? (file as LoadedVideo)?.file?.name
              : (file as LoadedAudio)?.file?.name}
          </span>
          <span className="mt-0.5 text-[10px] text-ink-500">
            {kind === 'video'
              ? `${(file as LoadedVideo).duration.toFixed(1)}s · ${formatBytes((file as LoadedVideo).size)}`
              : (file as LoadedAudio).codec
                ? `codec: ${(file as LoadedAudio).codec}${isLosslessCopy && kind === 'audio' ? ' · lossless' : ''}`
                : 'unknown'}
          </span>
        </div>
      ) : (
        <>
          <div className="text-sm">
            <span className="text-ink-200">{label}</span>
          </div>
          <div className="max-w-[16rem] text-[10px] leading-snug text-ink-500">{hint}</div>
        </>
      )}
    </div>
  )

  const phaseLabel =
    muxPhase === 'loading'
      ? 'Preparing ffmpeg engine…'
      : muxPhase === 'detecting'
        ? 'Reading audio…'
        : isLosslessCopy
          ? `Mixing losslessly… ${Math.round(progress * 100)}%`
          : `Mixing… ${Math.round(progress * 100)}%`

  return (
    <div className="flex h-full flex-col">
      <input
        ref={videoInputRef}
        type="file"
        accept={ACCEPT_VIDEO}
        className="hidden"
        onChange={(e) => onSelectVideo(e.target.files?.[0])}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept={ACCEPT_AUDIO}
        className="hidden"
        onChange={(e) => onSelectAudio(e.target.files?.[0])}
      />

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-3 pt-3">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Video + Audio Mixer</span>
          {video && audio && (
            <span className="text-[11px] text-ink-500">
              · {estimate?.durationSec.toFixed(1)}s output
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clear}
            disabled={!video && !audio}
            className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-red-400 transition-colors disabled:opacity-40 disabled:hover:text-ink-400"
          >
            <RefreshCw className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-3 pb-3">
        {!supported ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md rounded-lg border border-ink-700 bg-ink-900/40 p-6 text-center">
              <X className="mx-auto mb-3 h-8 w-8 text-ink-500" />
              <p className="text-sm text-ink-300">
                Your browser doesn't support <strong>WebAssembly</strong>, which audio mixing
                requires. Try the latest Chrome, Edge, Safari, or Firefox.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* Two dropzones */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {dropzone(
                'video', 'Drop video file', 'MP4/MOV · the video track is kept as-is (never re-encoded).',
                ACCEPT_VIDEO, videoInputRef, video, onSelectVideo,
                <FileVideo className="h-4 w-4 text-honey-400" />,
              )}
              {dropzone(
                'audio', 'Drop audio file', 'MP3, M4A, AAC, Opus, WAV… · added as the new sound.',
                ACCEPT_AUDIO, audioInputRef, audio, onSelectAudio,
                <Music className="h-4 w-4 text-honey-400" />,
              )}
            </div>

            {/* Mode + bitrate */}
            {audio && video && !processing && (
              <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
                <div className="mb-2 text-[11px]">
                  {isLosslessCopy ? (
                    <span className="text-emerald-400">
                      <strong>Fully lossless</strong> — your audio ({audio.codec}) is copy-compatible
                      with MP4, so both video &amp; audio are preserved as-is. No re-encode.
                    </span>
                  ) : (
                    <span>
                      <span className="text-honey-300"><strong>Video preserved</strong></span>{' '}
                      (h.264 stream-copied) — but your audio ({audio.codec || 'unknown'}) must be
                      converted to AAC for MP4, so the audio is re-encoded below.
                    </span>
                  )}
                </div>
                {!isLosslessCopy && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="aac-bit" className="text-[11px] text-ink-500">
                      Audio AAC bitrate
                    </label>
                    <select
                      id="aac-bit"
                      value={aacBitrateK}
                      onChange={(e) => setAacBitrateK(Number(e.target.value))}
                      className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-ink-200 focus:border-honey-500/60 focus:outline-none"
                    >
                      {[128, 160, 192, 256, 320].map((b) => (
                        <option key={b} value={b}>
                          {b} kbps
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && status === 'error' && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                {error}
              </div>
            )}

            {/* Estimate */}
            {estimate && !processing && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-ink-500">
                <span>≈ {formatBytes(estimate.sizeBytes)}</span>
                <span>
                  Output cuts at the shortest ({estimate.shorter})
                </span>
              </div>
            )}

            {/* Mix */}
            <div className="mt-auto">
              <button
                onClick={handleMix}
                disabled={!ready}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-500 transition-all active:scale-95 ${
                  ready ? 'bg-honey-500 text-ink-950 hover:bg-honey-400' : 'cursor-not-allowed bg-ink-800 text-ink-500'
                }`}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {phaseLabel}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {!video && !audio
                      ? 'Add a video + audio to start'
                      : isLosslessCopy
                        ? 'Mix & Download (lossless)'
                        : 'Mix & Download'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <StatusBar
        inputChars={(video?.size ?? 0) + (audio?.file?.size ?? 0)}
        outputChars={estimate?.sizeBytes ?? 0}
        status={status === 'processing' ? 'processing' : !video && !audio ? 'empty' : error ? 'error' : 'ok'}
        error={error}
        durationMs={null}
      />
    </div>
  )
}