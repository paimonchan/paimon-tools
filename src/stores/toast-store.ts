/**
 * toast-store.ts — Zustand store for ephemeral toast notifications.
 *
 * Exposes:
 *   toasts   — the active list (max 3)
 *   push     — add a toast, auto-dismiss after `duration` ms
 *   dismiss  — remove a toast by id
 *
 * Rendering is handled by <ToastContainer /> (see components/).
 */
import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────

export interface ToastItem {
  id: number
  message: string
  variant: 'success' | 'error' | 'info'
  duration: number
}

interface ToastOpts {
  variant?: 'success' | 'error' | 'info'
  duration?: number
}

interface ToastState {
  toasts: ToastItem[]
  push: (message: string, opts?: ToastOpts) => number
  dismiss: (id: number) => void
}

// ── Store ─────────────────────────────────────────────

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (message, opts = {}) => {
    const id = Date.now() + Math.random()
    const toast: ToastItem = {
      id,
      message,
      variant: opts.variant || 'info',
      duration: opts.duration ?? 2600,
    }
    set((s) => ({ toasts: [...s.toasts, toast].slice(-3) }))
    if (toast.duration > 0) {
      setTimeout(() => {
        const stillThere = get().toasts.find((t) => t.id === id)
        if (stillThere) get().dismiss(id)
      }, toast.duration)
    }
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Convenience alias for store consumers that just need push/dismiss. */
export const useToast = () => useToastStore()
