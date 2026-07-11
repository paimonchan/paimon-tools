import { Cpu, Lock } from 'lucide-react'

/**
 * StatusBar — a thin footer bar under the workspace that surfaces live stats
 * (input size, output size, char count, status) plus the persistent privacy
 * indicator. Inspired by editor status bars (VS Code, Vim).
 */
export default function StatusBar({
  inputChars,
  outputChars,
  status, // 'idle' | 'ok' | 'error' | 'empty'
  error,
  durationMs,
}) {
  const statusMeta = {
    idle: { label: 'Ready', dot: 'bg-ink-500', text: 'text-ink-400' },
    empty: { label: 'Awaiting input', dot: 'bg-ink-600', text: 'text-ink-500' },
    ok: { label: 'Converted', dot: 'bg-emerald-500', text: 'text-emerald-400' },
    error: { label: 'Error', dot: 'bg-red-500', text: 'text-red-400' },
  }[status] || { label: 'Ready', dot: 'bg-ink-500', text: 'text-ink-400' }

  return (
    <footer className="flex items-center justify-between gap-4 border-t border-ink-800 bg-ink-900/60 px-4 py-1.5 text-[11px] text-ink-400">
      {/* Left: status */}
      <div className="flex items-center gap-3">
        <span className={`flex items-center gap-1.5 ${statusMeta.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
          {statusMeta.label}
        </span>
        {status === 'error' && error && (
          <span className="hidden truncate text-red-400/80 sm:inline" title={error}>
            {error}
          </span>
        )}
      </div>

      {/* Right: stats + privacy */}
      <div className="flex items-center gap-3 font-mono">
        {status === 'ok' && durationMs != null && (
          <span className="hidden text-ink-500 sm:inline">{durationMs.toFixed(1)}ms</span>
        )}
        <span>
          in <span className="text-ink-200">{formatCount(inputChars)}</span>
        </span>
        <span className="text-ink-600">·</span>
        <span>
          out <span className="text-ink-200">{formatCount(outputChars)}</span>
        </span>
        <span className="hidden items-center gap-1 text-emerald-500/70 sm:flex">
          <Lock className="h-3 w-3" />
          on-device
        </span>
        <span className="flex items-center gap-1 text-ink-500">
          <Cpu className="h-3 w-3" />
          wasm-free
        </span>
      </div>
    </footer>
  )
}

function formatCount(n) {
  if (n == null) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}
