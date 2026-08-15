/**
 * VideoAudioExtractorTool - extract the audio track from a video, in-browser.
 *
 * Lazy-loaded ref tool. Uses ffmpeg.wasm (single-threaded core) to extract
 * audio two ways:
 *   - Lossless: `-vn -c:a copy` -> .m4a (stream copy, zero re-encode)
 *   - Convert:  `-vn -c:a <codec> -b:a <k>k` -> MP3 / M4A / Opus / Ogg
 * 100% client-side, video never leaves the device.
 *
 * Flow: drop file -> inspect (hasAudio + duration) -> choose mode/format ->
 * Extract -> download.
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  Download,
  FileAudio,
  Loader2,
  Music,
  X,
} from 'lucide-react'

import {
  AUDIO_FORMATS,
  defaultFormat,
  estimateAudioSize,
  formatBytes,
  formatById,
  makeAudioFilename,
  type AudioFormat,
} from '../engine/video-audio'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'
import ResultPreview from './ResultPreview'

// ── Constants ─────────────────────────────────────────

const ACCEPT = 'video/mp4,.mp4,.mov'

type Status = 'idle' | 'ok' | 'error' | 'processing'

interface LoadedFile {
  file: File
  duration: number
  size: number
  hasAudio: boolean
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

// ── Component ─────────────────────────────────────────

export default function VideoAudioExtractorTool() {
  const toast = useToast()

  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null)
  const [extractPhase, setExtractPhase] = useState<'loading' | 'extracting'>('loading')

  const [mode, setMode] = useState<'copy' | 'convert'>('copy')
  const [formatId, setFormatId] = useState<string>(defaultFormat().id)
  const [bitrate, setBitrate] = useState<number>(AUDIO_FORMATS[1].defaultBitrate)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  // ── Support ─────────────────────────────────────────
  const [supported, setSupported] = useState(true)
  useEffect(() => {
    setSupported(typeof WebAssembly !== 'undefined')
  }, [])

  // ── Load a file ─────────────────────────────────────
  const handleFile = useCallback(
    async (f: File | null | undefined) => {
      if (!f) return
      const isVideo = /\.(mp4|mov)$/i.test(f.name) || f.type.startsWith('video/')
      if (!isVideo) {
        toast.push('Please choose an MP4 or MOV video file.', { variant: 'error' })
        return
      }
      setStatus('processing')
      setError(null)
      setProcessing(true)
      try {
        const { inspectVideo } = await loadVideoMedia()
        const meta = await inspectVideo(f)
        if (!meta.hasAudio) {
          setError('No audio track found in this video.')
          setStatus('error')
          setProcessing(false)
          return
        }
        setLoaded({ file: f, duration: meta.duration, size: meta.size, hasAudio: meta.hasAudio })
        setResult(null)
        setStatus('ok')
        toast.push(`${meta.name} loaded · audio track found`, { variant: 'success' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setStatus('error')
        toast.push(msg, { variant: 'error' })
      } finally {
        setProcessing(false)
      }
    },
    [toast],
  )

  // ── Format change ───────────────────────────────────
  const onFormatChange = (id: string) => {
    setFormatId(id)
    const fmt = formatById(id)
    if (fmt && fmt.bitrates.length) {
      // keep current bitrate if valid, else reset to default
      setBitrate(
        fmt.bitrates.includes(bitrate) ? bitrate : fmt.defaultBitrate,
      )
    }
    // mode follows the format: only the m4a-lossless entry is a copy
    setMode(fmt && !fmt.codec ? 'copy' : 'convert')
  }

  // ── Extract ─────────────────────────────────────────
  const handleExtract = async () => {
    if (!loaded || processing) return
    const fmt = formatById(formatId) ?? defaultFormat()
    setProcessing(true)
    setStatus('processing')
    setError(null)
    setProgress(0)
    try {
      const { extractAudio } = await loadVideoMedia()
      const result = await extractAudio(loaded.file, {
        mode,
        codec: mode === 'convert' ? fmt.codec ?? undefined : undefined,
        bitrateK: mode === 'convert' ? bitrate : undefined,
        container: fmt.container ?? undefined,
        ext: fmt.ext,
        onProgress: (p) => setProgress(p),
        onPhase: (ph) => setExtractPhase(ph),
      })
      const filename = makeAudioFilename(loaded.file.name, fmt)
      setResult({ blob: result.blob, filename })
      setStatus('ok')
      toast.push(`Extracted ${filename} · ${formatBytes(result.size)} — check preview`, {
        variant: 'success',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      toast.push(`Extract failed: ${msg}`, { variant: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  const clear = () => {
    setLoaded(null)
    setResult(null)
    setStatus('idle')
    setError(null)
    setProgress(0)
    toast.push('Cleared', { variant: 'info' })
  }

  // ── Derived ─────────────────────────────────────────
  const fmt = formatById(formatId) ?? defaultFormat()
  const isLossless = mode === 'copy' || !fmt.codec
  const outBitrate = mode === 'convert' ? bitrate : 192
  const estSize = loaded ? estimateAudioSize(loaded.duration, outBitrate) : 0
  const phaseLabel =
    extractPhase === 'loading'
      ? 'Preparing ffmpeg engine…'
      : isLossless
        ? `Extracting losslessly… ${Math.round(progress * 100)}%`
        : `Converting… ${Math.round(progress * 100)}%`

  return (
    <div className="flex h-full flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0])}
      />

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-3 pt-3">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Audio Extractor</span>
          {loaded && (
            <span className="text-[11px] text-ink-500">
              · {loaded.file.name} · {formatBytes(loaded.size)} · {loaded.duration.toFixed(1)}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-honey-300 transition-colors"
          >
            <FileAudio className="h-3 w-3" /> Open
          </button>
          <button
            onClick={clear}
            disabled={!loaded}
            className="rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-red-400 transition-colors disabled:opacity-40 disabled:hover:text-ink-400"
          >
            Clear
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
                Your browser doesn't support <strong>WebAssembly</strong>, which audio extraction
                requires. Try the latest Chrome, Edge, Safari, or Firefox.
              </p>
            </div>
          </div>
        ) : !loaded ? (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault()
              setDragging(false)
              handleFile(e.dataTransfer.files?.[0])
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            className={`flex flex-1 min-h-[18rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 text-center transition-all ${
              dragging
                ? 'border-honey-400 bg-honey-400/5 scale-[1.01]'
                : 'border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30'
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-ink-700 bg-ink-800/50">
              <Music className="h-6 w-6 text-honey-400" />
            </div>
            <div className="text-sm">
              <span className="text-ink-200">Drop a video with audio</span>
              <span className="text-ink-500"> or </span>
              <span className="text-honey-300 underline-offset-2 hover:underline">browse</span>
            </div>
            <div className="max-w-xs text-xs text-ink-500">
              Extract the audio track losslessly, or export as MP3 / Opus / M4A. Handled 100% on
              your device — never uploaded.
            </div>
          </div>
        ) : (
          /* Loaded: options + extract */
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
              {/* Format select */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label htmlFor="audio-fmt" className="text-[11px] text-ink-500">
                  Format
                </label>
                <select
                  id="audio-fmt"
                  value={formatId}
                  onChange={(e) => onFormatChange(e.target.value)}
                  disabled={processing}
                  className="flex-1 rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-ink-200 focus:border-honey-500/60 focus:outline-none"
                >
                  {AUDIO_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
                {mode === 'convert' && fmt.bitrates.length > 0 && (
                  <label htmlFor="audio-bit" className="text-[11px] text-ink-500">
                    Bitrate
                  </label>
                )}
                {mode === 'convert' && fmt.bitrates.length > 0 && (
                  <select
                    id="audio-bit"
                    value={bitrate}
                    onChange={(e) => setBitrate(Number(e.target.value))}
                    disabled={processing}
                    className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-ink-200 focus:border-honey-500/60 focus:outline-none"
                  >
                    {fmt.bitrates.map((b) => (
                      <option key={b} value={b}>
                        {b} kbps
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Mode hint */}
              <div className="mb-3 text-[11px] text-ink-500">
                {isLossless ? (
                  <span className="text-emerald-400">
                    <strong>Lossless</strong> — audio is stream-copied, no re-encode, quality
                    identical to the source.
                  </span>
                ) : (
                  <span>
                    <strong className="text-honey-300">Re-encoded</strong> to{' '}
                    <span className="text-ink-300">{fmt.label}</span> at {bitrate} kbps.
                  </span>
                )}
              </div>

              {/* Error */}
              {error && status === 'error' && (
                <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
                  {error}
                </div>
              )}

              {/* Extract */}
              <button
                onClick={handleExtract}
                disabled={processing}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-500 transition-all active:scale-95 ${
                  processing ? 'bg-ink-800 text-ink-500' : 'bg-honey-500 text-ink-950 hover:bg-honey-400'
                }`}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {phaseLabel}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Extract Audio
                  </>
                )}
              </button>
            </div>

            {result ? (
              <ResultPreview
                key={result.filename + result.blob.size}
                kind={processing ? 'loading' : 'audio'}
                blob={processing ? undefined : result.blob}
                filename={result.filename}
                phaseLabel={processing ? (extractPhase === 'loading' ? 'Preparing engine…' : `Extracting… ${Math.round(progress)}%`) : undefined}
                hint={isLossless ? 'Audio kept losslessly (stream-copied).' : `${fmt.label} re-encoded (${bitrate} kbps).`}
                reRunLabel="Extract again"
                onReRun={() => { setResult(null); handleExtract() }}
              />
            ) : null}

            {/* Summary */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-ink-500">
              <span>
                Video: {formatBytes(loaded.size)} · {loaded.duration.toFixed(1)}s
              </span>
              <span>→ Audio: ~{formatBytes(estSize)}</span>
              <span className={isLossless ? 'text-emerald-400' : ''}>
                {isLossless ? 'lossless (copy)' : `${outBitrate} kbps`}
              </span>
            </div>
          </div>
        )}
      </div>

      <StatusBar
        inputChars={loaded ? loaded.size : 0}
        outputChars={loaded ? estSize : 0}
        status={status === 'processing' ? 'processing' : !loaded ? 'empty' : error ? 'error' : 'ok'}
        error={error}
        durationMs={null}
      />
    </div>
  )
}