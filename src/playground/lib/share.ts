/**
 * share.ts — kompresi kode ke URL hash pake lz-string.
 *
 * Cara mainnya:
 *   Share → compress → taruh di #code=...
 *   Load  → baca hash → decompress → masukin ke editor
 *
 * Gak perlu server — semua di URL fragment, gak dikirim kemana-mana.
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

export type DetectedLanguage = 'javascript' | 'json' | 'html' | 'python'

const HASH_KEY = 'code'

/** Kompres kode jadi hash fragment buat di-share. */
export function buildShareHash(code: string): string {
  const compressed = compressToEncodedURIComponent(code)
  return `#${HASH_KEY}=${compressed}`
}

/** Baca kode dari URL hash. Balikin null kalo gak ada. */
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

/** Update URL hash tanpa trigger navigasi. */
export function pushShareHash(code: string): void {
  const hash = buildShareHash(code)
  window.history.replaceState(null, '', hash)
}

/** Bersihin URL hash. */
export function clearShareHash(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

/** Tebak bahasa dari isi kode. Dipake pas load shared code yang gak ada metadata. */
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
