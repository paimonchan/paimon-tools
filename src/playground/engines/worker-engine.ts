/**
 * WorkerEngine — executes JavaScript in a Web Worker sandbox.
 *
 * Streaming protocol:
 *   1. Worker posts { type: 'sync', stdout, stderr, result, error, durationMs }
 *   2. Worker posts { type: 'output', stdout, stderr } for incremental async output
 *   3. Worker posts { type: 'done' } when collection phase ends (5s or abort)
 *   The engine accumulates all output and calls onOutput() for immediate UI updates.
 *
 * Creates a fresh Worker per run to guarantee zero state leakage.
 * Timeout: 10s hard cap via worker.terminate().
 * Crash circuit breaker: after 3 crashes in 60s, engine permanently
 * refuses execution until page reload.
 */

import type { CodeEngine, RunOptions, RunResult } from './types'

export class WorkerEngine implements CodeEngine {
  readonly name = 'JavaScript'
  private crashed = false
  private crashCount = 0
  private firstCrashTime = 0
  private running = false
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

    if (this.running) {
      return { stdout: '', stderr: '', error: 'Already running', result: null, durationMs: 0 }
    }
    this.running = true
    this.aborted = false

    // Fresh Worker per run — zero state leakage
    const worker = new Worker(new URL('../worker/sandbox-worker.ts', import.meta.url), { type: 'module' })

    return await new Promise<RunResult>((resolve) => {
      let settled = false
      this.pendingResolve = resolve

      // Accumulated result across streaming messages
      let finalResult: RunResult = {
        stdout: '',
        stderr: '',
        error: null,
        result: null,
        durationMs: 0,
      }

      const done = (result: RunResult) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.pendingResolve = null
        this.crashed = false
        this.crashCount = 0
        resolve(result)
      }

      const timeout = setTimeout(() => {
        if (this.aborted) return
        done({
          stdout: finalResult.stdout,
          stderr: finalResult.stderr,
          error: 'Execution timed out after 10s',
          result: null,
          durationMs: 10000,
        })
        // Track crash only after resolving to avoid double-resolve
        worker.terminate()
        this.trackCrash()
      }, 10000)

      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data

        // Legacy single-message format (backward compat, no streaming)
        if (!msg.type) {
          done({
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
            // Initial result from sync execution
            finalResult = {
              stdout: msg.stdout || '',
              stderr: msg.stderr || '',
              error: msg.error || null,
              result: msg.result || null,
              durationMs: msg.durationMs || 0,
            }
            // Show sync output immediately
            options?.onOutput?.(msg.stdout || '', msg.stderr || '')
            break
          }

          case 'output': {
            // Incremental async output — append to accumulator
            if (msg.stdout) {
              finalResult.stdout += (finalResult.stdout ? '\n' : '') + msg.stdout
            }
            if (msg.stderr) {
              finalResult.stderr += (finalResult.stderr ? '\n' : '') + msg.stderr
            }
            options?.onOutput?.(msg.stdout || '', msg.stderr || '')
            break
          }

          case 'done': {
            // Streaming complete — resolve with accumulated result
            done(finalResult)
            worker.terminate()
            break
          }
        }
      }

      worker.onerror = () => {
        if (settled || this.aborted) return
        clearTimeout(timeout)
        worker.terminate()
        this.trackCrash()
        resolve({
          stdout: finalResult.stdout,
          stderr: finalResult.stderr,
          error: 'Worker crashed. Please try again.',
          result: null,
          durationMs: 0,
        })
      }

      worker.onmessageerror = () => {
        if (settled || this.aborted) return
        clearTimeout(timeout)
        worker.terminate()
        this.trackCrash()
        resolve({
          stdout: finalResult.stdout,
          stderr: finalResult.stderr,
          error: 'Worker message format error. Please try again.',
          result: null,
          durationMs: 0,
        })
      }

      worker.postMessage({ code })
    }).finally(() => {
      worker.terminate()
      this.running = false
      this.pendingResolve = null
    })
  }

  abort(): void {
    this.aborted = true
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
