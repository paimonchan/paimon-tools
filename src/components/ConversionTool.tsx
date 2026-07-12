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

import { useEffect, useRef, useState } from 'react'
import { Download, Eraser, Sparkles } from 'lucide-react'

import CopyButton from './CopyButton'
import CodeArea from './CodeArea'
import EmptyState from './EmptyState'
import ErrorState from './ErrorState'
import FileDropzone from './FileDropzone'
import IndentPicker from './IndentPicker'
import LenientToggle from './LenientToggle'
import SuccessFileState from './SuccessFileState'
import StatusBar from './StatusBar'
import ToolHeader from './ToolHeader'
import { useResizableSplit, Pane, PaneAction, ResizeHandle } from './Panes'
import { useToast } from '../stores/toast-store'
import { usePersistentState } from '../hooks/usePersistentState'
import { TOOLS_BY_ID, type ToolDefinition, type ToolId } from '../engine/registry'
import { downloadArrayBuffer, downloadBlob } from '../lib/files'
import { makeFilename } from '../lib/makeFilename'
import type { Result } from '../engine/result'

// ── Types ─────────────────────────────────────────────

interface FileValue {
  value: ArrayBuffer | string
  name: string
}

type Status = 'empty' | 'error' | 'ok' | 'idle'

// Mirror the shape of the actions object exposed upward for header buttons.

/** Type representing the set of available toolbar actions exposed by the workspace. */
export interface ToolActions {
  copy: () => void
  download: () => void
  swap: () => void
  clear: () => void
  sample: () => void
  canCopy: boolean
  canDownload: boolean
  canSwap: boolean
  canSample: boolean
}

interface ConversionToolProps {
  toolId: ToolId
  onSwap: (id: ToolId) => void
  registerActions: (actions: ToolActions) => void
}

// ── MIME map ──────────────────────────────────────────

const MIME: Record<string, string> = {
  json: 'application/json',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

// ── Helpers ───────────────────────────────────────────

function deriveStatus(
  currentValue: unknown,
  result: Result<unknown> | null,
  error: string | null,
): Status {
  if (currentValue == null || currentValue === '') return 'empty'
  if (error) return 'error'
  if (result?.ok) return 'ok'
  return 'idle'
}

// ── Component ─────────────────────────────────────────

export default function ConversionTool({ toolId, onSwap, registerActions }: ConversionToolProps) {
  const tool: ToolDefinition = TOOLS_BY_ID[toolId]
  const toast = useToast()

  // ---- persisted state per tool -----------------------------------------
  const [storedInputs, setStoredInputs] = usePersistentState<Record<string, string>>('inputs', {})
  const [storedIndents, setStoredIndents] = usePersistentState<Record<string, number | 'tab'>>(
    'indents',
    {},
  )
  const [storedSplits, setStoredSplits] = usePersistentState<Record<string, number>>('splits', {})
  const [storedLenient, setStoredLenient] = usePersistentState<Record<string, boolean>>(
    'lenient',
    {},
  )

  const inputText = storedInputs[toolId] ?? ''
  const indent = storedIndents[toolId] ?? 2
  const splitRatio = storedSplits[toolId] ?? 0.5
  const lenient = storedLenient[toolId] ?? false

  const setInputText = (v: string) =>
    setStoredInputs((s: Record<string, string>) => ({ ...s, [toolId]: v }))
  const setIndent = (v: number | 'tab') =>
    setStoredIndents((s: Record<string, number | 'tab'>) => ({ ...s, [toolId]: v }))
  const setLenient = (v: boolean) =>
    setStoredLenient((s: Record<string, boolean>) => ({ ...s, [toolId]: v }))

  const { ratio, setRatio, onDragStart, containerRef } = useResizableSplit(splitRatio)
  useEffect(() => {
    setStoredSplits((s: Record<string, number>) => ({ ...s, [toolId]: ratio }))
  }, [ratio, toolId, setStoredSplits])

  // ---- file input state -------------------------------------------------
  const [fileValue, setFileValue] = useState<FileValue | null>(null)
  const [result, setResult] = useState<Result<unknown> | null>(null)
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const outputRef = useRef<HTMLDivElement | null>(null)

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
    const opts: Record<string, unknown> = {
      indent,
      lenient: tool.acceptsLenient ? lenient : false,
    }
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
  const error = ok === false ? (result as { ok: false; error: string }).error : null
  const outputText = ok && !isFileOutput ? String((result as { ok: true; value: unknown }).value) : ''
  const outputBlob = ok && isFileOutput ? (result as { ok: true; value: { arraybuffer: ArrayBuffer } }).value : null

  const status = deriveStatus(currentValue, result, error)

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
    setInputText(tool.sample ?? '')
    toast.push('Loaded sample data', { variant: 'success' })
  }

  function handleCopy() {
    if (!outputText) return
    toast.push('Copied to clipboard', { variant: 'success' })
  }

  function handleDownload() {
    const filename = makeFilename(tool, fileValue?.name)
    if (outputBlob) {
      const mime = MIME[tool.output.ext ?? 'xlsx'] ?? MIME.xlsx
      downloadArrayBuffer({
        arraybuffer: outputBlob.arraybuffer,
        filename,
        mime,
      })
    } else if (outputText) {
      const mime = MIME[tool.output.ext ?? 'txt'] ?? 'text/plain'
      downloadBlob({
        content: outputText,
        filename,
        mime,
      })
    }
    toast.push(`Downloaded ${filename}`, { variant: 'success' })
  }

  function handleSwap() {
    if (!tool.swap) return
    const partner = TOOLS_BY_ID[tool.swap]
    if (outputText && partner.input.type === 'text') {
      setStoredInputs((s: Record<string, string>) => ({ ...s, [tool.swap!]: outputText }))
    }
    onSwap(tool.swap as ToolId)
    toast.push(`Switched to ${partner.name}`, { variant: 'info' })
  }

  // ---- keyboard shortcuts ----------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 's' && !e.shiftKey) {
        e.preventDefault()
        handleDownload()
      } else if (key === 's' && e.shiftKey) {
        e.preventDefault()
        handleSwap()
      } else if (key === 'c' && e.shiftKey) {
        e.preventDefault()
        handleCopy()
      } else if (e.key === 'Backspace' && e.shiftKey) {
        e.preventDefault()
        handleClear()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Expose actions upward so the app-level header buttons can trigger them.
  useEffect(() => {
    registerActions({
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
      <ToolHeader tool={tool} onSwap={handleSwap} />

      {/* Options row */}
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

      {/* Split workspace */}
      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 flex-col gap-0 md:flex-row md:gap-0"
      >
        {/* Input pane */}
        <Pane
          ratio={ratio}
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
              accept={tool.input.accept ?? ''}
              readMode={tool.id.includes('excel') ? 'arraybuffer' : 'text'}
              onFile={setFileValue}
              currentName={fileValue?.name ?? undefined}
            />
          ) : (
            <CodeArea
              value={inputText}
              onChange={setInputText}
              placeholder={tool.input.placeholder}
            />
          )}
        </Pane>

        {/* Resize handle — desktop only */}
        <div className="hidden md:flex">
          <ResizeHandle onDragStart={onDragStart} onDoubleClick={() => setRatio(0.5)} />
        </div>

        {/* Output pane */}
        <Pane
          ratio={1 - ratio}
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
              <SuccessFileState
                filename={makeFilename(tool, fileValue?.name)}
                onDownload={handleDownload}
              />
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
