/**
 * ToastContainer — renders the toast queue from the toast store.
 * Extracted from the old ToastContext provider so the store stays pure.
 */
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useToastStore, type ToastItem } from '../stores/toast-store'

const VARIANTS: Record<string, { icon: typeof CheckCircle2; ring: string; text: string; iconColor: string }> = {
  success: {
    icon: CheckCircle2,
    ring: 'border-emerald-500/40',
    text: 'text-emerald-300',
    iconColor: 'text-emerald-400',
  },
  error: {
    icon: AlertCircle,
    ring: 'border-red-500/40',
    text: 'text-red-300',
    iconColor: 'text-red-400',
  },
  info: {
    icon: Info,
    ring: 'border-ink-600',
    text: 'text-ink-200',
    iconColor: 'text-ink-300',
  },
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
      {toasts.map((t: ToastItem) => {
        const v = VARIANTS[t.variant] || VARIANTS.info
        const IconComponent = v.icon
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border ${v.ring} bg-ink-900/95 px-3.5 py-2.5 shadow-pop backdrop-blur animate-slide-up`}
          >
            <IconComponent className={`mt-0.5 h-4 w-4 shrink-0 ${v.iconColor}`} />
            <p className={`flex-1 text-sm leading-snug ${v.text}`}>{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-ink-500 transition-colors hover:text-ink-200"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
