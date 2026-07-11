import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * useResizableSplit — manages a draggable split ratio between two panes.
 *
 * Returns:
 *   ratio    number 0.2–0.8 (fraction of width for the LEFT pane)
 *   onDragStart  attach to the handle's onMouseDown / onTouchStart
 *   containerRef attach to the row that holds both panes
 *
 * The split ratio is exposed so the caller can persist it.
 */
export function useResizableSplit(initialRatio = 0.5) {
  const containerRef = useRef(null)
  const [ratio, setRatio] = useState(initialRatio)
  const dragging = useRef(false)

  const onDragStart = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    function move(clientX) {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      let r = (clientX - rect.left) / rect.width
      r = Math.min(0.8, Math.max(0.2, r))
      setRatio(r)
    }
    function onMouseMove(e) { move(e.clientX) }
    function onTouchMove(e) { if (e.touches[0]) move(e.touches[0].clientX) }
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
