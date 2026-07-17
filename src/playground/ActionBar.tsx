/**
 * ActionBar — Run, Stop, Clear, Copy, and Share actions for the playground.
 */

import { Play, Square, Eraser, Copy, Share2 } from 'lucide-react'
import type { Language } from './LangTabs'

interface ActionBarProps {
  onRun: () => void
  onStop: () => void
  onClear: () => void
  onCopy: () => void
  onShare: () => void
  isRunning: boolean
  hasOutput: boolean
  language: Language
}

export default function ActionBar({ onRun, onStop, onClear, onCopy, onShare, isRunning, hasOutput, language }: ActionBarProps) {
  const isJson = language === 'json'

  return (
    <div className="flex items-center gap-2 border-t border-ink-800 px-1 py-2">
      <button
        onClick={isRunning ? onStop : onRun}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-500 transition-colors ${
          isRunning
            ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
            : 'bg-honey-500 text-ink-950 hover:bg-honey-400'
        }`}
      >
        {isRunning ? (
          <>
            <Square className="h-3 w-3 fill-current" />
            Stop
          </>
        ) : (
          <>
            <Play className="h-3 w-3" />
            {isJson ? 'Validate' : 'Run'}
            <span className="ml-1 text-[10px] opacity-60">{isJson ? '' : '⌘⏎'}</span>
          </>
        )}
      </button>

      <button
        onClick={onClear}
        disabled={isRunning}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200 disabled:opacity-40"
      >
        <Eraser className="h-3 w-3" />
        Clear
      </button>

      <button
        onClick={onShare}
        disabled={isRunning}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200 disabled:opacity-40"
      >
        <Share2 className="h-3 w-3" />
        Share
      </button>

      {hasOutput && !isRunning && (
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
        {isJson
          ? 'Auto-validates on change'
          : isRunning
            ? '⌘⏎ to stop'
            : 'Console output appears below'}
      </div>
    </div>
  )
}
