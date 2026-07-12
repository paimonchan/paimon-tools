/**
 * CommandPalette — ⌘K tool switcher with keyboard-first navigation.
 *
 * Keys:
 *   ↑ / ↓     move selection
 *   Enter     run selected tool
 *   Esc       close
 *
 * Filtering is a lightweight subsequence + keyword match (no deps). Results
 * keep category groupings so the list reads naturally.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CornerDownLeft, Search } from 'lucide-react'
import { TOOLS, CATEGORIES, type ToolDefinition, type ToolId } from '../engine/registry'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onSelect: (id: ToolId) => void
  activeId: ToolId
}

export default function CommandPalette({ open, onClose, onSelect, activeId }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Reset query + selection whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const results = useMemo(() => filterTools(query), [query])

  // Clamp the active index into the valid range whenever results change.
  useEffect(() => {
    setActive((i) => (results.length === 0 ? 0 : Math.min(i, results.length - 1)))
  }, [results])

  useEffect(() => {
    if (!open) return
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (results.length === 0) return
        setActive((i) => (i + 1) % results.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (results.length === 0) return
        setActive((i) => (i - 1 + results.length) % results.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const tool = results[active]
        if (tool) {
          onSelect(tool.id)
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, active, onClose, onSelect])

  // Keep active row in view during keyboard nav
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-pop animate-scale-in">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-ink-800 px-4">
          <Search className="h-4 w-4 text-ink-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="Search tools…"
            className="flex-1 bg-transparent py-3.5 text-sm text-ink-100 placeholder:text-ink-500"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="kbd">Esc</span>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[min(50vh,22rem)] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-500">
              No tools match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            group(results).map(({ category, tools }) => (
              <div key={category} className="mb-1">
                <div className="px-3 py-1.5 text-[10px] font-600 uppercase tracking-[0.14em] text-ink-500">
                  {category}
                </div>
                {tools.map((tool) => {
                  const idx = results.indexOf(tool)
                  const Icon = tool.icon
                  const isSelected = idx === active
                  const isActiveTool = tool.id === activeId
                  return (
                    <button
                      key={tool.id}
                      data-idx={idx}
                      onMouseMove={() => setActive(idx)}
                      onClick={() => {
                        onSelect(tool.id)
                        onClose()
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        isSelected
                          ? 'bg-honey-400/10 text-honey-100'
                          : 'text-ink-200 hover:bg-ink-800'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isSelected ? 'text-honey-300' : 'text-ink-400'
                        }`}
                      />
                      <span className="flex-1">
                        <span className="font-500">{tool.name}</span>
                        <span className="ml-2 text-xs text-ink-500">{tool.description}</span>
                      </span>
                      {isActiveTool && (
                        <span className="text-[10px] uppercase tracking-wide text-ink-500">
                          current
                        </span>
                      )}
                      {isSelected && <CornerDownLeft className="h-3.5 w-3.5 text-ink-500" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-ink-800 px-4 py-2 text-[11px] text-ink-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span> navigate
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd">↵</span> select
            </span>
          </div>
          <span className="flex items-center gap-1 text-emerald-500/70">100% local</span>
        </div>
      </div>
    </div>
  )
}

/** Subsequence + keyword match, scored so the best match floats up. */
function filterTools(query: string): ToolDefinition[] {
  const q = query.trim().toLowerCase()
  if (!q) return TOOLS
  const scored: { t: ToolDefinition; score: number }[] = []
  for (const t of TOOLS) {
    const hay = `${t.name} ${t.category} ${(t.keywords || []).join(' ')}`.toLowerCase()
    let score = 0
    if (t.name.toLowerCase().startsWith(q)) score += 100
    if (t.name.toLowerCase().includes(q)) score += 40
    if (hay.includes(q)) score += 20
    if (isSubsequence(q, t.name.toLowerCase())) score += 10
    if (score > 0) scored.push({ t, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.t)
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0
  for (const ch of hay) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return false
}

function group(tools: ToolDefinition[]): { category: string; tools: ToolDefinition[] }[] {
  const order = [...CATEGORIES]
  return order
    .map((category) => ({ category, tools: tools.filter((t) => t.category === category) }))
    .filter((g) => g.tools.length > 0)
}
