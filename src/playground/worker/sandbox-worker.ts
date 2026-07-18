/**
 * sandbox-worker.ts — Web Worker that executes user code in a sandboxed
 * environment with no DOM access.
 *
 * Streaming protocol:
 *   { type: 'sync', stdout, stderr, error, result, durationMs } — sync result
 *   { type: 'output', stdout, stderr } — incremental async output (every 100ms)
 *   { type: 'done' } — streaming complete, worker will idle
 *
 * After sync execution the worker stays alive to capture callbacks from
 * setTimeout, fetch.then, setInterval, etc. Collection ends when:
 *   1. All pending async operations (timers, fetches) have settled, AND
 *      no new output for 500ms (idle threshold)
 *   2. 5s hard cap — prevents runaway code
 *   3. { type: 'abort' } from engine — user clicked Stop
 *
 * Instead of guessing a timeout for async callbacks, we instrument the
 * scheduling APIs (setTimeout, fetch, setInterval) to track pending
 * operations in a Set. The collection phase only checks idle when the
 * pending set is empty — no arbitrary wait times needed.
 */

/** Format a value for display — objects/arrays get JSON, primitives get String(). */
function stringify(arg: unknown): string {
  if (arg === null) return 'null'
  if (arg === undefined) return 'undefined'
  if (typeof arg === 'object' || typeof arg === 'function') {
    try {
      return JSON.stringify(arg, null, 2)
    } catch {
      return String(arg)
    }
  }
  return String(arg)
}

/**
 * Install tracking wrappers on self.setTimeout, self.setInterval, self.fetch
 * so we know when all user-code async operations have settled.
 *
 * Returns a restore function that puts back the originals.
 */
function installAsyncTracker(): { pendingOps: Set<number | symbol>; restore: () => void } {
  const pendingOps = new Set<number | symbol>()

  const origSetTimeout = self.setTimeout.bind(self)
  const origClearTimeout = self.clearTimeout.bind(self)
  const origSetInterval = self.setInterval.bind(self)
  const origClearInterval = self.clearInterval.bind(self)
  const origFetch = self.fetch.bind(self)

  // --- setTimeout: track timer handle, remove on fire or cancel ---
  self.setTimeout = ((fn: (...args: unknown[]) => unknown, ms: number = 0, ...args: unknown[]) => {
    const handle = origSetTimeout(() => {
      pendingOps.delete(handle)
      fn(...args)
    }, ms, ...args)
    pendingOps.add(handle)
    return handle
  }) as typeof self.setTimeout

  self.clearTimeout = ((handle: number | undefined) => {
    pendingOps.delete(handle as number)
    origClearTimeout(handle)
  }) as typeof self.clearTimeout

  // --- setInterval: track handle, only remove on clearInterval ---
  self.setInterval = ((fn: (...args: unknown[]) => unknown, ms: number = 0, ...args: unknown[]) => {
    const handle = origSetInterval(() => {
      fn(...args)
      // NOT removed — intervals persist until explicitly cleared
    }, ms, ...args)
    pendingOps.add(handle)
    return handle
  }) as typeof self.setInterval

  self.clearInterval = ((handle: number | undefined) => {
    pendingOps.delete(handle as number)
    origClearInterval(handle)
  }) as typeof self.clearInterval

  // --- fetch: track promise, remove on settle (resolve or reject) ---
  self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const opId = Symbol('fetch')
    pendingOps.add(opId)
    try {
      const promise = origFetch(input, init)
      promise.finally(() => pendingOps.delete(opId))
      return promise
    } catch (err) {
      // Synchronous throw (e.g. invalid URL) — clean up immediately
      pendingOps.delete(opId)
      throw err
    }
  }) as typeof self.fetch

  return {
    pendingOps,
    restore() {
      self.setTimeout = origSetTimeout
      self.clearTimeout = origClearTimeout
      self.setInterval = origSetInterval
      self.clearInterval = origClearInterval
      self.fetch = origFetch
    },
  }
}

