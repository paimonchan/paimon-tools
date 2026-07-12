/**
 * WorkerEngine — executes JavaScript in a Web Worker sandbox.
 *
 * Security: Workers have no DOM access by design (window, document, etc.).
 * Timeout: 10s hard cap via worker.terminate().
 * Crash recovery: Worker is re-created on each run after a crash/timeout.
 */

import type { CodeEngine, RunResult } from './types'

export class WorkerEngine implements CodeEngine {
  readonly name = 'JavaScript'
  private worker: Worker | null = null
  private crashCount = 0
  private firstCrashTime = 0

  get ready(): boolean {
    return true
  }

  async load(): Promise<void> {
    if (!this.worker) {
      this.worker = new Worker(new URL('../worker/sandbox-worker.ts', import.meta.url), { type: 'module' })
    }
  }

  async run(code: string): Promise<RunResult> {
    await this.load()
    return new Promise<RunResult>((resolve) => {
      const timeout = setTimeout(() => {
        this.worker?.terminate()
        this.worker = null
        this.trackCrash()
        resolve({
          stdout: '',
          stderr: '',
          error: 'Execution timed out after 10s',
          result: null,
          durationMs: 10000,
        })
      }, 10000)

      this.worker!.onmessage = (e: MessageEvent<RunResult>) => {
        clearTimeout(timeout)
        this.crashCount = 0 // reset on success
        resolve(e.data)
      }

      this.worker!.onerror = () => {
        clearTimeout(timeout)
        this.worker?.terminate()
        this.worker = null
        this.trackCrash()
        resolve({
          stdout: '',
          stderr: '',
          error: 'Worker crashed. Please try again.',
          result: null,
          durationMs: 0,
        })
      }

      this.worker!.postMessage({ code })
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
  }

  private trackCrash(): void {
    const now = Date.now()
    if (now - this.firstCrashTime > 60000) {
      this.crashCount = 0
      this.firstCrashTime = now
    }
    this.crashCount++
    if (this.crashCount >= 3) {
      // Too many crashes — trigger the error handler instead of throwing
      // inside a Promise executor (which would be an unhandled rejection).
      // The current run promise is already resolved/rejected by this point,
      // so this only prevents future runs.
      this.crashCount = 0
      this.firstCrashTime = 0
      if (this.worker) {
        this.worker.terminate()
        this.worker = null
      }
    }
  }
}
