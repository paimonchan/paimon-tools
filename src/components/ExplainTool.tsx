/**
 * ExplainTool — PostgreSQL Plan Explorer.
 *
 * Lazy-loaded ref tool. Parses EXPLAIN output and renders an interactive
 * D3.js tree visualization with pan/zoom, color-coded nodes, and bottleneck
 * detection.
 *
 * Features:
 * - Paste EXPLAIN output → auto-parse → interactive tree
 * - Drag & drop .plan files
 * - Share via URL hash (lz-string compression)
 * - Download SVG / Copy as text
 * - Sample plan for quick try
 * - Keyboard shortcuts
 * - Persistent input via localStorage
 * - Legend panel with node type references
 * - Click node → detail panel (persistent, not just hover)
 * - Collapsible subtrees (click to expand/collapse)
 * - Original plan text displayed as reference
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Copy, Download, Share2, Eraser, Sparkles, GitBranch, ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react'
import * as d3Hierarchy from 'd3-hierarchy'
import * as d3Selection from 'd3-selection'
import * as d3Zoom from 'd3-zoom'
import type { HierarchyNode } from 'd3-hierarchy'

import { parseExplain, formatTreeAsText, type ExplainNode, type ExplainPlan, type NodeType } from '../engine/explain-parser'
import { buildShareHash, readShareHash } from '../lib/explain-share'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'
import { saveAs } from 'file-saver'

// ── Constants ─────────────────────────────────────────

const LS_KEY = 'plan-explorer-input'
const SAMPLE_PLAN = `Gather Motion 2:1  (cost=0.00..431.00 rows=1 width=48)
  ->  Hash Join  (cost=0.00..431.00 rows=1 width=48)
        Hash Cond: (a.id = b.a_id)
        ->  Seq Scan on a  (cost=0.00..32.60 rows=2260 width=28)
        ->  Hash  (cost=0.00..32.60 rows=2260 width=28)
              ->  Seq Scan on b  (cost=0.00..32.60 rows=2260 width=28)`

const INPUT_SIZE_LIMIT = 200_000

// ── Node color map + legend ───────────────────────────

const NODE_COLORS: Record<NodeType, string> = {
  scan: '#3b82f6',
  join: '#22c55e',
  aggregate: '#f97316',
  sort: '#a855f7',
  hash: '#ec4899',
  motion: '#06b6d4',
  setop: '#14b8a6',
  limit: '#f59e0b',
  subquery: '#8b5cf6',
  other: '#6b7280',
}

const NODE_LABELS: Record<NodeType, string> = {
  scan: 'Seq Scan, Index Scan, Bitmap Scan',
  join: 'Hash Join, Nested Loop, Merge Join',
  aggregate: 'Aggregate, HashAggregate, GroupAggregate',
  sort: 'Sort, Incremental Sort',
  hash: 'Hash node',
  motion: 'Gather/Redistribute/Broadcast Motion',
  setop: 'Append, Union, Except, Intersect',
  limit: 'Limit',
  subquery: 'Subquery Scan, Materialize, Result',
  other: 'Other node types',
}

const LEGEND_ORDER: NodeType[] = ['scan', 'join', 'aggregate', 'sort', 'hash', 'motion', 'setop', 'limit', 'subquery', 'other']

function getNodeColor(type: NodeType): string {
  return NODE_COLORS[type] || '#6b7280'
}

// ── Helpers ───────────────────────────────────────────

function loadPersisted(key: string, fallback = ''): string {
  try {
    const raw = localStorage.getItem(`paimon.${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function savePersisted(key: string, value: string) {
  try {
    localStorage.setItem(`paimon.${key}`, JSON.stringify(value))
  } catch { /* silently ignore */ }
}

// ── Component ─────────────────────────────────────────

