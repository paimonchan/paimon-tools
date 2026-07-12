/**
 * Sidebar — brand, command-palette trigger, grouped tool list, and the
 * privacy assurance. On mobile this is a slide-over driven by `open`/`onClose`.
 *
 * The "command palette" button doubles as a shortcut hint and is the primary
 * way power users navigate.
 */

import { Command, ShieldCheck } from 'lucide-react'
import BrandMark from './BrandMark'
import { TOOLS_BY_CATEGORY, type ToolId } from '../engine/registry'
import { ICON_MAP } from '../lib/icon-map'

interface SidebarProps {
  activeId: ToolId
  onSelect: (id: ToolId) => void
  onOpenPalette: () => void
  open: boolean
  onClose: () => void
}

export default function Sidebar({ activeId, onSelect, onOpenPalette, open, onClose }: SidebarProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={onClose}
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-800 bg-ink-900',
          'transition-transform duration-200 ease-out',
          'md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Brand row */}
        <div className="flex items-center gap-3 px-4 py-4">
          <BrandMark size={34} />
          <div className="leading-tight">
            <div className="font-display text-[15px] font-700 text-ink-50">
              Paimon<span className="text-honey-400"> Tools</span>
            </div>
            <div className="text-[11px] text-ink-400">privacy-first browser tools</div>
          </div>
        </div>

        {/* Command trigger */}
        <div className="px-3 pb-3">
          <button
            onClick={onOpenPalette}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-800/60 px-3 py-2 text-left text-sm text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100"
          >
            <Command className="h-3.5 w-3.5 text-ink-400" />
            <span className="flex-1">Search tools&hellip;</span>
            <span className="flex items-center gap-1">
              <span className="kbd">⌘</span>
              <span className="kbd">K</span>
            </span>
          </button>
        </div>

        {/* Tool list */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-2">
          {TOOLS_BY_CATEGORY.map(({ category, tools }) => (
            <div key={category}>
              <div className="px-3 pb-1.5 text-[10px] font-600 uppercase tracking-[0.14em] text-ink-500">
                {category}
              </div>
              <ul className="space-y-0.5">
                {tools.map((tool) => {
                  const Icon = ICON_MAP[tool.icon]
                  const active = tool.id === activeId || (tool.id === 'playground' && activeId.startsWith('playground-'))
                  return (
                    <li key={tool.id}>
                      <button
                        onClick={() => {
                          onSelect(tool.id)
                          onClose?.()
                        }}
                        className={`group relative flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition-colors duration-100 ${
                          active
                            ? 'bg-honey-400/10 font-500 text-honey-200'
                            : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50'
                        }`}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-honey-400" />
                        )}
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                            active
                              ? 'text-honey-300'
                              : 'text-ink-500 group-hover:text-ink-300'
                          }`}
                        />
                        <span className="truncate">{tool.name}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Privacy assurance */}
        <div className="border-t border-ink-800 p-3">
          <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] text-ink-400">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500/80" />
            <span>
              <span className="font-500 text-ink-300">100% local</span> — nothing leaves your browser
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
