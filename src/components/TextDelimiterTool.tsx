/**
 * TextDelimiterTool — join list items with delimiter, quoting, and wrapping.
 *
 * Lazy-loaded ref tool. Like delim.co, 100% client-side.
 * All settings persist via usePersistentState.
 */

import { useCallback, useEffect, useState } from 'react'
import { Copy, Download, Eraser, List, Sparkles } from 'lucide-react'

import { delimitText, type DelimiterOptions } from '../engine/converters/delimiter-tool'
import { usePersistentState } from '../hooks/usePersistentState'
import { downloadBlob } from '../lib/files'
import { useToast } from '../stores/toast-store'

// ── Constants ─────────────────────────────────────────

const DELIMITER_PRESETS: { label: string; value: string }[] = [
  { label: '⏎ New Line', value: '\n' },
  { label: ', Comma', value: ',' },
  { label: '; Semicolon', value: ';' },
  { label: '↹ Tab', value: '\t' },
  { label: '| Pipe', value: '|' },
  { label: '␣ Space', value: ' ' },
]

const COMMA_STYLES: { label: string; value: string }[] = [
  { label: ',  (no space)', value: ',' },
  { label: ',  (with space)', value: ', ' },
]

const QUOTE_OPTIONS: { label: string; value: DelimiterOptions['quote'] }[] = [
  { label: 'None', value: 'none' },
  { label: "' Single", value: 'single' },
  { label: '" Double', value: 'double' },
]

const DEFAULT_SAMPLE = `apple
banana`
const DEFAULT_OUTPUT = `apple, banana`

type Status = 'idle' | 'ok' | 'error'

// ── Helpers ───────────────────────────────────────────

function applyComma(delimiter: string, commaStyle: string): string {
  if (delimiter !== ',') return delimiter
  return commaStyle
}

