/**
 * DiffTool — compare two texts side-by-side or unified using CodeMirror 6.
 *
 * Lazy-loaded ref tool. Uses @codemirror/merge for inline diff rendering:
 * input and output are the same view — no separate output area.
 *
 * Supports:
 * - Editable side-by-side or unified view with real-time diff highlighting
 * - Drag & drop files to auto-fill panes
 * - Word-level change detection (via the diff library)
 * - Download .patch, copy diff, swap, clear, sample
 * - Keyboard shortcuts, persistent localStorage
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  Copy,
  Download,
  GitCompare,
} from 'lucide-react'

// CodeMirror 6
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { MergeView, unifiedMergeView } from '@codemirror/merge'

import { createPatch } from '../engine/converters/diff-engine'
import { readFileAsText } from '../lib/files'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'

// ── Constants ─────────────────────────────────────────

const LS_KEY_OLD = 'diff-old'
const LS_KEY_NEW = 'diff-new'

const FILE_ACCEPT =
  '.txt,.csv,.json,.yaml,.yml,.js,.ts,.jsx,.tsx,.py,.html,.css,.md,.xml,.log,.env,.ini,.cfg'

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

// ── Shared theme ───────────────────────────────────────

function editorTheme() {
  return EditorView.theme({
    '&': { backgroundColor: 'transparent !important', height: '100%' },
    '.cm-scroller': { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '13px' },
    '.cm-content': { padding: '8px 4px', caretColor: '#e7ac34' },
    '.cm-gutters': { backgroundColor: '#1d1a16', borderRight: '1px solid #2e2a24', color: '#5f574d' },
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
  })
}

function baseExtensions(editable = true) {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.editable.of(editable),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    editorTheme(),
  ]
}

// ── Types ─────────────────────────────────────────────

type Status = 'idle' | 'ok' | 'error' | 'processing'

// ── Component ─────────────────────────────────────────

export default function DiffTool() {
  const toast = useToast()

  // Refs for CodeMirror instance
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<MergeView | EditorView | null>(null)

  // Persistent text (syncs with CodeMirror via update listeners)
  const oldTextRef = useRef(loadPersisted(LS_KEY_OLD))
  const newTextRef = useRef(loadPersisted(LS_KEY_NEW))

  // Transient state
  const [stats, setStats] = useState({ additions: 0, deletions: 0 })
  const [status, setStatus] = useState<Status>('idle')
  const [diffView, setDiffView] = useState<'side-by-side' | 'unified'>('side-by-side')
  const [dragging, setDragging] = useState<'old' | 'new' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFileSide, setPendingFileSide] = useState<'old' | 'new' | null>(null)
  const patchUrlRef = useRef<string | null>(null)

  // ── Stats helper ──────────────────────────────────

  function computeStats() {
    const oldText = oldTextRef.current
    const newText = newTextRef.current
    if (!oldText && !newText) {
      setStats({ additions: 0, deletions: 0 })
      setStatus('idle')
      return
    }
    // Simple line diff for stats
    const oldLines = oldText.split('\n')
    const newLines = newText.split('\n')
    // Use a simple heuristic: number of lines different
    const maxLen = Math.max(oldLines.length, newLines.length)
    let additions = 0
    let deletions = 0
    for (let i = 0; i < maxLen; i++) {
      if (i >= oldLines.length) additions++
      else if (i >= newLines.length) deletions++
      else if (oldLines[i] !== newLines[i]) {
        additions++
        deletions++
      }
    }
    setStats({ additions, deletions })
    setStatus(additions > 0 || deletions > 0 ? 'ok' : 'ok')
  }

  // ── Build / rebuild editor ────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    // Store current text before destroying
    const oldDoc = oldTextRef.current
    const newDoc = newTextRef.current

    // Cleanup previous instance
    if (editorRef.current) {
      if ('destroy' in editorRef.current) {
        editorRef.current.destroy()
      }
      editorRef.current = null
    }
    containerRef.current.innerHTML = ''

    const makeReadFrom = (side: 'a' | 'b') =>
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const text = update.state.doc.toString()
          if (side === 'a') {
            oldTextRef.current = text
            savePersisted(LS_KEY_OLD, text)
          } else {
            newTextRef.current = text
            savePersisted(LS_KEY_NEW, text)
          }
          computeStats()
        }
      })

    if (diffView === 'side-by-side') {
      const shared = baseExtensions(true)
      const mv = new MergeView({
        a: { doc: oldDoc, extensions: [...shared, makeReadFrom('a'), placeholder('Paste original text or drop a file')] },
        b: { doc: newDoc, extensions: [...shared, makeReadFrom('b'), placeholder('Paste changed text or drop a file')] },
        parent: containerRef.current,
        gutter: false,
        highlightChanges: true,
        collapseUnchanged: { margin: 3, minSize: 4 },
      })
      editorRef.current = mv as unknown as EditorView
    } else {
      // Unified view — editor shows changed text with original as reference
      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          newTextRef.current = update.state.doc.toString()
          savePersisted(LS_KEY_NEW, newTextRef.current)
          computeStats()
        }
      })
      const view = new EditorView({
        doc: newDoc,
        extensions: [
          ...baseExtensions(true),
          updateListener,
          placeholder('Paste changed text or drop a file'),
          unifiedMergeView({
            original: oldDoc,
          }),
        ],
        parent: containerRef.current,
      })
      editorRef.current = view

      // For unified mode, we need to keep oldTextRef in sync
      // old text is read-only in unified mode, set from the last known value
      oldTextRef.current = oldDoc
    }

    // Give MergeView a tick to compute chunks
    setTimeout(computeStats, 50)

    return () => {
      if (editorRef.current) {
        if ('destroy' in editorRef.current) {
          editorRef.current.destroy()
        }
        editorRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffView])

  // ── Get current text helpers ──────────────────────

  function getOldText(): string { return oldTextRef.current }
  function getNewText(): string { return newTextRef.current }

  function setBothTexts(oldDoc: string, newDoc: string) {
    oldTextRef.current = oldDoc
    newTextRef.current = newDoc
    savePersisted(LS_KEY_OLD, oldDoc)
    savePersisted(LS_KEY_NEW, newDoc)
    // Rebuild editor with new content
    setDiffView((v) => {
      // Trigger rebuild by toggling to same view
      // Actually, we need to force a re-render of the editor
      // Use a different approach — dispatch changes to existing editors
      return v
    })
    // If we're in side-by-side mode, dispatch directly to editors
    const mv = editorRef.current as unknown as MergeView | null
    if (mv && 'a' in mv && 'b' in mv) {
      try {
        ;(mv as any).a.dispatch({ changes: { from: 0, to: (mv as any).a.state.doc.length, insert: oldDoc } })
        ;(mv as any).b.dispatch({ changes: { from: 0, to: (mv as any).b.state.doc.length, insert: newDoc } })
      } catch {
        // Editors might be in unified mode or not ready
      }
    } else if (editorRef.current && 'dispatch' in editorRef.current) {
      // Unified mode — only new text is editable
      try {
        ;(editorRef.current as EditorView).dispatch({
          changes: { from: 0, to: (editorRef.current as EditorView).state.doc.length, insert: newDoc },
        })
      } catch {
        // ignore
      }
    }
    setTimeout(computeStats, 50)
  }

  // ── File handling ───────────────────────────────────

  const handleFileDrop = useCallback(
    (side: 'old' | 'new', file: File | null | undefined) => {
      if (!file) return
      readFileAsText(file)
        .then((text) => {
          if (side === 'old') {
            setBothTexts(text, getNewText())
          } else {
            setBothTexts(getOldText(), text)
          }
          toast.push(`Loaded ${file.name}`, { variant: 'success' })
        })
        .catch(() => toast.push(`Failed to read ${file.name}`, { variant: 'error' }))
    },
    [toast],
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
    setStats({ additions: 0, deletions: 0 })
    setStatus('idle')
    if (patchUrlRef.current) {
      URL.revokeObjectURL(patchUrlRef.current)
      patchUrlRef.current = null
    }
    toast.push('Cleared', { variant: 'info' })
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

  // ── Drop zone handlers ─────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault() }, [])

  const handleDrop = useCallback(
    (side: 'old' | 'new') =>
      (e: React.DragEvent) => {
        e.preventDefault()
        setDragging(null)
        handleFileDrop(side, e.dataTransfer.files?.[0])
      },
    [handleFileDrop],
  )

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

      {/* Drop zone wrapping the code mirror container */}
      <div
        className={`flex min-h-0 flex-1 flex-col px-3 pt-3 pb-3 ${
          dragging ? '' : ''
        }`}
      >
        {/* Old text drop zone */}
        <div
          className="flex-1 flex"
          onDragOver={handleDragOver}
          onDragEnter={() => setDragging('old')}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(null)
          }}
          onDrop={handleDrop('old')}
        >
          {/* CodeMirror container — fills available space */}
          <div
            ref={containerRef}
            className={`flex-1 overflow-hidden rounded-lg border flex flex-col ${
              dragging === 'old'
                ? 'border-honey-500/60 bg-honey-500/5'
                : dragging === 'new'
                  ? 'border-honey-500/60 bg-honey-500/5'
                  : 'border-ink-700'
            } [&_.cm-mergeView]:flex-1 [&_.cm-mergeView]:min-h-0 [&_.cm-mergeView]:flex [&_.cm-mergeView]:flex-col [&_.cm-mergeViewEditors]:flex-1 [&_.cm-mergeViewEditors]:min-h-0 [&_.cm-mergeViewEditor]:flex [&_.cm-mergeViewEditor]:flex-col [&_.cm-editor]:flex-1`}
            onDragOver={handleDragOver}
            onDragEnter={() => setDragging(diffView === 'side-by-side' ? 'old' : 'new')}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(null)
            }}
            onDrop={handleDrop(diffView === 'side-by-side' ? 'old' : 'new')}
          />
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        inputChars={getOldText().length + getNewText().length}
        outputChars={stats.additions + stats.deletions}
        status={statusBarStatus}
        error={null}
        durationMs={null}
      />
    </div>
  )
}