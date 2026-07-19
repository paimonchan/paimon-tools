/**
 * DiffTool — compare two texts side-by-side or unified using CodeMirror 6.
 *
 * Lazy-loaded ref tool. Uses @codemirror/merge for inline diff rendering:
 * input and output are the same view — no separate output area.
 *
 * Supports:
 * - Editable side-by-side panes with real-time diff highlighting
 * - Drag & drop files to auto-fill panes
 * - Unified diff view mode
 * - Word-level change detection (via the diff library)
 * - Download .patch, copy diff, swap, clear, sample
 * - Keyboard shortcuts, input size guards
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  Copy,
  Download,
  GitCompare,
  Sparkles,
} from 'lucide-react'

// CodeMirror 6
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { MergeView } from '@codemirror/merge'

import { createPatch } from '../engine/converters/diff-engine'
import { readFileAsText } from '../lib/files'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'

// ── Constants ─────────────────────────────────────────

const LS_KEY_OLD = 'diff-old'
const LS_KEY_NEW = 'diff-new'

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

const INPUT_LIMIT = 200_000

// ── Persistent storage helpers ────────────────────────

function loadPersisted(key: string, fallback = ''): string {
  try {
    const raw = localStorage.getItem(`paimon.${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function savePersisted(key: string, value: string) {
  try {
    localStorage.setItem(`paimon.${key}`, JSON.stringify(value))
  } catch { /* quota exceeded — silently ignore */ }
}

// ── Editor extensions ─────────────────────────────────

