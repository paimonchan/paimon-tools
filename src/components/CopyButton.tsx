import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface CopyButtonProps {
  value: string
  onCopied?: () => void
  bare?: boolean
  disabled?: boolean
}

/**
 * CopyButton — copies `value` to the clipboard and shows a transient check.
 * Renders as a bare "pane action" by default to fit the workspace chrome.
 */
export default function CopyButton({ value, onCopied, bare = false, disabled }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    onCopied?.()
    setTimeout(() => setCopied(false), 1400)
  }

  if (bare) {
    return (
      <button
        onClick={copy}
        disabled={disabled || !value}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-500 text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-50 disabled:opacity-40"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    )
  }

  return (
    <button
      onClick={copy}
      disabled={disabled || !value}
      className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-800/50 px-3 py-1.5 text-xs font-500 text-ink-200 transition-colors hover:border-honey-500/50 hover:text-honey-200 disabled:opacity-40"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
