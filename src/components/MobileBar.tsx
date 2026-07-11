/**
 * MobileBar — top bar shown only on small screens. Holds the menu trigger,
 * brand, command trigger, and theme toggle. Kept dense (h-12) to maximize
 * working space on mobile.
 */

import { Command, Menu, Moon, Sun } from 'lucide-react'
import { useTheme } from '../stores/theme-store'
import BrandMark from './BrandMark'

interface MobileBarProps {
  onMenuClick: () => void
  onOpenPalette: () => void
}

export default function MobileBar({ onMenuClick, onOpenPalette }: MobileBarProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-ink-800 bg-ink-900/90 px-3 backdrop-blur md:hidden">
      <button
        onClick={onMenuClick}
        className="flex h-8 w-8 items-center justify-center rounded-md text-ink-300 hover:bg-ink-800 hover:text-ink-50"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2">
        <BrandMark size={24} />
        <span className="font-display text-[13px] font-700 text-ink-50">
          Paimon<span className="text-honey-400"> Tools</span>
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onOpenPalette}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-300 hover:bg-ink-800 hover:text-ink-50"
          aria-label="Search tools"
        >
          <Command className="h-4 w-4" />
        </button>
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-300 hover:bg-ink-800 hover:text-ink-50"
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  )
}
