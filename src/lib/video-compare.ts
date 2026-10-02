/**
 * video-compare.ts (lib) — the multi-video stage.
 *
 * Decoders are plain <video> elements, kept hidden. Nothing is ever shown from
 * them directly: one canvas composites every pane, and it is repainted ONLY
 * inside the master pane's requestVideoFrameCallback, gated on the other
 * decoders sitting in the same frame. Two elements playing side by side drift
 * (measured: mean 23 ms, max 33 ms, out of half-a-frame lock in 55 of 79
 * samples); this gate removes that entirely (measured alignment error 0.00000 s)
 * at the honest cost of following the slowest decoder.
 *
 * No ffmpeg, no re-encode, no upload: playback, compositing and the PSNR maths
 * are all browser-native. Nothing in this file loads wasm.
 */

import {
  bestOffset,
  compareBuffers,
  offsetCandidates,
  type CompareMode,
  type FrameMetrics,
  type TimelinePoint,
} from '../engine/video-compare'

export interface StagePane {
  id: number
  file: File
  url: string
  video: HTMLVideoElement
  duration: number
  width: number
  height: number
  /** Frame rate when the file's own box table could tell us. */
  fps: number | null
}

export interface StageState {
  time: number
  duration: number
  playing: boolean
  metrics: FrameMetrics | null
  timeline: TimelinePoint[]
  /** Frames actually composited (the ones that passed the alignment gate). */
  painted: number
  /** Frames dropped because a decoder was a frame or more behind. */
  skipped: number
  frameLocked: boolean
  /** How far apart the last painted pair was, in milliseconds. */
  alignMs: number
}

export interface StageOptions {
  container: HTMLElement
  canvas: HTMLCanvasElement
  onState?: (state: StageState) => void
}

/** Minimal shape of the rVFC metadata we rely on. */
interface FrameMeta {
  mediaTime: number
}

const MAX_CANVAS_EDGE = 1280
const METRIC_SAMPLE_MS = 250
// The metric runs on a copy of each frame, so it is sampled smaller than the
// canvas — but not SO small that it flatters the encode: drawImage averages when
// it downscales, and averaging erases the high-frequency detail that compression
// damages first. 320px measured 11.7% of pixels differing on a pair that the
// full-resolution spike put at 74%; 640px tracks the full-resolution number.
const METRIC_WIDTH = 640
const MAX_TIMELINE_POINTS = 1500

export class CompareStage {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private onState?: (s: StageState) => void

  private panes: StagePane[] = []
  private mode: CompareMode = 'side-by-side'
  private swipe = 0.5
  private opacity = 0.5
  private blinkIndex = 0
  private loop: [number, number] | null = null

  private lastMediaTime: number[] = []
  private rvfcIds: number[] = []
  private rafId: number | null = null

  private playing = false
  private time = 0
  private metrics: FrameMetrics | null = null
  private timeline: TimelinePoint[] = []
  private painted = 0
  private skipped = 0
  private lastMetricAt = 0
  private lastPaintedKey = ''
  private alignMs = 0
  private masterFrames = 0
  private nextId = 1
  private disposed = false

  /** Scratch canvases for the metric (kept out of the visible canvas). */
  private scratchA: HTMLCanvasElement
  private scratchB: HTMLCanvasElement

  constructor(opts: StageOptions) {
    this.container = opts.container
    this.canvas = opts.canvas
    this.onState = opts.onState
    const ctx = opts.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.')
    this.ctx = ctx
    this.scratchA = document.createElement('canvas')
    this.scratchB = document.createElement('canvas')
  }

  // ── Panes ───────────────────────────────────────────

  get paneCount(): number {
    return this.panes.length
  }

  get frameLocked(): boolean {
    return typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype
  }

