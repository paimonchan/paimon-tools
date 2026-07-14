/**
 * xlsx-io.ts — Excel (.xlsx) read/write via SheetJS (pure functions).
 *
 * SheetJS is imported as a static dep. The bundle chunking (manualChunks
 * in Vite config) ensures it's loaded as a separate chunk.
 */

import * as XLSX from 'xlsx'
import { parseCsv } from './csv-io'
import { toJsonArray } from './json-io'
import { type Result, run } from '../result'

/**
 * Convert JSON (array of objects) to an .xlsx workbook (ArrayBuffer).
 */
export function jsonToXlsx(
  input: unknown,
  opts: { lenient?: boolean } = {}
): Result<{ arraybuffer: ArrayBuffer; filename: string }> {
  return run(() => {
    const rows = toJsonArray(input, opts) as Record<string, unknown>[]
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    return { arraybuffer: out as ArrayBuffer, filename: 'converted.xlsx' }
  })
}

/**
 * Convert an .xlsx file (ArrayBuffer) into a JSON string of first sheet.
 */
export function xlsxToJson(input: ArrayBuffer): Result<string> {
  return run(() => {
    const wb = XLSX.read(input, { type: 'array' })
    const first = wb.SheetNames[0]
    if (!first) throw new Error('Workbook has no sheets.')
    const ws = wb.Sheets[first]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
    return JSON.stringify(rows, null, 2)
  })
}

/**
 * Convert a CSV string into an .xlsx workbook (ArrayBuffer).
 */
export function csvToXlsx(input: string): Result<{ arraybuffer: ArrayBuffer; filename: string }> {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new Error('CSV input is empty.')
    }
    const rows = parseCsv(input)
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    return { arraybuffer: out as ArrayBuffer, filename: 'converted.xlsx' }
  })
}

/**
 * Convert an .xlsx file (ArrayBuffer) into a CSV string of first sheet.
 */
export function xlsxToCsv(input: ArrayBuffer): Result<string> {
  return run(() => {
    const wb = XLSX.read(input, { type: 'array' })
    const first = wb.SheetNames[0]
    if (!first) throw new Error('Workbook has no sheets.')
    const ws = wb.Sheets[first]
    return XLSX.utils.sheet_to_csv(ws)
  })
}
