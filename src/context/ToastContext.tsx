import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

// ── Types ─────────────────────────────────────────────

interface ToastOpts {
  variant?: 'success' | 'error' | 'info'
  duration?: number
}

interface ToastItem {
  id: number
  message: string
  variant: 'success' | 'error' | 'info'
  duration: number
}

interface ToastContextValue {
  push: (message: string, opts?: ToastOpts) => number
}

const VARIANTS: Record<string, { icon: typeof CheckCircle2; ring: string; text: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: 'border-emerald-500/40', text: 'text-emerald-300', iconColor: 'text-emerald-400' },
  error: { icon: AlertCircle, ring: 'border-red-500/40', text: 'text-red-300', iconColor: 'text-red-400' },
  info: { icon: Info, ring: 'border-ink-600', text: 'text-ink-200', iconColor: 'text-ink-300' },
}

const ToastContext = createContext<ToastContextValue>({
  push: () => 0,
})

export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}

// ── Provider ──────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback(
    (message: string, opts: ToastOpts = {}) => {
      const id = ++idRef.current
      const toast: ToastItem = {
        id,
        message,
        variant: opts.variant || 'info',
        duration: opts.duration ?? 2600,
      }
      setToasts((prev) => [...prev, toast].slice(-3))
      if (toast.duration > 0) {
        setTimeout(() => dismiss(id), toast.duration)
      }
      return id
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map((t) => {
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
    </ToastContext.Provider>
  )
}
