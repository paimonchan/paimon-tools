// @ts-nocheck — will be fully decomposed and typed in Phase 2
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  Download,
  Eraser,
  FileCheck2,
  Sparkles,
} from 'lucide-react'

import CopyButton from './CopyButton'
import FileDropzone from './FileDropzone'
import StatusBar from './StatusBar'
import { useResizableSplit } from './Panes'
import { useToast } from '../context/ToastContext'
import { usePersistentState } from '../hooks/usePersistentState'
import { TOOLS_BY_ID } from '../engine/registry'
import { downloadArrayBuffer } from '../lib/files'

const MIME = {
  json: 'application/json',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/**
 * ConversionTool — the workspace powering every tool in the registry.
 *
 * UX in depth:
 *  - Resizable split panes (drag the center handle), persisted per tool
 *  - Live conversion with debounce on typing; instant on file drop
 *  - Per-tool persisted input + indent option (survives reload)
 *  - "Load sample" affordance so users can try a tool instantly
 *  - Keyboard shortcuts: ⌘S download, ⌘⇧C copy, ⌘⇧S swap, ⌘Backspace clear
 *  - Status bar: live char counts, conversion time, on-device indicator
 *  - Inline error + success states with art-directed empty state
 *
 * The component stays dumb about WHAT it converts; that lives in the registry.
 */
export default function ConversionTool({ toolId, onSwap, registerActions }) {
  const tool = TOOLS_BY_ID[toolId]
  const toast = useToast()

  // ---- persisted state per tool -----------------------------------------
  // We key storage by tool id so switching tools remembers each one's work.
  const [storedInputs, setStoredInputs] = usePersistentState('inputs', {})
  const [storedIndents, setStoredIndents] = usePersistentState('indents', {})
  const [storedSplits, setStoredSplits] = usePersistentState('splits', {})
  const [storedLenient, setStoredLenient] = usePersistentState('lenient', {})

  const inputText = storedInputs[toolId] ?? ''
  const indent = storedIndents[toolId] ?? 2
  const splitRatio = storedSplits[toolId] ?? 0.5
  const lenient = storedLenient[toolId] ?? false

  const setInputText = (v) => setStoredInputs((s) => ({ ...s, [toolId]: v }))
  const setIndent = (v) => setStoredIndents((s) => ({ ...s, [toolId]: v }))
  const setLenient = (v) => setStoredLenient((s) => ({ ...s, [toolId]: v }))

  const { ratio, setRatio, onDragStart, containerRef } = useResizableSplit(splitRatio)
  useEffect(() => {
    setStoredSplits((s) => ({ ...s, [toolId]: ratio }))
  }, [ratio, toolId, setStoredSplits])

  // ---- file input state -------------------------------------------------
  const [fileValue, setFileValue] = useState(null) // { value, name } | null
  const [result, setResult] = useState(null)
  const [durationMs, setDurationMs] = useState(null)
  const outputRef = useRef(null)

  const isFileInput = tool.input.type === 'file'
  const isFileOutput = tool.output.type === 'file'

  // Reset transient state when the tool changes.
  useEffect(() => {
    setFileValue(null)
    setResult(null)
    setDurationMs(null)
  }, [toolId])

  // ---- the conversion ---------------------------------------------------
  const currentValue = isFileInput ? fileValue?.value : inputText

  useEffect(() => {
    if (currentValue == null || currentValue === '') {
      setResult(null)
      setDurationMs(null)
      return
    }
    const opts = { indent, lenient: tool.acceptsLenient ? lenient : false }
    // Files convert immediately; text debounces.
    if (isFileInput) {
      const t0 = performance.now()
      setResult(tool.convert(currentValue, opts))
      setDurationMs(performance.now() - t0)
      return
    }
    const handle = setTimeout(() => {
      const t0 = performance.now()
      setResult(tool.convert(currentValue, opts))
      setDurationMs(performance.now() - t0)
    }, 200)
    return () => clearTimeout(handle)
  }, [currentValue, tool, indent, lenient, isFileInput])

  const ok = result?.ok
  const error = ok === false ? result.error : null
  const outputText = ok && !isFileOutput ? result.value : ''
  const outputBlob = ok && isFileOutput ? result.value : null

  const status = !currentValue || currentValue === '' ? 'empty'
    : error ? 'error'
    : ok ? 'ok'
    : 'idle'

  // ---- actions ----------------------------------------------------------
  function handleClear() {
    setInputText('')
    setFileValue(null)
    setResult(null)
    toast.push('Cleared', { variant: 'info' })
  }

  function handleLoadSample() {
    if (isFileInput) {
      toast.push('Samples are unavailable for file inputs', { variant: 'info' })
      return
    }
    setInputText(tool.sample)
    toast.push('Loaded sample data', { variant: 'success' })
  }

  function handleCopy() {
    if (!outputText) return
    toast.push('Copied to clipboard', { variant: 'success' })
  }

  function handleDownload() {
    const filename = makeFilename(tool, fileValue?.name)
    if (outputBlob) {
      downloadArrayBuffer({ arraybuffer: outputBlob.arraybuffer, filename, mime: MIME.xlsx })
    }
    toast.push(`Downloaded ${filename}`, { variant: 'success' })
  }

  function handleSwap() {
    if (!tool.swap) return
    const partner = TOOLS_BY_ID[tool.swap]
    if (outputText && partner.input.type === 'text') {
      setStoredInputs((s) => ({ ...s, [tool.swap]: outputText }))
    }
    onSwap(tool.swap)
    toast.push(`Switched to ${partner.name}`, { variant: 'info' })
  }

  // ---- keyboard shortcuts ----------------------------------------------
  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 's' && !e.shiftKey) { e.preventDefault(); handleDownload() }
      else if (key === 's' && e.shiftKey) { e.preventDefault(); handleSwap() }
      else if (key === 'c' && e.shiftKey) { e.preventDefault(); handleCopy() }
      else if (e.key === 'Backspace' && e.shiftKey) { e.preventDefault(); handleClear() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Expose actions upward so the app-level header buttons can trigger them.
  useEffect(() => {
    registerActions?.({
      copy: handleCopy,
      download: handleDownload,
      swap: handleSwap,
      clear: handleClear,
      sample: handleLoadSample,
      canCopy: !!outputText,
      canDownload: !!(outputBlob || outputText),
      canSwap: !!tool.swap,
      canSample: !isFileInput && !!tool.sample,
    })
  }, [outputText, outputBlob, tool, isFileInput, registerActions])

  // ---- render -----------------------------------------------------------
  return (
    <div className="flex h-full flex-col">
      {/* Tool header */}
      <ToolHeader tool={tool} onSwap={handleSwap} />

      {/* Options row — shown when the tool has indent or lenient options */}
      {(tool.hasOptions || tool.acceptsLenient) && (
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          {tool.hasOptions && (
            <div className="flex items-center gap-2">
              <span className="text-ink-400">Indentation</span>
              <IndentPicker value={indent} onChange={setIndent} />
            </div>
          )}
          {tool.acceptsLenient && (
            <div className="flex items-center gap-2">
              <span className="text-ink-400">Parsing</span>
              <LenientToggle value={lenient} onChange={setLenient} />
            </div>
          )}
        </div>
      )}

      {/* Split workspace — stacks vertically on mobile, side-by-side on md+ */}
      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col gap-0 md:flex-row md:gap-0">
        {/* Input pane */}
        <Pane
          ratio={ratio}
          side="left"
          label={tool.input.label}
          actions={
            <>
              {!isFileInput && tool.sample && (
                <PaneAction onClick={handleLoadSample} icon={Sparkles} label="Sample" />
              )}
              {(inputText || fileValue) && (
                <PaneAction onClick={handleClear} icon={Eraser} label="Clear" />
              )}
            </>
          }
        >
          {isFileInput ? (
            <FileDropzone
              accept={tool.input.accept}
              readMode={tool.id.includes('excel') ? 'arraybuffer' : 'text'}
              onFile={setFileValue}
              currentName={fileValue?.name}
            />
          ) : (
            <CodeArea
              value={inputText}
              onChange={setInputText}
              placeholder={tool.input.placeholder}
            />
          )}
        </Pane>

        {/* Resize handle — desktop only (horizontal split). Hidden on mobile where panes stack vertically. */}
        <div className="hidden md:flex">
          <ResizeHandle onDragStart={onDragStart} onDoubleClick={() => setRatio(0.5)} />
        </div>

        {/* Output pane */}
        <Pane
          ratio={1 - ratio}
          side="right"
          label={tool.output.label}
          actions={
            <>
              {outputText && <CopyButton value={outputText} onCopied={handleCopy} bare />}
              {(outputBlob || outputText) && (
                <PaneAction onClick={handleDownload} icon={Download} label="Save" />
              )}
            </>
          }
        >
          {error ? (
            <ErrorState message={error} />
          ) : ok ? (
            isFileOutput ? (
              <SuccessFileState filename={makeFilename(tool, fileValue?.name)} onDownload={handleDownload} />
            ) : (
              <CodeArea value={outputText} readOnly />
            )
          ) : (
            <EmptyState isFileInput={isFileInput} />
          )}
        </Pane>
      </div>

      {/* Status bar */}
      <StatusBar
        inputChars={(isFileInput ? '' : inputText).length}
        outputChars={outputText.length}
        status={status}
        error={error}
        durationMs={durationMs}
      />
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Sub-components                                                         */
/* --------------------------------------------------------------------- */

function ToolHeader({ tool, onSwap }) {
  const Icon = tool.icon
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-700 bg-ink-800/60">
          <Icon className="h-4 w-4 text-honey-300" />
        </div>
        <div>
          <h1 className="font-display text-lg font-600 text-ink-50">{tool.name}</h1>
          <p className="mt-0.5 max-w-2xl text-[13px] text-ink-400">{tool.description}</p>
        </div>
      </div>
      {tool.swap && (
        <button
          onClick={onSwap}
          className="group flex shrink-0 items-center gap-2 rounded-lg border border-ink-700 bg-ink-800/50 px-3 py-1.5 text-xs font-500 text-ink-200 transition-colors hover:border-honey-500/50 hover:text-honey-200"
          title="Swap direction (⌘⇧S)"
        >
          <ArrowLeftRight className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
          <span className="hidden sm:inline">Swap</span>
          <span className="kbd hidden sm:inline">⌘⇧S</span>
        </button>
      )}
    </div>
  )
}

function Pane({ ratio, side, label, actions, children }) {
  return (
    <div
      // Mobile: flex-1 makes stacked panes share height evenly (flexBasis ignored in column
      // direction because we set it via the grow/shrink, not basis). Desktop: flexBasis sets the
      // horizontal split ratio from the resize handle.
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink-800 bg-ink-900/40 md:flex-initial"
      style={{ flexBasis: `${ratio * 100}%` }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-ink-800 bg-ink-900/60 px-3 py-1.5">
        <span className="text-[10px] font-600 uppercase tracking-[0.14em] text-ink-400">{label}</span>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}

function PaneAction({ onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-500 text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-50"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )
}

function ResizeHandle({ onDragStart, onDoubleClick }) {
  return (
    <div
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
      onDoubleClick={onDoubleClick}
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      className="group relative z-10 flex w-3 shrink-0 cursor-col-resize items-center justify-center"
      title="Drag to resize · double-click to reset"
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink-800 transition-colors group-hover:bg-honey-500/60" />
      <div className="relative flex h-8 w-1 flex-col items-center justify-center gap-0.5 rounded-full bg-ink-700 transition-colors group-hover:bg-honey-500">
        <span className="h-0.5 w-0.5 rounded-full bg-ink-950" />
        <span className="h-0.5 w-0.5 rounded-full bg-ink-950" />
      </div>
    </div>
  )
}

function CodeArea({ value, onChange, placeholder, readOnly }) {
  return (
    <textarea
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      readOnly={readOnly}
      spellCheck={false}
      className="h-full min-h-[20rem] w-full resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-100 outline-none placeholder:text-ink-600"
    />
  )
}

function EmptyState({ isFileInput }) {
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-2 bg-dotgrid px-6 text-center">
      <div className="text-sm text-ink-400">
        {isFileInput ? 'Drop a file to begin' : 'Paste or type to begin'}
      </div>
      <div className="text-xs text-ink-600">Output appears here in real time</div>
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
        <AlertCircle className="h-5 w-5 text-red-400" />
      </div>
      <div className="text-sm font-500 text-red-300">Could not convert</div>
      <code className="max-w-md rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 font-mono text-xs text-red-300/90">
        {message}
      </code>
    </div>
  )
}

function SuccessFileState({ filename, onDownload }) {
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
        <FileCheck2 className="h-6 w-6 text-emerald-400" />
      </div>
      <div className="text-sm font-500 text-emerald-300">Workbook ready</div>
      <code className="font-mono text-xs text-emerald-400/80">{filename}</code>
      <button
        onClick={onDownload}
        className="mt-1 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-500 text-emerald-200 transition-colors hover:bg-emerald-500/20"
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </button>
    </div>
  )
}

function IndentPicker({ value, onChange }) {
  const opts = [
    { v: 2, label: '2 spaces' },
    { v: 4, label: '4 spaces' },
    { v: 'tab', label: 'Tab' },
  ]
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/50 p-0.5">
      {opts.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          className={[
            'rounded-md px-2.5 py-1 text-[11px] font-500 transition-colors',
            value === o.v ? 'bg-honey-400/15 text-honey-200' : 'text-ink-400 hover:text-ink-200',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * LenientToggle — switches the JSON parser between strict (spec) and lenient
 * (JSON5: single quotes, trailing commas, comments, unquoted keys). Lenient
 * is opt-in so validation stays strict by default.
 */
function LenientToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/50 p-0.5">
      <button
        onClick={() => onChange(false)}
        title="Spec-compliant JSON.parse"
        className={[
          'rounded-md px-2.5 py-1 text-[11px] font-500 transition-colors',
          !value ? 'bg-honey-400/15 text-honey-200' : 'text-ink-400 hover:text-ink-200',
        ].join(' ')}
      >
        Strict
      </button>
      <button
        onClick={() => onChange(true)}
        title="JSON5: single quotes, trailing commas, comments, unquoted keys"
        className={[
          'rounded-md px-2.5 py-1 text-[11px] font-500 transition-colors',
          value ? 'bg-honey-400/15 text-honey-200' : 'text-ink-400 hover:text-ink-200',
        ].join(' ')}
      >
        Lenient
      </button>
    </div>
  )
}

function makeFilename(tool, sourceName) {
  const base = (sourceName || 'converted').replace(/\.[^.]+$/, '') || 'converted'
  const ext = tool.output.ext || (tool.output.type === 'file' ? 'xlsx' : 'txt')
  return `${base}.${ext}`
}
