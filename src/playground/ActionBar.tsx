/**
 * ActionBar — Run, Clear, Copy, and Share actions for the playground.
 */

import { Play, Eraser, Copy, Share2 } from 'lucide-react'

interface ActionBarProps {
  onRun: () => void
  onClear: () => void
  onCopy: () => void
  onShare: () => void
  isRunning: boolean
  hasOutput: boolean
  language: string
}

export default function ActionBar({ onRun, onClear, onCopy, onShare, isRunning, hasOutput, language }: ActionBarProps) {
  const isJson = language === 'json'

  return (
    <div className="flex items-center gap-2 border-t border-ink-800 px-1 py-2">
      <button
        onClick={onRun}
        disabled={isRunning}
        className="flex items-center gap-1.5 rounded-lg bg-honey-500 px-3 py-1.5 text-xs font-500 text-ink-950 transition-colors hover:bg-honey-400 disabled:opacity-50"
      >
        {isRunning ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ink-950 border-t-transparent" />
        ) : (
          <Play className="h-3 w-3" />
        )}
        {isJson ? 'Validate' : isRunning ? 'Running…' : 'Run'}
        <span className="ml-1 text-[10px] opacity-60">{isJson ? '' : '⌘⏎'}</span>
      </button>

      <button
        onClick={onClear}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200"
      >
        <Eraser className="h-3 w-3" />
        Clear
      </button>

      <button
        onClick={onShare}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200"
      >
        <Share2 className="h-3 w-3" />
        Share
      </button>

      {hasOutput && (
        <button
          onClick={onCopy}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200"
        >
          <Copy className="h-3 w-3" />
          Copy
        </button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Help text */}
      <div className="hidden text-[10px] text-ink-500 md:block">
        {isJson ? 'Auto-validates on change' : 'Console output appears below'}
      </div>
    </div>
  )
}
