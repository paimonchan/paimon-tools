/**
 * LenientToggle — switches JSON parser between strict and lenient (JSON5) mode.
 */
interface LenientToggleProps {
  value: boolean
  onChange: (value: boolean) => void
}

export default function LenientToggle({ value, onChange }: LenientToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/50 p-0.5">
      <button
        onClick={() => onChange(false)}
        title="Spec-compliant JSON.parse"
        className={`rounded-md px-2.5 py-1 text-[11px] font-500 transition-colors ${
          !value
            ? 'bg-honey-400/15 text-honey-200'
            : 'text-ink-400 hover:text-ink-200'
        }`}
      >
        Strict
      </button>
      <button
        onClick={() => onChange(true)}
        title="JSON5: single quotes, trailing commas, comments, unquoted keys"
        className={`rounded-md px-2.5 py-1 text-[11px] font-500 transition-colors ${
          value
            ? 'bg-honey-400/15 text-honey-200'
            : 'text-ink-400 hover:text-ink-200'
        }`}
      >
        Lenient
      </button>
    </div>
  )
}
