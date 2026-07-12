/** Shared engine types for the playground */

export interface RunResult {
  stdout: string
  stderr: string
  error: string | null
  result: string | null
  durationMs: number
}

export interface CodeEngine {
  readonly name: string
  readonly ready: boolean
  load(): Promise<void>
  run(code: string): Promise<RunResult>
  dispose(): void
}
