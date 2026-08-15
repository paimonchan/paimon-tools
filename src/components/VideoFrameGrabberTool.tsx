/**
 * VideoFrameGrabberTool - extract frames from a video, 100% client-side.
 *
 * TRULY wasm-free (the one video tool with a truthful "wasm-free" label): grab
 * a frame with a native <video> seek + seeked + canvas.drawImage + toBlob.
 * Two modes (one click = one action):
 *   [A] Download frame @ current seek time
 *   [B] Download LAST frame (seek to duration -> grab)
 * No ffmpeg, no upload, no server. Fully GitHub Pages.
 */

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Image, ImageDown, Loader2, X } from 'lucide-react'

import { formatBytes } from '../engine/video-slice'
import {
  makeFrameFilename,
  makeLastFrameFilename,
  type FrameFormat,
} from '../engine/video-frame'
import { grabFrame, grabLastFrame, seekTo } from '../lib/video-frame'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'
import ResultPreview from './ResultPreview'

// ── Constants ─────────────────────────────────────────

const ACCEPT_VIDEO = 'video/*,.mp4,.mov,.webm'

type Status = 'idle' | 'ok' | 'error' | 'processing'

interface VideoInfo {
  duration: number
  size: number
  width: number
  height: number
}

// ── Component ─────────────────────────────────────────

