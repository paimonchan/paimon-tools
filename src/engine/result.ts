/** Shared Result type for all converters. */

export type Result<T> = OkResult<T> | ErrorResult

export interface OkResult<T> {
  ok: true
  value: T
  meta?: Record<string, unknown>
}

export interface ErrorResult {
  ok: false
  error: string
}

export function ok<T>(value: T, meta?: Record<string, unknown>): OkResult<T> {
  return meta ? { ok: true as const, value, meta } : { ok: true as const, value }
}

export function fail(error: unknown): ErrorResult {
  const msg = error instanceof Error ? error.message : String(error)
  return { ok: false as const, error: msg }
}

export function run<T>(fn: () => T): Result<T> {
  try {
    return ok(fn())
  } catch (e) {
    return fail(e)
  }
}
