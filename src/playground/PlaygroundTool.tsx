/**
 * PlaygroundTool — main component for the online code playground.
 *
 * Loaded lazily via React.lazy in App.tsx. Handles:
 * - Language tab switching (JavaScript, JSON, HTML, Python)
 * - CodeMirror 6 eager-imported (PlaygroundTool sendiri udah lazy-loaded dari App.tsx)
 * - Web Worker execution for JavaScript
 * - Inline validation for JSON
 * - HTML iframe preview for HTML/CSS/JS
 * - Pyodide WASM for Python (lazy ~12 MB load on first Run)
 * - Output display with stdout/stderr capture
 * - URL-based code sharing via lz-string
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePersistentState } from '../hooks/usePersistentState'
import { useToast } from '../stores/toast-store'
import { WorkerEngine } from './engines/worker-engine'
import { HtmlEngine } from './engines/html-engine'
import { PyodideEngine } from './engines/pyodide-engine'
import type { CodeEngine, RunResult } from './engines/types'
import LangTabs from './LangTabs'
import ActionBar from './ActionBar'
import OutputPane from './OutputPane'
import CodeMirrorWrapper from './CodeMirrorWrapper'
import StatusBar from '../components/StatusBar'
import type { Language } from './LangTabs'
import { buildShareHash, readShareHash, pushShareHash, clearShareHash, detectLanguage } from './lib/share'

// ── Template code per language ──────────────────────────────────────

const TEMPLATES: Record<Language, string> = {
  javascript: '// Write some JavaScript\nconsole.log("Hello, Paimon!");\n',
  json: '{\n  "name": "Paimon",\n  "role": "Guide"\n}',
  html: '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body {\n      font-family: system-ui;\n      display: flex;\n      justify-content: center;\n      align-items: center;\n      min-height: 100vh;\n      margin: 0;\n      background: #1a1a2e;\n      color: #eee;\n    }\n    h1 { color: #e94560; }\n  </style>\n</head>\n<body>\n  <h1>Hello, Paimon! 🎨</h1>\n  <p>Edit me and click Run</p>\n  <script>\n    document.querySelector(\'h1\').addEventListener(\'click\', () => {\n      alert(\'Hello from Paimon Tools!\');\n    });\n  </script>\n</body>\n</html>',
  python: '# Write some Python\nprint("Hello, Paimon!")\n\n# Math\nimport math\nprint(f"Pi = {math.pi:.4f}")\n\n# List comprehension\nsquares = [x**2 for x in range(10)]\nprint(f"Squares: {squares}")',
}

// ── Engine factory ──────────────────────────────────────────────────

function createEngine(language: Language): CodeEngine {
  switch (language) {
    case 'javascript': return new WorkerEngine()
    case 'html':       return new HtmlEngine()
    case 'python':     return new PyodideEngine()
    default:           return new WorkerEngine()
  }
}

// ── Component ───────────────────────────────────────────────────────

export default function PlaygroundTool() {
  const toast = useToast()
  const enginesRef = useRef<Map<Language, CodeEngine>>(new Map())
  const engineRef = useRef<CodeEngine>(new WorkerEngine())
  const [language, setLanguage] = useState<Language>('javascript')
  const [isPythonLoading, setIsPythonLoading] = useState(false)

  // Per-language code state
  const [jsCode, setJsCode] = usePersistentState('playground.js', TEMPLATES.javascript)
  const [jsonCode, setJsonCode] = usePersistentState('playground.json', TEMPLATES.json)
  const [htmlCode, setHtmlCode] = usePersistentState('playground.html', TEMPLATES.html)
  const [pythonCode, setPythonCode] = usePersistentState('playground.python', TEMPLATES.python)

  const [output, setOutput] = useState<RunResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const statusRef = useRef<string>('idle')

  // ── Load shared code from URL hash on mount ──────────────────────

  useEffect(() => {
    const shared = readShareHash()
    if (shared) {
      const lang = detectLanguage(shared)
      switch (lang) {
        case 'html': setHtmlCode(shared); break
        case 'python': setPythonCode(shared); break
        case 'json': setJsonCode(shared); break
        default: setJsCode(shared); break
      }
      setLanguage(lang)
      clearShareHash()
      toast.push('Shared code loaded from URL', { variant: 'info' })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup all engines on unmount
  useEffect(() => {
    return () => {
      enginesRef.current.forEach(engine => engine.dispose())
      enginesRef.current.clear()
    }
  }, [])

  // ── Current code based on language ───────────────────────────────

  const getCode = useCallback((lang: Language): string => {
    switch (lang) {
      case 'javascript': return jsCode
      case 'json':       return jsonCode
      case 'html':       return htmlCode
      case 'python':     return pythonCode
    }
  }, [jsCode, jsonCode, htmlCode, pythonCode])

  const setCode = useCallback((lang: Language, value: string) => {
    switch (lang) {
      case 'javascript': setJsCode(value); break
      case 'json':       setJsonCode(value); break
      case 'html':       setHtmlCode(value); break
      case 'python':     setPythonCode(value); break
    }
  }, [setJsCode, setJsonCode, setHtmlCode, setPythonCode])

  const inputCode = getCode(language)
  const setInputCode = useCallback(
    (v: string) => setCode(language, v),
    [language, setCode],
  )

  // ── Switch language → swap engine ────────────────────────────────

  const handleLanguageChange = useCallback((lang: Language) => {
    if (lang === language) return
    // Cache current engine before switching
    enginesRef.current.set(language, engineRef.current)
    // Get or create engine for target language
    let engine = enginesRef.current.get(lang)
    if (!engine) {
      engine = createEngine(lang)
      enginesRef.current.set(lang, engine)
    }
    engineRef.current = engine
    setLanguage(lang)
    setOutput(null)
    statusRef.current = 'idle'
  }, [language])

  // Register initial engine in cache
  enginesRef.current.set('javascript', engineRef.current)

  // ── Auto-validate JSON on change ─────────────────────────────────

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

  // ── Run ──────────────────────────────────────────────────────────

  const handleRun = useCallback(async () => {
    if (isRunning) return

    if (language === 'json') {
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

    // Python — show loading state for first-run WASM download
    if (language === 'python') {
      const engine = engineRef.current as unknown as PyodideEngine
      if (!engine.ready && !engine.loading) {
        setIsPythonLoading(true)
        toast.push('Loading Python engine (~12 MB, first time only)', { variant: 'info' })
        try {
          await engine.load()
        } catch (err) {
          setOutput({
            stdout: '',
            stderr: '',
            error: `Failed to load Python: ${String(err)}`,
            result: null,
            durationMs: 0,
          })
          setIsPythonLoading(false)
          return
        }
        setIsPythonLoading(false)
      }
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
  }, [isRunning, language, inputCode, toast])

  // ── Keyboard shortcut ⌘⏎ ─────────────────────────────────────────

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
  }, [handleRun])

  // ── Clear ────────────────────────────────────────────────────────

  function handleClear() {
    setOutput(null)
    toast.push('Output cleared', { variant: 'info' })
  }

  // ── Copy ─────────────────────────────────────────────────────────

  function handleCopy() {
    const parts: string[] = []
    if (output?.stdout) parts.push(output.stdout)
    if (output?.stderr) parts.push(output.stderr)
    if (output?.result) parts.push(`⇒ ${output.result}`)
    const text = parts.join('\n')
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        toast.push('Copied to clipboard', { variant: 'success' })
      })
    }
  }

  // ── Share ────────────────────────────────────────────────────────

  function handleShare() {
    const hash = buildShareHash(inputCode)
    const url = `${window.location.origin}${window.location.pathname}${hash}`
    navigator.clipboard.writeText(url).then(() => {
      pushShareHash(inputCode)
      toast.push('Share link copied to clipboard!', { variant: 'success' })
    }).catch(() => {
      // Fallback: just update URL
      pushShareHash(inputCode)
      toast.push('URL updated in address bar', { variant: 'info' })
    })
  }

  // ── Format JSON ──────────────────────────────────────────────────

  function handleFormat() {
    if (language !== 'json') return
    try {
      const parsed = JSON.parse(inputCode)
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
      <LangTabs value={language} onChange={handleLanguageChange} />

      {/* Editor + Output split */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        {/* Editor pane */}
        <div className="flex min-h-[12rem] flex-1 flex-col rounded-lg border border-ink-800 bg-ink-900/50">
          <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5">
            <div className="text-[11px] font-500 text-ink-400">
              {language === 'javascript' ? 'JavaScript' : language === 'json' ? 'JSON' : language === 'html' ? 'HTML' : 'Python'}
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
              <CodeMirrorWrapper
                value={inputCode}
                onChange={setInputCode}
                language={language}
              />
          </div>
        </div>

        {/* Output pane */}
        <div className="flex flex-1 flex-col">
          {isPythonLoading ? (
            <div className="flex flex-1 flex-col rounded-lg border border-ink-800 bg-ink-900/50">
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-honey-400 border-t-transparent" />
                  <p className="text-xs text-honey-300/80">Loading Python engine (~12 MB)</p>
                  <p className="mt-1 text-[10px] text-ink-500">First-time download — cached after this</p>
                </div>
              </div>
            </div>
          ) : (
            <OutputPane output={output} />
          )}
        </div>
      </div>

      {/* Action bar */}
      <ActionBar
        onRun={handleRun}
        onClear={handleClear}
        onCopy={handleCopy}
        onShare={handleShare}
        isRunning={isRunning || isPythonLoading}
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
