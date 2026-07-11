import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

const ToastContext = createContext({ push: () => {} })

const VARIANTS = {
  success: { icon: CheckCircle2, ring: 'border-emerald-500/40', text: 'text-emerald-300', iconColor: 'text-emerald-400' },
  error: { icon: AlertCircle, ring: 'border-red-500/40', text: 'text-red-300', iconColor: 'text-red-400' },
  info: { icon: Info, ring: 'border-ink-600', text: 'text-ink-200', iconColor: 'text-ink-300' },
}

/**
 * ToastContext — a tiny ephemeral notification system. Self-dismissing,
 * stackable (capped at 3 visible), accessible. Lives in a portal-ish fixed
 * container at the bottom-right.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback((message, opts = {}) => {
    const id = ++idRef.current
    const toast = { id, message, variant: opts.variant || 'info', duration: opts.duration ?? 2600 }
    setToasts((prev) => [...prev, toast].slice(-3))
    if (toast.duration > 0) {
      setTimeout(() => dismiss(id), toast.duration)
    }
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map((t) => {
          const v = VARIANTS[t.variant] || VARIANTS.info
          const Icon = v.icon
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border ${v.ring} bg-ink-900/95 px-3.5 py-2.5 shadow-pop backdrop-blur animate-slide-up`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${v.iconColor}`} />
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
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
