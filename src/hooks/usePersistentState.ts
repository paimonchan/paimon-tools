import { useEffect, useState } from 'react'

/**
 * usePersistentState — useState that mirrors its value to localStorage.
 *
 * Used to survive reloads: the user's active tool, input text, theme, etc.
 * Everything stays local; nothing is ever transmitted.
 *
 * @template T
 * @param {string} key        storage key (namespaced under the app automatically)
 * @param {T}      initial    fallback when nothing is stored / on parse error
 * @returns {[T, (v: T | ((prev: T) => T)) => void]}
 */
export function usePersistentState(key, initial) {
  const namespaced = `paimon.${key}`
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.localStorage.getItem(namespaced)
      if (raw == null) return initial
      return JSON.parse(raw)
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
