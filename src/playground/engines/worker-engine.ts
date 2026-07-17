/**
 * WorkerEngine — executes JavaScript in a Web Worker sandbox.
 *
 * Creates a fresh Worker per run to guarantee zero state leakage.
 * Timeout: 10s hard cap via AbortController + worker.terminate().
 * Crash circuit breaker: after 3 crashes in 60s, engine permanently
 * refuses execution until a run succeeds or page reloads.
 */

import type { CodeEngine, RunResult } from './types'

export class WorkerEngine implements CodeEngine {
  readonly name = 'JavaScript'
  private crashed = false
  private crashCount = 0
  private firstCrashTime = 0
  private running = false
  private pendingResolve: ((result: RunResult) => void) | null = null

  get ready(): boolean {
    return true
  }

  async load(): Promise<void> {
    // no-op: workers are created per-run now
  }

  async run(code: string): Promise<RunResult> {
    if (this.crashed) {
      return {
        stdout: '',
        stderr: '',
        error: 'Engine crashed repeatedly. Please reload the page.',
        result: null,
        durationMs: 0,
      }
    }

    if (this.running) {
      return { stdout: '', stderr: '', error: 'Already running', result: null, durationMs: 0 }
    }
    this.running = true

    // Fresh Worker per run — zero state leakage
    const worker = new Worker(new URL('../worker/sandbox-worker.ts', import.meta.url), { type: 'module' })

    return await new Promise<RunResult>((resolve) => {
      let settled = false
      this.pendingResolve = resolve

      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        worker.terminate()
        this.trackCrash()
        resolve({
          stdout: '',
          stderr: '',
          error: 'Execution timed out after 10s',
          result: null,
          durationMs: 10000,
        })
      }, 10000)

      worker.onmessage = (e: MessageEvent<RunResult>) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.pendingResolve = null
        // Successful run resets the circuit breaker
        this.crashed = false
        this.crashCount = 0
        resolve(e.data)
      }

      worker.onerror = () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        worker.terminate()
        this.trackCrash()
        resolve({
          stdout: '',
          stderr: '',
          error: 'Worker crashed. Please try again.',
          result: null,
          durationMs: 0,
        })
      }

      worker.postMessage({ code })
    }).finally(() => {
      // Ensure worker is always cleaned up
      worker.terminate()
      this.running = false
      this.pendingResolve = null
    })
  }

  dispose(): void {
    this.crashed = true
    if (this.pendingResolve) {
      this.pendingResolve({
        stdout: '',
        stderr: '',
        error: 'Cancelled',
        result: null,
        durationMs: 0,
      })
      this.pendingResolve = null
    }
  }

  private trackCrash(): void {
    if (this.crashed) return
    const now = Date.now()
    if (now - this.firstCrashTime > 60000) {
      this.crashCount = 0
      this.firstCrashTime = now
    }
    this.crashCount++
    if (this.crashCount >= 3) {
      this.crashed = true
    }
  }
}
