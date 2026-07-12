/**
 * CodeArea — a monospaced textarea for code/text input/output.
 */
import { type ChangeEvent } from 'react'

interface CodeAreaProps {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  readOnly?: boolean
}

export default function CodeArea({ value, onChange, placeholder, readOnly }: CodeAreaProps) {
  return (
    <textarea
      value={value}
      onChange={onChange ? (e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      readOnly={readOnly}
      spellCheck={false}
      className="h-full min-h-[20rem] w-full resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-100 outline-none placeholder:text-ink-600"
    />
  )
}
