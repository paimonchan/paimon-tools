/**
 * OutputPane — renders execution output, terminal-style.
 *
 * - Caps at 500 lines, truncates with a warning if exceeded
 * - Auto-scrolls to bottom on new output
 * - Toggles between Console and Preview tabs (when output is HTML)
 */

import { useState, useRef, useEffect } from 'react'
import { Terminal, Eye } from 'lucide-react'
import type { RunResult } from './engines/types'
import PreviewPane from './PreviewPane'

interface OutputPaneProps {
  output: RunResult | null
}

const MAX_LINES = 500

export default function OutputPane({ output }: OutputPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [previewMode, setPreviewMode] = useState(false)

  // Auto-scroll to bottom on new output (only when in console mode)
  useEffect(() => {
    if (scrollRef.current && !previewMode) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [output, previewMode])

  // Auto-switch: Console for non-HTML, Preview for HTML output
  useEffect(() => {
    if (output) {
      setPreviewMode(!!output.htmlPreview)
    }
  }, [output])

  const hasPreview = output?.htmlPreview && output.htmlPreview.length > 0

  if (!output) {
    return (
      <div className="flex flex-1 flex-col rounded-lg border border-ink-800 bg-ink-900/50">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Terminal className="mx-auto mb-2 h-6 w-6 text-ink-600" />
            <p className="text-xs text-ink-500">Run some code to see results</p>
          </div>
        </div>
      </div>
    )
  }

  // Render preview tab
  if (previewMode && hasPreview) {
    return (
      <div className="flex flex-1 flex-col rounded-lg border border-ink-800 bg-ink-900/50">
        {/* Tabs */}
        <div className="flex border-b border-ink-800">
          <button
            onClick={() => setPreviewMode(false)}
            className="flex items-center gap-1.5 border-r border-ink-800 px-3 py-1.5 text-[11px] text-ink-400 transition-colors hover:text-ink-200"
          >
            <Terminal className="h-3 w-3" />
            Console
          </button>
          <button className="flex items-center gap-1.5 bg-ink-800/50 px-3 py-1.5 text-[11px] text-honey-200">
            <Eye className="h-3 w-3" />
            Preview
          </button>
        </div>
        <PreviewPane html={output.htmlPreview!} />
      </div>
    )
  }

  // Console output
  const lines: string[] = []
  if (output.stdout) lines.push(...output.stdout.split('\n'))
  if (output.stderr) lines.push(...output.stderr.split('\n'))
  if (output.result !== null) lines.push(`⇒ ${output.result}`)

  const truncated = lines.length > MAX_LINES
  const display = truncated ? lines.slice(-MAX_LINES) : lines

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-ink-800 bg-ink-900/50">
      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-ink-800">
        <div className="flex">
          <button className="flex items-center gap-1.5 bg-ink-800/50 px-3 py-1.5 text-[11px] text-honey-200">
            <Terminal className="h-3 w-3" />
            Console
          </button>
          {hasPreview && (
            <button
              onClick={() => setPreviewMode(true)}
              className="flex items-center gap-1.5 border-l border-ink-800 px-3 py-1.5 text-[11px] text-ink-400 transition-colors hover:text-ink-200"
            >
              <Eye className="h-3 w-3" />
              Preview
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 pr-3 text-[10px] text-ink-500">
          {output.error && <span className="text-red-400">error</span>}
          <span>{output.durationMs.toFixed(0)}ms</span>
          <span>{lines.length} lines</span>
        </div>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed"
        style={{ maxHeight: '100%' }}
      >
        {truncated && (
          <div className="mb-2 rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-400">
            Output truncated to {MAX_LINES} lines ({lines.length} total)
          </div>
        )}

        {output.error && <div className="mb-2 rounded bg-red-500/10 px-2 py-1 text-red-400">{output.error}</div>}

        {output.stdout && <pre className="text-ink-100">{output.stdout}</pre>}

        {output.stderr && <pre className="text-orange-400">{output.stderr}</pre>}

        {output.result !== null && (
          <pre className="text-honey-300">⇒ {output.result}</pre>
        )}

        {!output.stdout && !output.stderr && output.result === null && !output.error && (
          <div className="text-ink-500">(no output)</div>
        )}
      </div>
    </div>
  )
}
