/**
 * PlaygroundTool — main component for the online code playground.
 *
 * Loaded lazily via React.lazy in App.tsx. Handles:
 * - Language tab switching (JavaScript, JSON)
 * - CodeMirror 6 progressive enhancement (textarea → CM on first run)
 * - Web Worker execution for JavaScript
 * - Inline validation for JSON
 * - Output display with stdout/stderr capture
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePersistentState } from '../hooks/usePersistentState'
import { useToast } from '../stores/toast-store'
import { WorkerEngine } from './engines/worker-engine'
import type { CodeEngine, RunResult } from './engines/types'
import LangTabs from './LangTabs'
import ActionBar from './ActionBar'
import OutputPane from './OutputPane'
import CodeArea from '../components/CodeArea'
import StatusBar from '../components/StatusBar'
import type { Language } from './LangTabs'

// Lazy-loaded CodeMirror wrapper — only imports on first Run or entry
const CodeMirrorWrapper = React.lazy(() => import('./CodeMirrorWrapper'))

import React from 'react'

export default function PlaygroundTool() {
  const toast = useToast()
  const engineRef = useRef<CodeEngine>(new WorkerEngine())
  const [language, setLanguage] = useState<Language>('javascript')
  const [code, setCode] = usePersistentState('playground.js', '// Write some JavaScript\nconsole.log("Hello, Paimon!");\n')
  const [jsonCode, setJsonCode] = usePersistentState('playground.json', '{\n  "name": "Paimon",\n  "role": "Guide"\n}')
  const [output, setOutput] = useState<RunResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [cmReady, setCmReady] = useState(false)
  const statusRef = useRef<string>('idle')

  // Load CodeMirror in background after mount (progressive enhancement)
  useEffect(() => {
    import('./CodeMirrorWrapper').then(() => setCmReady(true))
  }, [])

  const inputCode = language === 'javascript' ? code : jsonCode
  const setInputCode = useCallback(
    (v: string) => {
      if (language === 'javascript') setCode(v)
      else setJsonCode(v)
    },
    [language, setCode, setJsonCode],
  )

  // Auto-validate JSON on change
  useEffect(() => {
    if (language !== 'json' || !inputCode) return
    try {
      JSON.parse(inputCode)
      setOutput({
        stdout: '✅ Valid JSON',
        stderr: '',
        error: null,
        result: null,
        durationMs: 0,
      })
    } catch (err) {
      setOutput({
        stdout: '',
        stderr: '',
        error: `Invalid JSON: ${err instanceof Error ? err.message : 'Syntax error'}`,
        result: null,
        durationMs: 0,
      })
    }
  }, [inputCode, language])

  // Also run on ⌘⏎
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'Enter') {
        e.preventDefault()
        handleRun()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function handleRun() {
    if (isRunning) return
    if (language === 'json') {
      // Re-validate
      try {
        const parsed = JSON.parse(inputCode)
        const formatted = JSON.stringify(parsed, null, 2)
        setOutput({
          stdout: formatted,
          stderr: '',
          error: null,
          result: 'Valid JSON',
          durationMs: 0,
        })
      } catch (err) {
        setOutput({
          stdout: '',
          stderr: '',
          error: `Invalid JSON: ${err instanceof Error ? err.message : 'Syntax error'}`,
          result: null,
          durationMs: 0,
        })
      }
      return
    }

    setIsRunning(true)
    statusRef.current = 'running'

    try {
      const engine = engineRef.current
      const result = await engine.run(inputCode)
      setOutput(result)
    } catch (err) {
      setOutput({
        stdout: '',
        stderr: '',
        error: String(err),
        result: null,
        durationMs: 0,
      })
    } finally {
      setIsRunning(false)
      statusRef.current = 'idle'
    }
  }

  function handleClear() {
    setOutput(null)
    toast.push('Output cleared', { variant: 'info' })
  }

  function handleCopy() {
    const text = output?.stdout || output?.result || ''
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        toast.push('Copied to clipboard', { variant: 'success' })
      })
    }
  }

  function handleFormat() {
    if (language !== 'json') return
    try {
      const parsed = JSON.parse(inputCode)
      // Also set in the formatter: update input to formatted version
      setInputCode(JSON.stringify(parsed, null, 2))
      toast.push('Formatted JSON', { variant: 'success' })
    } catch {
      toast.push('Cannot format — invalid JSON', { variant: 'error' })
    }
  }

  const status: 'empty' | 'ok' | 'error' | 'idle' = output?.error ? 'error' : output ? 'ok' : 'empty'

  return (
    <div className="flex h-full flex-col">
      {/* Language tabs */}
      <LangTabs value={language} onChange={setLanguage} />

      {/* Editor + Output split */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        {/* Editor pane */}
        <div className="flex min-h-[12rem] flex-1 flex-col rounded-lg border border-ink-800 bg-ink-900/50">
          <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5">
            <div className="text-[11px] font-500 text-ink-400">
              {language === 'javascript' ? 'JavaScript' : 'JSON'}
            </div>
            {language === 'json' && (
              <button
                onClick={handleFormat}
                className="rounded px-2 py-0.5 text-[10px] text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200"
              >
                Format
              </button>
            )}
          </div>
          <div className="flex-1">
            {cmReady ? (
              <React.Suspense fallback={<CodeArea value={inputCode} onChange={setInputCode} />}>
                <CodeMirrorWrapper
                  value={inputCode}
                  onChange={setInputCode}
                  language={language}
                />
              </React.Suspense>
            ) : (
              <CodeArea value={inputCode} onChange={setInputCode} placeholder={language === 'javascript' ? '// Write JavaScript' : 'Paste JSON here'} />
            )}
          </div>
        </div>

        {/* Output pane */}
        <div className="flex flex-1 flex-col">
          <OutputPane output={output} />
        </div>
      </div>

      {/* Action bar */}
      <ActionBar
        onRun={handleRun}
        onClear={handleClear}
        onCopy={handleCopy}
        isRunning={isRunning}
        hasOutput={!!output}
        language={language}
      />

      {/* Status bar */}
      <StatusBar
        inputChars={inputCode.length}
        outputChars={output?.stdout?.length ?? 0}
        status={status}
        error={output?.error ?? null}
        durationMs={output?.durationMs ?? null}
      />
    </div>
  )
}
