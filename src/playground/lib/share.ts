/**
 * share.ts — URL-based code sharing via lz-string compression.
 *
 * Flow:
 *   Share → compress(code) → base64 → set URL hash (#code=...)
 *   Load  → read URL hash → decompress → set code
 *
 * Zero server needed — everything in the URL fragment (not sent to server).
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

const HASH_KEY = 'code'

/** Compress code and return a shareable URL hash fragment. */
export function buildShareHash(code: string): string {
  const compressed = compressToEncodedURIComponent(code)
  return `#${HASH_KEY}=${compressed}`
}

/** Read code from the current URL hash, if present. Returns null if no shared code. */
export function readShareHash(): string | null {
  if (!window.location.hash) return null
  const hash = window.location.hash.slice(1) // remove leading #
  const params = new URLSearchParams(hash)
  const compressed = params.get(HASH_KEY)
  if (!compressed) return null
  try {
    const decompressed = decompressFromEncodedURIComponent(compressed)
    return decompressed || null
  } catch {
    return null
  }
}

/** Update the URL hash without triggering a navigation/reload. */
export function pushShareHash(code: string): void {
  const hash = buildShareHash(code)
  window.history.replaceState(null, '', hash)
}

/** Clear the URL hash. */
export function clearShareHash(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}
