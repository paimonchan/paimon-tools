/**
 * converters.js — the heart of paimon-tools.
 *
 * Every function here is PURE: it takes data in, returns data out, and touches
 * no DOM, no network, no global state. This is what guarantees the privacy
 * promise — user data literally has nowhere to go from inside this module.
 *
 * Each converter returns a Result object:
 *   { ok: true,  value, meta? }      on success
 *   { ok: false, error }             on failure
 * The UI layer (ConversionTool.jsx) owns error display and never has to
 * try/catch the engine.
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import JSON5 from 'json5'

/**
 * Parse a JSON string. In lenient mode (JSON5) it accepts single quotes,
 * trailing commas, comments, and unquoted keys — the things people commonly
 * paste from JS/Python. In strict mode it uses the spec-compliant JSON.parse.
 * Lenient mode is opt-in so validation stays strict by default.
 */
function parseJson(text, { lenient = false } = {}) {
  if (lenient) return JSON5.parse(text)
  return JSON.parse(text)
}

/** Wrap a thrown value into a human-friendly message. */
function fail(e) {
  const msg = e instanceof Error ? e.message : String(e)
  return { ok: false, error: msg }
}

/** Reusable try/return helper for the happy path. */
function run(fn) {
  try {
    const value = fn()
    return { ok: true, value }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Ensure we have a plain array for row-oriented conversions.
 * Accepts a JSON array, a single object (wrapped to [obj]), or a JSON string.
 * Throws if the input isn't an array/object.
 */
function toJsonArray(input, opts = {}) {
  let data = input
  if (typeof data === 'string') {
    data = parseJson(data, opts)
  }
  if (data == null) throw new Error('Input is empty.')
  if (Array.isArray(data)) return data
  if (typeof data === 'object') return [data]
  throw new Error('JSON must be an array or an object, not a primitive value.')
}

// ---------------------------------------------------------------------------
// JSON <-> CSV
// ---------------------------------------------------------------------------

/**
 * Convert JSON (array of objects, or a single object) to a CSV string.
 * @param {string|object|array} input
 * @param {{ delimiter?: string, lenient?: boolean }} [opts]
 */
export function jsonToCsv(input, opts = {}) {
  return run(() => {
    const rows = toJsonArray(input, opts)
    if (rows.length === 0) return ''
    return Papa.unparse(rows, { delimiter: opts.delimiter ?? ',' })
  })
}

/**
 * Convert a CSV string into a JSON string (array of objects keyed by header row).
 * @param {string} input
 * @param {{ delimiter?: string }} [opts]
 */
export function csvToJson(input, opts = {}) {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new Error('CSV input is empty.')
    }
    const parsed = Papa.parse(input, {
      header: true,
      dynamicTyping: false, // keep values as strings for predictable round-trips
      skipEmptyLines: true,
      delimiter: opts.delimiter ?? '', // '' => auto-detect
    })
    if (parsed.errors.length) {
      // Papa reports non-fatal row errors; surface the first as a hint.
      const first = parsed.errors[0]
      throw new Error(`CSV parse issue on row ${first.row}: ${first.message}`)
    }
    return JSON.stringify(parsed.data, null, 2)
  })
}

// ---------------------------------------------------------------------------
// JSON <-> Excel
// ---------------------------------------------------------------------------

/**
 * Convert JSON (array of objects) to an .xlsx workbook (binary ArrayBuffer).
 * Returns { ok, value: { arraybuffer, filename } } so the UI can download it.
 * @param {string|object|array} input
 * @param {{ lenient?: boolean }} [opts]
 */
export function jsonToXlsx(input, opts = {}) {
  return run(() => {
    const rows = toJsonArray(input, opts)
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    // bookType xlsx => ArrayBuffer output
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    return { arraybuffer: out, filename: 'converted.xlsx' }
  })
}

/**
 * Convert an .xlsx file (ArrayBuffer) into a JSON string of the first sheet.
 * @param {ArrayBuffer} input
 */
export function xlsxToJson(input) {
  return run(() => {
    const wb = XLSX.read(input, { type: 'array' })
    const first = wb.SheetNames[0]
    if (!first) throw new Error('Workbook has no sheets.')
    const ws = wb.Sheets[first]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
    return JSON.stringify(rows, null, 2)
  })
}

// ---------------------------------------------------------------------------
// CSV <-> Excel
// ---------------------------------------------------------------------------

/**
 * Convert a CSV string into an .xlsx workbook.
 * @param {string} input
 */
export function csvToXlsx(input) {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new Error('CSV input is empty.')
    }
    const parsed = Papa.parse(input, {
      header: true,
      skipEmptyLines: true,
    })
    if (parsed.errors.length) {
      const first = parsed.errors[0]
      throw new Error(`CSV parse issue on row ${first.row}: ${first.message}`)
    }
    const ws = XLSX.utils.json_to_sheet(parsed.data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    return { arraybuffer: out, filename: 'converted.xlsx' }
  })
}

/**
 * Convert an .xlsx file (ArrayBuffer) into a CSV string of the first sheet.
 * @param {ArrayBuffer} input
 */
export function xlsxToCsv(input) {
  return run(() => {
    const wb = XLSX.read(input, { type: 'array' })
    const first = wb.SheetNames[0]
    if (!first) throw new Error('Workbook has no sheets.')
    const ws = wb.Sheets[first]
    return XLSX.utils.sheet_to_csv(ws)
  })
}

// ---------------------------------------------------------------------------
// JSON format / minify
// ---------------------------------------------------------------------------

/**
 * Pretty-print a JSON string.
 * @param {string} input
 * @param {{ indent?: 2|4|'tab', lenient?: boolean }} [opts]
 */
export function formatJson(input, opts = {}) {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new Error('JSON input is empty.')
    }
    const indent = opts.indent === 'tab' ? '\t' : opts.indent === 4 ? 4 : 2
    return JSON.stringify(parseJson(input, opts), null, indent)
  })
}

/**
 * Minify a JSON string (no whitespace). Validates syntax as a side effect.
 * @param {string} input
 * @param {{ lenient?: boolean }} [opts]
 */
export function minifyJson(input, opts = {}) {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new Error('JSON input is empty.')
    }
    return JSON.stringify(parseJson(input, opts))
  })
}

/**
 * Validate a JSON string without transforming it. Returns ok/ error.
 * @param {string} input
 * @param {{ lenient?: boolean }} [opts]
 */
export function validateJson(input, opts = {}) {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new Error('JSON input is empty.')
    }
    parseJson(input, opts)
    return 'Valid JSON ✓'
  })
}
