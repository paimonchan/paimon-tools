/**
 * excel-merge.ts — Pure merge logic for CSV & Excel files.
 *
 * Pure functions — zero React, zero browser API, zero DOM.
 * Result type wraps all errors for consistent error handling.
 *
 * Supported input formats: CSV, TSV, XLSX (auto-detected by extension)
 * Supported output formats: XLSX, CSV
 *
 * Phase 1: Append (stack rows from multiple files with matching/union headers)
 */

import { parseCsv } from './csv-io'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { type Result, run } from '../result'

// ── Types ─────────────────────────────────────────────

export interface FileSource {
  /** Original filename (used for format detection + tracking). */
  name: string
  /** File content — string for text formats, ArrayBuffer for binary. */
  data: string | ArrayBuffer
}

export type FileFormat = 'csv' | 'tsv' | 'xlsx' | 'xls'

export interface AppendOptions {
  /** When true, create a union of all columns across all files. */
  unionColumns?: boolean
  /** Desired output format. */
  outputFormat?: 'xlsx' | 'csv'
}

export interface AppendResult {
  data: ArrayBuffer | string
  format: 'xlsx' | 'csv'
  rowCount: number
  columns: string[]
  sources: { name: string; rows: number; format: FileFormat }[]
}

// ── Format detection ────────────────────────────────

/** Detect file format from its extension (case-insensitive). */
function detectFormat(name: string): FileFormat {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'tsv') return 'tsv'
  if (ext === 'xlsx') return 'xlsx'
  if (ext === 'xls') return 'xls'
  return 'csv' // default
}

/** Detect CSV delimiter: comma (default), tab (TSV), semicolon (European CSV). */
function detectDelimiter(input: string): string {
  const firstLine = input.split('\n')[0] ?? ''
  if (firstLine.includes('\t')) return '\t'
  if (firstLine.includes(';')) return ';'
  return ','
}

// ── File reading ────────────────────────────────────

/** Read an XLSX/XLS file and return rows as Record<string, unknown>[]. */
function readXlsx(data: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(data, { type: 'array' })
  const first = wb.SheetNames[0]
  if (!first) throw new Error(`Workbook has no sheets.`)
  return XLSX.utils.sheet_to_json(wb.Sheets[first], { defval: '' }) as Record<string, unknown>[]
}

/** Read a CSV/TSV file and return rows as Record<string, string>[]. */
function readCsv(data: string, format: 'csv' | 'tsv'): Record<string, string>[] {
  const delimiter = format === 'tsv' ? '\t' : detectDelimiter(data)
  const parsed = Papa.parse<Record<string, string>>(data, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
    delimiter,
  })
  if (parsed.errors.length) {
    const first = parsed.errors[0]
    throw new Error(`CSV parse error at row ${first.row}: ${first.message}`)
  }
  return parsed.data
}

// ── Public API ──────────────────────────────────────

/**
 * Append (stack) rows from multiple files into one output.
 *
 * - All files are read as arrays of objects (normalized).
 * - If unionColumns is true, all unique columns from all files are included.
 * - Output can be XLSX (ArrayBuffer) or CSV (string).
 */
export function appendFiles(files: FileSource[], opts: AppendOptions = {}): Result<AppendResult> {
  return run(() => {
    if (files.length < 2) throw new Error('Need at least 2 files to merge.')

    const unionColumns = opts.unionColumns ?? true
    const outputFormat = opts.outputFormat ?? 'xlsx'

    // Phase 1: Read all files into normalized row arrays
    const sources: { name: string; rows: number; format: FileFormat; data: Record<string, unknown>[] }[] = []

    for (const file of files) {
      const format = detectFormat(file.name)
      let rows: Record<string, unknown>[]

      switch (format) {
        case 'xlsx':
        case 'xls':
          if (!(file.data instanceof ArrayBuffer)) throw new Error(`Expected ArrayBuffer for ${file.name}`)
          rows = readXlsx(file.data)
          break
        case 'csv':
        case 'tsv':
          if (typeof file.data !== 'string') throw new Error(`Expected string for ${file.name}`)
          rows = readCsv(file.data, format)
          break
        default:
          throw new Error(`Unsupported format: .${format} in ${file.name}`)
      }

      if (rows.length === 0) throw new Error(`${file.name} has no data rows.`)

      sources.push({ name: file.name, rows: rows.length, format, data: rows })
    }

    // Phase 2: Determine output columns
    if (unionColumns) {
      // Union of ALL columns across ALL files
      const allKeys = new Set<string>()
      for (const src of sources) {
        for (const row of src.data) {
          Object.keys(row).forEach((k) => allKeys.add(k))
        }
      }
      const columns = [...allKeys]

      // Normalize every row to include all columns
      const allRows: Record<string, unknown>[] = []
      for (const src of sources) {
        for (const row of src.data) {
          const normalized: Record<string, unknown> = {}
          for (const col of columns) {
            normalized[col] = row[col] ?? ''
          }
          allRows.push(normalized)
        }
      }

      const totalRows = allRows.length

      // Phase 3: Write output
      if (outputFormat === 'csv') {
        const csv = Papa.unparse(allRows as Record<string, unknown>[], { delimiter: ',' })
        return { data: csv, format: 'csv' as const, rowCount: totalRows, columns, sources: sources.map((s) => ({ name: s.name, rows: s.rows, format: s.format })) }
      } else {
        const ws = XLSX.utils.json_to_sheet(allRows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Combined')
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
        return { data: out as ArrayBuffer, format: 'xlsx' as const, rowCount: totalRows, columns, sources: sources.map((s) => ({ name: s.name, rows: s.rows, format: s.format })) }
      }
    } else {
      // Use first file's headers only — filter out extra columns from other files
      const firstSource = sources[0]
      if (!firstSource) throw new Error('No files to merge.')
      const firstRow = firstSource.data[0]
      if (!firstRow) throw new Error('First file has no data.')
      const columns = Object.keys(firstRow)

      const allRows: Record<string, unknown>[] = []
      for (const src of sources) {
        for (const row of src.data) {
          const normalized: Record<string, unknown> = {}
          for (const col of columns) {
            normalized[col] = row[col] ?? ''
          }
          allRows.push(normalized)
        }
      }

      const totalRows = allRows.length

      if (outputFormat === 'csv') {
        const csv = Papa.unparse(allRows as Record<string, unknown>[], { delimiter: ',' })
        return { data: csv, format: 'csv' as const, rowCount: totalRows, columns, sources: sources.map((s) => ({ name: s.name, rows: s.rows, format: s.format })) }
      } else {
        const ws = XLSX.utils.json_to_sheet(allRows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Combined')
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
        return { data: out as ArrayBuffer, format: 'xlsx' as const, rowCount: totalRows, columns, sources: sources.map((s) => ({ name: s.name, rows: s.rows, format: s.format })) }
      }
    }
  })
}
