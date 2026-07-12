/**
 * ToolHeader — icon, name, description, optional swap button.
 */
import { ArrowLeftRight } from 'lucide-react'
import type { ConverterTool } from '../engine/registry'

interface ToolHeaderProps {
  tool: ConverterTool
  onSwap: () => void
}

export default function ToolHeader({ tool, onSwap }: ToolHeaderProps) {
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
