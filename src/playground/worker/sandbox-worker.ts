/**
 * sandbox-worker.ts — Web Worker that executes user code in a sandboxed
 * environment with no DOM access.
 *
 * Captures console.log/error/warn output and returns it with the result.
 * Runs in a separate thread — does not block the UI.
 */

self.onmessage = (e: MessageEvent<{ code: string }>) => {
  const { code } = e.data
  const stdout: string[] = []
  const stderr: string[] = []
  const start = performance.now()

  // Capture console methods
  const origLog = self.console.log
  const origError = self.console.error
  const origWarn = self.console.warn
  self.console.log = (...args: unknown[]) => stdout.push(args.map(String).join(' '))
  self.console.error = (...args: unknown[]) => stderr.push(args.map(String).join(' '))
  self.console.warn = (...args: unknown[]) => stderr.push(args.map(String).join(' '))

  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(code)()
    const durationMs = performance.now() - start
    self.postMessage({
      stdout: stdout.join('\n'),
      stderr: stderr.join('\n'),
      error: null,
      result: result === undefined ? null : String(result),
      durationMs,
    })
  } catch (err) {
    const durationMs = performance.now() - start
    self.postMessage({
      stdout: stdout.join('\n'),
      stderr: stderr.join('\n'),
      error: String(err),
      result: null,
      durationMs,
    })
  } finally {
    self.console.log = origLog
    self.console.error = origError
    self.console.warn = origWarn
  }
}
