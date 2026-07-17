/** Shared engine types for the playground */

export interface RunResult {
  stdout: string
  stderr: string
  error: string | null
  result: string | null
  durationMs: number
  /** Raw HTML/CSS/JS for iframe preview (used by HtmlEngine). */
  htmlPreview?: string
}

/** Optional streaming callback for incremental output during execution. */
export interface RunOptions {
  onOutput?: (stdout: string, stderr: string) => void
}

export interface CodeEngine {
  readonly name: string
  readonly ready: boolean
  load(): Promise<void>
  run(code: string, options?: RunOptions): Promise<RunResult>
  /** Abort the current execution (e.g. user clicked Stop or switched language). */
  abort(): void
  dispose(): void
}
