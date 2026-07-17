/**
 * csv-io.ts — CSV parse/stringify via PapaParse (pure functions).
 *
 * Also includes jsonToCsv (JSON → CSV) since it uses PapaParse for output.
 */

import Papa from 'papaparse'
import { type Result, run } from '../result'
import { toJsonArray } from './json-io'

export interface CsvOpts {
  delimiter?: string
}

/**
 * Parse a CSV string into an array of objects.
 */
export function parseCsv(input: string, opts: CsvOpts = {}): Record<string, string>[] {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('CSV input is empty.')
  }
  const parsed = Papa.parse<Record<string, string>>(input, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
    delimiter: opts.delimiter ?? '',
  })
  if (parsed.errors.length) {
    const first = parsed.errors[0]
    throw new Error(`CSV parse issue on row ${first.row}: ${first.message}`)
  }
  return parsed.data
}

/**
 * Convert CSV string to JSON string (array of objects).
 */
export function csvToJson(input: string, opts: CsvOpts = {}): Result<string> {
  return run(() => {
    const data = parseCsv(input, opts)
    return JSON.stringify(data, null, 2)
  })
}

/**
 * Convert JSON (array of objects) to a CSV string.
 * Lives here because PapaParse is the CSV engine.
 */
export function jsonToCsv(input: unknown, opts: { delimiter?: string; lenient?: boolean } = {}): Result<string> {
  return run(() => {
    const rows = toJsonArray(input, opts)
    if (rows.length === 0) return ''

    // Reject primitive arrays — CSV requires objects
    if (rows.some((r) => typeof r !== 'object' || r === null)) {
      throw new Error(
        'JSON to CSV requires an array of objects, not primitives.\n' +
          'Try: [{"key": "value"}, {"key": "value"}]\n' +
          'Got: mixed or primitive values',
      )
    }

    // Warn about nested objects/arrays — CSV flattens to "[object Object]"
    const nested = rows.find((r) =>
      Object.values(r as Record<string, unknown>).some((v) => typeof v === 'object' && v !== null && !(v instanceof Date)),
    )
    if (nested) {
      throw new Error(
        'CSV does not support nested objects or arrays. ' +
          'Values like objects or arrays become "[object Object]" in CSV output.\n' +
          'Flatten nested data first or use JSON format instead.',
      )
    }

    return Papa.unparse(rows as Record<string, unknown>[], { delimiter: opts.delimiter ?? ',' })
  })
}
