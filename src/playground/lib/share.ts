/**
 * share.ts — pack code into the URL hash via lz-string.
 *
 * Flow: Share → compress → stash in #code=...
 *       Load  → read hash → decompress → fill editor
 *
 * No server involved — everything stays in the URL fragment.
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

export type DetectedLanguage = 'javascript' | 'json' | 'html' | 'python'

const HASH_KEY = 'code'
const LANG_KEY = 'lang'

/** Compress code into a URL hash fragment for sharing. */
export function buildShareHash(code: string, language?: DetectedLanguage): string {
  const compressed = compressToEncodedURIComponent(code)
  // Include language tag so shared code opens in the right mode
  if (language) {
    return `#${HASH_KEY}=${compressed}&${LANG_KEY}=${language}`
  }
  return `#${HASH_KEY}=${compressed}`
}

/** Read code from the URL hash. Returns null if nothing's there. */
export function readShareHash(): { code: string; language?: DetectedLanguage } | null {
  if (!window.location.hash) return null
  const hash = window.location.hash.slice(1) // remove leading #
  const params = new URLSearchParams(hash)
  const compressed = params.get(HASH_KEY)
  if (!compressed) return null
  try {
    const decompressed = decompressFromEncodedURIComponent(compressed)
    if (!decompressed) return null
    const language = params.get(LANG_KEY) as DetectedLanguage | null
    return { code: decompressed, language: language ?? undefined }
  } catch {
    return null
  }
}

/** Update the URL hash without triggering navigation. */
export function pushShareHash(code: string): void {
  const hash = buildShareHash(code)
  window.history.replaceState(null, '', hash)
}

/** Clear the URL hash. */
export function clearShareHash(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

/** Guess the language of a code snippet. Used when loading shared code that has no language tag. */
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
  const pythonIndicators = lines.some((line) => {
    const s = line.trimStart()
    return /^(import |from |def |class |print\(|# |if __name__|elif |else:|try:|except |with |async |await )/.test(s)
  })
  if (pythonIndicators) return 'python'

  // Default to JavaScript
  return 'javascript'
}
