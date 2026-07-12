/**
 * LangTabs — language selector for the playground.
 */

import type { ReactNode } from 'react'

export type Language = 'javascript' | 'json'

interface LangTabsProps {
  value: Language
  onChange: (lang: Language) => void
}

const TABS: { id: Language; label: string; desc: string }[] = [
  { id: 'javascript', label: 'JavaScript', desc: 'Run code via Web Worker' },
  { id: 'json', label: 'JSON', desc: 'Format & validate' },
]

export default function LangTabs({ value, onChange }: LangTabsProps) {
  return (
    <div className="mb-3 flex flex-wrap gap-1">
      {TABS.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`group relative rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
              active
                ? 'bg-honey-400/10 text-honey-200'
                : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'
            }`}
          >
            <div className="font-500">{tab.label}</div>
            <div className={`mt-0.5 ${active ? 'text-honey-300/60' : 'text-ink-500'}`}>
              {tab.desc}
            </div>
          </button>
        )
      })}
    </div>
  )
}
