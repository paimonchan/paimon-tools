/**
 * OutputPane — terminal-style output display for the playground.
 *
 * Features:
 * - Max 500 lines (overflow trimmed with warning)
 * - Auto-scroll to bottom on new output
 * - Timestamped output lines
 */

import { useRef, useEffect } from 'react'
import { Terminal } from 'lucide-react'
import type { RunResult } from './engines/types'

interface OutputPaneProps {
  output: RunResult | null
}

const MAX_LINES = 500

export default function OutputPane({ output }: OutputPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [output])

  if (!output) {
    return (
      <div className="flex flex-1 flex-col rounded-lg border border-ink-800 bg-ink-900/50">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Terminal className="mx-auto mb-2 h-6 w-6 text-ink-600" />
            <p className="text-xs text-ink-500">
              Run some code to see results
            </p>
          </div>
        </div>
      </div>
    )
  }

  const lines: string[] = []
  if (output.stdout) lines.push(...output.stdout.split('\n'))
  if (output.stderr) lines.push(...output.stderr.split('\n'))
  if (output.result !== null) lines.push(`⇒ ${output.result}`)

  const truncated = lines.length > MAX_LINES
  const display = truncated ? lines.slice(-MAX_LINES) : lines

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-ink-800 bg-ink-900/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-3 w-3 text-ink-500" />
          <span className="text-[11px] text-ink-400">Output</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-ink-500">
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

        {output.error && (
          <div className="mb-2 rounded bg-red-500/10 px-2 py-1 text-red-400">
            {output.error}
          </div>
        )}

        {output.stdout && (
          <pre className="text-ink-100">{output.stdout}</pre>
        )}

        {output.stderr && (
          <pre className="text-orange-400">{output.stderr}</pre>
        )}

        {output.result !== null && !output.stdout && !output.stderr && (
          <pre className="text-honey-300">⇒ {output.result}</pre>
        )}

        {!output.stdout && !output.stderr && output.result === null && !output.error && (
          <div className="text-ink-500">(no output)</div>
        )}
      </div>
    </div>
  )
}