self.onmessage = async (e: MessageEvent<{ code: string }>) => {
  const { code } = e.data
  const stdout: string[] = []
  const stderr: string[] = []
  const start = performance.now()

  // Capture console methods
  const origLog = self.console.log
  const origError = self.console.error
  const origWarn = self.console.warn
  self.console.log = (...args: unknown[]) => { stdout.push(args.map(stringify).join(' ')) }
  self.console.error = (...args: unknown[]) => { stderr.push(args.map(stringify).join(' ')) }
  self.console.warn = (...args: unknown[]) => { stderr.push(args.map(stringify).join(' ')) }

  // --- Save originals BEFORE installing tracker ---
  // These are used internally by the collection phase (flushTimer, keepalive).
  // Separating them from the tracker avoids esbuild/minifier ambiguity with
  // destructuring property-name = variable-name patterns.
  const nativeSetInterval = self.setInterval.bind(self)
  const nativeClearInterval = self.clearInterval.bind(self)

  // Install async operation tracker — wraps setTimeout/fetch etc. to track
  // pending operations. User code runs through these instrumented APIs.
  const { pendingOps, restore: restoreAsyncTracker } = installAsyncTracker()

  try {
    // Wrap in async IIFE: enables top-level await, captures promise chains,
    // and scopes `var` declarations so they don't leak to the global worker scope.
    const result = await new Function(`return (async () => { ${code} })()`)()
    const syncDuration = performance.now() - start

    // Post sync result with all output captured during sync execution
    self.postMessage({
      type: 'sync',
      stdout: stdout.join('\n'),
      stderr: stderr.join('\n'),
      error: null,
      result: result === undefined ? null : stringify(result),
      durationMs: syncDuration,
    })

    // Clear arrays — subsequent output is incremental (async callbacks)
    stdout.length = 0
    stderr.length = 0

    // --- Adaptive streaming collection phase ---
    // Finishes when all pending async ops have settled AND no new output
    // for 500ms, or 5s hard cap.
    const MAX_COLLECT_MS = 5000
    const IDLE_THRESHOLD_MS = 500
    const MIN_COLLECT_MS = 200
    const collectionStart = Date.now()
    let lastOutputTime: number | null = null
    let finalized = false

    // IMPORTANT: use NATIVE setInterval for internal timers.
    // If we used self.setInterval here (which is the instrumented version),
    // this internal timer handle would be added to pendingOps, preventing
    // the collection phase from ever ending (pendingOps would never be empty
    // while the flushTimer keeps running).
    const flushTimer = nativeSetInterval(() => {
      const now = Date.now()
      const totalMs = now - collectionStart

      // Flush any accumulated async output
      if (stdout.length > 0 || stderr.length > 0) {
        self.postMessage({
          type: 'output',
          stdout: stdout.splice(0).join('\n'),
          stderr: stderr.splice(0).join('\n'),
        })
        lastOutputTime = now
      }

      if (finalized) return

      // Hard cap — always applies, prevents runaway code
      if (totalMs >= MAX_COLLECT_MS) {
        finalized = true
        nativeClearInterval(flushTimer)
        self.postMessage({ type: 'done' })
        return
      }

      // Only check idle when all user-code async ops have settled.
      // If pendingOps is non-empty, there are outstanding timers or fetches
      // that may produce output — keep waiting.
      if (pendingOps.size === 0) {
        if (lastOutputTime !== null) {
          // Had at least one async output — use fast idle (500ms)
          if (now - lastOutputTime >= IDLE_THRESHOLD_MS) {
            finalized = true
            nativeClearInterval(flushTimer)
            self.postMessage({ type: 'done' })
          }
        } else {
          // No output at all (pure sync code, no async ops) — minimum wait
          if (totalMs >= MIN_COLLECT_MS) {
            finalized = true
            nativeClearInterval(flushTimer)
            self.postMessage({ type: 'done' })
          }
        }
      }
      // If pendingOps.size > 0, stay alive — callbacks may fire and produce output.
      // The 5s hard cap above will eventually catch runaway code.
    }, 100)

    // Listen for abort signal from engine
    self.onmessage = (msg: MessageEvent) => {
      if (msg.data?.type === 'abort' && !finalized) {
        finalized = true
        nativeClearInterval(flushTimer)
        // Flush remaining output one last time
        if (stdout.length > 0 || stderr.length > 0) {
          self.postMessage({
            type: 'output',
            stdout: stdout.splice(0).join('\n'),
            stderr: stderr.splice(0).join('\n'),
          })
        }
        self.postMessage({ type: 'done' })
      }
    }

    // Keep function alive until collection ends.
    // Without this await the function exits the try block, finally restores
    // console to original, and setTimeout callbacks lose their capture.
    await new Promise<void>((resolve) => {
      const id = nativeSetInterval(() => {
        if (finalized) {
          nativeClearInterval(id)
          resolve()
        }
      }, 50)
    })
  } catch (err) {
    const durationMs = performance.now() - start
    self.postMessage({
      type: 'sync',
      stdout: stdout.join('\n'),
      stderr: stderr.join('\n'),
      // Preserve full stack trace — String(err) only gives the message
      error: err instanceof Error ? err.stack || err.message : String(err),
      result: null,
      durationMs,
    })
    self.postMessage({ type: 'done' })
  } finally {
    self.console.log = origLog
    self.console.error = origError
    self.console.warn = origWarn
    // Restore original async APIs — important for correctness on subsequent runs
    // (the worker stays alive and may process another onmessage)
    restoreAsyncTracker()
  }
}
