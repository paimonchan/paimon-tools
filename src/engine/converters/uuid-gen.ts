/**
 * uuid-gen.ts — UUID generator (pure function).
 *
 * Uses crypto.randomUUID() — native, available in all modern browsers.
 * Zero external dependencies.
 */

import { type Result, run } from '../result'

/** Generate a random UUID v4. */
export function generateUuid(): Result<string> {
  return run(() => {
    return crypto.randomUUID()
  })
}

/** Generate multiple UUIDs. */
export function generateUuids(count: number): Result<string> {
  return run(() => {
    if (count < 1 || count > 100) throw new Error('Count must be between 1 and 100.')
    return Array.from({ length: count }, () => crypto.randomUUID()).join('\n')
  })
}
