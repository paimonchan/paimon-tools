/**
 * explain-share.ts — share EXPLAIN plans via URL hash.
 *
 * Same pattern as playground-share.ts: lz-string compression + URL hash.
 * Zero React, browser API only (window.location).
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

const HASH_KEY = 'plan'
const MAX_URL_LENGTH = 1800

/**
 * Build a share URL hash from an EXPLAIN plan text.
 * Returns null if compressed exceeds URL length limits.
 */
export function buildShareHash(plan: string): string | null {
  try {
    const compressed = compressToEncodedURIComponent(plan)
    if (compressed.length > MAX_URL_LENGTH) return null
    return `#${HASH_KEY}=${compressed}`
  } catch {
    return null
  }
}

/**
 * Read a shared EXPLAIN plan from the current URL hash.
 * Returns null if no valid plan is found.
 */
export function readShareHash(): string | null {
  try {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const compressed = params.get(HASH_KEY)
    if (!compressed) return null
    return decompressFromEncodedURIComponent(compressed)
  } catch {
    return null
  }
}

/**
 * Check if the current URL hash contains a shared plan.
 */
export function hasShareHash(): boolean {
  return window.location.hash.includes(`${HASH_KEY}=`)
}