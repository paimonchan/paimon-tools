import { useEffect, useState } from 'react'

/**
 * usePersistentState — useState that mirrors its value to localStorage.
 *
 * Used to survive reloads: the user's active tool, input text, theme, etc.
 * Everything stays local; nothing is ever transmitted.
 */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const namespaced = `paimon.${key}`
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.localStorage.getItem(namespaced)
      if (raw == null) return initial
      return JSON.parse(raw) as T
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(namespaced, JSON.stringify(value))
    } catch {
      // Quota exceeded or storage disabled — silently degrade to in-memory.
    }
  }, [namespaced, value])

  return [value, setValue]
}
