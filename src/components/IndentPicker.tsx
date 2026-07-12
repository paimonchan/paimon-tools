/**
 * IndentPicker — toggle between 2-space, 4-space, and tab indentation.
 */
interface IndentPickerProps {
  value: number | 'tab'
  onChange: (value: number | 'tab') => void
}

const OPTIONS: { v: number | 'tab'; label: string }[] = [
  { v: 2, label: '2 spaces' },
  { v: 4, label: '4 spaces' },
  { v: 'tab', label: 'Tab' },
]

export default function IndentPicker({ value, onChange }: IndentPickerProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/50 p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-500 transition-colors ${
            value === o.v ? 'bg-honey-400/15 text-honey-200' : 'text-ink-400 hover:text-ink-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