/** Reusable card wrapper for control groups. */
function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-700/50 bg-ink-800/30 p-3">
      <label className="mb-2 block text-[11px] font-600 uppercase tracking-wider text-ink-400">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Reusable active/ inactive chip button. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[11px] font-500 transition-colors ${
        active
          ? 'bg-honey-400/15 text-honey-200'
          : 'text-ink-400 hover:text-ink-200'
      }`}
    >
      {children}
    </button>
  )
}

/** Small monospace input for short text like <li>. */
function ShortInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-20 rounded border border-ink-700 bg-ink-800/50 px-2 py-1 font-mono text-xs text-ink-100 placeholder-ink-500 focus:outline-none focus:border-honey-500/50"
    />
  )
}

// ── Component ─────────────────────────────────────────

export default function TextDelimiterTool() {
  const toast = useToast()

  // Persisted settings
  const [inputText, setInputText] = usePersistentState('td-input', DEFAULT_SAMPLE)
  const [delimiter, setDelimiter] = usePersistentState('td-delimiter', ',')
  const [commaStyle, setCommaStyle] = usePersistentState('td-comma-style', ', ')
  const [quote, setQuote] = usePersistentState<DelimiterOptions['quote']>('td-quote', 'none')
  const [wrapOpen, setWrapOpen] = usePersistentState('td-wrap-open', '')
  const [wrapClose, setWrapClose] = usePersistentState('td-wrap-close', '')
  const [wrapperOpen, setWrapperOpen] = usePersistentState('td-wrapper-open', '')
  const [wrapperClose, setWrapperClose] = usePersistentState('td-wrapper-close', '')
  const [skipLines, setSkipLines] = usePersistentState('td-skip-lines', 0)
  const [trim, setTrim] = usePersistentState('td-trim', true)
  const [skipEmpty, setSkipEmpty] = usePersistentState('td-skip-empty', true)
  const [customDelimiter, setCustomDelimiter] = usePersistentState('td-custom-delim', '')

  // Transient state
  const [output, setOutput] = useState(DEFAULT_OUTPUT)
  const [status, setStatus] = useState<Status>('idle')
  const [debouncedInput, setDebouncedInput] = useState(DEFAULT_SAMPLE)
  const [durationMs, setDurationMs] = useState<number | null>(null)

  // Compute effective delimiter
  const effectiveDelimiter = delimiter === 'custom' ? customDelimiter || ',' : applyComma(delimiter, commaStyle)

  // ── Processing ────────────────────────────────────

  // Debounce input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInput(inputText), 200)
    return () => clearTimeout(t)
  }, [inputText])

  // Run delimiter
  useEffect(() => {
    if (!debouncedInput || debouncedInput.trim() === '') {
      setOutput('')
      setStatus('idle')
      setDurationMs(null)
      return
    }
    const t0 = performance.now()
    try {
      const result = delimitText(debouncedInput, {
        delimiter: effectiveDelimiter,
        quote,
        skipLines,
        wrapOpen,
        wrapClose,
        wrapperOpen,
        wrapperClose,
        trim,
        skipEmpty,
      })
      setOutput(result)
      setStatus(result ? 'ok' : 'idle')
    } catch {
      setOutput('')
      setStatus('error')
    }
    setDurationMs(performance.now() - t0)
  }, [debouncedInput, effectiveDelimiter, quote, skipLines, wrapOpen, wrapClose, wrapperOpen, wrapperClose, trim, skipEmpty])

  // ── Actions ───────────────────────────────────────

  const handleClear = useCallback(() => {
    setInputText('')
    toast.push('Cleared', { variant: 'info' })
  }, [setInputText, toast])

  const handleLoadSample = useCallback(() => {
    setInputText(DEFAULT_SAMPLE)
    toast.push('Loaded sample', { variant: 'success' })
  }, [setInputText, toast])

  const handleCopy = useCallback(() => {
    if (!output) return
    navigator.clipboard.writeText(output)
    toast.push('Copied to clipboard', { variant: 'success' })
  }, [output, toast])

  const handleDownload = useCallback(() => {
    if (!output) return
    downloadBlob({ content: output, filename: 'delimited.txt', mime: 'text/plain' })
    toast.push('Downloaded delimited.txt', { variant: 'success' })
  }, [output, toast])

  // ── Render ──────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* ── Heading ── */}
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-700 bg-ink-800/60">
          <List className="h-4 w-4 text-honey-300" />
        </div>
        <div>
          <h1 className="font-display text-lg font-600 text-ink-50">Text Delimiter Tool</h1>
          <p className="mt-0.5 max-w-2xl text-[13px] text-ink-400">
            Join list items with custom delimiter, quotes, and wrapping. Perfect for SQL IN clauses, HTML lists, and array literals.
          </p>
        </div>
      </div>

      {/* ── 2-Column layout (desktop) ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        {/* ── Left column: Input + Controls ── */}
        <div className="flex flex-col gap-3 md:w-3/5">
          {/* Input area */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-600 uppercase tracking-wider text-ink-400">
                Column Data
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleLoadSample}
                  className="flex items-center gap-1 text-[11px] text-ink-400 transition-colors hover:text-honey-200"
                >
                  <Sparkles className="h-3 w-3" /> Sample
                </button>
                {inputText && (
                  <button
                    onClick={handleClear}
                    className="flex items-center gap-1 text-[11px] text-ink-400 transition-colors hover:text-ink-200"
                  >
                    <Eraser className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste items, one per line…"
              className="w-full h-32 md:h-44 rounded-lg border border-ink-700 bg-ink-800/50 px-3 py-2 font-mono text-sm text-ink-100 placeholder-ink-500 resize-y focus:outline-none focus:border-honey-500/50"
              spellCheck={false}
            />
          </div>

          {/* Delimiter card */}
          <Card label="Delimiter">
            <div className="flex flex-wrap items-center gap-1.5">
              {DELIMITER_PRESETS.map((d) => (
                <Chip key={d.value} active={delimiter === d.value} onClick={() => setDelimiter(d.value)}>
                  {d.label}
                </Chip>
              ))}
              <Chip active={delimiter === 'custom'} onClick={() => setDelimiter('custom')}>
                ✏️ Custom
              </Chip>
            </div>
            {/* Comma style — only when delimiter is comma */}
            {delimiter === ',' && (
              <div className="mt-2 flex flex-wrap items-center gap-2 pt-2 border-t border-ink-700/30">
                <span className="text-[11px] text-ink-500">Style:</span>
                {COMMA_STYLES.map((s) => (
                  <Chip key={s.value} active={commaStyle === s.value} onClick={() => setCommaStyle(s.value)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            )}
            {/* Custom delimiter input */}
            {delimiter === 'custom' && (
              <div className="mt-2 flex items-center gap-2 pt-2 border-t border-ink-700/30">
                <span className="text-[11px] text-ink-500 shrink-0">Custom:</span>
                <input
                  value={customDelimiter}
                  onChange={(e) => setCustomDelimiter(e.target.value)}
                  placeholder="Enter delimiter…"
                  className="flex-1 min-w-0 max-w-32 rounded border border-ink-700 bg-ink-800/50 px-2 py-1 font-mono text-xs text-ink-100 placeholder-ink-500 focus:outline-none focus:border-honey-500/50"
                />
              </div>
            )}
          </Card>

          {/* Formatting card: Quotes + Wrapping */}
          <Card label="Formatting">
            {/* Quotes */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {QUOTE_OPTIONS.map((q) => (
                <Chip key={q.value} active={quote === q.value} onClick={() => setQuote(q.value)}>
                  {q.label}
                </Chip>
              ))}
            </div>

            {/* Wrap Each Item */}
            <div className="mb-2">
              <span className="text-[11px] text-ink-500 mb-1 block">Wrap each item</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-ink-500">Open</span>
                <ShortInput value={wrapOpen} onChange={setWrapOpen} placeholder="<li>" />
                <span className="text-[11px] text-ink-500">Close</span>
                <ShortInput value={wrapClose} onChange={setWrapClose} placeholder="</li>" />
              </div>
            </div>

            {/* Global Wrapper */}
            <div>
              <span className="text-[11px] text-ink-500 mb-1 block">Global wrapper</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-ink-500">Open</span>
                <ShortInput value={wrapperOpen} onChange={setWrapperOpen} placeholder="<ul>" />
                <span className="text-[11px] text-ink-500">Close</span>
                <ShortInput value={wrapperClose} onChange={setWrapperClose} placeholder="</ul>" />
              </div>
            </div>
          </Card>

          {/* Options card */}
          <Card label="Options">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-[11px] text-ink-300">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} className="accent-honey-500" />
                Trim lines
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-ink-300">
                <input type="checkbox" checked={skipEmpty} onChange={(e) => setSkipEmpty(e.target.checked)} className="accent-honey-500" />
                Skip empty
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-ink-300">
                <span>Skip first</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={skipLines}
                  onChange={(e) => setSkipLines(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
                  className="w-12 rounded border border-ink-700 bg-ink-800/50 px-1.5 py-0.5 text-center text-xs text-ink-100 focus:outline-none focus:border-honey-500/50"
                />
                <span>lines (header)</span>
              </label>
            </div>
            {/* Known limitations — subtle note */}
            <p className="mt-3 pt-3 border-t border-ink-700/30 text-[10px] text-ink-500 italic">
              Note: values containing the delimiter character are not escaped — same behavior as delim.co.
            </p>
          </Card>
        </div>

        {/* ── Right column: Output ── */}
        <div className="flex min-h-0 flex-1 flex-col md:w-2/5">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-600 uppercase tracking-wider text-ink-400">
              Delimited Output
            </label>
            <div className="flex items-center gap-2">
              {output && (
                <>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[11px] text-ink-400 transition-colors hover:text-honey-200"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1 text-[11px] text-ink-400 transition-colors hover:text-honey-200"
                  >
                    <Download className="h-3 w-3" /> Download
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            value={output}
            readOnly
            className="w-full flex-1 resize-none rounded-lg border border-ink-700 bg-ink-800/50 px-3 py-2 font-mono text-sm text-ink-100 focus:outline-none"
            spellCheck={false}
            placeholder="Delimited output will appear here…"
          />
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="mt-3 flex items-center justify-between border-t border-ink-800 pt-2 text-[11px] text-ink-500">
        <div className="flex items-center gap-4">
          <span>{inputText.split('\n').length} lines input</span>
          <span>{output.length.toLocaleString()} chars output</span>
          <span>{status === 'ok' && durationMs !== null ? `${durationMs.toFixed(0)}ms` : ''}</span>
        </div>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500/60" />
          100% local
        </span>
      </div>
    </div>
  )
}
