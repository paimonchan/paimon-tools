/**
 * ImageToVideoTool - turn one photo plus an audio track into an MP4.
 *
 * Lazy-loaded ref tool. The picture is drawn onto a canvas at the exact target
 * size first (which fixes EXIF rotation, flattens alpha and widens format
 * support beyond what ffmpeg.wasm can decode), then looped for the length of
 * the audio and encoded with libx264.
 *
 * The frame rate is the user's choice and defaults to 5fps: a still image gains
 * nothing from 30fps, and measured on this app's single-threaded core 1-5fps is
 * 5-21x faster at effectively the same file size.
 * 100% client-side.
 */

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { AudioLines, ImagePlay, Loader2, X } from 'lucide-react'

import { formatBytes } from '../engine/video-slice'
import {
  DEFAULT_FPS,
  FIT_MODES,
  FPS_OPTIONS,
  RESOLUTION_PRESETS,
  estimateImageVideoSeconds,
  estimateImageVideoSize,
  formatEstimate,
  makeImageVideoFilename,
  type FitMode,
} from '../engine/image-video'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'
import ResultPreview from './ResultPreview'

// ── Constants ─────────────────────────────────────────

const ACCEPT_IMAGE = 'image/*'
const ACCEPT_AUDIO = 'audio/*,.mp3,.m4a,.aac,.wav,.opus,.ogg,.flac'

/** Above this, the encode stops feeling instant — warn with an estimate. */
const SLOW_SECONDS = 45

type Status = 'idle' | 'ok' | 'error' | 'processing'

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

interface ImageMeta {
  width: number
  height: number
  size: number
}

interface AudioMeta {
  duration: number
  size: number
}

// ── Component ─────────────────────────────────────────