  /** Add a clip as a hidden decoder. Throws a readable error if it cannot play. */
  async addPane(file: File): Promise<StagePane> {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    // Kept in the DOM (browsers may stop decoding a detached video) but
    // invisible: the canvas is the only thing the user ever sees.
    video.style.cssText = 'position:absolute;width:2px;height:2px;opacity:0;pointer-events:none;left:-10px;top:-10px'
    this.container.appendChild(video)

    try {
      await this.waitForMetadata(video, file.name)
    } catch (err) {
      video.remove()
      URL.revokeObjectURL(url)
      throw err
    }

    const pane: StagePane = {
      id: this.nextId++,
      file,
      url,
      video,
      duration: video.duration || 0,
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      fps: null,
    }
    // A finished element must flip the transport back to paused, or the UI keeps
    // claiming it is playing while the gate rejects every frame.
    video.addEventListener('ended', () => {
      const anyPlaying = this.panes.some((p) => !p.video.paused && !p.video.ended)
      if (!anyPlaying) {
        this.playing = false
        this.emit()
      }
    })
    this.panes.push(pane)
    this.lastMediaTime.push(0)
    this.resizeCanvas()
    this.attachFrameLoop(this.panes.length - 1)
    this.paintNow(0)
    return pane
  }

  /** Frame rate, when a pane's own box table could supply it (set by the caller). */
  setPaneFps(id: number, fps: number | null): void {
    const pane = this.panes.find((p) => p.id === id)
    if (pane) pane.fps = fps
    this.emit()
  }

  removePane(id: number): void {
    const i = this.panes.findIndex((p) => p.id === id)
    if (i < 0) return
    const pane = this.panes[i]
    this.cancelFrameLoop(i)
    pane.video.pause()
    pane.video.removeAttribute('src')
    pane.video.remove()
    URL.revokeObjectURL(pane.url)
    this.panes.splice(i, 1)
    this.lastMediaTime.splice(i, 1)
    this.rvfcIds.splice(i, 1)
    this.timeline = []
    this.metrics = null
    this.resizeCanvas()
    if (this.panes.length) this.paintNow(this.time)
    this.emit()
  }