export default function VideoFrameGrabberTool() {
  const toast = useToast()

  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [seek, setSeek] = useState(0)
  const [fmt, setFmt] = useState<FrameFormat>('png')
  const [quality, setQuality] = useState(0.9)
  const [result, setResult] = useState<{ blob: Blob; filename: string; mode: 'current' | 'last' } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)

  // ── Handlers ────────────────────────────────────────
  const onSelect = async (f: File | null | undefined) => {
    if (!f) return
    if (!f.type.startsWith('video/') && !/\.(mp4|mov|webm)$/i.test(f.name)) {
      toast.push('Please choose a video file.', { variant: 'error' })
      return
    }
    setStatus('processing')
    setError(null)
    setResult(null)
    setSeek(0)
    setCanvasReady(false)
    try {
      // Reuse the existing wasm-free metadata prober (inspectVideo) from the
      // shared video-media module — no ffmpeg core is loaded for this tool.
      const { inspectVideo } = await import('../lib/video-media')
      const vi = await inspectVideo(f)

      if (srcUrl) URL.revokeObjectURL(srcUrl)
      const url = URL.createObjectURL(f)

      setSrcUrl(url)
      setFile(f)
      setInfo({
        duration: vi.duration,
        size: vi.size,
        width: vi.width ?? 0,
        height: vi.height ?? 0,
      })
      setStatus('ok')
      toast.push(`${vi.name} loaded · ${formatBytes(vi.size)}`, { variant: 'success' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
    }
  }

  // ── Seek ────────────────────────────────────────────
  const handleSeek = async (t: number) => {
    setSeek(t)
    const v = videoRef.current
    if (!v) return
    await seekTo(v, t)
    drawToCanvas()
  }

  const drawToCanvas = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')?.drawImage(video, 0, 0, w, h)
    setCanvasReady(true)
  }

  // ── Grab & download ─────────────────────────────────
  const grab = async (mode: 'current' | 'last') => {
    const v = videoRef.current
    if (!v || !file) return
    setProcessing(true)
    setStatus('processing')
    setError(null)
    setResult(null)
    try {
      const blob =
        mode === 'last'
          ? await grabLastFrame(v, fmt, quality)
          : await grabFrame(v, fmt, quality)
      if (!blob) throw new Error('Could not capture a frame — make sure the video has loaded.')
      const filename =
        mode === 'last'
          ? makeLastFrameFilename(file.name, fmt)
          : makeFrameFilename(file.name, seek, fmt)
      setResult({ blob, filename, mode })
      setStatus('ok')
      toast.push(`Frame saved · ${formatBytes(blob.size)} — check preview`, { variant: 'success' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      toast.push(`Capture failed: ${msg}`, { variant: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  const clear = () => {
    if (srcUrl) URL.revokeObjectURL(srcUrl)
    setFile(null)
    setInfo(null)
    setSrcUrl(null)
    setResult(null)
    setSeek(0)
    setCanvasReady(false)
    setError(null)
    setStatus('idle')
    toast.push('Cleared', { variant: 'info' })
  }

  // ── Derived ─────────────────────────────────────────
  const hasVideo = !!file && !!info && status === 'ok'
  const canGrab = hasVideo && !processing

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-3 pt-3">
        <div className="flex items-center gap-2">
          <Image className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Video Frame Grabber</span>
          {info && (
            <span className="text-[11px] text-ink-500">
              {info.width}×{info.height} · {info.duration.toFixed(1)}s
            </span>
          )}
        </div>
        <button
          onClick={clear}
          disabled={!file}
          className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 transition-colors hover:text-red-400 disabled:opacity-40 disabled:hover:text-ink-400"
        >
          <X className="h-3 w-3" /> Clear
        </button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-3 pb-3">
        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e: DragEvent<HTMLInputElement>) => {
            e.preventDefault()
            setDragging(false)
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
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center transition-all ${hasVideo ? 'border-ink-700/60 py-4' : 'flex-1 min-h-[10rem] border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30'} ${
            dragging ? 'border-honey-400 bg-honey-400/5 scale-[1.01]' : ''
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_VIDEO}
            className="hidden"
            onChange={(e) => onSelect(e.target.files?.[0])}
          />
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
              file ? 'border-ink-600 bg-ink-800/60' : 'border-ink-700 bg-ink-800/50'
            }`}
          >
            <Image className="h-[18px] w-[18px] text-honey-400" />
          </div>
          {file && info ? (
            <div className="flex flex-col items-center gap-1">
              <span className="max-w-[20rem] truncate text-xs text-ink-200">{file.name}</span>
              <span className="text-[10px] text-ink-500">
                {formatBytes(info.size)} · {info.width}×{info.height} · {info.duration.toFixed(1)}s
              </span>
              <span className="mt-0.5 text-[10px] text-emerald-400">
                Ready to grab frames · PNG / JPEG · 100% on-device
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-500 text-ink-200">Drop a video or browse</span>
              <span className="text-[11px] text-ink-500">
                Extract any frame, or download the last frame. No ffmpeg — instant &amp; private.
              </span>
            </div>
          )}
        </div>

        {/* Editor (hidden until a video loads) */}
        {hasVideo && (
          <div className="flex flex-1 flex-col gap-3">
            {/* Video + canvas */}
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <div className="overflow-hidden rounded-lg border border-ink-800 bg-ink-900/40">
                  <video
                    ref={videoRef}
                    src={srcUrl ?? undefined}
                    controls
                    playsInline
                    muted
                    className="max-h-[30vh] w-full bg-black object-contain"
                    preload="auto"
                    onLoadedMetadata={drawToCanvas}
                    onLoadedData={drawToCanvas}
                    onSeeked={drawToCanvas}
                    onPlay={drawToCanvas}
                  />
                </div>
                <div className="text-center text-[10px] text-ink-500">
                  Source video · scrub to a moment
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-ink-800 bg-ink-900/40">
                  {/* Canvas is always mounted so drawToCanvas can find it by ref. */}
                  <canvas
                    ref={canvasRef}
                    className="max-h-[30vh] max-w-full"
                    style={{ display: canvasReady ? 'block' : 'none', width: 'auto' }}
                  />
                  {!canvasReady && (
                    <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-xs text-ink-500">
                      <Loader2 className="h-5 w-5 animate-spin text-honey-400" />
                      Preparing preview…
                    </div>
                  )}
                </div>
                <div className="text-center text-[10px] text-ink-500">Live frame preview</div>
              </div>
            </div>

            {/* Seek slider + format */}
            <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] text-ink-400">
                <span className="font-mono text-honey-300">{seek.toFixed(2)}s</span>
                <span className="text-ink-500"> / {info.duration.toFixed(2)}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={info.duration}
                step={0.001}
                value={seek}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="w-full accent-honey-400"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-ink-400">
                  Format
                  <select
                    value={fmt}
                    onChange={(e) => setFmt(e.target.value as FrameFormat)}
                    className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-[11px] text-ink-200"
                  >
                    <option value="png">PNG · lossless</option>
                    <option value="jpeg">JPEG · smaller</option>
                  </select>
                </label>
                {fmt === 'jpeg' && (
                  <label className="flex items-center gap-1.5 text-[11px] text-ink-400">
                    Quality
                    <input
                      type="range"
                      min={0.4}
                      max={1}
                      step={0.05}
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-24 accent-honey-400"
                    />
                    <span className="font-mono text-honey-300">
                      {Math.round(quality * 100)}%
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Action buttons (one click = one action) */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => grab('current')}
                disabled={!canGrab}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-honey-500 px-4 py-2.5 text-sm font-500 text-ink-950 transition-all hover:bg-honey-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-ink-800 disabled:text-ink-500"
              >
                <Image className="h-4 w-4" />
                Download frame @ {seek.toFixed(2)}s
              </button>
              <button
                onClick={() => grab('last')}
                disabled={!canGrab}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-honey-500/40 bg-honey-500/10 px-4 py-2.5 text-sm font-500 text-honey-300 transition-all hover:bg-honey-500/20 active:scale-95 disabled:cursor-not-allowed disabled:border-ink-700 disabled:bg-ink-800 disabled:text-ink-500"
              >
                <ImageDown className="h-4 w-4" />
                Download last frame
              </button>
            </div>
          </div>
        )}

        {/* Result preview */}
        {result && (
          <ResultPreview
            key={result.filename + result.blob.size}
            kind={processing ? 'loading' : 'image'}
            blob={processing ? undefined : result.blob}
            filename={result.filename}
            hint={
              fmt === 'png'
                ? 'PNG frame · lossless.'
                : `JPEG frame · ${Math.round(quality * 100)}% quality.`
            }
            reRunLabel={result.mode === 'last' ? 'Grab last again' : 'Grab frame again'}
            onReRun={() => grab(result.mode)}
          />
        )}

        {/* Error */}
        {error && status === 'error' && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      <StatusBar
        inputChars={info?.size ?? 0}
        outputChars={result?.blob.size ?? info?.size ?? 0}
        status={status === 'processing' ? 'processing' : !file ? 'empty' : error ? 'error' : 'ok'}
        error={error}
        durationMs={null}
      />
    </div>
  )
}
