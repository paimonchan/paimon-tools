/**
 * ExplainTool — PostgreSQL Plan Explorer.
 *
 * Lazy-loaded ref tool. Parses EXPLAIN output and renders an interactive
 * table-based tree view (primary) with progress bars, metric toggle, and
 * an alternative D3 SVG tree view.
 *
 * Inspired by explain.dalibo.com (PEV2).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Copy, Download, Share2, Eraser, Sparkles, GitBranch, ChevronDown, ChevronUp, Maximize2, Minimize2, PanelRightOpen, PanelRightClose, Columns3, ListTree } from 'lucide-react'
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
const LS_VIEW_KEY = 'plan-explorer-view'
const LS_METRIC_KEY = 'plan-explorer-metric'
const SAMPLE_PLAN = `Gather Motion 2:1  (cost=0.00..431.00 rows=1 width=48)
  ->  Hash Join  (cost=0.00..431.00 rows=1 width=48)
        Hash Cond: (a.id = b.a_id)
        ->  Seq Scan on a  (cost=0.00..32.60 rows=2260 width=28)
        ->  Hash  (cost=0.00..32.60 rows=2260 width=28)
              ->  Seq Scan on b  (cost=0.00..32.60 rows=2260 width=28)`

const INPUT_SIZE_LIMIT = 200_000

type ViewMode = 'table' | 'tree'
type Metric = 'cost' | 'rows' | 'time'

interface FlatRow {
  node: ExplainNode
  depth: number
  _id: string
  isCollapsed: boolean
  hasChildren: boolean
}

// ── Node color map ────────────────────────────────────

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

let _nodeIdCounter = 0
function assignNodeIds(node: ExplainNode) {
  _nodeIdCounter++
  ;(node as any)._id = `n${_nodeIdCounter}`
  for (const child of node.children) assignNodeIds(child)
}

function flattenTree(node: ExplainNode, collapsedIds: Set<string>, depth = 0): FlatRow[] {
  const id = (node as any)._id
  const rows: FlatRow[] = [{
    node,
    depth,
    _id: id,
    isCollapsed: collapsedIds.has(id),
    hasChildren: node.children.length > 0,
  }]
  if (!collapsedIds.has(id)) {
    for (const child of node.children) {
      rows.push(...flattenTree(child, collapsedIds, depth + 1))
    }
  }
  return rows
}

function findOriginalNode(node: ExplainNode, id: string): ExplainNode | null {
  if ((node as any)._id === id) return node
  for (const child of node.children) {
    const found = findOriginalNode(child, id)
    if (found) return found
  }
  return null
}

function getMetricValue(node: ExplainNode, metric: Metric): number {
  switch (metric) {
    case 'cost': return node.cost.total
    case 'rows': return node.rows
    case 'time': return node.actualTime?.last ?? node.cost.total
  }
}

function formatMetric(value: number): string {
  if (value < 1000) return value.toFixed(2)
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`
  return `${(value / 1_000_000).toFixed(2)}M`
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + '…'
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
  const [viewMode, setViewMode] = useState<ViewMode>(() => (loadPersisted(LS_VIEW_KEY, 'table') as ViewMode))
  const [metric, setMetric] = useState<Metric>(() => (loadPersisted(LS_METRIC_KEY, 'cost') as Metric))

  const svgRef = useRef<SVGSVGElement>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)

  // ── Flattened rows for table view ───────────────────

  const flatRows = useMemo(() => {
    if (!plan?.tree) return []
    return flattenTree(plan.tree, collapsedIds)
  }, [plan, collapsedIds])

  // ── Max metric value for progress bars ──────────────

  const maxMetric = useMemo(() => {
    if (!plan?.tree) return 0
    let max = 0
    const allRows = flattenTree(plan.tree, new Set())
    for (const row of allRows) {
      const val = getMetricValue(row.node, metric)
      if (val > max) max = val
    }
    return max
  }, [plan, metric])

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
        setError('Could not parse EXPLAIN output.')
        setStatus('error')
        setPlan(null)
        return
      }

      if (result.warnings.length > 0) {
        result.warnings.forEach(w => toast.push(w, { variant: 'info' }))
      }

      _nodeIdCounter = 0
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

  // ── Input change ────────────────────────────────────

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

  // ── Share ───────────────────────────────────────────

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

  // ── Auto-load from URL hash ─────────────────────────

  useEffect(() => {
    const shared = readShareHash()
    if (shared) {
      setInputText(shared)
      savePersisted(LS_KEY, shared)
      parseInput(shared)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [parseInput])

  // ── View mode toggle ────────────────────────────────

  const handleViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    savePersisted(LS_VIEW_KEY, mode)
  }, [])

  const handleMetric = useCallback((m: Metric) => {
    setMetric(m)
    savePersisted(LS_METRIC_KEY, m)
  }, [])

  // ── Collapse / Select ───────────────────────────────

  const handleRowClick = useCallback((row: FlatRow) => {
    if (row.hasChildren) {
      setCollapsedIds(prev => {
        const next = new Set(prev)
        if (next.has(row._id)) next.delete(row._id)
        else next.add(row._id)
        return next
      })
    }
    setSelectedNode(row.node === selectedNode ? null : row.node)
  }, [selectedNode])

  // ── D3 tree rendering ───────────────────────────────

  useEffect(() => {
    if (viewMode !== 'tree' || !plan?.tree || !treeContainerRef.current) {
      if (svgRef.current) d3Selection.select(svgRef.current).selectAll('*').remove()
      return
    }

    const container = treeContainerRef.current
    const width = container.clientWidth || 800
    const height = Math.max(400, container.clientHeight || 500)
    const svg = d3Selection.select(svgRef.current)
    svg.selectAll('*').remove()
    const g = svg.append<SVGGElement>('g').attr('class', 'tree-group')

    const zoomBehavior = d3Zoom.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: d3Zoom.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', String(event.transform))
      })
    void svg.call(zoomBehavior as unknown as (sel: typeof svg) => void)

    // Build filtered tree
    function buildFiltered(node: ExplainNode): ExplainNode | null {
      const id = (node as any)._id
      const isCollapsed = collapsedIds.has(id)
      const children: ExplainNode[] = []
      for (const child of node.children) {
        const filtered = buildFiltered(child)
        if (filtered) children.push(filtered)
      }
      return { ...node, children: isCollapsed ? [] : children }
    }

    const currentPlan = plan.tree as ExplainNode
    const filteredTree = buildFiltered(currentPlan)
    const root = d3Hierarchy.hierarchy<ExplainNode>(filteredTree!, (d) => d.children.length > 0 ? d.children : undefined)
    const treeLayout = d3Hierarchy.tree<ExplainNode>()
      .size([height - 80, width - 200])
      .separation((a, b) => a.parent === b.parent ? 1.5 : 2.5)
    treeLayout(root)

    const initialTransform = d3Zoom.zoomIdentity.translate(120, 40).scale(0.85)
    void svg.call(zoomBehavior.transform as unknown as (sel: typeof svg, t: typeof initialTransform) => void, initialTransform)

    // Links
    g.append<SVGGElement>('g')
      .selectAll<SVGPathElement, d3Hierarchy.HierarchyLink<ExplainNode>>('path')
      .data(root.links()).enter().append<SVGPathElement>('path')
      .attr('d', (d: d3Hierarchy.HierarchyLink<ExplainNode>) => {
        const sy = d.source.y!, sx = d.source.x, ty = d.target.y!, tx = d.target.x
        return `M${sy},${sx} C${(sy + ty) / 2},${sx} ${(sy + ty) / 2},${tx} ${ty},${tx}`
      })
      .attr('fill', 'none').attr('stroke', '#2e2a24').attr('stroke-width', 2)

    // Bottleneck
    let maxCost = 0, maxNodeId = ''
    root.each((d: HierarchyNode<ExplainNode>) => {
      if (d.data.cost.total > maxCost) { maxCost = d.data.cost.total; maxNodeId = (d.data as any)._id || '' }
    })

    // Nodes
    const node = g.append<SVGGElement>('g')
      .selectAll<SVGGElement, d3Hierarchy.HierarchyNode<ExplainNode>>('g')
      .data(root.descendants()).enter().append<SVGGElement>('g')
      .attr('transform', (d: d3Hierarchy.HierarchyNode<ExplainNode>) => `translate(${d.y},${d.x})`)

    node.append('circle').attr('r', 6)
      .attr('fill', (d: d3Hierarchy.HierarchyNode<ExplainNode>) => getNodeColor(d.data.type))
      .attr('stroke', (d: d3Hierarchy.HierarchyNode<ExplainNode>) =>
        d.data === selectedNode ? '#e7ac34' : (d.data as any)._id === maxNodeId ? '#ef4444' : '#1d1a16')
      .attr('stroke-width', (d: d3Hierarchy.HierarchyNode<ExplainNode>) =>
        d.data === selectedNode || (d.data as any)._id === maxNodeId ? 3 : 1.5)

    // Collapse indicator
    node.filter((d: d3Hierarchy.HierarchyNode<ExplainNode>) => {
      const orig = findOriginalNode(currentPlan, (d.data as any)._id)
      return !!(orig && orig.children.length > 0)
    }).append('text').attr('x', -6).attr('y', -12).attr('font-size', '8px').attr('fill', '#78716c').attr('text-anchor', 'middle')
      .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => collapsedIds.has((d.data as any)._id) ? '▶' : '▼')

    node.append('text').attr('x', 14).attr('y', -2).attr('font-size', '13px').attr('font-family', "'JetBrains Mono', ui-monospace, monospace").attr('fill', '#e4e0d6')
      .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => truncateText(d.data.label, 30))
    node.append('text').attr('x', 14).attr('y', 12).attr('font-size', '10px').attr('fill', '#78716c')
      .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => `cost=${formatMetric(d.data.cost.total)} · rows=${d.data.rows}`)

    // Click
    node.on('click', function (_e: MouseEvent, d: d3Hierarchy.HierarchyNode<ExplainNode>) {
      const id = (d.data as any)._id
      const orig = findOriginalNode(currentPlan, id)
      if (orig && orig.children.length > 0) {
        setCollapsedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
      }
      setSelectedNode(d.data === selectedNode ? null : d.data)
    })

    // Tooltip
    const tooltip = d3Selection.select(container).append('div').attr('class', 'plan-tooltip')
      .style('position', 'absolute').style('display', 'none').style('background', '#1d1a16')
      .style('border', '1px solid #2e2a24').style('border-radius', '8px').style('padding', '10px 14px')
      .style('font-size', '12px').style('font-family', "'JetBrains Mono', ui-monospace, monospace")
      .style('color', '#e4e0d6').style('pointer-events', 'none').style('z-index', '100')
      .style('max-width', '320px').style('box-shadow', '0 4px 12px rgba(0,0,0,0.4)').style('line-height', '1.5')

    node.on('mouseenter', function (this: SVGGElement, event: MouseEvent, d: d3Hierarchy.HierarchyNode<ExplainNode>) {
      const n = d.data
      let html = `<div style="font-weight:600;margin-bottom:4px;color:${getNodeColor(n.type)}">${n.label}</div>`
      html += `<div>Cost: ${n.cost.startup}..${n.cost.total}</div><div>Rows: ${n.rows.toLocaleString()} · Width: ${n.width}</div>`
      if (n.actualTime) html += `<div>Actual: ${n.actualTime.first}..${n.actualTime.last} ms</div>`
      if (n.buffers) html += `<div>Buffers: shared hit=${n.buffers.sharedHit}</div>`
      for (const ann of n.annotations) html += `<div style="color:#a8a29e;font-size:11px">${ann}</div>`
      tooltip.style('display', 'block').html(html).style('left', `${event.offsetX + 15}px`).style('top', `${event.offsetY - 10}px`)
      d3Selection.select(this).select('circle').attr('r', 8).attr('stroke', '#e7ac34').attr('stroke-width', 2)
    })
    node.on('mousemove', function (this: SVGGElement, event: MouseEvent) {
      tooltip.style('left', `${event.offsetX + 15}px`).style('top', `${event.offsetY - 10}px`)
    })
    node.on('mouseleave', function (this: SVGGElement, _e: MouseEvent, d: d3Hierarchy.HierarchyNode<ExplainNode>) {
      d3Selection.select(this).select('circle').attr('r', 6)
        .attr('stroke', d.data === selectedNode ? '#e7ac34' : (d.data as any)._id === maxNodeId ? '#ef4444' : '#1d1a16')
        .attr('stroke-width', d.data === selectedNode || (d.data as any)._id === maxNodeId ? 3 : 1.5)
      tooltip.style('display', 'none')
    })

    return () => { tooltip.remove() }
  }, [plan, viewMode, selectedNode, collapsedIds])

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
  }, [inputText])

  // ── Drag & drop ─────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault() }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (text) { setInputText(text); savePersisted(LS_KEY, text); parseInput(text) }
    }
    reader.readAsText(file)
  }, [parseInput])

  // ── Build detail panel ──────────────────────────────

  function buildNodeDetail(node: ExplainNode): string {
    let html = `<div style="font-weight:600;margin-bottom:6px;font-size:14px;color:${getNodeColor(node.type)}">${node.label}</div>`
    html += `<div class="dr"><span class="dl">Startup Cost</span><span>${node.cost.startup}</span></div>`
    html += `<div class="dr"><span class="dl">Total Cost</span><span>${node.cost.total}</span></div>`
    html += `<div class="dr"><span class="dl">Est. Rows</span><span>${node.rows.toLocaleString()}</span></div>`
    html += `<div class="dr"><span class="dl">Row Width</span><span>${node.width} bytes</span></div>`
    if (node.actualTime) {
      html += `<div class="dr"><span class="dl">Actual Time</span><span>${node.actualTime.first}..${node.actualTime.last} ms</span></div>`
      if (node.loops && node.loops > 1) html += `<div class="dr"><span class="dl">Loops</span><span>${node.loops}</span></div>`
    }
    if (node.buffers) {
      html += `<div class="dr"><span class="dl">Shared Hit</span><span>${node.buffers.sharedHit.toLocaleString()}</span></div>`
      html += `<div class="dr"><span class="dl">Shared Read</span><span>${node.buffers.sharedRead.toLocaleString()}</span></div>`
    }
    for (const ann of node.annotations) {
      const ci = ann.indexOf(':')
      html += `<div class="dr"><span class="dl">${ci > 0 ? ann.slice(0, ci) : 'Note'}</span><span>${ci > 0 ? ann.slice(ci + 1).trim() : ann}</span></div>`
    }
    html += `<div class="dr" style="border-top:1px solid #2e2a24;padding-top:4px;margin-top:4px"><span class="dl">Type</span><span>${node.type}</span></div>`
    html += `<div class="dr"><span class="dl">Children</span><span>${node.children.length}</span></div>`
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
        <div className="flex min-h-0 flex-1 flex-col md:w-1/4 md:max-w-sm">
          <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/60 px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-honey-400" />
              <span className="text-[11px] font-500 text-ink-200">Plan Explorer</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={handleSample} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-ink-800 hover:text-ink-200" title="Load sample plan"><Sparkles className="h-2.5 w-2.5" />Sample</button>
              <button onClick={handleClear} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-ink-800 hover:text-ink-200" title="Clear (Esc)"><Eraser className="h-2.5 w-2.5" />Clear</button>
            </div>
          </div>
          <textarea className="flex-1 resize-none border-0 bg-transparent p-3 font-mono text-[12px] leading-relaxed text-ink-200 outline-none placeholder:text-ink-600"
            placeholder="Paste EXPLAIN output here, or drop a .plan file&#10;&#10;Example:&#10;Gather Motion 2:1  (cost=0.00..431.00 rows=1 width=48)&#10;  ->  Hash Join  (cost=0.00..431.00 rows=1 width=48)"
            value={inputText} onChange={handleInputChange} onDragOver={handleDragOver} onDrop={handleDrop} spellCheck={false}
          />
        </div>

        {/* Visualization pane */}
        <div className="relative flex min-h-0 flex-1 flex-col border-t border-ink-800 md:border-l md:border-t-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/60 px-3 py-1.5">
            <div className="flex items-center gap-2 text-[11px] text-ink-400">
              {/* View mode toggle */}
              <div className="flex rounded border border-ink-700 overflow-hidden">
                <button onClick={() => handleViewMode('table')} className={`flex items-center gap-1 px-2 py-0.5 text-[10px] ${viewMode === 'table' ? 'bg-honey-500/20 text-honey-300' : 'text-ink-400 hover:bg-ink-800'}`}><ListTree className="h-3 w-3" />Table</button>
                <button onClick={() => handleViewMode('tree')} className={`flex items-center gap-1 px-2 py-0.5 text-[10px] ${viewMode === 'tree' ? 'bg-honey-500/20 text-honey-300' : 'text-ink-400 hover:bg-ink-800'}`}><Columns3 className="h-3 w-3" />Tree</button>
              </div>
              {/* Metric toggle */}
              {viewMode === 'table' && plan?.tree && (
                <div className="flex rounded border border-ink-700 overflow-hidden">
                  {(['cost', 'rows', 'time'] as Metric[]).map(m => (
                    <button key={m} onClick={() => handleMetric(m)} className={`px-2 py-0.5 text-[10px] ${metric === m ? 'bg-ink-700 text-ink-200' : 'text-ink-500 hover:bg-ink-800'}`}>{m}</button>
                  ))}
                </div>
              )}
              {plan?.tree && (
                <span className="text-ink-500">
                  {plan.summary.totalCost.toFixed(0)} · {plan.summary.nodeCount} nodes · {plan.summary.totalRows.toLocaleString()} rows
                  {plan.summary.planningTime != null && ` · plan ${plan.summary.planningTime}ms`}
                  {plan.summary.executionTime != null && ` · exec ${plan.summary.executionTime}ms`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleShare} disabled={!plan?.tree} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-ink-800 hover:text-ink-200 disabled:opacity-30" title="Copy share URL (⌘⇧C)"><Share2 className="h-2.5 w-2.5" />Share</button>
              {viewMode === 'tree' && <button onClick={handleDownloadSvg} disabled={!plan?.tree} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-ink-800 hover:text-ink-200 disabled:opacity-30" title="Download SVG (⌘S)"><Download className="h-2.5 w-2.5" />SVG</button>}
              <button onClick={handleCopyText} disabled={!plan?.tree} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-ink-800 hover:text-ink-200 disabled:opacity-30" title="Copy as text (⌘⇧T)"><Copy className="h-2.5 w-2.5" />Text</button>
              <button onClick={() => setPlanTextOpen(o => !o)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-ink-800 hover:text-ink-200" title="Toggle plan text reference">{planTextOpen ? <Minimize2 className="h-2.5 w-2.5" /> : <Maximize2 className="h-2.5 w-2.5" />}Ref</button>
            </div>
          </div>

          {/* Plan text reference */}
          {planTextOpen && plan && (
            <div className="border-b border-ink-800 bg-ink-900/80 px-3 py-1.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[9px] font-500 text-ink-500 uppercase tracking-wider">Original Plan</span>
                <button onClick={() => setPlanTextOpen(false)} className="text-ink-500 hover:text-ink-200"><ChevronUp className="h-2.5 w-2.5" /></button>
              </div>
              <pre className="max-h-24 overflow-auto rounded border border-ink-800 bg-ink-950/80 p-2 text-[10px] leading-relaxed text-ink-400 font-mono">{inputText}</pre>
            </div>
          )}

          {/* Main content area */}
          <div className="flex min-h-0 flex-1">
            {/* Tree / Table */}
            <div ref={treeContainerRef} className="relative flex-1 overflow-auto" onDragOver={handleDragOver} onDrop={handleDrop}>
              {!plan?.tree && !error && (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="text-center text-sm text-ink-500">
                    <GitBranch className="mx-auto mb-3 h-10 w-10 text-ink-700" />
                    <p className="mb-2">Paste EXPLAIN output on the left</p>
                    <p className="text-xs text-ink-600">See interactive tree with progress bars here</p>
                  </div>
                </div>
              )}
              {error && (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="max-w-md rounded-lg border border-red-800/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">{error}</div>
                </div>
              )}

              {/* Table View */}
              {plan?.tree && viewMode === 'table' && (
                <div className="divide-y divide-ink-800/50">
                  {flatRows.map((row) => {
                    const val = getMetricValue(row.node, metric)
                    const pct = maxMetric > 0 ? (val / maxMetric) * 100 : 0
                    const isSelected = row.node === selectedNode
                    const isBottleneck = row.node.cost.total === plan.summary.bottleneck?.cost
                    return (
                      <div
                        key={row._id}
                        onClick={() => handleRowClick(row)}
                        className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 text-[11px] transition-colors hover:bg-ink-800/50 ${isSelected ? 'bg-honey-500/10' : ''}`}
                      >
                        {/* Indentation + collapse icon */}
                        <div className="flex shrink-0 items-center" style={{ width: row.depth * 20 + 14 }}>
                          {row.hasChildren ? (
                            <span className="w-3.5 text-center text-[8px] text-ink-500">{row.isCollapsed ? '▶' : '▼'}</span>
                          ) : (
                            <span className="w-3.5" />
                          )}
                        </div>
                        {/* Color dot */}
                        <span className="mt-0.5 block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getNodeColor(row.node.type) }} />
                        {/* Node name */}
                        <span className="min-w-0 flex-1 truncate font-mono text-ink-200">{row.node.label}</span>
                        {/* Bottleneck badge */}
                        {isBottleneck && <span className="shrink-0 rounded bg-red-900/40 px-1 py-0.5 text-[9px] text-red-300">⚠️</span>}
                        {/* Metric value */}
                        <span className="shrink-0 font-mono text-ink-400">{formatMetric(val)}</span>
                        {/* Progress bar */}
                        <div className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-ink-800">
                          <div
                            className="h-full rounded-full transition-all duration-200"
                            style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: getNodeColor(row.node.type) }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* D3 Tree View */}
              {plan?.tree && viewMode === 'tree' && (
                <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block', minHeight: '450px' }} />
              )}
            </div>

            {/* Right side panel: legend or detail */}
            {selectedNode ? (
              <div className="w-60 shrink-0 border-l border-ink-800 bg-ink-900/80 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5">
                  <span className="text-[9px] font-500 text-ink-500 uppercase tracking-wider">Node Detail</span>
                  <button onClick={() => setSelectedNode(null)} className="text-ink-500 hover:text-ink-200 text-[11px]">✕</button>
                </div>
                <div className="p-2.5 text-[11px] leading-relaxed [&_.dr]:flex [&_.dr]:justify-between [&_.dr]:gap-2 [&_.dr]:py-0.5 [&_.dl]:text-ink-500" dangerouslySetInnerHTML={{ __html: buildNodeDetail(selectedNode) }} />
              </div>
            ) : legendOpen && plan?.tree ? (
              <div className="w-52 shrink-0 border-l border-ink-800 bg-ink-900/80 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5">
                  <span className="text-[9px] font-500 text-ink-500 uppercase tracking-wider">Legend</span>
                  <button onClick={() => setLegendOpen(false)} className="text-ink-500 hover:text-ink-200 text-[11px]">✕</button>
                </div>
                <div className="p-2.5 space-y-1.5">
                  {LEGEND_ORDER.map(type => (
                    <div key={type} className="flex items-start gap-1.5">
                      <span className="mt-0.5 block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: NODE_COLORS[type] }} />
                      <div>
                        <div className="text-[10px] font-500 text-ink-200 capitalize">{type}</div>
                        <div className="text-[9px] text-ink-500 leading-tight">{NODE_LABELS[type]}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Re-open legend */}
            {!selectedNode && !legendOpen && plan?.tree && (
              <button onClick={() => setLegendOpen(true)} className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded bg-ink-800 px-2 py-1 text-[10px] text-ink-400 hover:text-ink-200">
                <ChevronDown className="h-2.5 w-2.5" />Legend
              </button>
            )}
          </div>
        </div>
      </div>

      <StatusBar inputChars={inputCharCount} outputChars={outputCharCount} status={statusBarStatus} error={error} durationMs={durationMs} />
    </div>
  )
}