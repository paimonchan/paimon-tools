import { createContext, useContext, useEffect } from 'react'
import { usePersistentState } from '../hooks/usePersistentState'

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} })

/**
 * Provides dark/light theme. Defaults to dark (the app's natural aesthetic)
 * and persists the choice. No network, no analytics.
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = usePersistentState('theme', 'dark')

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
