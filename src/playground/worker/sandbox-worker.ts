/**
 * sandbox-worker.ts — Web Worker that executes user code in a sandboxed
 * environment with no DOM access.
 *
 * Streaming protocol:
 *   { type: 'sync', stdout, stderr, error, result, durationMs } — sync result
 *   { type: 'output', stdout, stderr } — incremental async output (every 100ms)
 *   { type: 'done' } — streaming complete, worker will idle
 *
 * After sync execution the worker stays alive for up to 5s to capture
 * callbacks from setTimeout, fetch.then, setInterval, etc.
 * The engine can send { type: 'abort' } to end collection early.
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

    // --- Streaming collection phase ---
    // Keep worker alive up to 5s to catch async callbacks (setTimeout, fetch.then, etc.)
    const COLLECT_MS = 5000
    const flushTimer = setInterval(() => {
      if (stdout.length > 0 || stderr.length > 0) {
        self.postMessage({
          type: 'output',
          stdout: stdout.splice(0).join('\n'),
          stderr: stderr.splice(0).join('\n'),
        })
      }
    }, 100)

    let finalized = false

    // Listen for abort signal from engine
    self.onmessage = (msg: MessageEvent) => {
      if (msg.data?.type === 'abort' && !finalized) {
        finalized = true
        clearInterval(flushTimer)
        // Flush remaining output
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

    await new Promise<void>((resolve) => setTimeout(resolve, COLLECT_MS))

    if (!finalized) {
      finalized = true
      clearInterval(flushTimer)
      // Final flush
      if (stdout.length > 0 || stderr.length > 0) {
        self.postMessage({
          type: 'output',
          stdout: stdout.splice(0).join('\n'),
          stderr: stderr.splice(0).join('\n'),
        })
      }
      self.postMessage({ type: 'done' })
    }
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
  }
}
