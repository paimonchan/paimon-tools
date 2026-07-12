/**
 * pyodide-engine.ts — Python execution via Pyodide WASM.
 *
 * Pyodide (~12 MB WASM) loaded from CDN on first run, then cached by the browser.
 * Cold start: ~3-6s (download 12 MB + compile WASM).
 * Warm start: ~1s (WASM cached).
 */

import type { CodeEngine, RunResult } from './types'

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<{
      runPython: (code: string) => unknown
      globals: {
        get(key: string): unknown
      }
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

    // Capture stdout
    const origStdout = (self as any).__pyodide_stdout
    ;(self as any).__pyodide_stdout = (text: string) => stdout.push(text)

    try {
      const result = this.pyodide.runPython(code)
      const durationMs = performance.now() - start
      // Try to get captured stdout from Pyodide's internal buffer
      return {
        stdout: stdout.join('\n'),
        stderr: stderr.join('\n'),
        error: null,
        result: result === undefined ? null : String(result),
        durationMs,
      }
    } catch (err) {
      const durationMs = performance.now() - start
      return {
        stdout: stdout.join('\n'),
        stderr: stderr.join('\n'),
        error: String(err),
        result: null,
        durationMs,
      }
    } finally {
      ;(self as any).__pyodide_stdout = origStdout
    }
  }

  dispose(): void {
    this.pyodide = null
    this._ready = false
  }
}
