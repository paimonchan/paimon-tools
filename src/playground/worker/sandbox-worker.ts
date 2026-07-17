/**
 * sandbox-worker.ts — Web Worker that executes user code in a sandboxed
 * environment with no DOM access.
 *
 * Captures console.log/error/warn output and returns it with the result.
 * Wraps code in an async IIFE so top-level await, setTimeout, fetch, etc.
 * all produce usable output. Runs in a separate thread — does not block the UI.
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
  self.console.log = (...args: unknown[]) => stdout.push(args.map(stringify).join(' '))
  self.console.error = (...args: unknown[]) => stderr.push(args.map(stringify).join(' '))
  self.console.warn = (...args: unknown[]) => stderr.push(args.map(stringify).join(' '))

  try {
    // Wrap in async IIFE: enables top-level await, captures promise chains,
    // and scopes `var` declarations so they don't leak to the global worker scope.
    const result = await new Function(`return (async () => { ${code} })()`)()
    const durationMs = performance.now() - start
    self.postMessage({
      stdout: stdout.join('\n'),
      stderr: stderr.join('\n'),
      error: null,
      result: result === undefined ? null : stringify(result),
      durationMs,
    })
  } catch (err) {
    const durationMs = performance.now() - start
    self.postMessage({
      stdout: stdout.join('\n'),
      stderr: stderr.join('\n'),
      // Preserve full stack trace — String(err) only gives the message
      error: err instanceof Error ? err.stack || err.message : String(err),
      result: null,
      durationMs,
    })
  } finally {
    self.console.log = origLog
    self.console.error = origError
    self.console.warn = origWarn
  }
}