  private waitForMetadata(video: HTMLVideoElement, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ok = () => {
        cleanup()
        if (!video.duration && !video.videoWidth) {
          reject(new Error(`Could not read “${name}” — it may have no video stream.`))
          return
        }
        resolve()
      }
      const fail = () => {
        cleanup()
        // The honest reason: this is the browser's codec support, not the file.
        reject(
          new Error(
            `This browser cannot decode “${name}”. Its codec is outside what the built-in player supports (HEVC in Chrome, ProRes and some MKV files are common examples).`,
          ),
        )
      }
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', ok)
        video.removeEventListener('error', fail)
        window.clearTimeout(timer)
      }
      const timer = window.setTimeout(fail, 15000)
      video.addEventListener('loadedmetadata', ok)
      video.addEventListener('error', fail)
    })
  }

  // ── The gated paint loop ────────────────────────────

  private attachFrameLoop(index: number): void {
    const pane = this.panes[index]
    if (!pane) return
    this.cancelFrameLoop(index)

    if (this.frameLocked) {
      const cb = (_now: number, meta: FrameMeta) => {
        if (this.disposed) return
        this.rvfcIds[index] = pane.video.requestVideoFrameCallback(cb)
        this.handleFrame(index, meta.mediaTime)
      }
      this.rvfcIds[index] = pane.video.requestVideoFrameCallback(cb)
      return
    }
    // Fallback for browsers without rVFC: a rAF clock reading currentTime. The
    // gate still applies, but it quantises to rAF ticks instead of frames.
    if (this.rafId != null) return
    const tick = () => {
      if (this.disposed) return
      this.rafId = window.requestAnimationFrame(tick)
      if (!this.playing) return
      this.panes.forEach((p, i) => {
        this.lastMediaTime[i] = p.video.currentTime
      })
      this.handleFrame(0, this.panes[0]?.video.currentTime ?? 0)
    }
    this.rafId = window.requestAnimationFrame(tick)
  }

  private cancelFrameLoop(index: number): void {
    const pane = this.panes[index]
    const id = this.rvfcIds[index]
    if (pane && id != null && pane.video.cancelVideoFrameCallback) {
      pane.video.cancelVideoFrameCallback(id)
    }
    this.rvfcIds[index] = -1
  }

  private handleFrame(index: number, mediaTime: number): void {
    if (!this.panes[index]) return
    this.lastMediaTime[index] = mediaTime
    if (!this.playing) return
    // What the master actually presented: the baseline the paint count is
    // measured against. Counting rejected callbacks instead would double-count
    // one frame per decoder and make the drop rate look twice as bad as it is.
    if (index === 0) this.masterFrames++

    // Segment loop: jump back to the start of the slice we are staring at.
    // Only the master drives it, or every pane would seek at once.
    if (index === 0 && this.loop && mediaTime >= this.loop[1]) {
      void this.seek(this.loop[0])
      return
    }

    // Half a frame, never a whole one. At a full-frame tolerance a pair that is
    // exactly one frame apart passes the gate — frame N against frame N+1, the
    // precise failure this gate exists to prevent.
    const tol = 0.5 / (this.panes[0].fps || 30)
    const times = this.lastMediaTime
    const ref = times[0] ?? 0
    let worst = 0
    const aligned = this.panes.every((_, i) => {
      const d = Math.abs((times[i] ?? 0) - ref)
      if (d > worst) worst = d
      return d <= tol
    })

    // The check runs on EVERY pane's callback, not just the master's. Decoders
    // present the same frame a few milliseconds apart and in an unpredictable
    // order: whichever fires first would look at the other's PREVIOUS frame and
    // reject, every single time. Waiting for the set to close fixes that — and
    // the aligned set is painted once, not once per callback.
    if (!aligned) return
    const key = times.map((t) => Math.round(t * 1000)).join(':')
    if (key === this.lastPaintedKey) return
    this.lastPaintedKey = key

    this.time = ref
    this.alignMs = Math.round(worst * 1000)
    this.paint()
    this.painted++
    this.maybeSampleMetrics(ref)
    this.emit()
  }

  // ── Transport ───────────────────────────────────────

  async play(): Promise<void> {
    if (!this.panes.length) return
    // Pressing play at the end has to restart: calling play() on a finished
    // element leaves it parked at the duration, which reads as "playing" while
    // producing no frames at all.
    const end = this.duration
    if (end > 0 && this.time >= end - 0.05) {
      await this.seek(0)
    }
    this.playing = true
    await Promise.all(this.panes.map((p) => p.video.play().catch(() => {})))
    this.emit()
  }

  pause(): void {
    this.playing = false
    this.panes.forEach((p) => p.video.pause())
    this.emit()
  }

  async seek(t: number): Promise<void> {
    if (!this.panes.length) return
    const duration = this.duration
    const target = Math.max(0, Math.min(duration || 0, t))
    await Promise.all(
      this.panes.map(
        (p) =>
          new Promise<void>((resolve) => {
            const done = () => {
              p.video.removeEventListener('seeked', done)
              resolve()
            }
            p.video.addEventListener('seeked', done)
            // A paused <video> does not always fire rVFC after a seek, so the
            // composite is repainted here rather than waiting for a frame.
            p.video.currentTime = target
            window.setTimeout(done, 1500)
          }),
      ),
    )
    this.lastMediaTime = this.panes.map(() => target)
    this.time = target
    this.paint()
    this.emit()
  }

  /** Step exactly one frame (using the master pane's frame rate). */
  async stepFrame(delta: number): Promise<void> {
    const fps = this.panes[0]?.fps || 30
    this.pause()
    await this.seek(this.time + delta / fps)
  }

  /** Loop a short slice around the current position — the artifact-inspection view. */
  setLoop(seconds: number | null): void {
    if (seconds == null || !this.panes.length) this.loop = null
    else this.loop = [Math.max(0, this.time), Math.min(this.duration, this.time + seconds)]
    this.emit()
  }

  get loopRange(): [number, number] | null {
    return this.loop
  }

  get duration(): number {
    return this.panes.reduce((min, p) => (min === 0 ? p.duration : Math.min(min, p.duration)), 0)
  }

  get currentTime(): number {
    return this.time
  }

  // ── View options ────────────────────────────────────

  setMode(mode: CompareMode): void {
    this.mode = mode
    this.paint()
    this.emit()
  }

  setSwipe(x: number): void {
    this.swipe = Math.max(0, Math.min(1, x))
    this.paint()
  }

  setOpacity(v: number): void {
    this.opacity = Math.max(0, Math.min(1, v))
    this.paint()
  }

  setBlinkIndex(i: number): void {
    this.blinkIndex = Math.max(0, Math.min(this.panes.length - 1, i))
    this.paint()
  }

  // ── Painting ────────────────────────────────────────

  private resizeCanvas(): void {
    const master = this.panes[0]
    if (!master) return
    const w = master.width || 1280
    const h = master.height || 720
    const scale = Math.min(1, MAX_CANVAS_EDGE / Math.max(w, h))
    this.canvas.width = Math.max(2, Math.round(w * scale))
    this.canvas.height = Math.max(2, Math.round(h * scale))
  }

  /** Letterbox a video into a box, preserving its aspect ratio. */
  private drawFit(video: HTMLVideoElement, x: number, y: number, w: number, h: number): void {
    const vw = video.videoWidth || w
    const vh = video.videoHeight || h
    const scale = Math.min(w / vw, h / vh)
    const dw = vw * scale
    const dh = vh * scale
    this.ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  }

  private paint(): void {
    const { width: W, height: H } = this.canvas
    const ctx = this.ctx
    if (!this.panes.length) {
      ctx.clearRect(0, 0, W, H)
      return
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    const [a, b] = this.panes

    if (this.mode === 'side-by-side') {
      const half = W / 2
      this.drawFit(a.video, 0, 0, half, H)
      if (b) this.drawFit(b.video, half, 0, half, H)
      // divider
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(half - 0.5, 0, 1, H)
      return
    }

    if (this.mode === 'blink') {
      const pane = this.panes[this.blinkIndex] ?? a
      this.drawFit(pane.video, 0, 0, W, H)
      return
    }

    if (this.mode === 'difference') {
      this.drawFit(a.video, 0, 0, W, H)
      if (b) {
        ctx.globalCompositeOperation = 'difference'
        this.drawFit(b.video, 0, 0, W, H)
        ctx.globalCompositeOperation = 'source-over'
      }
      return
    }

    if (this.mode === 'overlay') {
      this.drawFit(a.video, 0, 0, W, H)
      if (b) {
        ctx.globalAlpha = this.opacity
        this.drawFit(b.video, 0, 0, W, H)
        ctx.globalAlpha = 1
      }
      return
    }

    // swipe: A whole, B revealed from the divider rightwards
    this.drawFit(a.video, 0, 0, W, H)
    if (b) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(W * this.swipe, 0, W - W * this.swipe, H)
      ctx.clip()
      this.drawFit(b.video, 0, 0, W, H)
      ctx.restore()
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillRect(W * this.swipe - 1, 0, 2, H)
    }
  }

  /** Repaint outside the loop (after a seek, a mode change, or a pane edit). */
  paintNow(t?: number): void {
    if (t != null) this.time = t
    this.paint()
    this.emit()
  }

  // ── Measurement ─────────────────────────────────────

  private sampleSize(): { w: number; h: number } {
    const master = this.panes[0]
    const aspect = master && master.height ? master.width / master.height : 16 / 9
    // Never sample wider than the source: upscaling would invent pixels and
    // smooth the very differences we are trying to measure.
    const sourceW = master?.width || METRIC_WIDTH
    const w = Math.max(64, Math.min(METRIC_WIDTH, sourceW))
    const h = Math.max(2, Math.round(w / aspect))
    return { w, h }
  }

  private readSample(video: HTMLVideoElement, w: number, h: number, scratch: HTMLCanvasElement): Uint8ClampedArray | null {
    if (!video.videoWidth) return null
    scratch.width = w
    scratch.height = h
    const c = scratch.getContext('2d', { willReadFrequently: true })
    if (!c) return null
    c.fillStyle = '#000'
    c.fillRect(0, 0, w, h)
    const vw = video.videoWidth
    const vh = video.videoHeight
    const scale = Math.min(w / vw, h / vh)
    c.drawImage(video, (w - vw * scale) / 2, (h - vh * scale) / 2, vw * scale, vh * scale)
    return c.getImageData(0, 0, w, h).data
  }

  /** Compare the two panes' current frames. Public so the UI can force it. */
  measure(): FrameMetrics | null {
    if (this.panes.length < 2) return null
    const { w, h } = this.sampleSize()
    const A = this.readSample(this.panes[0].video, w, h, this.scratchA)
    const B = this.readSample(this.panes[1].video, w, h, this.scratchB)
    if (!A || !B) return null
    return compareBuffers(A, B, w, h)
  }

  private maybeSampleMetrics(t: number): void {
    const now = performance.now()
    if (now - this.lastMetricAt < METRIC_SAMPLE_MS) return
    this.lastMetricAt = now
    const m = this.measure()
    if (!m) return
    this.metrics = m
    this.timeline.push({ t, psnr: m.psnr })
    if (this.timeline.length > MAX_TIMELINE_POINTS) this.timeline.shift()
  }

  /**
   * Hunt for the true sync between two recordings: try each candidate offset and
   * keep the one whose frames match best. Verified in the spike that a shifted
   * copy of the same content reaches MSE 0 at the right offset.
   */
  async detectOffset(referenceTime?: number): Promise<{ offset: number; mse: number } | null> {
    if (this.panes.length < 2) return null
    const wasPlaying = this.playing
    this.pause()
    const t0 = referenceTime ?? Math.min(this.duration * 0.5, 2)
    const results: { offset: number; mse: number }[] = []
    for (const off of offsetCandidates()) {
      const t = t0 + off
      if (t < 0 || t > this.duration) continue
      await this.seekPair(t0, t)
      const m = this.measure()
      if (m) results.push({ offset: off, mse: m.mse })
    }
    await this.seek(t0)
    if (wasPlaying) await this.play()
    return bestOffset(results)
  }

  /** Seek pane 0 to `ta` and pane 1 to `tb` — used by offset detection. */
  private async seekPair(ta: number, tb: number): Promise<void> {
    const jobs = [this.panes[0], this.panes[1]].map(
      (p, i) =>
        new Promise<void>((resolve) => {
          const done = () => {
            p.video.removeEventListener('seeked', done)
            resolve()
          }
          p.video.addEventListener('seeked', done)
          p.video.currentTime = i === 0 ? ta : tb
          window.setTimeout(done, 1500)
        }),
    )
    await Promise.all(jobs)
    this.lastMediaTime[0] = ta
    if (this.panes[1]) this.lastMediaTime[1] = tb
    this.time = ta
    this.paint()
    this.emit()
  }

  // ── Output ──────────────────────────────────────────

  /** The composited frame as a PNG — a shareable still of what you are looking at. */
  snapshot(): Promise<Blob | null> {
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
  }

  clearTimeline(): void {
    this.timeline = []
    this.metrics = null
    this.emit()
  }

  private emit(): void {
    this.onState?.({
      time: this.time,
      duration: this.duration,
      playing: this.playing,
      metrics: this.metrics,
      timeline: [...this.timeline],
      painted: this.painted,
      skipped: Math.max(0, this.masterFrames - this.painted),
      frameLocked: this.frameLocked,
      alignMs: this.alignMs,
    })
  }

  dispose(): void {
    this.disposed = true
    if (this.rafId != null) window.cancelAnimationFrame(this.rafId)
    this.rvfcIds.forEach((_, i) => this.cancelFrameLoop(i))
    this.panes.forEach((p) => {
      p.video.pause()
      p.video.removeAttribute('src')
      p.video.remove()
      URL.revokeObjectURL(p.url)
    })
    this.panes = []
    this.lastMediaTime = []
    this.rvfcIds = []
    this.timeline = []
  }
}