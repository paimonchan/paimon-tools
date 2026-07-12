/**
 * Panes — resizable split-pane layout components.
 *
 * useResizableSplit — hook that manages a draggable ratio between two panes.
 * Pane              — a titled container that fills its parent.
 * PaneAction        — a small icon+label button for a pane toolbar.
 * ResizeHandle      — the draggable separator between panes.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// ── useResizableSplit ─────────────────────────────────

export function useResizableSplit(initialRatio = 0.5) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [ratio, setRatio] = useState(initialRatio)
  const dragging = useRef(false)

  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    function move(clientX: number) {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      let r = (clientX - rect.left) / rect.width
      r = Math.min(0.8, Math.max(0.2, r))
      setRatio(r)
    }
    function onMouseMove(e: MouseEvent) {
      move(e.clientX)
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches[0]) move(e.touches[0].clientX)
    }
    function end() {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', end)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('touchend', end)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', end)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', end)
    }
  }, [])

  return { ratio, setRatio, onDragStart, containerRef }
}

// ── Pane ──────────────────────────────────────────────

interface PaneProps {
  ratio: number
  label: string
  actions?: ReactNode
  children: ReactNode
}

export function Pane({ ratio, label, actions, children }: PaneProps) {
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink-800 bg-ink-900/40 md:flex-initial"
      style={{ flexBasis: `${ratio * 100}%` }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-ink-800 bg-ink-900/60 px-3 py-1.5">
        <span className="text-[10px] font-600 uppercase tracking-[0.14em] text-ink-400">
          {label}
        </span>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}

// ── PaneAction ────────────────────────────────────────

interface PaneActionProps {
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}

export function PaneAction({ onClick, icon: Icon, label }: PaneActionProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-500 text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-50"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )
}

// ── ResizeHandle ──────────────────────────────────────

interface ResizeHandleProps {
  onDragStart: (e: React.MouseEvent | React.TouchEvent) => void
  onDoubleClick: () => void
}

export function ResizeHandle({ onDragStart, onDoubleClick }: ResizeHandleProps) {
  return (
    <div
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
      onDoubleClick={onDoubleClick}
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      className="group relative z-10 flex w-3 shrink-0 cursor-col-resize items-center justify-center"
      title="Drag to resize · double-click to reset"
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink-800 transition-colors group-hover:bg-honey-500/60" />
      <div className="relative flex h-8 w-1 flex-col items-center justify-center gap-0.5 rounded-full bg-ink-700 transition-colors group-hover:bg-honey-500">
        <span className="h-0.5 w-0.5 rounded-full bg-ink-950" />
        <span className="h-0.5 w-0.5 rounded-full bg-ink-950" />
      </div>
    </div>
  )
}
