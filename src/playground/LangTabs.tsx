/**
 * LangTabs — language selector for the playground.
 */

export type Language = 'javascript' | 'json' | 'html' | 'python'

interface LangTabsProps {
  value: Language
  onChange: (lang: Language) => void
}

const TABS: { id: Language; label: string; desc: string }[] = [
  { id: 'javascript', label: 'JavaScript', desc: 'Run code via Web Worker' },
  { id: 'json', label: 'JSON', desc: 'Format & validate' },
  { id: 'html', label: 'HTML', desc: 'Live preview in iframe' },
  { id: 'python', label: 'Python', desc: 'Pyodide WASM (~12 MB)' },
]

export default function LangTabs({ value, onChange }: LangTabsProps) {
  return (
    <div className="mb-3 flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`group relative shrink-0 rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
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
