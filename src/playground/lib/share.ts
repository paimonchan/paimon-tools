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

export type DetectedLanguage = 'javascript' | 'json' | 'html' | 'python'

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

/** Detect language from code content. Used when loading shared code without language metadata. */
export function detectLanguage(code: string): DetectedLanguage {
  const trimmed = code.trim()

  // Empty → default to javascript
  if (!trimmed) return 'javascript'

  // HTML detection: doctype or root <html tag
  if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return 'html'
  }

  // JSON detection: starts with { or [, and parses
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {
      // Not valid JSON, continue
    }
  }

  // Python heuristics: import/def/class/print at line start, # comments, triple quotes
  const lines = trimmed.split('\n')
  const pythonIndicators = lines.some(line => {
    const s = line.trimStart()
    return /^(import |from |def |class |print\(|# |if __name__|elif |else:|try:|except |with |async |await )/.test(s)
  })
  if (pythonIndicators) return 'python'

  // Default to JavaScript
  return 'javascript'
}
