/**
 * App — root component.
 *
 * Shell manages all top-level UI state. ThemeEffect syncs the dark class on
 * <html>, and ToastContainer renders toast notifications from the Zustand store.
 */

import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { Moon, Sun } from 'lucide-react'

import { ThemeEffect, useTheme } from './stores/theme-store'
import { usePersistentState } from './hooks/usePersistentState'
import Sidebar from './components/Sidebar'
import MobileBar from './components/MobileBar'
import CommandPalette from './components/CommandPalette'
import ConversionTool from './components/ConversionTool'
import ToastContainer from './components/ToastContainer'
import type { ToolActions } from './components/ConversionTool'
import { TOOLS } from './engine/registry'
import type { ToolId } from './engine/registry'
import { toolIdFromLocation, pushTool, syncDocumentTitle } from './lib/router'

// Lazy import: PlaygroundTool only loads when user navigates to /code/
const PlaygroundTool = lazy(() => import('./playground/PlaygroundTool'))

function Shell() {
  const { theme, toggleTheme } = useTheme()

  // On first load, prefer the URL (deep link) over the persisted tool so a
  // direct visit to /json-to-csv opens that tool. Falls back to the last-used
  // tool, then the first tool.
  const [activeId, setActiveId] = useState<ToolId>(() => {
    const fromUrl = toolIdFromLocation()
    return fromUrl || TOOLS[0].id
  })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Selecting a tool from the UI: update state, push a URL entry, sync the tab title.
  const selectTool = (id: ToolId) => {
    setActiveId(id)
    pushTool(id)
    syncDocumentTitle(id)
  }

  // Keep the URL + tab title in sync whenever the active tool changes, and
  // handle browser back/forward.
  useEffect(() => {
    syncDocumentTitle(activeId)
    const onPop = () => {
      const fromUrl = toolIdFromLocation()
      if (fromUrl) setActiveId(fromUrl)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [activeId])

  // Global ⌘K to open the command palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- toolbar action up-lift binding ----------------------------------
  const [currentActions, setCurrentActions] = useState<ToolActions | null>(null)
  const registerActions = (actions: ToolActions) => setCurrentActions(actions)

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950 text-ink-100">
      <Sidebar
        activeId={activeId}
        onSelect={selectTool}
        onOpenPalette={() => setPaletteOpen(true)}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar
          onMenuClick={() => setSidebarOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        {/* Desktop top-right controls */}
        <div className="hidden items-center justify-between px-6 pt-3 md:flex">
          <div className="flex items-center gap-2 text-[11px] text-ink-500">
            <span>Press</span>
            <span className="kbd">⌘</span>
            <span className="kbd">K</span>
            <span>to search ·</span>
            <span className="kbd">⌘</span>
            <span className="kbd">S</span>
            <span>to download</span>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-800/50 px-2.5 py-1.5 text-xs font-500 text-ink-200 transition-colors hover:border-honey-500/50 hover:text-honey-200"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>

        {/* Workspace */}
        <main className="flex min-h-0 flex-1 flex-col p-4 md:p-6 md:pt-3">
          {activeId === 'playground' || activeId.startsWith('playground-') ? (
            <Suspense fallback={
              <div className="flex flex-1 items-center justify-center">
                <div className="text-sm text-ink-400">Loading playground…</div>
              </div>
            }>
              <PlaygroundTool
                initialLanguage={
                  activeId.startsWith('playground-')
                    ? (activeId.slice('playground-'.length) as 'javascript' | 'python' | 'html' | 'json')
                    : undefined
                }
              />
            </Suspense>
          ) : (
            <ConversionTool
              toolId={activeId}
              onSwap={selectTool}
              registerActions={registerActions}
            />
          )}
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={selectTool}
        activeId={activeId}
      />
    </div>
  )
}

export default function App() {
  return (
    <>
      <ThemeEffect />
      <Shell />
      <ToastContainer />
    </>
  )
}
