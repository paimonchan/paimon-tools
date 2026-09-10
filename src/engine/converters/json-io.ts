/**
 * json-io.ts — JSON parse/stringify with strict + lenient (JSON5) mode.
 *
 * Every function here is PURE: takes data in, returns Result out.
 * Zero DOM, zero network, zero React.
 */

import JSON5 from 'json5'
import { type Result, run } from '../result'

export interface JsonOpts {
  lenient?: boolean
}

const PYTHON_HINTS: { re: RegExp; fix: string }[] = [
  { re: /\bTrue\b/, fix: 'true' },
  { re: /\bFalse\b/, fix: 'false' },
  { re: /\bNone\b/, fix: 'null' },
  { re: /\bNaN\b/, fix: 'null' },
  { re: /\bInfinity\b/, fix: 'a very large number' },
]

/**
 * Re-throw a JSON parse failure with an actionable hint when the text contains
 * Python-style literals (True/False/None/NaN/Infinity) — the most common
 * paste mistake. Passes through any other error message unchanged.
 */
function hintPythonLiterals(text: string, original: Error): never {
  const hits = PYTHON_HINTS.filter((h) => h.re.test(text))
  if (hits.length > 0) {
    const suggestions = hits.map((h) => `\`${h.fix}\``).join(', ')
    const found = hits.map((h) => h.re.source.replace(/\\b/g, '')).join(', ')
    throw new Error(
      `Looks like Python-style values (${found}), which are not valid JSON. ` +
        `Replace them with ${suggestions}.` +
        `\n\nOriginal error: ${original.message}`,
    )
  }
  throw original
}

/**
 * Parse a JSON string. In lenient mode (JSON5) it accepts single quotes,
 * trailing commas, comments, and unquoted keys.
 */
export function parseJson(text: string, { lenient = false }: JsonOpts = {}): unknown {
  try {
    if (lenient) return JSON5.parse(text)
    return JSON.parse(text)
  } catch (err) {
    const message = err instanceof Error ? err : new Error(String(err))
    return hintPythonLiterals(text, message)
  }
}

/**
 * Ensure we have a plain array for row-oriented conversions.
 * Accepts a JSON array, a single object (wraps to [obj]), or a JSON string.
 */
export function toJsonArray(input: unknown, opts: JsonOpts = {}): unknown[] {
  let data = input
  if (typeof data === 'string') {
    data = parseJson(data, opts)
  }
  if (data == null) throw new Error('Input is empty.')
  if (Array.isArray(data)) return data
  if (typeof data === 'object') return [data]
  throw new Error('JSON must be an array or an object, not a primitive value.')
}

/**
 * Check raw JSON text for integers that exceed Number.MAX_SAFE_INTEGER (9,007,199,254,740,991).
 * JS double precision silently rounds these — warn the user to use string wrapping.
 */
function checkUnsafeIntegers(text: string): void {
  const m = text.match(/(?:^|[:\s\[,])\s*(\d{16,})(?:\s*[,\s\]\}]|$)/)
  if (m) {
    throw new Error(
      `Number ${m[1]} exceeds JavaScript's safe integer range (${Number.MAX_SAFE_INTEGER.toLocaleString()}). ` +
        `Precision will be lost! Wrap in quotes to preserve: "${m[1]}"`,
    )
  }
}

/**
 * Pretty-print a JSON string.
 */
export function formatJson(input: string, opts: { indent?: number | 'tab'; lenient?: boolean } = {}): Result<string> {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new Error('JSON input is empty.')
    }
    checkUnsafeIntegers(input)
    const indent = opts.indent === 'tab' ? '\t' : opts.indent === 4 ? 4 : 2
    return JSON.stringify(parseJson(input, opts), null, indent)
  })
}

/**
 * Minify a JSON string (strip all whitespace).
 */
export function minifyJson(input: string, opts: { lenient?: boolean } = {}): Result<string> {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new Error('JSON input is empty.')
    }
    checkUnsafeIntegers(input)
    return JSON.stringify(parseJson(input, opts))
  })
}

/**
 * Validate JSON without transforming. Returns ok string or error.
 */
export function validateJson(input: string, opts: { lenient?: boolean } = {}): Result<string> {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new Error('JSON input is empty.')
    }
    checkUnsafeIntegers(input)
    parseJson(input, opts)
    return 'Valid JSON ✓'
  })
}
