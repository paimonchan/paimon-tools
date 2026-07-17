/**
 * DiffTool — compare two texts side-by-side or unified.
 *
 * Lazy-loaded ref tool. Supports:
 * - Paste text in left/right panes
 * - Drag & drop files to auto-fill panes
 * - Side-by-side and unified diff views
 * - Word-level change detection
 * - Download .patch
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Download, GitCompare, Copy } from 'lucide-react'

import {
  textDiff,
  markChangedPairs,
  createPatch,
  type DiffResult,
  type DiffView,
  type DiffLineType,
} from '../engine/converters/diff-engine'
import { usePersistentState } from '../hooks/usePersistentState'
import { readFileAsText } from '../lib/files'
import { useToast } from '../stores/toast-store'

// ── Types ─────────────────────────────────────────────

type Status = 'idle' | 'ok' | 'error'

// ── Color map ─────────────────────────────────────────

const LINE_COLORS: Record<DiffLineType, string> = {
  unchanged: '',
  added: 'bg-emerald-950/40 border-l-2 border-emerald-500',
  removed: 'bg-red-950/40 border-l-2 border-red-500',
}

const LINE_GUTTER_COLORS: Record<DiffLineType, string> = {
  unchanged: 'text-ink-500',
  added: 'text-emerald-400',
  removed: 'text-red-400',
}

const LINE_TEXT_COLORS: Record<DiffLineType, string> = {
  unchanged: 'text-ink-200',
  added: 'text-emerald-200',
  removed: 'text-red-200',
}

const LINE_NUMBERS = 'w-[3.5ch] shrink-0 text-right text-[11px] leading-5 font-mono'

// ── Component ─────────────────────────────────────────

export default function DiffTool() {
  const toast = useToast()

  // Persisted state
  const [oldText, setOldText] = usePersistentState('diff-old', '')
  const [newText, setNewText] = usePersistentState('diff-new', '')
  const [diffView, setDiffView] = usePersistentState<DiffView>('diff-view', 'side-by-side')

  // Transient state
  const [result, setResult] = useState<DiffResult | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [dragging, setDragging] = useState<'old' | 'new' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFileSide, setPendingFileSide] = useState<'old' | 'new' | null>(null)

  // ── Diff computation ────────────────────────────────

  useEffect(() => {
    if (!oldText.trim() && !newText.trim()) {
      setResult(null)
      setStatus('idle')
      setDurationMs(null)
      return
    }

    const t0 = performance.now()
    const res = textDiff(oldText, newText)
    setDurationMs(performance.now() - t0)

    if (res.ok) {
      const marked = markChangedPairs(res.value)
      setResult(marked)
      setStatus('ok')
    } else {
      setResult(null)
      setStatus('error')
    }
  }, [oldText, newText])

  // ── File handling ───────────────────────────────────

  const handleFileDrop = useCallback(
    (side: 'old' | 'new', file: File | null | undefined) => {
      if (!file) return
      readFileAsText(file)
        .then((text) => {
          if (side === 'old') setOldText(text)
          else setNewText(text)
          toast.push(`Loaded ${file.name}`, { variant: 'success' })
        })
        .catch((e) => toast.push(`Failed to read ${file.name}`, { variant: 'error' }))
    },
    [setOldText, setNewText, toast],
  )

  // ── Actions ─────────────────────────────────────────

  function handleSwap() {
    const temp = oldText
    setOldText(newText)
    setNewText(temp)
  }

  function handleClear() {
    setOldText('')
    setNewText('')
  }

  async function handleCopyDiff() {
    if (!result) return
    const text = result.lines
      .map((l) => {
        const prefix = l.type === 'added' ? '+' : l.type === 'removed' ? '-' : ' '
        return `${prefix} ${l.text}`
      })
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.push('Diff copied to clipboard', { variant: 'success' })
    } catch {
      toast.push('Failed to copy', { variant: 'error' })
    }
  }

  async function handleDownloadPatch() {
    const res = createPatch(oldText, newText)
    if (!res.ok) {
      toast.push(`Failed to generate patch: ${res.error}`, { variant: 'error' })
      return
    }
    const blob = new Blob([res.value], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'diff.patch'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 0)
    toast.push('Downloaded diff.patch', { variant: 'success' })
  }

  // ── Render helpers ──────────────────────────────────

  function renderLine(type: DiffLineType, text: string, showGutter = true, key?: number) {
    const bg = LINE_COLORS[type]
    const txt = LINE_TEXT_COLORS[type]
    return (
      <div key={key} className={`flex min-h-[20px] items-stretch font-mono text-[13px] leading-5 ${bg}`}>
        {showGutter && renderGutter(type)}
        <span className={`flex-1 whitespace-pre-wrap break-all px-2 ${txt}`}>{text || '\u00A0'}</span>
      </div>
    )
  }

  function renderGutter(type: DiffLineType) {
    const cls = LINE_GUTTER_COLORS[type]
    const indicator = type === 'added' ? '+' : type === 'removed' ? '-' : ' '
    return (
      <span className={`w-[2ch] shrink-0 text-center text-[11px] font-mono leading-5 ${cls}`}>
        {indicator}
      </span>
    )
  }

  // ── Side-by-side render ─────────────────────────────

  function renderSideBySide() {
    if (!result) return null

    // Split lines into old (unchanged+removed) and new (unchanged+added) sequences
    const oldLines: { type: DiffLineType; line: number | null; text: string }[] = []
    const newLines: { type: DiffLineType; line: number | null; text: string }[] = []

    for (const line of result.lines) {
      if (line.type === 'unchanged') {
        oldLines.push({ type: 'unchanged', line: line.oldLine, text: line.text })
        newLines.push({ type: 'unchanged', line: line.newLine, text: line.text })
      } else if (line.type === 'removed') {
        oldLines.push({ type: 'removed', line: line.oldLine, text: line.text })
        newLines.push({ type: 'unchanged', line: null, text: '' }) // blank placeholder
      } else if (line.type === 'added') {
        oldLines.push({ type: 'unchanged', line: null, text: '' }) // blank placeholder
        newLines.push({ type: 'added', line: line.newLine, text: line.text })
      }
    }

    return (
      <div className="flex flex-1 overflow-hidden rounded-lg border border-ink-700">
        {/* Left column — original */}
        <div className="flex-1 overflow-auto">
          <div className="sticky top-0 z-10 flex border-b border-ink-700 bg-ink-900 px-2 py-1 text-[11px] font-500 text-ink-400">
            <span className="w-[2ch]" />
            <span className={`${LINE_NUMBERS} text-ink-500`}>Old</span>
            <span className="flex-1 px-2">Original</span>
          </div>
          <div className="min-h-full">
            {oldLines.map((l, i) => renderLine(l.type, l.text, true, i))}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-ink-700" />

        {/* Right column — changed */}
        <div className="flex-1 overflow-auto">
          <div className="sticky top-0 z-10 flex border-b border-ink-700 bg-ink-900 px-2 py-1 text-[11px] font-500 text-ink-400">
            <span className="w-[2ch]" />
            <span className={`${LINE_NUMBERS} text-ink-500`}>New</span>
            <span className="flex-1 px-2">Changed</span>
          </div>
          <div className="min-h-full">
            {newLines.map((l, i) => renderLine(l.type, l.text, true, i))}
          </div>
        </div>
      </div>
    )
  }

  // ── Unified render ──────────────────────────────────

  function renderUnified() {
    if (!result) return null
    return (
      <div className="flex-1 overflow-auto rounded-lg border border-ink-700">
        <div className="sticky top-0 z-10 flex border-b border-ink-700 bg-ink-900 px-2 py-1 text-[11px] font-500 text-ink-400">
          <div className="flex gap-3">
            <span className="w-[3.5ch]" />
            <span className="w-[3.5ch]" />
            <span>Unified diff</span>
          </div>
        </div>
        <div className="min-h-full">
          {result.lines.map((l, i) => renderLine(l.type, l.text, true, i))}
        </div>
      </div>
    )
  }

  // ── Drop zone render ────────────────────────────────

  function renderDropZone(
    side: 'old' | 'new',
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    label: string,
  ) {
    const isDragging = dragging === side

    return (
      <div
        className={`relative flex flex-1 flex-col rounded-lg border transition-all ${
          isDragging
            ? 'border-honey-400 bg-honey-400/5'
            : value
              ? 'border-ink-700'
              : 'border-dashed border-ink-700 hover:border-honey-500/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(side) }}
        onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(null) }}
        onDrop={(e) => { e.preventDefault(); setDragging(null); handleFileDrop(side, e.dataTransfer.files?.[0]) }}
      >
        {/* Label */}
        <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5">
          <span className="text-[11px] font-500 text-ink-400">{label}</span>
          {!value && (
            <button
              onClick={() => { setPendingFileSide(side); fileInputRef.current?.click() }}
              className="text-[10px] text-ink-500 hover:text-honey-300 transition-colors"
            >
              Drop file or browse
            </button>
          )}
        </div>

        {/* Textarea */}
        <textarea
          value={value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className="min-h-[150px] flex-1 resize-none bg-transparent px-3 py-2 font-mono text-[13px] leading-5 text-ink-100 outline-none placeholder:text-ink-600"
        />

        {/* Clear button */}
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-2 top-8 rounded px-1.5 py-0.5 text-[10px] text-ink-500 hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    )
  }

  // ── Status bar ──────────────────────────────────────

  const statusMeta = {
    idle: { label: 'Enter text in both panes', dot: 'bg-ink-600', text: 'text-ink-500' },
    ok: { label: 'Diff ready', dot: 'bg-emerald-500', text: 'text-emerald-400' },
    error: { label: 'Error', dot: 'bg-red-500', text: 'text-red-400' },
  }[status]

  // ── Render ──────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.csv,.json,.yaml,.yml,.js,.ts,.jsx,.tsx,.py,.html,.css,.md,.xml,.log,.env,.ini,.cfg"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          if (pendingFileSide) handleFileDrop(pendingFileSide, e.target.files?.[0])
          setPendingFileSide(null)
        }}
      />

      {/* Top bar */}
      <div className="flex items-center justify-between px-3 pt-3">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-ink-400" />
          <span className="text-xs font-500 text-ink-300">Diff Tool</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-ink-700 overflow-hidden">
            {(['side-by-side', 'unified'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setDiffView(v)}
                className={`px-2.5 py-1 text-[11px] font-500 transition-colors ${
                  diffView === v
                    ? 'bg-honey-500/20 text-honey-300'
                    : 'bg-transparent text-ink-400 hover:text-ink-200'
                }`}
              >
                {v === 'side-by-side' ? 'Side by side' : 'Unified'}
              </button>
            ))}
          </div>

          {/* Actions */}
          {result && (
            <>
              <button onClick={handleSwap} className="rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-honey-300 transition-colors">
                ⇄ Swap
              </button>
              <button onClick={handleCopyDiff} className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-honey-300 transition-colors">
                <Copy className="h-3 w-3" /> Copy diff
              </button>
              <button onClick={handleDownloadPatch} className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-honey-300 transition-colors">
                <Download className="h-3 w-3" /> .patch
              </button>
              <button onClick={handleClear} className="rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-red-400 transition-colors">
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* Input panes */}
      <div className="flex flex-1 gap-3 px-3 pt-3 min-h-0">
        {renderDropZone('old', oldText, setOldText, 'Paste original text or drop a file', 'Original')}
        {renderDropZone('new', newText, setNewText, 'Paste changed text or drop a file', 'Changed')}
      </div>

      {/* Diff result */}
      {(oldText || newText) && (
        <div className="flex flex-[2] flex-col gap-2 px-3 pt-3 pb-3 min-h-0">
          {status === 'ok' && result && (
            <>
              {/* Column headers for side-by-side */}
              {diffView === 'side-by-side' ? renderSideBySide() : renderUnified()}
            </>
          )}
          {status === 'error' && (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-red-900/50 bg-red-950/20">
              <span className="text-sm text-red-400">Diff failed — check your input</span>
            </div>
          )}
        </div>
      )}

      {/* Status bar */}
      <footer className="flex items-center justify-between gap-4 border-t border-ink-800 bg-ink-900/60 px-4 py-1.5 text-[11px] text-ink-400">
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 ${statusMeta.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono">
          {status === 'ok' && durationMs != null && (
            <span className="hidden text-ink-500 sm:inline">{durationMs.toFixed(1)}ms</span>
          )}
          {result && (
            <>
              <span className="text-ink-500">
                <span className="text-emerald-400">+{result.stats.additions}</span>
                {' '}
                <span className="text-red-400">-{result.stats.deletions}</span>
                {' · '}
                <span className="text-ink-200">{result.stats.unchanged}</span> unchanged
              </span>
              <span className="text-ink-600">·</span>
              <span className="text-ink-500">
                {result.oldLineCount} → {result.newLineCount} lines
              </span>
            </>
          )}
          <span className="hidden items-center gap-1 text-emerald-500/70 sm:flex">
            on-device
          </span>
        </div>
      </footer>
    </div>
  )
}
