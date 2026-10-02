/**
 * VideoCompareTool — watch two (or more) clips against each other, frame-locked.
 *
 * The stage never shows the <video> elements: it composites them onto one canvas
 * and repaints only when the decoders agree on the frame (proposal 023 /
 * DEC-022). Five views share that one clock — side by side, swipe, difference,
 * overlay and blink — so a difference you spot in one is the same frame in the
 * others. Everything is browser-native: no ffmpeg, no core download, no upload.
 *
 * Measurement is part of the deal: PSNR/MSE on the current pair, a timeline of
 * the worst PSNR per slice (so the damage has a location, not just an average),
 * and offset detection for two recordings of the same thing.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Columns2, Loader2, Pause, Play, Plus, Ruler, SkipBack, SkipForward, Timer, Trash2, X } from 'lucide-react'

import { formatBytes } from '../engine/video-slice'
import {
  COMPARE_MODES,
  bucketWorst,
  pairingLabel,
  pairingMode,
  percent,
  psnrLabel,
  type CompareMode,
  type FrameMetrics,
  type PaneSpec,
} from '../engine/video-compare'
import { CompareStage, type StagePane, type StageState } from '../lib/video-compare'
import { readBoxMetadata } from '../lib/video-metadata'
import { avcProfileLabel, videoCodecName } from '../engine/video-metadata'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'

// ── Constants ─────────────────────────────────────────

const ACCEPT_VIDEO = 'video/*,.mp4,.mov,.m4v,.webm,.mkv,.ogv'
const MAX_PANES = 4

type Status = 'idle' | 'ok' | 'error' | 'processing'

interface PaneRow {
  pane: StagePane
  spec: PaneSpec | null
  reading: boolean
}

const EMPTY_STATE: StageState = {
  time: 0,
  duration: 0,
  playing: false,
  metrics: null,
  timeline: [],
  painted: 0,
  skipped: 0,
  frameLocked: true,
  alignMs: 0,
}

// ── Component ─────────────────────────────────────────

export default function VideoCompareTool() {
  const toast = useToast()

  const [rows, setRows] = useState<PaneRow[]>([])
  const [stage, setStage] = useState<StageState>(EMPTY_STATE)
  const [mode, setMode] = useState<CompareMode>('side-by-side')
  const [swipe, setSwipe] = useState(0.5)
  const [opacity, setOpacity] = useState(0.5)
  const [blink, setBlink] = useState(0)
  const [loopOn, setLoopOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [offsetBusy, setOffsetBusy] = useState(false)
  const [offset, setOffset] = useState<{ offset: number; mse: number } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const stageHostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<CompareStage | null>(null)
  const rowsRef = useRef<PaneRow[]>([])

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  // ── Stage lifecycle ─────────────────────────────────
  useEffect(() => {
    if (!stageHostRef.current || !canvasRef.current) return
    const s = new CompareStage({
      container: stageHostRef.current,
      canvas: canvasRef.current,
      onState: setStage,
    })
    stageRef.current = s
    return () => {
      s.dispose()
      stageRef.current = null
    }
  }, [])

  // ── Adding files ────────────────────────────────────
  const addFiles = useCallback(
    async (files: FileList | File[] | null | undefined) => {
      const list = files ? Array.from(files) : []
      if (!list.length || !stageRef.current) return
      const s = stageRef.current
      setError(null)
      setBusy(true)
      for (const file of list) {
        if (rowsRef.current.length >= MAX_PANES) {
          toast.push(`Up to ${MAX_PANES} clips at once.`, { variant: 'error' })
          break
        }
        if (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv|ogv)$/i.test(file.name)) {
          toast.push(`${file.name} is not a video file.`, { variant: 'error' })
          continue
        }
        try {
          const pane = await s.addPane(file)
          const row: PaneRow = { pane, spec: null, reading: true }
          rowsRef.current = [...rowsRef.current, row]
          setRows(rowsRef.current)

          // Specs come from the file's own box table — instant, no ffmpeg
          // (proposal 022). Frame rate also feeds the frame-stepper and the
          // alignment gate.
          const box = await readBoxMetadata(file).catch(() => null)
          const video = box?.meta?.tracks.find((t) => t.kind === 'video')
          const fps =
            video?.mediaTimescale && video?.sampleCount && video?.mediaDurationSec
              ? video.sampleCount / video.mediaDurationSec
              : null
          if (fps) s.setPaneFps(pane.id, fps)
          const spec: PaneSpec | null = video
            ? {
                videoCodec: videoCodecName(video.codec),
                profile: avcProfileLabel(video.avcProfile, video.avcLevel, video.avcCompat),
                width: video.width,
                height: video.height,
                fpsLabel: fps ? `${fps.toFixed(3).replace(/\.?0+$/, '')} fps` : undefined,
                frameCount: video.sampleCount,
                videoKbps: video.streamKbps,
                audioCodec: box?.meta?.tracks.find((t) => t.kind === 'audio')?.codec?.toUpperCase(),
                audioChannels: undefined,
                durationSec: box?.meta?.durationSec,
                container: box?.meta?.container?.majorBrand,
              }
            : null
          rowsRef.current = rowsRef.current.map((r) => (r.pane.id === pane.id ? { ...r, spec, reading: false } : r))
          setRows(rowsRef.current)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(msg)
          toast.push(msg, { variant: 'error' })
        }
      }
      setBusy(false)
      setOffset(null)
      if (rowsRef.current.length >= 2) void stageRef.current.play().catch(() => {})
    },
    [toast],
  )

  const removePane = useCallback((id: number) => {
    stageRef.current?.removePane(id)
    rowsRef.current = rowsRef.current.filter((r) => r.pane.id !== id)
    setRows(rowsRef.current)
    setOffset(null)
    if (rowsRef.current.length < 2) stageRef.current?.pause()
  }, [])

  const clearAll = useCallback(() => {
    rowsRef.current.forEach((r) => stageRef.current?.removePane(r.pane.id))
    rowsRef.current = []
    setRows([])
    setOffset(null)
    setError(null)
    toast.push('Cleared', { variant: 'info' })
  }, [toast])

  // ── Transport ───────────────────────────────────────
  const togglePlay = useCallback(() => {
    const s = stageRef.current
    if (!s) return
    if (stage.playing) s.pause()
    else void s.play().catch(() => {})
  }, [stage.playing])

  const step = useCallback((delta: number) => {
    void stageRef.current?.stepFrame(delta)
  }, [])

  const toggleLoop = useCallback(() => {
    const s = stageRef.current
    if (!s) return
    if (loopOn) {
      s.setLoop(null)
      setLoopOn(false)
    } else {
      s.setLoop(2)
      setLoopOn(true)
      toast.push('Looping the next 2 seconds', { variant: 'info' })
    }
  }, [loopOn, toast])

  const findOffset = useCallback(async () => {
    const s = stageRef.current
    if (!s || rowsRef.current.length < 2) return
    setOffsetBusy(true)
    try {
      const best = await s.detectOffset()
      setOffset(best)
      if (best) {
        toast.push(
          `Best alignment: ${best.offset >= 0 ? '+' : ''}${best.offset.toFixed(2)}s (MSE ${best.mse})`,
          { variant: best.mse === 0 ? 'success' : 'info' },
        )
      }
    } catch (err) {
      toast.push(`Offset search failed: ${err instanceof Error ? err.message : String(err)}`, { variant: 'error' })
    } finally {
      setOffsetBusy(false)
    }
  }, [toast])

  const snapshot = useCallback(async () => {
    const s = stageRef.current
    if (!s || rowsRef.current.length < 2) return
    const blob = await s.snapshot()
    if (!blob) return
    const [a, b] = rowsRef.current
    const name = `${a.pane.file.name.replace(/\.[^.]+$/, '')}-vs-${b.pane.file.name.replace(/\.[^.]+$/, '')}-${mode}.png`
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.push('Comparison frame saved as PNG', { variant: 'success' })
  }, [mode, toast])

  // ── Keyboard: space plays, arrows step a frame ───────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        step(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        step(-1)
      } else if (e.key === 'Escape' && rowsRef.current.length) {
        clearAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, step, clearAll])

  // ── PSNR timeline chart ─────────────────────────────
  useEffect(() => {
    const canvas = chartRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(0, 0, W, H)
    const buckets = bucketWorst(stage.timeline, stage.duration || 0, W)
    const lo = 15
    const hi = 50
    for (let x = 0; x < buckets.length; x++) {
      const v = buckets[x]
      if (!Number.isFinite(v)) continue
      const norm = Math.max(0, Math.min(1, (hi - v) / (hi - lo)))
      const h = Math.max(1, norm * H)
      ctx.fillStyle = v >= 40 ? 'rgba(52,211,153,0.85)' : v >= 30 ? 'rgba(251,191,36,0.85)' : 'rgba(248,113,113,0.9)'
      ctx.fillRect(x, H - h, 1, h)
    }
    if (stage.duration > 0) {
      const px = Math.round((stage.time / stage.duration) * W)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillRect(px, 0, 1, H)
    }
  }, [stage.timeline, stage.time, stage.duration])

  // ── Derived ─────────────────────────────────────────
  const hasTwo = rows.length >= 2
  const pair = useMemo(
    () =>
      rows.length >= 2
        ? pairingMode(rows[0].pane.fps, rows[1].pane.fps)
        : 'time',
    [rows],
  )
  const status: Status = busy ? 'processing' : error ? 'error' : rows.length ? 'ok' : 'idle'
  const activeMode = COMPARE_MODES.find((m) => m.id === mode)

  const renderMetrics = (m: FrameMetrics | null) =>
    m
      ? [
          ['PSNR', `${m.psnr === Infinity ? '∞' : m.psnr} dB`],
          ['Verdict', psnrLabel(m.psnr)],
          ['Mean abs diff', `${m.meanAbs} / 255`],
          ['Pixels differing', percent(m.diffFraction)],
          ['Sampled at', `${m.sampleWidth}×${m.sampleHeight}`],
        ]
      : [
          ['PSNR', '—'],
          ['Verdict', 'waiting for two clips'],
          ['Mean abs diff', '—'],
          ['Pixels differing', '—'],
          ['Sampled at', '—'],
        ]

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-3 pt-3">
        <div className="flex items-center gap-2">
          <Columns2 className="h-4 w-4 text-honey-400" />
          <span className="text-xs font-500 text-ink-300">Video Compare</span>
          <span className="text-[11px] text-ink-500">
            {rows.length} clip{rows.length === 1 ? '' : 's'}
            {hasTwo ? ` · ${pair === 'frame' ? 'frame-locked' : 'time-paired'}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasTwo && (
            <button
              onClick={snapshot}
              className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 transition-colors hover:text-honey-300"
            >
              Save frame
            </button>
          )}
          <button
            onClick={clearAll}
            disabled={!rows.length}
            className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 transition-colors hover:text-red-400 disabled:opacity-40 disabled:hover:text-ink-400"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>

      {/* Hidden decoders live here — the canvas is all the user sees */}
      <div ref={stageHostRef} className="pointer-events-none absolute h-0 w-0 overflow-hidden" aria-hidden="true" />

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-3 pb-3">
        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e: DragEvent<HTMLInputElement>) => {
            e.preventDefault()
            setDragging(false)
            void addFiles(e.dataTransfer.files)
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
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center transition-all ${
            hasTwo ? 'border-ink-700/60 py-2.5' : 'min-h-[9rem] flex-1 border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30'
          } ${dragging ? 'scale-[1.01] border-honey-400 bg-honey-400/5' : ''}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_VIDEO}
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {hasTwo ? (
            <span className="flex items-center gap-2 text-[11px] text-ink-400">
              <Plus className="h-3 w-3" /> Drop another clip to add a pane ({rows.length}/{MAX_PANES})
            </span>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink-700 bg-ink-800/50">
                <Columns2 className="h-[18px] w-[18px] text-honey-400" />
              </div>
              <span className="text-sm font-500 text-ink-200">Drop two videos to compare</span>
              <span className="text-[11px] text-ink-500">
                Played frame-locked on one canvas — side by side, swipe, difference or blink. Read
                straight off your disk: no ffmpeg, no upload.
              </span>
            </>
          )}
        </div>

        {/* Pane list */}
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {rows.map((row, i) => (
              <div
                key={row.pane.id}
                className="flex min-w-[15rem] flex-1 items-start gap-2 rounded-md border border-ink-800 bg-ink-900/40 px-2.5 py-2"
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-honey-500/15 text-[10px] font-600 text-honey-300">
                  {String.fromCharCode(65 + i)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] text-ink-200">{row.pane.file.name}</div>
                  <div className="text-[10px] text-ink-500">
                    {formatBytes(row.pane.file.size)} · {row.pane.width}×{row.pane.height} ·{' '}
                    {row.pane.duration.toFixed(2)}s
                  </div>
                  <div className="mt-0.5 text-[10px] text-ink-500">
                    {row.reading ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" /> reading spec…
                      </span>
                    ) : row.spec ? (
                      [
                        row.spec.videoCodec,
                        row.spec.profile,
                        row.spec.width ? `${row.spec.width}×${row.spec.height}` : null,
                        row.spec.fpsLabel,
                        row.spec.frameCount ? `${row.spec.frameCount} frames` : null,
                        row.spec.videoKbps ? `${(row.spec.videoKbps / 1000).toFixed(2)} Mbps` : null,
                        row.spec.audioCodec,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    ) : (
                      'spec unavailable — not an MP4/MOV box table'
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removePane(row.pane.id)}
                  className="mt-0.5 shrink-0 text-ink-600 transition-colors hover:text-red-400"
                  title="Remove pane"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Stage. The canvas must exist from the first render: the stage is
            constructed in an effect that needs this ref, and a stage that
            cannot be built can never accept the first clip. It is simply
            hidden until there are two panes to show. */}
        <div className={`min-h-0 flex-1 flex-col gap-3 lg:flex-row ${hasTwo ? 'flex' : 'hidden'}`}>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-ink-800 bg-black">
                <canvas ref={canvasRef} className="h-full w-full object-contain" />
                {mode === 'swipe' && (
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={swipe}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setSwipe(v)
                      stageRef.current?.setSwipe(v)
                    }}
                    className="absolute bottom-2 left-1/2 w-[70%] -translate-x-1/2 accent-honey-400"
                    aria-label="Swipe divider"
                  />
                )}
                {mode === 'blink' && (
                  <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-md border border-ink-700 bg-ink-950/80 p-0.5">
                    {rows.map((r, i) => (
                      <button
                        key={r.pane.id}
                        onClick={() => {
                          setBlink(i)
                          stageRef.current?.setBlinkIndex(i)
                        }}
                        className={`rounded px-2 py-0.5 text-[11px] ${
                          blink === i ? 'bg-honey-500/20 text-honey-300' : 'text-ink-400'
                        }`}
                      >
                        {String.fromCharCode(65 + i)}
                      </button>
                    ))}
                  </div>
                )}
                {!stage.frameLocked && (
                  <div className="absolute top-2 left-2 rounded bg-red-900/80 px-2 py-0.5 text-[10px] text-red-200">
                    This browser has no frame callback — pairing is quantised
                  </div>
                )}
              </div>

              {/* Transport */}
              <div className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => step(-1)}
                    className="text-ink-400 transition-colors hover:text-honey-300"
                    title="Previous frame (←)"
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-honey-500 text-ink-950 transition-all hover:bg-honey-400 active:scale-95"
                    title="Play / pause (space)"
                  >
                    {stage.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => step(1)}
                    className="text-ink-400 transition-colors hover:text-honey-300"
                    title="Next frame (→)"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.01, stage.duration)}
                    step={0.001}
                    value={Math.min(stage.time, stage.duration)}
                    onChange={(e) => void stageRef.current?.seek(Number(e.target.value))}
                    className="min-w-0 flex-1 accent-honey-400"
                  />
                  <span className="shrink-0 font-mono text-[11px] text-honey-300">
                    {stage.time.toFixed(2)}s
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-500">
                    / {stage.duration.toFixed(2)}s
                  </span>
                  <button
                    onClick={toggleLoop}
                    className={`flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                      loopOn
                        ? 'border-honey-500/50 bg-honey-500/15 text-honey-300'
                        : 'border-ink-700 text-ink-400 hover:text-honey-300'
                    }`}
                    title="Loop a 2 second slice from here"
                  >
                    <Timer className="h-3 w-3" /> Loop 2s
                  </button>
                </div>
              </div>
            </div>

            {/* Right rail: modes + measurement */}
            <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[19rem]">
              <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-2">
                <div className="mb-1.5 text-[10px] tracking-wide text-ink-500 uppercase">View</div>
                <div className="grid grid-cols-2 gap-1">
                  {COMPARE_MODES.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setMode(m.id)
                        stageRef.current?.setMode(m.id)
                      }}
                      className={`rounded px-2 py-1 text-[11px] transition-colors ${
                        mode === m.id
                          ? 'bg-honey-500/15 text-honey-300'
                          : 'border border-ink-800 text-ink-400 hover:text-ink-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-ink-500">{activeMode?.hint}</p>
                {mode === 'overlay' && (
                  <label className="mt-2 flex items-center gap-2 text-[10px] text-ink-400">
                    Opacity
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={opacity}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setOpacity(v)
                        stageRef.current?.setOpacity(v)
                      }}
                      className="flex-1 accent-honey-400"
                    />
                    <span className="font-mono text-honey-300">{Math.round(opacity * 100)}%</span>
                  </label>
                )}
              </div>

              <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-2">
                <div className="mb-1.5 flex items-center justify-between text-[10px] tracking-wide text-ink-500 uppercase">
                  <span className="flex items-center gap-1">
                    <Ruler className="h-3 w-3" /> Difference
                  </span>
                  <button
                    onClick={() => void findOffset()}
                    disabled={offsetBusy}
                    className="rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400 normal-case transition-colors hover:text-honey-300 disabled:opacity-40"
                    title="Search for the true sync between the two clips"
                  >
                    {offsetBusy ? 'searching…' : 'find offset'}
                  </button>
                </div>
                <dl className="space-y-1">
                  {renderMetrics(stage.metrics).map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-2">
                      <dt className="text-[10px] text-ink-500">{k}</dt>
                      <dd className="min-w-0 truncate font-mono text-[10px] text-ink-200" title={String(v)}>
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
                {offset && (
                  <p className="mt-1.5 text-[10px] text-honey-300">
                    Best alignment {offset.offset >= 0 ? '+' : ''}
                    {offset.offset.toFixed(2)}s (MSE {offset.mse})
                  </p>
                )}
                <div className="mt-2">
                  <div className="mb-0.5 text-[10px] text-ink-500">Worst PSNR per slice</div>
                  <canvas ref={chartRef} width={280} height={44} className="h-[44px] w-full rounded" />
                </div>
              </div>

              <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-2">
                <div className="mb-1 text-[10px] tracking-wide text-ink-500 uppercase">Pairing</div>
                <p className="text-[10px] leading-relaxed text-ink-500">{pairingLabel(pair)}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-ink-500">
                  {stage.painted} frames drawn as {stage.painted + stage.skipped} presented ·{' '}
                  {stage.skipped} skipped waiting for the slower decoder · last pair {stage.alignMs} ms
                  apart. Presentation follows the slowest clip — the pairing never drifts.
                </p>
              </div>
            </div>
        </div>

        {/* Guidance while a single clip is loaded */}
        {rows.length === 1 && !busy && (
          <div className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-3 text-xs text-ink-300">
            <p className="mb-1">Add a second clip to start comparing.</p>
            <p className="text-[11px] text-ink-500">
              The usual pairing is a source and its export — drop the original, then the compressed
              or resized result, and use Swipe or Difference to see what the encode cost.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">{error}</div>
        )}
      </div>

      <StatusBar
        inputChars={rows.reduce((n, r) => n + r.pane.file.size, 0)}
        outputChars={rows.reduce((n, r) => n + r.pane.file.size, 0)}
        status={status}
        error={error}
        durationMs={null}
        wasmLabel="wasm-free"
      />
    </div>
  )
}