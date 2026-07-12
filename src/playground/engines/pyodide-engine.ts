/**
 * pyodide-engine.ts — run Python in the browser via Pyodide WASM.
 *
 * Pyodide (~12 MB) is fetched from CDN on first Run, then cached by
 * the browser. Expect:
 *   Cold start: 3-6s (download 12 MB + compile WASM)
 *   Warm start: ~1s (WASM cached)
 */

import type { CodeEngine, RunResult } from './types'

/** Execution timeout — same as WorkerEngine's 10s cap. */
const RUN_TIMEOUT_MS = 10_000

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<{
      runPython: (code: string) => unknown
      setStdout: (opts: { batched?: (text: string) => void; raw?: (text: string) => void }) => void
      setStderr: (opts: { batched?: (text: string) => void; raw?: (text: string) => void }) => void
      setInterruptBuffer: (buf: Int32Array | null) => void
    }>
  }
}

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'

export class PyodideEngine implements CodeEngine {
  readonly name = 'Python'
  private pyodide: Awaited<ReturnType<NonNullable<typeof window.loadPyodide>>> | null = null
  private _ready = false
  private _loading = false
  private _loadPromise: Promise<void> | null = null

  get ready(): boolean {
    return this._ready
  }

  get loading(): boolean {
    return this._loading
  }

  async load(): Promise<void> {
    if (this._ready) return
    if (this._loadPromise) return this._loadPromise

    this._loading = true
    this._loadPromise = this._doLoad()
    try {
      await this._loadPromise
    } finally {
      this._loading = false
    }
  }

  private async _doLoad(): Promise<void> {
    // Inject the pyodide loader script if not already loaded
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = `${PYODIDE_CDN}pyodide.js`
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load Pyodide script from CDN'))
        document.head.appendChild(script)
      })
    }

    if (!window.loadPyodide) {
      throw new Error('Pyodide failed to initialize')
    }

    this.pyodide = await window.loadPyodide({
      indexURL: PYODIDE_CDN,
    })
    this._ready = true
  }

  async run(code: string): Promise<RunResult> {
    await this.load()
    if (!this.pyodide) {
      return {
        stdout: '',
        stderr: '',
        error: 'Python engine not initialized',
        result: null,
        durationMs: 0,
      }
    }

    const start = performance.now()
    const stdout: string[] = []
    const stderr: string[] = []

    // Capture stdout/stderr via Pyodide's official API
    this.pyodide.setStdout({ batched: (text: string) => stdout.push(text) })
    this.pyodide.setStderr({ batched: (text: string) => stderr.push(text) })

    // Set up interrupt buffer for timeout protection.
    // Pyodide's runPython internally yields to the JS event loop when an
    // interrupt buffer is set, allowing the setTimeout to fire and signal
    // a KeyboardInterrupt. This prevents `while True: pass` from freezing.
    const interruptBuffer = new Int32Array(new ArrayBuffer(4))
    this.pyodide.setInterruptBuffer(interruptBuffer)

    const timeoutId = setTimeout(() => {
      interruptBuffer[0] = 2 // signal KeyboardInterrupt
    }, RUN_TIMEOUT_MS)

    try {
      const result = this.pyodide.runPython(code)
      clearTimeout(timeoutId)
      this.pyodide.setInterruptBuffer(null)

      const durationMs = performance.now() - start
      return {
        stdout: stdout.join('\n'),
        stderr: stderr.join('\n'),
        error: null,
        result: result === undefined ? null : String(result),
        durationMs,
      }
    } catch (err) {
      clearTimeout(timeoutId)
      this.pyodide.setInterruptBuffer(null)

      const durationMs = performance.now() - start
      const errorMsg = String(err)
      // If execution was interrupted by our timeout, report a clean message
      const isTimeout = errorMsg.includes('KeyboardInterrupt') && durationMs >= RUN_TIMEOUT_MS

      return {
        stdout: stdout.join('\n'),
        stderr: stderr.join('\n'),
        error: isTimeout ? `Execution timed out after ${RUN_TIMEOUT_MS / 1000}s` : errorMsg,
        result: null,
        durationMs,
      }
    }
  }

  dispose(): void {
    this.pyodide?.setInterruptBuffer(null)
    this.pyodide = null
    this._ready = false
  }
}
