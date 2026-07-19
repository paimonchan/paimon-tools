/**
 * CombineFilesTool — merge/append multiple CSV & Excel files.
 *
 * Lazy-loaded ref tool. Supports:
 * - Multi-file drag & drop (CSV, TSV, XLSX, mixed)
 * - Auto-detect format per file
 * - Union columns (merge mismatched headers)
 * - Preview first 5 rows
 * - Output as .xlsx or .csv
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Check, Download, FileUp, Trash2 } from 'lucide-react'

import { appendFiles, type AppendResult, type FileSource } from '../engine/converters/excel-merge'
import { usePersistentState } from '../hooks/usePersistentState'
import { downloadArrayBuffer, downloadBlob, readFileAsArrayBuffer, readFileAsText } from '../lib/files'
import { useToast } from '../stores/toast-store'
import EmptyState from './EmptyState'
import ErrorState from './ErrorState'
import StatusBar from './StatusBar'
import ToolHeader from './ToolHeader'
import { TOOLS_BY_ID, type ConverterTool, type ToolDefinition } from '../engine/registry'

// ── Constants ─────────────────────────────────────────

const MAX_TOTAL_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ACCEPT = '.csv,.tsv,.xlsx,.xls'

type Status = 'idle' | 'ok' | 'error' | 'processing'

// ── Format helpers ────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function extLabel(ext: string): string {
  switch (ext) {
    case 'xlsx':
      return 'XLSX'
    case 'xls':
      return 'XLS'
    case 'tsv':
      return 'TSV'
    default:
      return 'CSV'
  }
}

// ── Types ─────────────────────────────────────────────

interface LoadedFile {
  name: string
  size: number
  format: string
}

// ── Component ─────────────────────────────────────────

export default function CombineFilesTool() {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const tool = TOOLS_BY_ID['combine-files'] as ToolDefinition

  // State
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([])
  const [rawFiles, setRawFiles] = useState<FileSource[]>([])
  const [result, setResult] = useState<AppendResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [dragging, setDragging] = useState(false)
  const [durationMs, setDurationMs] = useState<number | null>(null)

  // Persisted options
  const [unionColumns, setUnionColumns] = usePersistentState('combine-union', true)
  const [outputFormat, setOutputFormat] = usePersistentState<'xlsx' | 'csv'>('combine-format', 'xlsx')

  // Debounced raw files for 200ms debounce on merge computation
  const [debouncedRawFiles, setDebouncedRawFiles] = useState<FileSource[]>([])

  // ── Derived ─────────────────────────────────────────

  const totalFileSize = loadedFiles.reduce((sum, f) => sum + f.size, 0)

  // ── File loading ───────────────────────────────────

  const loadFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    if (fileList.length < 2) {
      toast.push('Drop at least 2 files to merge.', { variant: 'info' })
      return
    }

    // Size guard
    let totalSize = 0
    for (let i = 0; i < fileList.length; i++) {
      totalSize += fileList[i]!.size
    }
    if (totalSize > MAX_TOTAL_FILE_SIZE) {
      toast.push(
        `Total file size exceeds 50MB limit (${formatSize(totalSize)}). Please reduce file sizes.`,
        { variant: 'error' },
      )
      return
    }

    setStatus('processing')
    setErrorMessage('')
    setResult(null)

    const loaded: LoadedFile[] = []
    const sources: FileSource[] = []

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      if (!file) continue

      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      try {
        const data =
          ext === 'xlsx' || ext === 'xls'
            ? await readFileAsArrayBuffer(file)
            : await readFileAsText(file)

        loaded.push({ name: file.name, size: file.size, format: ext })
        sources.push({ name: file.name, data })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toast.push(`Failed to read ${file.name}: ${msg}`, { variant: 'error' })
      }
    }

    setLoadedFiles(loaded)
    setRawFiles(sources)

    if (sources.length < 2) {
      setStatus('idle')
      toast.push('Need at least 2 valid files to merge.', { variant: 'info' })
      return
    }
  }, [toast])

  // ── Debounce raw files (200ms) ─────────────────────

  useEffect(() => {
    const t = setTimeout(() => setDebouncedRawFiles(rawFiles), 200)
    return () => clearTimeout(t)
  }, [rawFiles])

  // ── Merge computation ────────────────────────────

  useEffect(() => {
    if (debouncedRawFiles.length < 2) return

    setStatus('processing')
    let cancelled = false

    setTimeout(() => {
      if (cancelled) return
      const t0 = performance.now()
      const res = appendFiles(debouncedRawFiles, { unionColumns, outputFormat })
      if (cancelled) return
      setDurationMs(performance.now() - t0)

      if (res.ok) {
        setResult(res.value)
        setErrorMessage('')
        setStatus('ok')
      } else {
        setResult(null)
        setErrorMessage(res.error)
        setStatus('error')
      }
    }, 0)

    return () => {
      cancelled = true
    }
  }, [debouncedRawFiles, unionColumns, outputFormat])

  // ── Actions ────────────────────────────────────────

  function handleRemove(index: number) {
    const nextLoaded = loadedFiles.filter((_, i) => i !== index)
    const nextRaw = rawFiles.filter((_, i) => i !== index)
    setLoadedFiles(nextLoaded)
    setRawFiles(nextRaw)
    if (nextLoaded.length === 0) {
      setResult(null)
      setErrorMessage('')
      setStatus('idle')
      setDurationMs(null)
    }
  }

  const handleClear = useCallback(() => {
    setLoadedFiles([])
    setRawFiles([])
    setResult(null)
    setErrorMessage('')
    setStatus('idle')
    setDurationMs(null)
  }, [])

  const handleDownload = useCallback(() => {
    if (!result) return
    const filename = `combined.${outputFormat}`
    if (outputFormat === 'csv') {
      if (typeof result.data !== 'string') {
        toast.push('Unexpected data format for CSV download.', { variant: 'error' })
        return
      }
      downloadBlob({ content: result.data, filename, mime: 'text/csv' })
    } else {
      if (!(result.data instanceof ArrayBuffer)) {
        toast.push('Unexpected data format for Excel download.', { variant: 'error' })
        return
      }
      downloadArrayBuffer({
        arraybuffer: result.data,
        filename,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    }
    toast.push(`Downloaded ${filename}`, { variant: 'success' })
  }, [result, outputFormat, toast])

  // ── Keyboard shortcuts ──────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey
      if (isMeta && e.shiftKey && e.key === 'c') {
        e.preventDefault()
        handleClear()
      }
      if (isMeta && e.key === 's') {
        e.preventDefault()
        handleDownload()
      }
      if (e.key === 'Escape' && loadedFiles.length > 0) {
        e.preventDefault()
        handleClear()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedFiles, result])

  // ── Render helpers ─────────────────────────────────

  function renderPreview() {
    if (!result) return null

    const MAX_COLUMNS = 8
    const columns = result.columns.slice(0, MAX_COLUMNS)

    return (
      <div className="space-y-3">
        {/* Column badges */}
        <div className="flex flex-wrap gap-1.5">
          {columns.map((col) => (
            <span
              key={col}
              className="rounded bg-ink-700 px-2 py-0.5 text-[11px] font-mono text-ink-200"
            >
              {col}
            </span>
          ))}
          {result.columns.length > MAX_COLUMNS && (
            <span className="rounded bg-ink-700 px-2 py-0.5 text-[11px] text-ink-400">
              +{result.columns.length - MAX_COLUMNS} more
            </span>
          )}
        </div>

        {/* Sample data table */}
        {result.sampleRows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-ink-700">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="border-b border-ink-700 bg-ink-800/50">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-2 py-1 text-left text-ink-400 font-500 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.sampleRows.map((row, i) => (
                  <tr key={i} className="border-b border-ink-800/50 last:border-0">
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="max-w-[200px] truncate px-2 py-1 text-ink-200"
                        title={String(row[col] ?? '')}
                      >
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-[11px] text-ink-400">
          {result.columns.length} column{result.columns.length !== 1 ? 's' : ''} ·{' '}
          {result.rowCount.toLocaleString()} rows total
          {result.rowCount > 5 && <span className="text-ink-500"> · showing first 5</span>}
        </div>
      </div>
    )
  }

  // Compute output chars for status bar
  const outputChars = result
    ? typeof result.data === 'string'
      ? result.data.length
      : result.data instanceof ArrayBuffer
        ? result.data.byteLength
        : 0
    : 0

  // Determine StatusBar status
  const barStatus = loadedFiles.length === 0 ? 'empty' : status === 'processing' ? 'processing' : status

  // ── Render ─────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Tool header */}
      <div className="mx-3 mt-3">
        <ToolHeader tool={tool as unknown as ConverterTool} onSwap={() => {}} />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          loadFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        className={[
          'mx-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-all',
          dragging
            ? 'border-honey-400 bg-honey-400/5 scale-[1.01]'
            : loadedFiles.length > 0
              ? 'border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30'
              : 'border-ink-700 py-16 hover:border-honey-500/50 hover:bg-ink-800/30',
        ].join(' ')}
      >
        {loadedFiles.length === 0 ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-ink-700 bg-ink-800/50">
              <FileUp className="h-6 w-6 text-ink-400" />
            </div>
            <div className="text-sm">
              <span className="text-ink-200">Drop CSV, TSV, or Excel files</span>
            </div>
            <div className="text-xs text-ink-500">
              Supports mixed formats · Drop 2+ files to merge
            </div>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
              <Check className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="text-xs text-ink-400">Drop more files or click to add</div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => loadFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {loadedFiles.length > 0 && (
        <div className="mx-3 mb-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-500 text-ink-400">
              {loadedFiles.length} file{loadedFiles.length !== 1 ? 's' : ''} ({formatSize(totalFileSize)})
            </span>
            <button
              onClick={handleClear}
              className="text-[11px] text-ink-500 transition-colors hover:text-red-400"
            >
              Clear all
            </button>
          </div>
          {loadedFiles.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center justify-between rounded-md bg-ink-800/40 px-3 py-1.5 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[10px] text-ink-300">
                  {extLabel(f.format)}
                </span>
                <span className="truncate text-ink-200">{f.name}</span>
                <span className="shrink-0 text-ink-500">({formatSize(f.size)})</span>
              </div>
              <button
                onClick={() => handleRemove(i)}
                className="ml-2 shrink-0 text-ink-500 transition-colors hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Options */}
      {loadedFiles.length > 0 && (
        <div className="mx-3 mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={unionColumns}
              onChange={(e) => setUnionColumns(e.target.checked)}
              className="h-3.5 w-3.5 accent-honey-500"
            />
            <span className="text-ink-300">Union all columns</span>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-ink-400">Output:</span>
            <div className="flex overflow-hidden rounded-md border border-ink-700">
              {(['xlsx', 'csv'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setOutputFormat(fmt)}
                  className={[
                    'px-2.5 py-1 text-[11px] font-500 transition-colors',
                    outputFormat === fmt
                      ? 'bg-honey-500/20 text-honey-300'
                      : 'bg-transparent text-ink-400 hover:text-ink-200',
                  ].join(' ')}
                >
                  .{fmt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Preview / Result area */}
      <div className="mx-3 flex min-h-0 flex-1 flex-col">
        {status === 'ok' && result ? (
          <div className="flex flex-1 flex-col rounded-lg border border-ink-700 bg-ink-900/30 p-4">
            <div className="mb-2 text-[11px] font-500 text-ink-400">Preview</div>
            {renderPreview()}
            <div className="mt-auto pt-4">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 rounded-lg bg-honey-500/20 px-4 py-2 text-sm font-500 text-honey-300 transition-colors hover:bg-honey-500/30"
              >
                <Download className="h-4 w-4" />
                Download combined.{outputFormat}
              </button>
            </div>
          </div>
        ) : status === 'error' && errorMessage ? (
          <ErrorState message={errorMessage} />
        ) : (
          <EmptyState isFileInput={true} />
        )}
      </div>

      {/* Status bar */}
      <StatusBar
        inputChars={totalFileSize}
        outputChars={outputChars}
        status={barStatus as 'idle' | 'ok' | 'error' | 'empty' | 'processing'}
        error={status === 'error' ? errorMessage : null}
        durationMs={durationMs}
      />
    </div>
  )
}