function baseExtensions(editable = true) {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.editable.of(editable),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.theme({
      '&': { backgroundColor: 'transparent !important', height: '100%' },
      '.cm-scroller': { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '13px' },
      '.cm-content': { padding: '8px 4px', caretColor: '#e7ac34' },
      '.cm-gutters': { backgroundColor: 'transparent', borderRight: '1px solid #2e2a24', color: '#5f574d' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '.cm-lineNumbers': { minWidth: '3ch', fontSize: '11px' },
      '.cm-merge-gap': { borderLeft: '1px solid #2e2a24', borderRight: '1px solid #2e2a24' },
      '.cm-merge-gutter': { backgroundColor: 'transparent' },
      '.cm-merge-gutter .cm-merge-gutter-marker': { width: '100%' },
      '.cm-merge-chunk': { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
      '.cm-merge-chunk-start': { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
      '.cm-merge-chunk-end': { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
      '.cm-merge-chunk-b': { backgroundColor: 'rgba(34, 197, 94, 0.1)' },
      '.cm-merge-chunk-b-start': { backgroundColor: 'rgba(34, 197, 94, 0.1)' },
      '.cm-merge-chunk-b-end': { backgroundColor: 'rgba(34, 197, 94, 0.1)' },
    }),
  ]
}

// ── Types ─────────────────────────────────────────────

type Status = 'idle' | 'ok' | 'error' | 'processing'

// ── Component ─────────────────────────────────────────

export default function DiffTool() {
  const toast = useToast()

  // Refs for CodeMirror instance
  const containerRef = useRef<HTMLDivElement>(null)
  const mergeViewRef = useRef<MergeView | null>(null)

  // Transient state
  const [stats, setStats] = useState({ additions: 0, deletions: 0, unchanged: 0 })
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage] = useState('')
  const [durationMs] = useState<number | null>(null)
  const [dragging, setDragging] = useState<'old' | 'new' | null>(null)
  const [diffView, setDiffView] = useState<'side-by-side' | 'unified'>('side-by-side')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFileSide, setPendingFileSide] = useState<'old' | 'new' | null>(null)
  const patchUrlRef = useRef<string | null>(null)

  // ── Initialize / rebuild CodeMirror ─────────────────

  function updateStats() {
    const mv = mergeViewRef.current
    if (!mv) return
    try {
      const chunks = mv.chunks
      let additions = 0
      let deletions = 0
      for (const c of chunks) {
        deletions += c.toA - c.fromA
        additions += c.toB - c.fromB
      }
      setStats({ additions, deletions, unchanged: 0 })
      if (additions > 0 || deletions > 0) {
        setStatus('ok')
      } else {
        const aLen = mv.a.state.doc.length
        const bLen = mv.b.state.doc.length
        setStatus(aLen > 0 || bLen > 0 ? 'ok' : 'idle')
      }
    } catch {
      // chunks not ready yet
    }
  }

  useEffect(() => {
    if (!containerRef.current) return

    // Cleanup previous instance
    mergeViewRef.current?.destroy()
    containerRef.current.innerHTML = ''

    const oldDoc = loadPersisted(LS_KEY_OLD)
    const newDoc = loadPersisted(LS_KEY_NEW)

    const readFrom = (side: 'a' | 'b') =>
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          savePersisted(side === 'a' ? LS_KEY_OLD : LS_KEY_NEW, update.state.doc.toString())
          updateStats()
        }
      })

    const shared = baseExtensions(true)
    const aExts = [...shared, readFrom('a'), placeholder('Paste original text or drop a file')]
    const bExts = [...shared, readFrom('b'), placeholder('Paste changed text or drop a file')]

    const mv = new MergeView({
      a: { doc: oldDoc, extensions: aExts },
      b: { doc: newDoc, extensions: bExts },
      parent: containerRef.current,
      gutter: true,
      highlightChanges: true,
      collapseUnchanged: { margin: 3, minSize: 4 },
    })

    mergeViewRef.current = mv
    setTimeout(updateStats, 50)

    return () => {
      mv.destroy()
      mergeViewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Get current text from editors ───────────────────

  function getOldText(): string {
    return mergeViewRef.current?.a.state.doc.toString() ?? ''
  }
  function getNewText(): string {
    return mergeViewRef.current?.b.state.doc.toString() ?? ''
  }

  function setBothTexts(oldDoc: string, newDoc: string) {
    const mv = mergeViewRef.current
    if (!mv) return
    mv.a.dispatch({ changes: { from: 0, to: mv.a.state.doc.length, insert: oldDoc } })
    mv.b.dispatch({ changes: { from: 0, to: mv.b.state.doc.length, insert: newDoc } })
    savePersisted(LS_KEY_OLD, oldDoc)
    savePersisted(LS_KEY_NEW, newDoc)
    setTimeout(updateStats, 50)
  }

  // ── Input guard ─────────────────────────────────────

  const guardInputSize = useCallback(
    (text: string, existing: string): boolean => {
      if ((text.length + existing.length) > INPUT_LIMIT) {
        toast.push(`Input size limit is ${INPUT_LIMIT.toLocaleString()} characters`, {
          variant: 'error',
        })
        return false
      }
      return true
    },
    [toast],
  )

  // ── File handling ───────────────────────────────────

  const handleFileDrop = useCallback(
    (side: 'old' | 'new', file: File | null | undefined) => {
      if (!file) return
      readFileAsText(file)
        .then((text) => {
          const current = side === 'old' ? getOldText() : getNewText()
          if (!guardInputSize(text, current)) return
          if (side === 'old') {
            setBothTexts(text, getNewText())
          } else {
            setBothTexts(getOldText(), text)
          }
          toast.push(`Loaded ${file.name}`, { variant: 'success' })
        })
        .catch(() => toast.push(`Failed to read ${file.name}`, { variant: 'error' }))
    },
    [toast, guardInputSize],
  )

  // ── Actions ─────────────────────────────────────────

  function handleSwap() {
    const old = getOldText()
    const cur = getNewText()
    setBothTexts(cur, old)
    toast.push('Swapped inputs', { variant: 'info' })
  }

  function handleClear() {
    setBothTexts('', '')
    setStats({ additions: 0, deletions: 0, unchanged: 0 })
    setStatus('idle')
    if (patchUrlRef.current) {
      URL.revokeObjectURL(patchUrlRef.current)
      patchUrlRef.current = null
    }
    toast.push('Cleared', { variant: 'info' })
  }

  function handleLoadSample() {
    setBothTexts(DEFAULT_OLD, DEFAULT_NEW)
    toast.push('Loaded sample', { variant: 'success' })
  }

  async function handleCopyDiff() {
    const old = getOldText()
    const cur = getNewText()
    if (!old && !cur) return

    const { diffLines } = await import('diff')
    const changes = diffLines(old, cur)
    const text = changes
      .map((c: { added?: boolean; removed?: boolean; count?: number; value: string }) => {
        const prefix = c.added ? '+' : c.removed ? '-' : ' '
        return c.value
          .split('\n')
          .filter(Boolean)
          .map((line: string) => `${prefix} ${line}`)
          .join('\n')
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
    const old = getOldText()
    const cur = getNewText()
    const res = createPatch(old, cur)
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

  // ── Keyboard shortcuts ──────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const m = e.metaKey || e.ctrlKey
      if (m && e.shiftKey && e.key === 'c') { e.preventDefault(); handleCopyDiff(); return }
      if (m && e.key === 's') { e.preventDefault(); handleDownloadPatch(); return }
      if (m && e.shiftKey && e.key === 'w') { e.preventDefault(); handleSwap(); return }
      if (e.key === 'Escape' && (getOldText() || getNewText())) { e.preventDefault(); handleClear(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Status bar mapping ──────────────────────────────

  const statusBarStatus: 'idle' | 'ok' | 'error' | 'empty' | 'processing' =
    status === 'idle' && !getOldText() && !getNewText() ? 'empty' : status

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

          {/* Load sample */}
          <button
            onClick={handleLoadSample}
            className="flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 hover:text-honey-300 transition-colors"
          >
            <Sparkles className="h-3 w-3" /> Sample
          </button>

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
        </div>
      </div>

      {/* CodeMirror merge view */}
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 pb-3">
        <div
          ref={containerRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink-700 [&_.cm-mergeView]:flex-1 [&_.cm-editor]:h-full"
        />
      </div>

      {/* Status bar */}
      <StatusBar
        inputChars={getOldText().length + getNewText().length}
        outputChars={stats.additions + stats.deletions}
        status={statusBarStatus}
        error={status === 'error' ? errorMessage : null}
        durationMs={durationMs}
      />
    </div>
  )
}