export default function ImageToVideoTool() {
  const toast = useToast()

  const [image, setImage] = useState<File | null>(null)
  const [imageMeta, setImageMeta] = useState<ImageMeta | null>(null)
  const [audio, setAudio] = useState<File | null>(null)
  const [audioMeta, setAudioMeta] = useState<AudioMeta | null>(null)

  const [presetId, setPresetId] = useState(RESOLUTION_PRESETS[0].id)
  const [fit, setFit] = useState<FitMode>('fit')
  const [fps, setFps] = useState(DEFAULT_FPS)

  const [status, setStatus] = useState<Status>('idle')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'image' | 'loading' | 'detecting' | 'encoding'>('encoding')
  const [result, setResult] = useState<{
    blob: Blob
    filename: string
    width: number
    height: number
    fps: number
    audioMode: string
  } | null>(null)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState<'image' | 'audio' | null>(null)

  // ── Support ─────────────────────────────────────────
  const [supported, setSupported] = useState(true)
  useEffect(() => {
    setSupported(typeof WebAssembly !== 'undefined' && typeof createImageBitmap === 'function')
  }, [])

  // ── Derived ─────────────────────────────────────────
  const preset = useMemo(
    () => RESOLUTION_PRESETS.find((p) => p.id === presetId) ?? RESOLUTION_PRESETS[0],
    [presetId],
  )

  const duration = audioMeta?.duration ?? 0
  const sizeEstimate =
    audio && audioMeta
      ? estimateImageVideoSize({
          audioBytes: audioMeta.size,
          // AAC is kept as-is; anything else is re-encoded.
          audioCopied: /\.(m4a|aac|mp4)$/i.test(audio.name),
          durationSec: duration,
          fps,
          width: preset.width,
          height: preset.height,
        })
      : null
  const secondsEstimate = duration
    ? estimateImageVideoSeconds(duration, fps, preset.width, preset.height)
    : 0
  const isSlow = secondsEstimate > SLOW_SECONDS
  const ready = !!image && !!imageMeta && !!audio && !!audioMeta && duration > 0 && !processing

  // ── Handlers ────────────────────────────────────────
  const onSelectImage = async (f: File | null | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|avif|heic|heif|tiff?)$/i.test(f.name)) {
      toast.push('Please choose an image file.', { variant: 'error' })
      return
    }
    setStatus('processing')
    setError(null)
    setResult(null)
    try {
      const { inspectImage } = await loadVideoMedia()
      const dims = await inspectImage(f)
      setImage(f)
      setImageMeta({ width: dims.width, height: dims.height, size: f.size })
      setStatus('ok')
      toast.push(`${f.name} loaded`, { variant: 'success' })
    } catch {
      setImage(null)
      setImageMeta(null)
      setError(
        `This browser can't open that image (${f.name}). HEIC/HEIF photos work in Safari; ` +
          `elsewhere, export it as JPEG or PNG first.`,
      )
      setStatus('error')
    }
  }

  const onSelectAudio = async (f: File | null | undefined) => {
    if (!f) return
    if (!f.type.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|opus|ogg|flac)$/i.test(f.name)) {
      toast.push('Please choose an audio file.', { variant: 'error' })
      return
    }
    setStatus('processing')
    setError(null)
    setResult(null)
    try {
      const { inspectAudio } = await loadVideoMedia()
      const info = await inspectAudio(f)
      if (!info.duration) {
        setError(`Couldn't read the length of ${f.name}. Is it a playable audio file?`)
        setStatus('error')
        return
      }
      setAudio(f)
      setAudioMeta(info)
      setStatus('ok')
      toast.push(`${f.name} · ${info.duration.toFixed(1)}s loaded`, { variant: 'success' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  const clear = () => {
    setImage(null)
    setImageMeta(null)
    setAudio(null)
    setAudioMeta(null)
    setResult(null)
    setError(null)
    setProgress(0)
    setStatus('idle')
    toast.push('Cleared', { variant: 'info' })
  }

  // ── Create ──────────────────────────────────────────
  const handleCreate = async () => {
    if (!ready || !image || !audio || !audioMeta) return
    setProcessing(true)
    setStatus('processing')
    setError(null)
    setProgress(0)
    try {
      const { makeImageVideo } = await loadVideoMedia()
      const out = await makeImageVideo({
        image,
        audio,
        audioDurationSec: audioMeta.duration,
        width: preset.width,
        height: preset.height,
        fit,
        fps,
        onProgress: (p) => setProgress(p),
        onPhase: (ph) => setPhase(ph),
      })
      setResult({
        blob: out.blob,
        filename: makeImageVideoFilename(image.name, preset.id),
        width: preset.width,
        height: preset.height,
        fps,
        audioMode: out.audioMode,
      })
      setStatus('ok')
      toast.push(
        `${preset.width}×${preset.height} · ${fps}fps · ${formatBytes(out.size)} — check preview`,
        { variant: 'success' },
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      toast.push(`Create failed: ${msg}`, { variant: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  const remainingLabel = (() => {
    if (phase === 'image') return 'Preparing image…'
    if (phase === 'loading') return 'Preparing ffmpeg engine…'
    if (phase === 'detecting') return 'Reading audio…'
    const pct = Math.round(progress * 100)
    if (progress > 0.05 && secondsEstimate > 0) {
      return `Encoding… ${pct}% · ${formatEstimate((secondsEstimate * (1 - progress)) / 1)} left`
    }
    return `Encoding… ${pct}%`
  })()

  const audioHint =
    result?.audioMode === 'copy'
      ? 'Audio copied untouched.'
      : result?.audioMode === 'aac'
        ? 'Audio re-encoded to AAC.'
        : 'No audio in the source.'

  // ── Render ──────────────────────────────────────────
  const dropzone = (
    kind: 'image' | 'audio',
    label: string,
    hint: string,
    Icon: typeof ImagePlay,
    filled: boolean,
  ) => (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(kind)
      }}
      onDragLeave={() => setDragging(null)}
      onDrop={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setDragging(null)
        const f = e.dataTransfer.files?.[0]
        if (kind === 'image') onSelectImage(f)
        else onSelectAudio(f)
      }}
      onClick={() => (kind === 'image' ? imageInputRef : audioInputRef).current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          ;(kind === 'image' ? imageInputRef : audioInputRef).current?.click()
        }
      }}
      className={`flex min-h-[7.5rem] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 text-center transition-all ${
        processing ? 'pointer-events-none opacity-50' : 'cursor-pointer'
      } ${
        filled
          ? 'border-ink-600 bg-ink-800/30'
          : dragging === kind
            ? 'border-honey-400 bg-honey-400/5'
            : 'border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30'
      }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
          filled ? 'border-ink-600 bg-ink-800/60' : 'border-ink-700 bg-ink-800/50'
        }`}
      >
        <Icon className="h-4 w-4 text-honey-400" />
      </div>
      <div className="text-[10px] font-500 uppercase tracking-wider text-ink-500">{label}</div>
      {kind === 'image' && image && imageMeta ? (
        <div className="flex flex-col items-center gap-0.5">
          <span className="max-w-[16rem] truncate text-xs text-ink-200">{image.name}</span>
          <span className="text-[10px] text-ink-500">
            {imageMeta.width}×{imageMeta.height} · {formatBytes(imageMeta.size)}
          </span>
        </div>
      ) : kind === 'audio' && audio && audioMeta ? (
        <div className="flex flex-col items-center gap-0.5">
          <span className="max-w-[16rem] truncate text-xs text-ink-200">{audio.name}</span>
          <span className="text-[10px] text-ink-500">
            {audioMeta.duration.toFixed(1)}s · {formatBytes(audioMeta.size)}
          </span>
        </div>
      ) : (
        <div className="max-w-[15rem] text-[10px] leading-snug text-ink-500">{hint}</div>
      )}
    </div>
  )

  // Options never unmount while a job runs — that would shift the layout
  // mid-encode (the same jump that read as a flicker in the frame grabber).
  // They stay put and go inert instead. Any change drops the stale preview.
  const changePreset = (id: string) => {
    setPresetId(id)
    setResult(null)
  }
  const changeFit = (value: FitMode) => {
    setFit(value)
    setResult(null)
  }
  const changeFps = (value: number) => {
    setFps(value)
    setResult(null)
  }

  const optionGroup = <T extends string | number>(
    title: string,
    options: Array<{ id: T; label: string; note: string }>,
    current: T,
    onPick: (value: T) => void,
  ) => (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-500 uppercase tracking-wider text-ink-500">{title}</span>
      <div className="inline-flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={String(o.id)}
            onClick={() => onPick(o.id)}
            disabled={processing}
            title={o.note}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              current === o.id
                ? 'border-honey-400/50 bg-honey-400/15 text-honey-200'
                : 'border-ink-700 text-ink-400 hover:text-ink-200'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <input
        ref={imageInputRef}
        type="file"
        accept={ACCEPT_IMAGE}
        className="hidden"
        onChange={(e) => {
          onSelectImage(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept={ACCEPT_AUDIO}
        className="hidden"
        onChange={(e) => {
          onSelectAudio(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-3 pt-3">
        <div className="flex items-center gap-2">
          <ImagePlay className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Image to Video</span>
          {audioMeta && (
            <span className="text-[11px] text-ink-500">· {duration.toFixed(1)}s · {fps}fps</span>
          )}
        </div>
        <button
          onClick={clear}
          disabled={!image && !audio}
          className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-red-400 transition-colors disabled:opacity-40 disabled:hover:text-ink-400"
        >
          <X className="h-3 w-3" /> Clear
        </button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-3 pb-3">
        {!supported ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md rounded-lg border border-ink-700 bg-ink-900/40 p-6 text-center">
              <X className="mx-auto mb-3 h-8 w-8 text-ink-500" />
              <p className="text-sm text-ink-300">
                Your browser is missing <strong>WebAssembly</strong> or canvas image support,
                which this tool needs. Try the latest Chrome, Edge, Safari, or Firefox.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* Dropzones */}
            <div className="grid gap-3 md:grid-cols-2">
              {dropzone(
                'image',
                'Image',
                'Drop a photo (PNG, JPEG, WebP…)',
                ImagePlay,
                !!image,
              )}
              {dropzone(
                'audio',
                'Audio',
                'Drop a track (MP3, M4A, WAV…) — sets the video length',
                AudioLines,
                !!audio,
              )}
            </div>

            {/* Options — always mounted while a job runs (no layout jump) */}
            <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
              {optionGroup(
                'Resolution',
                RESOLUTION_PRESETS.map((p) => ({ id: p.id, label: p.label, note: p.note })),
                presetId,
                changePreset,
              )}
              {optionGroup(
                'Framing',
                FIT_MODES.map((f) => ({ id: f.id, label: f.label, note: f.note })),
                fit,
                changeFit,
              )}
              {optionGroup(
                'Frame rate',
                FPS_OPTIONS.map((f) => ({ id: f.value, label: f.label, note: f.note })),
                fps,
                changeFps,
              )}

              {sizeEstimate && audioMeta ? (
                <div className="text-[11px] text-ink-400">
                  {preset.width}×{preset.height} · output ≈{' '}
                  <span className="text-ink-200">{formatBytes(sizeEstimate.low)}</span>
                  {' – '}
                  <span className="text-ink-200">{formatBytes(sizeEstimate.high)}</span>
                  {' · '}
                  <span className="text-ink-300">{formatEstimate(secondsEstimate)}</span>
                  <span className="text-ink-600"> (rough — depends on the photo)</span>
                </div>
              ) : (
                <div className="text-[11px] text-ink-500">
                  {image ? 'Add an audio track to set the video length.' : 'Drop a photo to begin.'}
                </div>
              )}

              {isSlow && (
                <p className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-amber-300">
                  <strong>Long track:</strong> {Math.round(duration)}s of audio at {fps}fps will
                  take {formatEstimate(secondsEstimate)}. A lower frame rate is much faster with no
                  visible difference on a still photo.
                </p>
              )}
            </div>

            {/* Error */}
            {error && status === 'error' && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                {error}
              </div>
            )}

            {/* Create button */}
            <div className="mt-auto">
              <button
                onClick={handleCreate}
                disabled={!ready}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-500 transition-all active:scale-95 ${
                  ready
                    ? 'bg-honey-500 text-ink-950 hover:bg-honey-400'
                    : 'cursor-not-allowed bg-ink-800 text-ink-500'
                }`}
                aria-disabled={!ready}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {remainingLabel}
                  </>
                ) : (
                  <>
                    <ImagePlay className="h-4 w-4" />
                    {!image
                      ? 'Create video & download'
                      : !audio
                        ? 'Add an audio track'
                        : `${duration.toFixed(1)}s video at ${preset.width}×${preset.height}`}
                  </>
                )}
              </button>
            </div>

            {result ? (
              <ResultPreview
                kind="video"
                blob={result.blob}
                filename={result.filename}
                hint={`${result.width}×${result.height} · ${result.fps}fps · ${audioHint}`}
                reRunLabel="Create again"
                onReRun={() => {
                  setResult(null)
                  handleCreate()
                }}
              />
            ) : null}
          </div>
        )}
      </div>

      <StatusBar
        inputChars={(imageMeta?.size ?? 0) + (audioMeta?.size ?? 0)}
        outputChars={result?.blob.size ?? 0}
        wasmLabel="ffmpeg.wasm"
        status={processing ? 'processing' : status === 'error' ? 'error' : result ? 'ok' : 'empty'}
        error={error}
        durationMs={null}
      />
    </div>
  )
}
