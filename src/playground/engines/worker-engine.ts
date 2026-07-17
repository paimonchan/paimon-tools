/**
 * WorkerEngine — executes JavaScript in a Web Worker sandbox.
 *
 * Streaming protocol:
 *   1. Worker posts { type: 'sync', stdout, stderr, result, error, durationMs }
 *      → Engine resolves run() promise IMMEDIATELY (button switches back to Run)
 *   2. Worker posts { type: 'output', stdout, stderr } for incremental async output
 *      → Engine calls onOutput() for live UI updates
 *   3. Worker posts { type: 'done' } when collection phase ends (5s or abort)
 *      → Engine cleans up worker, marks streaming complete
 *
 * This two-phase approach gives instant button feedback while still capturing
 * setTimeout/fetch.then callbacks in the background.
 */

import type { CodeEngine, RunOptions, RunResult } from './types'

export class WorkerEngine implements CodeEngine {
  readonly name = 'JavaScript'
  private crashed = false
  private crashCount = 0
  private firstCrashTime = 0
  private running = false
  /** True while a background streaming worker is alive collecting async output. */
  private streaming = false
  private currentWorker: Worker | null = null
  private pendingResolve: ((result: RunResult) => void) | null = null
  private aborted = false

  get ready(): boolean {
    return true
  }

  async load(): Promise<void> {
    // no-op: workers are created per-run now
  }

  async run(code: string, options?: RunOptions): Promise<RunResult> {
    if (this.crashed) {
      return {
        stdout: '',
        stderr: '',
        error: 'Engine crashed repeatedly. Please reload the page.',
        result: null,
        durationMs: 0,
      }
    }

    if (this.running || this.streaming) {
      return { stdout: '', stderr: '', error: 'Already running', result: null, durationMs: 0 }
    }
    this.running = true
    this.streaming = true
    this.aborted = false

    // Fresh Worker per run — zero state leakage
    const worker = new Worker(new URL('../worker/sandbox-worker.ts', import.meta.url), { type: 'module' })
    this.currentWorker = worker

    return await new Promise<RunResult>((resolve) => {
      let settled = false
      this.pendingResolve = resolve

      const timeout = setTimeout(() => {
        if (this.aborted) return
        settled = true
        worker.terminate()
        this.trackCrash()
        this.streaming = false
        this.currentWorker = null
        resolve({
          stdout: '',
          stderr: '',
          error: 'Execution timed out after 10s',
          result: null,
          durationMs: 10000,
        })
      }, 10000)

      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data

        // Legacy single-message format (backward compat, no streaming)
        if (!msg.type) {
          clearTimeout(timeout)
          settled = true
          this.pendingResolve = null
          this.crashed = false
          this.crashCount = 0
          this.streaming = false
          this.currentWorker = null
          resolve({
            stdout: msg.stdout || '',
            stderr: msg.stderr || '',
            error: msg.error || null,
            result: msg.result || null,
            durationMs: msg.durationMs || 0,
          })
          worker.terminate()
          return
        }

        switch (msg.type) {
          case 'sync': {
            // Resolve immediately so the UI button switches back to Run.
            // The worker stays alive for background streaming.
            clearTimeout(timeout)
            this.pendingResolve = null
            this.crashed = false
            this.crashCount = 0

            const syncResult: RunResult = {
              stdout: msg.stdout || '',
              stderr: msg.stderr || '',
              error: null,
              result: msg.result || null,
              durationMs: msg.durationMs || 0,
            }
            options?.onOutput?.(msg.stdout || '', msg.stderr || '')
            resolve(syncResult)
            break
          }

          case 'output': {
            // Incremental async output — notify UI via callback
            options?.onOutput?.(msg.stdout || '', msg.stderr || '')
            break
          }

          case 'done': {
            // Streaming complete — clean up
            worker.terminate()
            this.streaming = false
            this.currentWorker = null
            break
          }
        }
      }

      worker.onerror = () => {
        if (settled || this.aborted) return
        clearTimeout(timeout)
        settled = true
        worker.terminate()
        this.trackCrash()
        this.streaming = false
        this.currentWorker = null
        resolve({
          stdout: '',
          stderr: '',
          error: 'Worker crashed. Please try again.',
          result: null,
          durationMs: 0,
        })
      }

      worker.onmessageerror = () => {
        if (settled || this.aborted) return
        clearTimeout(timeout)
        settled = true
        worker.terminate()
        this.trackCrash()
        this.streaming = false
        this.currentWorker = null
        resolve({
          stdout: '',
          stderr: '',
          error: 'Worker message format error. Please try again.',
          result: null,
          durationMs: 0,
        })
      }

      worker.postMessage({ code })
    }).finally(() => {
      this.running = false
      this.pendingResolve = null
      // NOTE: worker is NOT terminated here — it stays alive for background
      // streaming. It's terminated when 'done' arrives or on abort/timeout.
    })
  }

  abort(): void {
    this.aborted = true
    if (this.currentWorker) {
      this.currentWorker.terminate()
      this.currentWorker = null
    }
    this.streaming = false
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

  dispose(): void {
    this.crashed = true
    this.abort()
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
