/**
 * DiffTool — compare two texts side-by-side or unified.
 *
 * Lazy-loaded ref tool. Supports:
 * - Paste text in left/right panes
 * - Drag & drop files to auto-fill panes
 * - Side-by-side and unified diff views
 * - Word-level change detection
 * - Download .patch
 * - Keyboard shortcuts, sample data, input size guards
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Copy, Download, Eraser, GitCompare, Sparkles } from 'lucide-react'

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
import EmptyState from './EmptyState'
import ErrorState from './ErrorState'
import StatusBar from './StatusBar'
import { useResizableSplit, Pane, PaneAction, ResizeHandle } from './Panes'

// ── Constants ─────────────────────────────────────────

const MAX_INPUT_CHARS = 200_000
const INPUT_SIZE_WARN = 'Input truncated — max 200K characters allowed'

const DEFAULT_OLD = `Hello World
This is a test
Line three
Line four`

const DEFAULT_NEW = `Hello World
This is a modified test
Line three
Extra line
Line five`

const FILE_ACCEPT =
  '.txt,.csv,.json,.yaml,.yml,.js,.ts,.jsx,.tsx,.py,.html,.css,.md,.xml,.log,.env,.ini,.cfg'

// ── Types ─────────────────────────────────────────────

type Status = 'idle' | 'ok' | 'error' | 'processing'

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
  const [errorMessage, setErrorMessage] = useState('')
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [dragging, setDragging] = useState<'old' | 'new' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFileSide, setPendingFileSide] = useState<'old' | 'new' | null>(null)
  const patchUrlRef = useRef<string | null>(null)

  const { ratio, setRatio, onDragStart, containerRef } = useResizableSplit(0.5)

  // Debounced versions of inputs — diff only runs once they settle
  const [debouncedOld, setDebouncedOld] = useState('')
  const [debouncedNew, setDebouncedNew] = useState('')

  // ── Input guard ─────────────────────────────────────

  const handleOldChange = useCallback(
    (value: string) => {
      if (value.length > MAX_INPUT_CHARS) {
        value = value.slice(0, MAX_INPUT_CHARS)
        toast.push(INPUT_SIZE_WARN, { variant: 'info' })
      }
      setOldText(value)
      setStatus('processing')
    },
    [setOldText, toast],
  )

  const handleNewChange = useCallback(
    (value: string) => {
      if (value.length > MAX_INPUT_CHARS) {
        value = value.slice(0, MAX_INPUT_CHARS)
        toast.push(INPUT_SIZE_WARN, { variant: 'info' })
      }
      setNewText(value)
      setStatus('processing')
    },
    [setNewText, toast],
  )

  // ── Debounce ────────────────────────────────────────

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedOld(oldText)
      setDebouncedNew(newText)
    }, 200)
    return () => clearTimeout(t)
  }, [oldText, newText])

  // ── Diff computation ────────────────────────────────

  useEffect(() => {
    if (!debouncedOld.trim() && !debouncedNew.trim()) {
      setResult(null)
      setStatus('idle')
      setErrorMessage('')
      setDurationMs(null)
      return
    }

    const t0 = performance.now()
    const res = textDiff(debouncedOld, debouncedNew)
    setDurationMs(performance.now() - t0)

    if (res.ok) {
      const marked = markChangedPairs(res.value)
      setResult(marked)
      setStatus('ok')
      setErrorMessage('')
    } else {
      setResult(null)
      setStatus('error')
      setErrorMessage(res.error)
    }
  }, [debouncedOld, debouncedNew])

  // ── File handling ───────────────────────────────────

  const handleFileDrop = useCallback(
    (side: 'old' | 'new', file: File | null | undefined) => {
      if (!file) return
      readFileAsText(file)
        .then((text) => {
          if (side === 'old') {
            handleOldChange(text)
          } else {
            handleNewChange(text)
          }
          toast.push(`Loaded ${file.name}`, { variant: 'success' })
        })
        .catch(() => toast.push(`Failed to read ${file.name}`, { variant: 'error' }))
    },
    [handleOldChange, handleNewChange, toast],
  )

  // ── Keyboard shortcuts ──────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey

      if (isMeta && e.shiftKey && e.key === 'c') {
        e.preventDefault()
        handleCopyDiff()
        return
      }
      if (isMeta && e.key === 's') {
        e.preventDefault()
        handleDownloadPatch()
        return
      }
      if (isMeta && e.shiftKey && e.key === 'w') {
        e.preventDefault()
        handleSwap()
        return
      }
      if (e.key === 'Escape' && (oldText || newText)) {
        e.preventDefault()
        handleClear()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldText, newText, result])

  // ── Actions ─────────────────────────────────────────

  function handleSwap() {
    const temp = oldText
    setOldText(newText)
    setNewText(temp)
    toast.push('Swapped inputs', { variant: 'info' })
  }

  function handleClear() {
    setOldText('')
    setNewText('')
    setResult(null)
    setStatus('idle')
    setErrorMessage('')
    setDurationMs(null)
    if (patchUrlRef.current) {
      URL.revokeObjectURL(patchUrlRef.current)
      patchUrlRef.current = null
    }
    toast.push('Cleared', { variant: 'info' })
  }

  function handleLoadSample() {
    setOldText(DEFAULT_OLD)
    setNewText(DEFAULT_NEW)
    toast.push('Loaded sample', { variant: 'success' })
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
    if (patchUrlRef.current) URL.revokeObjectURL(patchUrlRef.current)
    const url = URL.createObjectURL(blob)
    patchUrlRef.current = url
    const a = document.createElement('a')
    a.href = url
    a.download = 'diff.patch'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => {
      URL.revokeObjectURL(url)
      if (patchUrlRef.current === url) patchUrlRef.current = null
    }, 0)
    toast.push('Downloaded diff.patch', { variant: 'success' })
  }

  // ── Render helpers ──────────────────────────────────

  function renderGutter(type: DiffLineType) {
    const cls = LINE_GUTTER_COLORS[type]
    const indicator = type === 'added' ? '+' : type === 'removed' ? '-' : ' '
    return (
      <span className={`w-[2ch] shrink-0 text-center text-[11px] font-mono leading-5 ${cls}`}>
        {indicator}
      </span>
    )
  }

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

  // ── Side-by-side render ─────────────────────────────

  function renderSideBySide() {
    if (!result) return null

    const oldLines: { type: DiffLineType; line: number | null; text: string }[] = []
    const newLines: { type: DiffLineType; line: number | null; text: string }[] = []

    for (const line of result.lines) {
      if (line.type === 'unchanged') {
        oldLines.push({ type: 'unchanged', line: line.oldLine, text: line.text })
        newLines.push({ type: 'unchanged', line: line.newLine, text: line.text })
      } else if (line.type === 'removed') {
        oldLines.push({ type: 'removed', line: line.oldLine, text: line.text })
        newLines.push({ type: 'unchanged', line: null, text: '' })
      } else if (line.type === 'added') {
        oldLines.push({ type: 'unchanged', line: null, text: '' })
        newLines.push({ type: 'added', line: line.newLine, text: line.text })
      }
    }

    return (
      <div className="flex flex-1 overflow-hidden rounded-lg border border-ink-700">
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

        <div className="w-px bg-ink-700" />

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

  // ── Drag-drop wrapper ───────────────────────────────

  function renderDropContent(side: 'old' | 'new', value: string, onChange: (v: string) => void) {
    const isDragging = dragging === side

    return (
      <div
        className={`flex h-full flex-col transition-all ${
          isDragging ? 'bg-honey-400/5' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(side)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(null)
          handleFileDrop(side, e.dataTransfer.files?.[0])
        }}
      >
        <textarea
          value={value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          placeholder={side === 'old' ? 'Paste original text or drop a file' : 'Paste changed text or drop a file'}
          spellCheck={false}
          className="min-h-[150px] flex-1 resize-none bg-transparent px-3 py-2 font-mono text-[13px] leading-5 text-ink-100 outline-none placeholder:text-ink-600"
        />
      </div>
    )
  }

  // ── Status bar mapping ──────────────────────────────

  const statusBarStatus: 'idle' | 'ok' | 'error' | 'empty' | 'processing' =
    status === 'idle' && !oldText && !newText ? 'empty' : status

  // ── Render ──────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
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
          {/* Keyboard shortcuts hint */}
          <span className="hidden text-[10px] text-ink-500 xl:inline">
            <kbd className="rounded border border-ink-700 bg-ink-800/60 px-1 py-0.5 font-mono">⌘⇧C</kbd> copy{' '}
            <kbd className="rounded border border-ink-700 bg-ink-800/60 px-1 py-0.5 font-mono">⌘S</kbd> dl{' '}
            <kbd className="rounded border border-ink-700 bg-ink-800/60 px-1 py-0.5 font-mono">⌘⇧W</kbd> swap{' '}
            <kbd className="rounded border border-ink-700 bg-ink-800/60 px-1 py-0.5 font-mono">Esc</kbd> clear
          </span>

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
          <button
            onClick={handleSwap}
            className="rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-honey-300 transition-colors"
          >
            ⇄ Swap
          </button>
          {result && (
            <>
              <button
                onClick={handleCopyDiff}
                className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-honey-300 transition-colors"
              >
                <Copy className="h-3 w-3" /> Copy diff
              </button>
              <button
                onClick={handleDownloadPatch}
                className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-honey-300 transition-colors"
              >
                <Download className="h-3 w-3" /> .patch
              </button>
              <button
                onClick={handleClear}
                className="rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* Input panes — resizable split */}
      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 flex-col gap-0 px-3 pt-3 md:flex-row md:gap-0"
      >
        <Pane
          ratio={ratio}
          label="Original"
          actions={
            <>
              <PaneAction onClick={handleLoadSample} icon={Sparkles} label="Sample" />
              {oldText && (
                <PaneAction onClick={() => setOldText('')} icon={Eraser} label="Clear" />
              )}
              {!oldText && (
                <button
                  onClick={() => {
                    setPendingFileSide('old')
                    fileInputRef.current?.click()
                  }}
                  className="rounded-md px-2 py-1 text-[10px] text-ink-500 hover:text-honey-300 transition-colors"
                >
                  Browse
                </button>
              )}
            </>
          }
        >
          {renderDropContent('old', oldText, handleOldChange)}
        </Pane>

        <div className="hidden md:flex">
          <ResizeHandle onDragStart={onDragStart} onDoubleClick={() => setRatio(0.5)} />
        </div>

        <Pane
          ratio={ratio}
          label="Changed"
          actions={
            <>
              <PaneAction onClick={handleLoadSample} icon={Sparkles} label="Sample" />
              {newText && (
                <PaneAction onClick={() => setNewText('')} icon={Eraser} label="Clear" />
              )}
              {!newText && (
                <button
                  onClick={() => {
                    setPendingFileSide('new')
                    fileInputRef.current?.click()
                  }}
                  className="rounded-md px-2 py-1 text-[10px] text-ink-500 hover:text-honey-300 transition-colors"
                >
                  Browse
                </button>
              )}
            </>
          }
        >
          {renderDropContent('new', newText, handleNewChange)}
        </Pane>
      </div>

      {/* Diff output area */}
      <div className="flex flex-[2] flex-col px-3 pt-3 pb-3 min-h-[200px]">
        {status === 'error' ? (
          <ErrorState message={errorMessage} />
        ) : status === 'idle' && !result ? (
          <EmptyState isFileInput={false} />
        ) : result ? (
          diffView === 'side-by-side' ? (
            renderSideBySide()
          ) : (
            renderUnified()
          )
        ) : null}
      </div>

      {/* Status bar */}
      <StatusBar
        inputChars={oldText.length + newText.length}
        outputChars={result ? result.lines.length : 0}
        status={statusBarStatus}
        error={status === 'error' ? errorMessage : null}
        durationMs={durationMs}
      />
    </div>
  )
}
