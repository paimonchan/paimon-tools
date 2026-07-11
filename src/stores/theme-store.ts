/**
 * theme-store.ts — Zustand store for dark/light theme.
 * Persisted to localStorage via the `persist` middleware.
 * The actual DOM class toggling is handled by ThemeEffect (see below).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useEffect } from 'react'

export type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'paimon.theme' }
  )
)

/**
 * ThemeEffect — syncs the `dark` class on <html> whenever the theme changes.
 * Mount once at the app root.
 */
export function ThemeEffect() {
  const theme = useThemeStore((s) => s.theme)
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return null
}

/** Convenience alias for store consumers that just need push/dismiss. */
export const useTheme = () => useThemeStore()
