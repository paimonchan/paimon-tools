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

/**
 * Parse a JSON string. In lenient mode (JSON5) it accepts single quotes,
 * trailing commas, comments, and unquoted keys.
 */
export function parseJson(text: string, { lenient = false }: JsonOpts = {}): unknown {
  if (lenient) return JSON5.parse(text)
  return JSON.parse(text)
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
 * Pretty-print a JSON string.
 */
export function formatJson(
  input: string,
  opts: { indent?: number | 'tab'; lenient?: boolean } = {}
): Result<string> {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new Error('JSON input is empty.')
    }
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
    parseJson(input, opts)
    return 'Valid JSON ✓'
  })
}