export default function ExplainTool() {
  const toast = useToast()
  const [inputText, setInputText] = useState(() => loadPersisted(LS_KEY, ''))
  const [plan, setPlan] = useState<ExplainPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'empty' | 'ok' | 'error' | 'processing'>('idle')
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [selectedNode, setSelectedNode] = useState<ExplainNode | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [legendOpen, setLegendOpen] = useState(true)
  const [planTextOpen, setPlanTextOpen] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)

  // Generate a unique id for each node in the tree
  let nodeIdCounter = 0
  function assignNodeIds(node: ExplainNode) {
    nodeIdCounter++
    ;(node as any)._id = `n${nodeIdCounter}`
    for (const child of node.children) assignNodeIds(child)
  }

  // ── Parse input ─────────────────────────────────────

  const parseInput = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) {
      setPlan(null)
      setError(null)
      setStatus('empty')
      setDurationMs(null)
      setSelectedNode(null)
      setCollapsedIds(new Set())
      return
    }

    if (trimmed.length > INPUT_SIZE_LIMIT) {
      setError(`Input too large (${trimmed.length.toLocaleString()} chars). Max ${INPUT_SIZE_LIMIT.toLocaleString()}.`)
      setStatus('error')
      return
    }

    setStatus('processing')
    const start = performance.now()

    try {
      const result = parseExplain(trimmed)
      const elapsed = performance.now() - start

      if (!result.tree) {
        setError('Could not parse EXPLAIN output. Make sure it\'s valid PostgreSQL EXPLAIN text.')
        setStatus('error')
        setPlan(null)
        return
      }

      if (result.warnings.length > 0) {
        result.warnings.forEach(w => toast.push(w, { variant: 'info' }))
      }

      // Assign node IDs for collapse tracking
      assignNodeIds(result.tree)

      setPlan(result)
      setError(null)
      setStatus('ok')
      setDurationMs(elapsed)
      setSelectedNode(null)
      setCollapsedIds(new Set())
    } catch (e) {
      setError(`Parse error: ${e instanceof Error ? e.message : String(e)}`)
      setStatus('error')
      setPlan(null)
    }
  }, [toast])

  // ── Input change handler ────────────────────────────

  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setInputText(text)
    savePersisted(LS_KEY, text)
    parseInput(text)
  }, [parseInput])

  // ── Sample ──────────────────────────────────────────

  const handleSample = useCallback(() => {
    setInputText(SAMPLE_PLAN)
    savePersisted(LS_KEY, SAMPLE_PLAN)
    parseInput(SAMPLE_PLAN)
  }, [parseInput])

  // ── Clear ───────────────────────────────────────────

  const handleClear = useCallback(() => {
    setInputText('')
    savePersisted(LS_KEY, '')
    setPlan(null)
    setError(null)
    setStatus('empty')
    setDurationMs(null)
    setSelectedNode(null)
    setCollapsedIds(new Set())
  }, [])

  // ── Share via URL hash ──────────────────────────────

  const handleShare = useCallback(() => {
    const trimmed = inputText.trim()
    if (!trimmed) {
      toast.push('Nothing to share — paste an EXPLAIN plan first', { variant: 'info' })
      return
    }
    const hash = buildShareHash(trimmed)
    if (!hash) {
      toast.push('Plan too large for URL sharing — use Download instead', { variant: 'info' })
      return
    }
    const url = `${window.location.origin}${window.location.pathname}${hash}`
    navigator.clipboard.writeText(url).then(
      () => toast.push('Share URL copied to clipboard!', { variant: 'success' }),
      () => toast.push('Failed to copy URL', { variant: 'error' }),
    )
  }, [inputText, toast])

  // ── Download SVG ────────────────────────────────────

  const handleDownloadSvg = useCallback(() => {
    const svg = svgRef.current
    if (!svg) {
      toast.push('No tree to export — paste an EXPLAIN plan first', { variant: 'info' })
      return
    }

    const svgClone = svg.cloneNode(true) as SVGSVGElement
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svgClone)
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    saveAs(svgBlob, 'plan-explorer.svg')
    toast.push('SVG downloaded!', { variant: 'success' })
  }, [toast])

  // ── Copy as text ────────────────────────────────────

  const handleCopyText = useCallback(() => {
    if (!plan?.tree) {
      toast.push('No tree to copy — paste an EXPLAIN plan first', { variant: 'info' })
      return
    }
    const text = formatTreeAsText(plan.tree)
    navigator.clipboard.writeText(text).then(
      () => toast.push('Plan copied as text!', { variant: 'success' }),
      () => toast.push('Failed to copy', { variant: 'error' }),
    )
  }, [plan, toast])

  // ── Auto-load from URL hash on mount ────────────────

  useEffect(() => {
    const shared = readShareHash()
    if (shared) {
      setInputText(shared)
      savePersisted(LS_KEY, shared)
      parseInput(shared)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [parseInput])

  // ── Toggle collapse ─────────────────────────────────

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── D3 tree rendering ───────────────────────────────

  useEffect(() => {
    if (!plan?.tree || !treeContainerRef.current) {
      if (svgRef.current) {
        d3Selection.select(svgRef.current).selectAll('*').remove()
      }
      return
    }

    const currentPlan = plan.tree
    if (!currentPlan) return

    const container = treeContainerRef.current
    const width = container.clientWidth || 800
    const height = Math.max(400, container.clientHeight || 500)

    const svg = d3Selection.select(svgRef.current)
    svg.selectAll('*').remove()

    // Set up zoom on a main group
    const g = svg.append<SVGGElement>('g').attr('class', 'tree-group')

    const zoomBehavior = d3Zoom.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: d3Zoom.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', String(event.transform))
      })

    void svg.call(zoomBehavior as unknown as (sel: typeof svg) => void)

    // Build hierarchy — filter out collapsed children
    function buildFilteredTree(node: ExplainNode): ExplainNode | null {
      const id = (node as any)._id
      const isCollapsed = collapsedIds.has(id)
      const children: ExplainNode[] = []
      for (const child of node.children) {
        const filtered = buildFilteredTree(child)
        if (filtered) children.push(filtered)
      }
      return {
        ...node,
        children: isCollapsed ? [] : children,
      }
    }

    const filteredTree = buildFilteredTree(currentPlan!)
    const root = d3Hierarchy.hierarchy<ExplainNode>(filteredTree!, (d) => d.children.length > 0 ? d.children : undefined)
    const treeLayout = d3Hierarchy.tree<ExplainNode>()
      .size([height - 80, width - 200])
      .separation((a, b) => a.parent === b.parent ? 1.5 : 2.5)

    treeLayout(root)

    // Apply initial transform
    const initialTransform = d3Zoom.zoomIdentity.translate(120, 40).scale(0.85)
    void svg.call(zoomBehavior.transform as unknown as (sel: typeof svg, t: typeof initialTransform) => void, initialTransform)

    // Draw links (curved paths)
    g.append<SVGGElement>('g')
      .selectAll<SVGPathElement, d3Hierarchy.HierarchyLink<ExplainNode>>('path')
      .data(root.links())
      .enter()
      .append<SVGPathElement>('path')
      .attr('d', (d: d3Hierarchy.HierarchyLink<ExplainNode>) => {
        const sy = d.source.y!
        const sx = d.source.x
        const ty = d.target.y!
        const tx = d.target.x
        return `M${sy},${sx} C${(sy + ty) / 2},${sx} ${(sy + ty) / 2},${tx} ${ty},${tx}`
      })
      .attr('fill', 'none')
      .attr('stroke', '#2e2a24')
      .attr('stroke-width', 2)

    // Find bottleneck node ID
    let maxCost = 0
    let maxNodeId = ''
    root.each((d: HierarchyNode<ExplainNode>) => {
      if (d.data.cost.total > maxCost) {
        maxCost = d.data.cost.total
        maxNodeId = (d.data as any)._id || ''
      }
    })

    // Draw nodes
    const node = g.append<SVGGElement>('g')
      .selectAll<SVGGElement, d3Hierarchy.HierarchyNode<ExplainNode>>('g')
      .data(root.descendants())
      .enter()
      .append<SVGGElement>('g')
      .attr('transform', (d: d3Hierarchy.HierarchyNode<ExplainNode>) => `translate(${d.y},${d.x})`)

    // Highlight background for selected node
    node.append('rect')
      .attr('x', -10)
      .attr('y', -18)
      .attr('width', 0)
      .attr('height', 0)
      .attr('rx', 4)
      .attr('fill', 'rgba(231, 172, 52, 0.1)')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 1)

    // Node circle
    node.append('circle')
      .attr('r', 6)
      .attr('fill', (d: d3Hierarchy.HierarchyNode<ExplainNode>) => getNodeColor(d.data.type))
      .attr('stroke', (d: d3Hierarchy.HierarchyNode<ExplainNode>) => {
        if (d.data === selectedNode) return '#e7ac34'
        if ((d.data as any)._id === maxNodeId) return '#ef4444'
        return '#1d1a16'
      })
      .attr('stroke-width', (d: d3Hierarchy.HierarchyNode<ExplainNode>) => {
        if (d.data === selectedNode) return 3
        if ((d.data as any)._id === maxNodeId) return 3
        return 1.5
      })

    // Collapse indicator (chevron) for nodes with children
    node.filter((d: d3Hierarchy.HierarchyNode<ExplainNode>) => {
      const orig = findOriginalNode(currentPlan, (d.data as any)._id)
      return !!(orig && orig.children.length > 0)
    }).append('text')
      .attr('x', -6)
      .attr('y', -12)
      .attr('font-size', '8px')
      .attr('fill', '#78716c')
      .attr('text-anchor', 'middle')
      .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => {
        const id = (d.data as any)._id
        return collapsedIds.has(id) ? '▶' : '▼'
      })

    // Node label
    node.append('text')
      .attr('x', 14)
      .attr('y', -2)
      .attr('font-size', '13px')
      .attr('font-family', "'JetBrains Mono', ui-monospace, monospace")
      .attr('fill', '#e4e0d6')
      .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => truncateText(d.data.label, 30))

    // Cost badge
    node.append('text')
      .attr('x', 14)
      .attr('y', 12)
      .attr('font-size', '10px')
      .attr('font-family', "'JetBrains Mono', ui-monospace, monospace")
      .attr('fill', '#78716c')
      .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => `cost=${formatCost(d.data.cost.total)} · rows=${d.data.rows}`)

    // Annotation badges (first annotation only, truncated)
    node.filter((d: d3Hierarchy.HierarchyNode<ExplainNode>) => d.data.annotations.length > 0)
      .append('text')
      .attr('x', 14)
      .attr('y', 24)
      .attr('font-size', '9px')
      .attr('font-family', "'JetBrains Mono', ui-monospace, monospace")
      .attr('fill', '#a8a29e')
      .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => truncateText(d.data.annotations[0], 40))

    // ── Click: select node / toggle collapse ───────
    node.on('click', function (_event: MouseEvent, d: d3Hierarchy.HierarchyNode<ExplainNode>) {
      const id = (d.data as any)._id
      const orig = findOriginalNode(currentPlan, id)
      if (orig && orig.children.length > 0) {
        toggleCollapse(id)
      }
      setSelectedNode(d.data === selectedNode ? null : d.data)
    })

    // ── Hover tooltip ─────────────────────────────
    const tooltip = d3Selection.select(container)
      .append('div')
      .attr('class', 'plan-tooltip')
      .style('position', 'absolute')
      .style('display', 'none')
      .style('background', '#1d1a16')
      .style('border', '1px solid #2e2a24')
      .style('border-radius', '8px')
      .style('padding', '10px 14px')
      .style('font-size', '12px')
      .style('font-family', "'JetBrains Mono', ui-monospace, monospace")
      .style('color', '#e4e0d6')
      .style('pointer-events', 'none')
      .style('z-index', '100')
      .style('max-width', '320px')
      .style('box-shadow', '0 4px 12px rgba(0,0,0,0.4)')
      .style('line-height', '1.5')

    node.on('mouseenter', function (this: SVGGElement, event: MouseEvent, d: d3Hierarchy.HierarchyNode<ExplainNode>) {
      d3Selection.select(this).select('circle')
        .attr('r', 8)
        .attr('stroke', '#e7ac34')
        .attr('stroke-width', 2)

      const n = d.data
      let html = `<div style="font-weight:600;margin-bottom:4px;color:${getNodeColor(n.type)}">${n.label}</div>`
      html += `<div>Cost: ${n.cost.startup}..${n.cost.total}</div>`
      html += `<div>Rows: ${n.rows.toLocaleString()} · Width: ${n.width} bytes</div>`
      if (n.actualTime) {
        html += `<div>Actual: ${n.actualTime.first}..${n.actualTime.last} ms</div>`
        if (n.loops && n.loops > 1) html += `<div>Loops: ${n.loops}</div>`
      }
      if (n.buffers) {
        html += `<div>Buffers: shared hit=${n.buffers.sharedHit} read=${n.buffers.sharedRead}</div>`
      }
      for (const ann of n.annotations) {
        html += `<div style="color:#a8a29e;font-size:11px;margin-top:2px">${ann}</div>`
      }
      if (n.children.length > 0) {
        const orig = findOriginalNode(currentPlan, (n as any)._id)
        const total = orig ? orig.children.length : n.children.length
        html += `<div style="color:#78716c;font-size:10px;margin-top:4px">Children: ${total} (click to collapse)</div>`
      }
      html += `<div style="color:#78716c;font-size:10px;margin-top:2px">Click to select</div>`

      tooltip
        .style('display', 'block')
        .html(html)
        .style('left', `${event.offsetX + 15}px`)
        .style('top', `${event.offsetY - 10}px`)
    })

    node.on('mousemove', function (this: SVGGElement, event: MouseEvent) {
      tooltip
        .style('left', `${event.offsetX + 15}px`)
        .style('top', `${event.offsetY - 10}px`)
    })

    node.on('mouseleave', function (this: SVGGElement, _event: MouseEvent, d: d3Hierarchy.HierarchyNode<ExplainNode>) {
      d3Selection.select(this).select('circle')
        .attr('r', 6)
        .attr('stroke', d.data === selectedNode ? '#e7ac34' : (d.data as any)._id === maxNodeId ? '#ef4444' : '#1d1a16')
        .attr('stroke-width', d.data === selectedNode ? 3 : (d.data as any)._id === maxNodeId ? 3 : 1.5)

      tooltip.style('display', 'none')
    })

    return () => {
      tooltip.remove()
    }
  }, [plan, selectedNode, collapsedIds, toggleCollapse])

  // ── Keyboard shortcuts ──────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const m = e.metaKey || e.ctrlKey
      if (m && e.shiftKey && e.key === 'c') { e.preventDefault(); handleShare(); return }
      if (m && e.key === 's') { e.preventDefault(); handleDownloadSvg(); return }
      if (m && e.shiftKey && e.key === 't') { e.preventDefault(); handleCopyText(); return }
      if (e.key === 'Escape' && inputText) { e.preventDefault(); handleClear(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, handleShare, handleDownloadSvg, handleCopyText, handleClear])

  // ── Drag & drop ─────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault() }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (text) {
        setInputText(text)
        savePersisted(LS_KEY, text)
        parseInput(text)
      }
    }
    reader.readAsText(file)
  }, [parseInput])

  // ── Build detail panel content ──────────────────────

  function buildNodeDetail(node: ExplainNode): string {
    let html = `<div style="font-weight:600;margin-bottom:6px;font-size:14px;color:${getNodeColor(node.type)}">${node.label}</div>`
    html += `<div class="detail-row"><span class="detail-label">Startup Cost</span><span>${node.cost.startup}</span></div>`
    html += `<div class="detail-row"><span class="detail-label">Total Cost</span><span>${node.cost.total}</span></div>`
    html += `<div class="detail-row"><span class="detail-label">Estimated Rows</span><span>${node.rows.toLocaleString()}</span></div>`
    html += `<div class="detail-row"><span class="detail-label">Row Width</span><span>${node.width} bytes</span></div>`
    if (node.actualTime) {
      html += `<div class="detail-row"><span class="detail-label">Actual Time</span><span>${node.actualTime.first}..${node.actualTime.last} ms</span></div>`
      if (node.loops && node.loops > 1) {
        html += `<div class="detail-row"><span class="detail-label">Loops</span><span>${node.loops}</span></div>`
      }
    }
    if (node.buffers) {
      html += `<div class="detail-row"><span class="detail-label">Shared Hit</span><span>${node.buffers.sharedHit.toLocaleString()}</span></div>`
      html += `<div class="detail-row"><span class="detail-label">Shared Read</span><span>${node.buffers.sharedRead.toLocaleString()}</span></div>`
    }
    for (const ann of node.annotations) {
      const colonIdx = ann.indexOf(':')
      if (colonIdx > 0) {
        html += `<div class="detail-row"><span class="detail-label">${ann.slice(0, colonIdx)}</span><span>${ann.slice(colonIdx + 1).trim()}</span></div>`
      } else {
        html += `<div class="detail-row"><span class="detail-label">Note</span><span>${ann}</span></div>`
      }
    }
    html += `<div class="detail-row" style="border-top:1px solid #2e2a24;padding-top:4px;margin-top:4px"><span class="detail-label">Type</span><span>${node.type}</span></div>`
    html += `<div class="detail-row"><span class="detail-label">Children</span><span>${node.children.length}</span></div>`
    return html
  }

  // ── Render ──────────────────────────────────────────

  const inputCharCount = inputText.length
  const outputCharCount = plan?.tree ? plan.summary.nodeCount : 0
  const statusBarStatus = error ? 'error' : status === 'processing' ? 'processing' : status === 'ok' ? 'ok' : status === 'empty' ? 'empty' : 'idle'

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Input pane */}
        <div className="flex min-h-0 flex-1 flex-col md:w-1/3 md:max-w-md">
          <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/60 px-4 py-2">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-honey-400" />
              <span className="text-xs font-500 text-ink-200">Plan Explorer</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleSample} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200" title="Load sample plan">
                <Sparkles className="h-3 w-3" />
                Sample
              </button>
              <button onClick={handleClear} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200" title="Clear input (Esc)">
                <Eraser className="h-3 w-3" />
                Clear
              </button>
            </div>
          </div>
          <textarea
            className="flex-1 resize-none border-0 bg-transparent p-4 font-mono text-[13px] leading-relaxed text-ink-200 outline-none placeholder:text-ink-600"
            placeholder="Paste EXPLAIN output here, or drop a .plan file&#10;&#10;Example:&#10;Gather Motion 2:1  (cost=0.00..431.00 rows=1 width=48)&#10;  ->  Hash Join  (cost=0.00..431.00 rows=1 width=48)"
            value={inputText}
            onChange={handleInputChange}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            spellCheck={false}
          />
        </div>

        {/* Tree visualization + reference panels */}
        <div className="relative flex min-h-0 flex-1 flex-col border-t border-ink-800 md:border-l md:border-t-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/60 px-4 py-2">
            <div className="flex items-center gap-2 text-xs text-ink-400">
              {plan?.tree ? (
                <>
                  <span>Cost: {plan.summary.totalCost.toFixed(2)}</span>
                  <span className="text-ink-600">·</span>
                  <span>Nodes: {plan.summary.nodeCount}</span>
                  <span className="text-ink-600">·</span>
                  <span>Rows: {plan.summary.totalRows.toLocaleString()}</span>
                  {plan.summary.bottleneck && (
                    <>
                      <span className="text-ink-600">·</span>
                      <span className="text-red-400">⚠️ bottleneck</span>
                    </>
                  )}
                </>
              ) : (
                <span className="text-ink-500">Tree visualization</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleShare} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200" title="Copy share URL (⌘⇧C)" disabled={!plan?.tree}>
                <Share2 className="h-3 w-3" />
                Share
              </button>
              <button onClick={handleDownloadSvg} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200" title="Download SVG (⌘S)" disabled={!plan?.tree}>
                <Download className="h-3 w-3" />
                SVG
              </button>
              <button onClick={handleCopyText} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200" title="Copy as text (⌘⇧T)" disabled={!plan?.tree}>
                <Copy className="h-3 w-3" />
                Text
              </button>
              {/* Toggle plan text reference */}
              {plan?.tree && (
                <button onClick={() => setPlanTextOpen(o => !o)} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200" title="Toggle plan text reference">
                  {planTextOpen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                  Ref
                </button>
              )}
            </div>
          </div>

          {/* Reference: plan text overlay */}
          {planTextOpen && plan && (
            <div className="border-b border-ink-800 bg-ink-900/80 px-4 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-500 text-ink-500 uppercase tracking-wider">Original Plan</span>
                <button onClick={() => setPlanTextOpen(false)} className="text-ink-500 hover:text-ink-200">
                  <ChevronUp className="h-3 w-3" />
                </button>
              </div>
              <pre className="max-h-32 overflow-auto rounded border border-ink-800 bg-ink-950/80 p-2 text-[11px] leading-relaxed text-ink-400 font-mono">{inputText}</pre>
            </div>
          )}

          {/* Main tree area with side panels */}
          <div className="flex min-h-0 flex-1">
            {/* Tree */}
            <div
              ref={treeContainerRef}
              className="relative flex-1 overflow-hidden"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {plan?.tree ? (
                <svg
                  ref={svgRef}
                  width="100%"
                  height="100%"
                  style={{ display: 'block', minHeight: '450px' }}
                />
              ) : error ? (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="max-w-md rounded-lg border border-red-800/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="text-center text-sm text-ink-500">
                    <GitBranch className="mx-auto mb-3 h-10 w-10 text-ink-700" />
                    <p className="mb-2">Paste EXPLAIN output on the left</p>
                    <p className="text-xs text-ink-600">Then see an interactive tree visualization here</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right side panel: selected node detail */}
            {selectedNode && (
              <div className="w-64 border-l border-ink-800 bg-ink-900/80 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-ink-800 px-3 py-2">
                  <span className="text-[10px] font-500 text-ink-500 uppercase tracking-wider">Node Detail</span>
                  <button onClick={() => setSelectedNode(null)} className="text-ink-500 hover:text-ink-200 text-xs">✕</button>
                </div>
                <div
                  className="p-3 text-xs leading-relaxed [&_.detail-row]:flex [&_.detail-row]:justify-between [&_.detail-row]:gap-2 [&_.detail-row]:py-0.5 [&_.detail-label]:text-ink-500"
                  dangerouslySetInnerHTML={{ __html: buildNodeDetail(selectedNode) }}
                />
              </div>
            )}

            {/* Right side panel: legend */}
            {!selectedNode && legendOpen && plan?.tree && (
              <div className="w-56 border-l border-ink-800 bg-ink-900/80 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-ink-800 px-3 py-2">
                  <span className="text-[10px] font-500 text-ink-500 uppercase tracking-wider">Legend</span>
                  <button onClick={() => setLegendOpen(false)} className="text-ink-500 hover:text-ink-200 text-xs">✕</button>
                </div>
                <div className="p-3 space-y-2">
                  {LEGEND_ORDER.map(type => (
                    <div key={type} className="flex items-start gap-2">
                      <span className="mt-1 block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: NODE_COLORS[type] }} />
                      <div>
                        <div className="text-[11px] font-500 text-ink-200 capitalize">{type}</div>
                        <div className="text-[10px] text-ink-500 leading-tight">{NODE_LABELS[type]}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Re-open legend button when closed */}
            {!selectedNode && !legendOpen && plan?.tree && (
              <button
                onClick={() => setLegendOpen(true)}
                className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded bg-ink-800 px-2 py-1 text-[10px] text-ink-400 hover:text-ink-200"
              >
                <ChevronDown className="h-3 w-3" />
                Legend
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        inputChars={inputCharCount}
        outputChars={outputCharCount}
        status={statusBarStatus}
        error={error}
        durationMs={durationMs}
      />
    </div>
  )
}

// ── Utilities ─────────────────────────────────────────

function findOriginalNode(node: ExplainNode, id: string): ExplainNode | null {
  if ((node as any)._id === id) return node
  for (const child of node.children) {
    const found = findOriginalNode(child, id)
    if (found) return found
  }
  return null
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + '…'
}

function formatCost(cost: number): string {
  if (cost < 1000) return cost.toFixed(2)
  if (cost < 1_000_000) return `${(cost / 1000).toFixed(1)}k`
  return `${(cost / 1_000_000).toFixed(2)}M`
}