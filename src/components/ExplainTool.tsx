/**
 * ExplainTool — PostgreSQL Plan Explorer.
 *
 * Lazy-loaded ref tool. Parses EXPLAIN output and renders interactive
 * views inspired by explain.dalibo.com (PEV2).
 *
 * Tabs: Plan | Grid | Raw | Query | Stats
 * Plan view: Table (indented with tree connectors) + D3 SVG tree
 * Grid view: Flat table with all metrics
 * Stats view: Aggregate by table, node type, index
 * Detail panel: Tabbed (General | IO & Buffers | Output | Workers | Misc)
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  Copy, Download, Share2, Eraser, Sparkles, GitBranch, ChevronDown, ChevronUp,
  Columns3, ListTree, Table, BarChart3, FileText, Terminal, Database,
  ArrowUpDown, Cpu, Info, Layers, Zap,
} from 'lucide-react'
import * as d3Hierarchy from 'd3-hierarchy'
import * as d3Selection from 'd3-selection'
import * as d3Zoom from 'd3-zoom'
import type { HierarchyNode } from 'd3-hierarchy'

import { parseExplain, formatTreeAsText, type ExplainNode, type ExplainPlan, type NodeType, type Buffers, type ActualTime } from '../engine/explain-parser'
import { buildShareHash, readShareHash } from '../lib/explain-share'
import { useToast } from '../stores/toast-store'
import StatusBar from './StatusBar'
import { saveAs } from 'file-saver'

// ── Constants ─────────────────────────────────────────

const LS_KEY = 'plan-explorer-input'
const LS_VIEW_KEY = 'plan-explorer-view'
const LS_METRIC_KEY = 'plan-explorer-metric'
const LS_TAB_KEY = 'plan-explorer-tab'
const LS_TREE_METRIC_KEY = 'plan-explorer-tree-metric'
const LS_LIVE_KEY = 'plan-explorer-live'
const SAMPLE_PLAN = `Gather Motion 2:1  (cost=0.00..431.00 rows=1 width=48)
  ->  Hash Join  (cost=0.00..431.00 rows=1 width=48)
        Hash Cond: (a.id = b.a_id)
        ->  Seq Scan on a  (cost=0.00..32.60 rows=2260 width=28)
        ->  Hash  (cost=0.00..32.60 rows=2260 width=28)
              ->  Seq Scan on b  (cost=0.00..32.60 rows=2260 width=28)`

const INPUT_SIZE_LIMIT = 200_000

// ── Types ─────────────────────────────────────────────

type Tab = 'plan' | 'grid' | 'raw' | 'query' | 'stats'
type ViewMode = 'table' | 'tree'
type Metric = 'time' | 'rows' | 'estimation' | 'cost' | 'buffers' | 'io'
type DetailTab = 'general' | 'io' | 'output' | 'workers' | 'misc'
type TreeMetric = 'none' | 'duration' | 'rows' | 'cost'

interface FlatRow {
  node: ExplainNode
  depth: number
  _id: string
  isCollapsed: boolean
  hasChildren: boolean
  nodeIndex: number
}

interface GridRow {
  index: number
  node: ExplainNode
  depth: number
  treePrefix: string
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

const METRIC_LABELS: Record<Metric, string> = {
  time: 'Time',
  rows: 'Rows',
  estimation: 'Estim',
  cost: 'Cost',
  buffers: 'Buffers',
  io: 'IO',
}

const TAB_ICONS: Record<Tab, typeof Table> = {
  plan: ListTree,
  grid: Table,
  raw: FileText,
  query: Terminal,
  stats: BarChart3,
}

const TAB_LABELS: Record<Tab, string> = {
  plan: 'Plan',
  grid: 'Grid',
  raw: 'Raw',
  query: 'Query',
  stats: 'Stats',
}

// Node descriptions for the detail panel
const NODE_DESCRIPTIONS: Record<string, string> = {
  'Hash Join': 'Hash Join builds a hash table from the inner relation and then probes it with the outer relation. Best for large, unsorted data sets where one side fits in memory.',
  'Nested Loop': 'Nested Loop iterates over the outer relation and for each row, scans the inner relation. Efficient for small subsets or when the inner side has an index.',
  'Merge Join': 'Merge Join sorts both inputs on the join key and then merges them. Best for already-sorted data or large data sets where sorting is acceptable.',
  'Seq Scan': 'Sequential Scan reads the entire table row by row. Used when the table is small, or when no index exists for the query conditions.',
  'Index Scan': 'Index Scan traverses the index to find matching rows, then fetches them from the heap. Efficient for selective queries.',
  'Index Only Scan': 'Index Only Scan reads directly from the index without touching the heap. Fastest scan type when all needed columns are in the index.',
  'Hash Aggregate': 'HashAggregate groups records together based on a GROUP BY or aggregate function. Uses a hash to organize records by a key.',
  'Group Aggregate': 'GroupAggregate sorts the input first, then processes groups sequentially. Used when data is already sorted or for aggregations on sorted data.',
  'Sort': 'Sort reorders the result set by specified keys. Uses either in-memory quicksort or external merge sort for large data sets.',
  'Incremental Sort': 'Incremental Sort leverages partially sorted input to reduce sorting overhead. More efficient than a full sort when data is already partially ordered.',
  'Hash': 'Hash builds a hash table from the inner relation for use by a Hash Join node above it.',
  'Gather': 'Gather collects results from parallel workers. The coordinator waits for all workers to finish and merges their results.',
  'Limit': 'Limit stops fetching rows after the specified count is reached. Can short-circuit plan nodes below it.',
  'Append': 'Append concatenates the results of multiple sub-plans, typically used for UNION ALL, partitioned tables, or inheritance.',
  'Subquery Scan': 'Subquery Scan wraps a subquery or CTE, materializing the result if needed.',
  'Materialize': 'Materialize evaluates the inner plan once and caches the result in memory. Useful when the inner plan would be re-scanned multiple times.',
  'Result': 'Result node evaluates constant expressions or scalar subqueries that don\'t depend on any table.',
  'Bitmap Heap Scan': 'Bitmap Heap Scan fetches table rows using a bitmap from a Bitmap Index Scan. More efficient than Seq Scan for moderately selective queries.',
  'Bitmap Index Scan': 'Bitmap Index Scan builds a bitmap of matching page locations from the index. Used together with Bitmap Heap Scan.',
  'Bitmap Or': 'Bitmap Or combines multiple bitmap scans with OR logic.',
  'Bitmap And': 'Bitmap And combines multiple bitmap scans with AND logic.',
}

function getNodeDescription(label: string): string {
  for (const [key, desc] of Object.entries(NODE_DESCRIPTIONS)) {
    if (label.startsWith(key)) return desc
  }
  return ''
}

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
    node, depth, _id: id,
    isCollapsed: collapsedIds.has(id),
    hasChildren: node.children.length > 0,
    nodeIndex: 0,
  }]
  if (!collapsedIds.has(id)) {
    for (const child of node.children) {
      rows.push(...flattenTree(child, collapsedIds, depth + 1))
    }
  }
  // Assign indices after flattening
  rows.forEach((r, i) => { r.nodeIndex = i + 1 })
  return rows
}

// Build tree connectors for the table view
function buildTreePrefix(depth: number, siblings: boolean[], isLast: boolean): string {
  let prefix = ''
  for (let i = 0; i < depth; i++) {
    prefix += siblings[i] ? '│ ' : '  '
  }
  prefix += isLast ? '└─' : '├─'
  return prefix
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
    case 'estimation': {
      // Estimation quality: ratio of actual rows to planned rows
      if (node.actualTime) {
        const actualRows = node.rows
        // We need planned rows - stored in cost startup
        return node.details.cost ? 1 : 1
      }
      return 0
    }
    case 'buffers': return node.buffers ? node.buffers.sharedHit + node.buffers.sharedRead : 0
    case 'io': return node.buffers ? node.buffers.sharedRead + node.buffers.tempRead : 0
  }
}

function getMetricValue2(node: ExplainNode, metric: Metric): number {
  // Secondary metric for dual progress bars
  switch (metric) {
    case 'cost': return node.rows
    case 'rows': return node.cost.total
    case 'time': return node.rows
    case 'estimation': return node.cost.total
    case 'buffers': return node.cost.total
    case 'io': return node.cost.total
  }
}

function getMetricUnit(metric: Metric): string {
  switch (metric) {
    case 'time': return 'ms'
    case 'cost': return ''
    case 'rows': return ''
    case 'estimation': return '×'
    case 'buffers': return 'blks'
    case 'io': return 'blks'
  }
}

function formatMetric(value: number): string {
  if (value < 1000) return value.toFixed(2)
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`
  return `${(value / 1_000_000).toFixed(2)}M`
}

function formatMetricShort(value: number): string {
  if (value < 10) return value.toFixed(2)
  if (value < 1000) return value.toFixed(1)
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`
  return `${(value / 1_000_000).toFixed(2)}M`
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + '…'
}

// Extract table name from a scan node label
function extractTableName(label: string): string | null {
  const scanMatch = label.match(/^(?:Seq Scan|Index Scan|Index Only Scan|Bitmap Heap Scan)\s+on\s+(\S+)/i)
  if (scanMatch) return scanMatch[1]
  return null
}

// Extract index name from an index scan label
function extractIndexName(label: string): string | null {
  const idxMatch = label.match(/using\s+(\S+)/i)
  if (idxMatch) return idxMatch[1]
  return null
}

// Compute estimation quality: actual/planned ratio
function computeEstimation(node: ExplainNode): { ratio: number; label: string } | null {
  if (!node.actualTime) return null
  // We need planned rows. Use the cost startup value as a heuristic,
  // or extract from details
  const planned = node.details.rows ? Number(node.details.rows) : null
  // Since we can't easily get planned rows from the current parser,
  // we'll use actual rows vs a heuristic
  // The parser stores the actual rows in node.rows when actualTime is present
  // and the planned rows are overwritten. Let's extract from the raw annotation.
  return null
}

// Get the key info line for a node (table name, join condition, sort key, etc.)
function getNodeKeyInfo(node: ExplainNode): string {
  const tableName = extractTableName(node.label)
  if (tableName) return `on ${tableName}`

  // Look for join conditions, sort keys, etc. in annotations
  for (const ann of node.annotations) {
    if (ann.startsWith('Hash Cond:') || ann.startsWith('Join Cond:') || ann.startsWith('Merge Cond:')) {
      return ann.replace(/^(Hash Cond|Join Cond|Merge Cond):\s*/, 'on ')
    }
    if (ann.startsWith('Sort Key:')) {
      return ann.replace(/^Sort Key:\s*/, 'by ')
    }
    if (ann.startsWith('Filter:')) {
      return ann.replace(/^Filter:\s*/, 'filter: ')
    }
    if (ann.startsWith('Group Key:')) {
      return ann.replace(/^Group Key:\s*/, 'by ')
    }
  }
  return ''
}

// Cheap heuristic: does the text look like an EXPLAIN plan?
function looksLikePlan(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  // Node line starts with optional "->" and has (cost=.. .. rows=.. width=..)
  return /^(?:\s*(?:->\s*)?[\w\s]+\s*\(\s*cost=\d+\.\.\d+\s+rows=\d+\s+width=\d+\))/m.test(trimmed)
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
  const [activeTab, setActiveTab] = useState<Tab>(() => (loadPersisted(LS_TAB_KEY, 'plan') as Tab))
  const [detailTab, setDetailTab] = useState<DetailTab>('general')
  const [queryText, setQueryText] = useState('')
  const [queryStatus, setQueryStatus] = useState<'hidden' | 'auto' | 'manual'>('hidden')
  const [inputCollapsed, setInputCollapsed] = useState(false)
  const [analyzed, setAnalyzed] = useState(false)
  const [livePreview, setLivePreview] = useState(() => loadPersisted(LS_LIVE_KEY, 'off') === 'on')
  const [treeMetric, setTreeMetric] = useState<TreeMetric>(() => (loadPersisted(LS_TREE_METRIC_KEY, 'none') as TreeMetric))

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

  // ── Grid rows with tree connectors ──────────────────

  const gridRows = useMemo(() => {
    if (!plan?.tree) return []
    const rows: GridRow[] = []
    let index = 0
    function walk(node: ExplainNode, depth: number, siblings: boolean[], isLast: boolean) {
      index++
      const prefix = buildTreePrefix(depth, siblings, isLast)
      rows.push({ index, node, depth, treePrefix: prefix })
      for (let i = 0; i < node.children.length; i++) {
        const childSiblings = [...siblings, !isLast]
        walk(node.children[i], depth + 1, childSiblings, i === node.children.length - 1)
      }
    }
    if (plan.tree) {
      walk(plan.tree, 0, [], true)
    }
    return rows
  }, [plan])

  // ── Stats data ──────────────────────────────────────

  interface StatEntry {
    name: string
    count: number
    time: number
    timePct: number
  }

  const statsByTable = useMemo(() => {
    if (!plan?.tree) return []
    const map = new Map<string, { count: number; time: number }>()
    function walk(node: ExplainNode) {
      const table = extractTableName(node.label)
      if (table) {
        const entry = map.get(table) || { count: 0, time: 0 }
        entry.count++
        entry.time += node.actualTime?.last ?? 0
        map.set(table, entry)
      }
      for (const child of node.children) walk(child)
    }
    walk(plan.tree)
    const totalTime = Array.from(map.values()).reduce((s, e) => s + e.time, 0)
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, count: data.count, time: data.time, timePct: totalTime > 0 ? (data.time / totalTime) * 100 : 0 }))
      .sort((a, b) => b.time - a.time)
  }, [plan])

  const statsByNodeType = useMemo(() => {
    if (!plan?.tree) return []
    const map = new Map<string, { count: number; time: number }>()
    function walk(node: ExplainNode) {
      const type = node.type
      const entry = map.get(type) || { count: 0, time: 0 }
      entry.count++
      entry.time += node.actualTime?.last ?? 0
      map.set(type, entry)
      for (const child of node.children) walk(child)
    }
    walk(plan.tree)
    const totalTime = Array.from(map.values()).reduce((s, e) => s + e.time, 0)
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, count: data.count, time: data.time, timePct: totalTime > 0 ? (data.time / totalTime) * 100 : 0 }))
      .sort((a, b) => b.time - a.time)
  }, [plan])

  const statsByIndex = useMemo(() => {
    if (!plan?.tree) return []
    const map = new Map<string, { count: number; time: number }>()
    function walk(node: ExplainNode) {
      const idx = extractIndexName(node.label)
      if (idx) {
        const entry = map.get(idx) || { count: 0, time: 0 }
        entry.count++
        entry.time += node.actualTime?.last ?? 0
        map.set(idx, entry)
      }
      for (const child of node.children) walk(child)
    }
    walk(plan.tree)
    const totalTime = Array.from(map.values()).reduce((s, e) => s + e.time, 0)
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, count: data.count, time: data.time, timePct: totalTime > 0 ? (data.time / totalTime) * 100 : 0 }))
      .sort((a, b) => b.time - a.time)
  }, [plan])

  const statsByFunction = useMemo(() => {
    if (!plan?.tree) return []
    const map = new Map<string, { count: number; time: number }>()
    function walk(node: ExplainNode) {
      // Look for function calls in annotations (e.g., count(*), sum(), etc.)
      for (const ann of node.annotations) {
        const fnMatch = ann.match(/\b(\w+)\s*\(/g)
        if (fnMatch) {
          for (const fn of fnMatch) {
            const fnName = fn.replace(/\s*\($/, '')
            if (['count', 'sum', 'avg', 'min', 'max', 'coalesce', 'nullif', 'row_number', 'rank', 'dense_rank', 'lag', 'lead', 'first_value', 'last_value'].includes(fnName.toLowerCase())) {
              const entry = map.get(fnName) || { count: 0, time: 0 }
              entry.count++
              entry.time += node.actualTime?.last ?? 0
              map.set(fnName, entry)
            }
          }
        }
      }
      for (const child of node.children) walk(child)
    }
    walk(plan.tree)
    const totalTime = Array.from(map.values()).reduce((s, e) => s + e.time, 0)
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, count: data.count, time: data.time, timePct: totalTime > 0 ? (data.time / totalTime) * 100 : 0 }))
      .sort((a, b) => b.time - a.time)
  }, [plan])

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
      setQueryText('')
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

      // Try to extract SQL query from input
      // Look for lines before EXPLAIN keyword
      const explainIdx = trimmed.search(/\bEXPLAIN\b/i)
      if (explainIdx > 0) {
        const beforeExplain = trimmed.slice(0, explainIdx).trim()
        if (beforeExplain && !beforeExplain.match(/^(?:Planning|Execution|Trigger)/i)) {
          setQueryText(beforeExplain)
          setQueryStatus('auto')
        } else {
          setQueryText('')
          setQueryStatus('hidden')
        }
      } else {
        setQueryText('')
        setQueryStatus('hidden')
      }
    } catch (e) {
      setError(`Parse error: ${e instanceof Error ? e.message : String(e)}`)
      setStatus('error')
      setPlan(null)
    }
  }, [toast])

  // ── Analyze (manual trigger) ────────────────────────

  const handleAnalyze = useCallback(() => {
    const trimmed = inputText.trim()
    if (!trimmed) return
    if (trimmed.length > INPUT_SIZE_LIMIT) {
      toast.push(`Input too large — max ${INPUT_SIZE_LIMIT.toLocaleString()} chars`, { variant: 'error' })
      return
    }
    parseInput(trimmed)
    setAnalyzed(true)
    setInputCollapsed(true)
  }, [inputText, parseInput, toast])

  // ── Input change ────────────────────────────────────

  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setInputText(text)
    savePersisted(LS_KEY, text)
    // If input becomes empty, clear the rendered plan
    if (!text.trim()) {
      setAnalyzed(false)
      setInputCollapsed(false)
      setPlan(null)
      setError(null)
      setStatus('empty')
      setDurationMs(null)
      setSelectedNode(null)
      setCollapsedIds(new Set())
      return
    }
    if (livePreview) {
      // Live mode: parse instantly, keep pane open while editing
      parseInput(text)
      setAnalyzed(true)
    } else {
      // Manual mode: mark dirty, user clicks Analyze
      setAnalyzed(false)
      setInputCollapsed(false)
    }
  }, [livePreview, parseInput])

  // ── Sample ──────────────────────────────────────────

  const handleSample = useCallback(() => {
    setInputText(SAMPLE_PLAN)
    savePersisted(LS_KEY, SAMPLE_PLAN)
    parseInput(SAMPLE_PLAN)
    setAnalyzed(true)
    setInputCollapsed(true)
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
    setQueryText('')
    setInputCollapsed(false)
    setAnalyzed(false)
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
      setAnalyzed(true)
      setInputCollapsed(true)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [parseInput])

  // ── Tab change ──────────────────────────────────────

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab)
    savePersisted(LS_TAB_KEY, tab)
  }, [])

  // ── View mode toggle ────────────────────────────────

  const handleViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    savePersisted(LS_VIEW_KEY, mode)
  }, [])

  const handleMetric = useCallback((m: Metric) => {
    setMetric(m)
    savePersisted(LS_METRIC_KEY, m)
  }, [])

  const handleTreeMetric = useCallback((m: TreeMetric) => {
    setTreeMetric(m)
    savePersisted(LS_TREE_METRIC_KEY, m)
  }, [])

  const handleToggleLive = useCallback(() => {
    setLivePreview(prev => {
      const next = !prev
      savePersisted(LS_LIVE_KEY, next ? 'on' : 'off')
      return next
    })
  }, [])

  // ── Collapse / Select ───────────────────────────────

  // Build parent map for auto-expand
  const parentMap = useMemo(() => {
    const map = new Map<string, string>()
    if (!plan?.tree) return map
    function walk(node: ExplainNode, parentId?: string) {
      const id = (node as any)._id
      if (parentId) map.set(id, parentId)
      for (const child of node.children) walk(child, id)
    }
    walk(plan.tree)
    return map
  }, [plan])

  // Get ancestor IDs for a node (walks up to root)
  const getAncestorIds = useCallback((nodeId: string): string[] => {
    const ancestors: string[] = []
    let currentId = nodeId
    let maxIter = 100
    while (maxIter > 0) {
      const parentId = parentMap.get(currentId)
      if (!parentId) break
      ancestors.push(parentId)
      currentId = parentId
      maxIter--
    }
    return ancestors
  }, [parentMap])

  const handleRowSelect = useCallback((row: FlatRow) => {
    // Select (or deselect if same node)
    setSelectedNode(prev => row.node === prev ? null : row.node)
    setDetailTab('general')
    // Auto-expand ancestors so the selected node is visible
    const ancestors = getAncestorIds(row._id)
    if (ancestors.length > 0) {
      setCollapsedIds(prev => {
        const next = new Set(prev)
        for (const aid of ancestors) next.delete(aid)
        return next
      })
    }
  }, [getAncestorIds])

  const handleCollapseToggle = useCallback((row: FlatRow, e: React.MouseEvent) => {
    e.stopPropagation()
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(row._id)) next.delete(row._id)
      else next.add(row._id)
      return next
    })
  }, [])

  // ── D3 tree rendering (block-based, Dalibo-style) ──

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

    // Block dimensions
    const BLOCK_W = 170
    const BLOCK_H = 52
    const VERT_GAP = 40

    const treeLayout = d3Hierarchy.tree<ExplainNode>()
      .nodeSize([BLOCK_W + 30, BLOCK_H + VERT_GAP])
      .separation((a, b) => a.parent === b.parent ? 1.2 : 2)
    treeLayout(root)

    // Center the tree horizontally
    let xMin = root.x! - BLOCK_W / 2
    let xMax = root.x! + BLOCK_W / 2
    root.each((d: HierarchyNode<ExplainNode>) => {
      const left = d.x! - BLOCK_W / 2
      const right = d.x! + BLOCK_W / 2
      if (left < xMin) xMin = left
      if (right > xMax) xMax = right
    })
    const treeW = xMax - xMin
    const offsetX = (width - treeW) / 2 - xMin

    const initialTransform = d3Zoom.zoomIdentity.translate(offsetX, 30).scale(0.85)
    void svg.call(zoomBehavior.transform as unknown as (sel: typeof svg, t: typeof initialTransform) => void, initialTransform)

    // Bottleneck
    let maxCost = 0
    let maxNodeId = ''
    root.each((d: HierarchyNode<ExplainNode>) => {
      if (d.data.cost.total > maxCost) { maxCost = d.data.cost.total; maxNodeId = (d.data as any)._id || '' }
    })

    // Find max metric value for tree coloring
    function getTreeMetricValue(node: ExplainNode): number {
      switch (treeMetric) {
        case 'duration': return node.actualTime?.last ?? 0
        case 'rows': return node.rows
        case 'cost': return node.cost.total
        default: return 0
      }
    }
    let maxTreeMetric = 0
    root.each((d: HierarchyNode<ExplainNode>) => {
      const v = getTreeMetricValue(d.data)
      if (v > maxTreeMetric) maxTreeMetric = v
    })

    // Links — step paths (vertical → horizontal → vertical)
    g.append<SVGGElement>('g')
      .selectAll<SVGPathElement, d3Hierarchy.HierarchyLink<ExplainNode>>('path')
      .data(root.links()).enter().append<SVGPathElement>('path')
      .attr('d', (d: d3Hierarchy.HierarchyLink<ExplainNode>) => {
        const sx = d.source.x, sy = d.source.y! + BLOCK_H / 2
        const tx = d.target.x, ty = d.target.y! - BLOCK_H / 2
        const my = (sy + ty) / 2
        return `M${sx},${sy} V${my} H${tx} V${ty}`
      })
      .attr('fill', 'none').attr('stroke', '#2e2a24').attr('stroke-width', 2)

    // Nodes
    const node = g.append<SVGGElement>('g')
      .selectAll<SVGGElement, d3Hierarchy.HierarchyNode<ExplainNode>>('g')
      .data(root.descendants()).enter().append<SVGGElement>('g')
      .attr('transform', (d: d3Hierarchy.HierarchyNode<ExplainNode>) => `translate(${d.x},${d.y})`)

    // Block background rect
    node.append('rect')
      .attr('x', -BLOCK_W / 2).attr('y', -BLOCK_H / 2)
      .attr('width', BLOCK_W).attr('height', BLOCK_H)
      .attr('rx', 6).attr('ry', 6)
      .attr('fill', (d: d3Hierarchy.HierarchyNode<ExplainNode>) => {
        const baseColor = getNodeColor(d.data.type)
        if (treeMetric === 'none' || maxTreeMetric === 0) return baseColor + '40' // 25% opacity
        const v = getTreeMetricValue(d.data)
        const intensity = v / maxTreeMetric
        // Interpolate between 15% and 60% opacity based on metric value
        const alpha = Math.round(0.15 + intensity * 0.45)
        const hex = alpha.toString(16).padStart(2, '0')
        return baseColor + hex
      })
      .attr('stroke', (d: d3Hierarchy.HierarchyNode<ExplainNode>) => {
        if (d.data === selectedNode) return '#e7ac34'
        if ((d.data as any)._id === maxNodeId) return '#ef4444'
        return '#1d1a16'
      })
      .attr('stroke-width', (d: d3Hierarchy.HierarchyNode<ExplainNode>) =>
        d.data === selectedNode || (d.data as any)._id === maxNodeId ? 2.5 : 1.5)

    // Node name (bold, top-left)
    node.append('text')
      .attr('x', -BLOCK_W / 2 + 8).attr('y', -BLOCK_H / 2 + 16)
      .attr('font-size', '11px').attr('font-weight', '600')
      .attr('font-family', "'JetBrains Mono', ui-monospace, monospace")
      .attr('fill', '#e4e0d6')
      .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => truncateText(d.data.label, 20))

    // Node number (#1, #2, etc.) — top-right
    // Find the node index
    let nodeIndex = 0
    const idToIndex = new Map<string, number>()
    root.eachBefore((d: HierarchyNode<ExplainNode>) => {
      nodeIndex++
      idToIndex.set((d.data as any)._id, nodeIndex)
    })

    node.append('text')
      .attr('x', BLOCK_W / 2 - 8).attr('y', -BLOCK_H / 2 + 16)
      .attr('text-anchor', 'end')
      .attr('font-size', '9px').attr('fill', '#78716c')
      .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => {
        const idx = idToIndex.get((d.data as any)._id) || 0
        return `#${idx}`
      })

    // Key info (small, below name)
    node.append('text')
      .attr('x', -BLOCK_W / 2 + 8).attr('y', -BLOCK_H / 2 + 30)
      .attr('font-size', '8px').attr('fill', '#78716c')
      .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => {
        const keyInfo = getNodeKeyInfo(d.data)
        if (keyInfo) return truncateText(keyInfo, 28)
        return ''
      })

    // Metric value (bottom-right)
    if (treeMetric !== 'none') {
      node.append('text')
        .attr('x', BLOCK_W / 2 - 8).attr('y', -BLOCK_H / 2 + 30)
        .attr('text-anchor', 'end')
        .attr('font-size', '8px').attr('fill', '#a8a29e')
        .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => {
          const v = getTreeMetricValue(d.data)
          if (v === 0) return ''
          return `${treeMetric}=${formatMetricShort(v)}`
        })
    }

    // Collapse indicator (left edge)
    node.filter((d: d3Hierarchy.HierarchyNode<ExplainNode>) => {
      const orig = findOriginalNode(currentPlan, (d.data as any)._id)
      return !!(orig && orig.children.length > 0)
    }).append('text')
      .attr('x', -BLOCK_W / 2 - 10).attr('y', 4)
      .attr('font-size', '9px').attr('fill', '#78716c').attr('text-anchor', 'middle')
      .text((d: d3Hierarchy.HierarchyNode<ExplainNode>) => collapsedIds.has((d.data as any)._id) ? '▶' : '▼')

    // Click on block → select; click on collapse indicator → toggle collapse
    node.on('click', function (event: MouseEvent, d: d3Hierarchy.HierarchyNode<ExplainNode>) {
      const target = event.target as SVGElement
      const isCollapseText = target.tagName === 'text' && (target.textContent === '▶' || target.textContent === '▼')

      if (isCollapseText) {
        // Toggle collapse only
        event.stopPropagation()
        const id = (d.data as any)._id
        setCollapsedIds(prev => {
          const n = new Set(prev)
          if (n.has(id)) n.delete(id); else n.add(id)
          return n
        })
      } else {
        // Select only (with auto-expand ancestors)
        const id = (d.data as any)._id
        setSelectedNode(d.data === selectedNode ? null : d.data)
        const ancestors = getAncestorIds(id)
        if (ancestors.length > 0) {
          setCollapsedIds(prev => {
            const next = new Set(prev)
            for (const aid of ancestors) next.delete(aid)
            return next
          })
        }
      }
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
      d3Selection.select(this).select('rect').attr('stroke', '#e7ac34').attr('stroke-width', 2.5)
    })
    node.on('mousemove', function (this: SVGGElement, event: MouseEvent) {
      tooltip.style('left', `${event.offsetX + 15}px`).style('top', `${event.offsetY - 10}px`)
    })
    node.on('mouseleave', function (this: SVGGElement, _e: MouseEvent, d: d3Hierarchy.HierarchyNode<ExplainNode>) {
      d3Selection.select(this).select('rect')
        .attr('stroke', d.data === selectedNode ? '#e7ac34' : (d.data as any)._id === maxNodeId ? '#ef4444' : '#1d1a16')
        .attr('stroke-width', d.data === selectedNode || (d.data as any)._id === maxNodeId ? 2.5 : 1.5)
      tooltip.style('display', 'none')
    })

    return () => { tooltip.remove() }
  }, [plan, viewMode, selectedNode, collapsedIds, treeMetric, getAncestorIds])

  // ── Keyboard shortcuts ──────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const m = e.metaKey || e.ctrlKey
      if (m && e.shiftKey && e.key === 'c') { e.preventDefault(); handleShare(); return }
      if (m && e.key === 's') { e.preventDefault(); handleDownloadSvg(); return }
      if (m && e.shiftKey && e.key === 't') { e.preventDefault(); handleCopyText(); return }
      if (m && e.key === 'Enter') { e.preventDefault(); handleAnalyze(); return }
      if (e.key === 'Escape' && inputText) { e.preventDefault(); handleClear(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, handleAnalyze])

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
        setAnalyzed(true)
        setInputCollapsed(true)
      }
    }
    reader.readAsText(file)
  }, [parseInput])

  // ── Build detail panel ──────────────────────────────

  function buildGeneralDetail(node: ExplainNode): string {
    const keyInfo = getNodeKeyInfo(node)
    let html = `<div class="flex items-center gap-2 mb-2">`
    html += `<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:${getNodeColor(node.type)}"></span>`
    html += `<span style="font-weight:600;font-size:13px;color:#e4e0d6">${node.label}</span>`
    html += `</div>`
    if (keyInfo) {
      html += `<div style="font-size:11px;color:#a8a29e;margin-bottom:6px;padding:4px 8px;background:#1d1a16;border-radius:4px;border:1px solid #2e2a24">${keyInfo}</div>`
    }
    const desc = getNodeDescription(node.label)
    if (desc) {
      html += `<div style="font-size:10px;color:#78716c;line-height:1.5;margin-bottom:8px;padding:6px 8px;background:#1d1a16;border-radius:4px;border:1px solid #2e2a24">${desc}</div>`
    }

    // Timing
    if (node.actualTime) {
      const totalTime = plan?.summary.executionTime || node.actualTime.last
      const pct = totalTime > 0 ? ((node.actualTime.last / totalTime) * 100).toFixed(1) : '0.0'
      html += `<div class="dr"><span class="dl">Timing</span><span style="color:#e4e0d6">${node.actualTime.first}..${node.actualTime.last} ms</span><span class="ml-2 text-[10px] text-ink-500">${pct}%</span></div>`
    }

    // Rows
    // The parser stores actual rows when EXPLAIN ANALYZE, planned rows otherwise
    // We don't have both separately, so show what we have
    html += `<div class="dr"><span class="dl">Rows</span><span style="color:#e4e0d6">${node.rows.toLocaleString()}</span></div>`
    if (node.actualTime) {
      html += `<div class="dr"><span class="dl">Row Width</span><span style="color:#e4e0d6">${node.width} bytes</span></div>`
    }

    // Cost
    html += `<div class="dr"><span class="dl">Cost</span><span style="color:#e4e0d6">${node.cost.startup.toFixed(2)}</span><span style="color:#78716c;font-size:10px"> (Total: ${node.cost.total.toFixed(2)})</span></div>`

    // Loops
    if (node.loops && node.loops > 1) {
      html += `<div class="dr"><span class="dl">Loops</span><span style="color:#e4e0d6">${node.loops}</span></div>`
    }

    // Annotations
    for (const ann of node.annotations) {
      const ci = ann.indexOf(':')
      const label = ci > 0 ? ann.slice(0, ci) : 'Note'
      const val = ci > 0 ? ann.slice(ci + 1).trim() : ann
      html += `<div class="dr"><span class="dl">${label}</span><span style="color:#78716c;font-size:10px;text-align:right">${val}</span></div>`
    }

    // Node type
    html += `<div class="dr" style="border-top:1px solid #2e2a24;padding-top:4px;margin-top:4px"><span class="dl">Node Type</span><span style="color:#78716c">${node.type}</span></div>`
    html += `<div class="dr"><span class="dl">Children</span><span style="color:#78716c">${node.children.length}</span></div>`

    return html
  }

  function buildIODetail(node: ExplainNode): string {
    if (!node.buffers) {
      return `<div style="color:#78716c;font-size:11px;padding:12px;text-align:center">No buffer information available. Enable BUFFERS in EXPLAIN (ANALYZE, BUFFERS).</div>`
    }
    const b = node.buffers
    let html = ''
    html += `<div class="dr"><span class="dl">Shared Hit</span><span style="color:#e4e0d6">${b.sharedHit.toLocaleString()}</span></div>`
    html += `<div class="dr"><span class="dl">Shared Read</span><span style="color:#e4e0d6">${b.sharedRead.toLocaleString()}</span></div>`
    html += `<div class="dr"><span class="dl">Shared Written</span><span style="color:#e4e0d6">${b.sharedWritten.toLocaleString()}</span></div>`
    html += `<div class="dr" style="border-top:1px solid #2e2a24;padding-top:4px;margin-top:4px"><span class="dl">Local Hit</span><span style="color:#e4e0d6">${b.localHit.toLocaleString()}</span></div>`
    html += `<div class="dr"><span class="dl">Local Read</span><span style="color:#e4e0d6">${b.localRead.toLocaleString()}</span></div>`
    html += `<div class="dr" style="border-top:1px solid #2e2a24;padding-top:4px;margin-top:4px"><span class="dl">Temp Read</span><span style="color:#e4e0d6">${b.tempRead.toLocaleString()}</span></div>`
    html += `<div class="dr"><span class="dl">Temp Written</span><span style="color:#e4e0d6">${b.tempWritten.toLocaleString()}</span></div>`
    const total = b.sharedHit + b.sharedRead + b.sharedWritten + b.localHit + b.localRead + b.tempRead + b.tempWritten
    html += `<div class="dr" style="border-top:1px solid #2e2a24;padding-top:4px;margin-top:4px"><span class="dl">Total Blocks</span><span style="color:#e4e0d6;font-weight:600">${total.toLocaleString()}</span></div>`
    if (total > 0) {
      const hitRate = ((b.sharedHit + b.localHit) / total * 100).toFixed(1)
      html += `<div class="dr"><span class="dl">Cache Hit Rate</span><span style="color:#22c55e">${hitRate}%</span></div>`
    }
    return html
  }

  function buildOutputDetail(node: ExplainNode): string {
    // Output columns from annotations
    const outputAnn = node.annotations.find(a => a.startsWith('Output:'))
    if (outputAnn) {
      const cols = outputAnn.replace(/^Output:\s*/, '')
      let html = `<div style="font-size:11px;color:#a8a29e;margin-bottom:6px">Output columns</div>`
      html += `<div style="font-size:10px;color:#e4e0d6;font-family:monospace;padding:6px 8px;background:#1d1a16;border-radius:4px;border:1px solid #2e2a24;line-height:1.6">${cols}</div>`
      return html
    }

    // Filter conditions
    const filterAnn = node.annotations.find(a => a.startsWith('Filter:'))
    if (filterAnn) {
      const filter = filterAnn.replace(/^Filter:\s*/, '')
      let html = `<div style="font-size:11px;color:#a8a29e;margin-bottom:6px">Filter condition</div>`
      html += `<div style="font-size:10px;color:#e4e0d6;font-family:monospace;padding:6px 8px;background:#1d1a16;border-radius:4px;border:1px solid #2e2a24;line-height:1.6">${filter}</div>`
      return html
    }

    // Sort keys
    const sortAnn = node.annotations.find(a => a.startsWith('Sort Key:'))
    if (sortAnn) {
      const key = sortAnn.replace(/^Sort Key:\s*/, '')
      let html = `<div style="font-size:11px;color:#a8a29e;margin-bottom:6px">Sort key</div>`
      html += `<div style="font-size:10px;color:#e4e0d6;font-family:monospace;padding:6px 8px;background:#1d1a16;border-radius:4px;border:1px solid #2e2a24;line-height:1.6">${key}</div>`
      return html
    }

    // Join conditions
    const joinAnn = node.annotations.find(a => a.startsWith('Hash Cond:') || a.startsWith('Join Cond:') || a.startsWith('Merge Cond:'))
    if (joinAnn) {
      const cond = joinAnn.replace(/^(Hash Cond|Join Cond|Merge Cond):\s*/, '')
      let html = `<div style="font-size:11px;color:#a8a29e;margin-bottom:6px">Join condition</div>`
      html += `<div style="font-size:10px;color:#e4e0d6;font-family:monospace;padding:6px 8px;background:#1d1a16;border-radius:4px;border:1px solid #2e2a24;line-height:1.6">${cond}</div>`
      return html
    }

    // Group keys
    const groupAnn = node.annotations.find(a => a.startsWith('Group Key:'))
    if (groupAnn) {
      const key = groupAnn.replace(/^Group Key:\s*/, '')
      let html = `<div style="font-size:11px;color:#a8a29e;margin-bottom:6px">Group key</div>`
      html += `<div style="font-size:10px;color:#e4e0d6;font-family:monospace;padding:6px 8px;background:#1d1a16;border-radius:4px;border:1px solid #2e2a24;line-height:1.6">${key}</div>`
      return html
    }

    return `<div style="color:#78716c;font-size:11px;padding:12px;text-align:center">No output/condition details available for this node.</div>`
  }

  function buildWorkersDetail(node: ExplainNode): string {
    if (!node.actualTime || !node.loops) {
      return `<div style="color:#78716c;font-size:11px;padding:12px;text-align:center">No worker information available. Enable EXPLAIN (ANALYZE) for parallel worker details.</div>`
    }
    let html = ''
    html += `<div class="dr"><span class="dl">Loops</span><span style="color:#e4e0d6">${node.loops}</span></div>`
    if (node.actualTime) {
      html += `<div class="dr"><span class="dl">Actual Time</span><span style="color:#e4e0d6">${node.actualTime.first}..${node.actualTime.last} ms</span></div>`
      const avgPerLoop = node.loops > 1 ? (node.actualTime.last / node.loops).toFixed(2) : '-'
      html += `<div class="dr"><span class="dl">Avg per Loop</span><span style="color:#e4e0d6">${avgPerLoop} ms</span></div>`
    }
    return html
  }

  function buildMiscDetail(node: ExplainNode): string {
    let html = ''
    html += `<div class="dr"><span class="dl">Node Type</span><span style="color:#78716c">${node.type}</span></div>`
    html += `<div class="dr"><span class="dl">Startup Cost</span><span style="color:#e4e0d6">${node.cost.startup}</span></div>`
    html += `<div class="dr"><span class="dl">Total Cost</span><span style="color:#e4e0d6">${node.cost.total}</span></div>`
    html += `<div class="dr"><span class="dl">Est. Rows</span><span style="color:#e4e0d6">${node.rows.toLocaleString()}</span></div>`
    html += `<div class="dr"><span class="dl">Row Width</span><span style="color:#e4e0d6">${node.width} bytes</span></div>`
    html += `<div class="dr"><span class="dl">Children</span><span style="color:#78716c">${node.children.length}</span></div>`
    html += `<div class="dr"><span class="dl">Depth</span><span style="color:#78716c">${node.depth}</span></div>`
    return html
  }

  // ── Render ──────────────────────────────────────────

  const inputCharCount = inputText.length
  const outputCharCount = plan?.tree ? plan.summary.nodeCount : 0
  const statusBarStatus = error ? 'error' : status === 'processing' ? 'processing' : status === 'ok' ? 'ok' : status === 'empty' ? 'empty' : 'idle'

  const TABS: Tab[] = ['plan', 'grid', 'raw', 'query', 'stats']

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Input pane — auto-collapses when plan parsed */}
        <div className={`flex min-h-0 flex-col border-r border-ink-800 transition-all duration-200 ${inputCollapsed ? 'md:w-8 md:max-w-8' : 'md:w-1/4 md:max-w-sm'}`}>
          {inputCollapsed ? (
            /* Collapsed: thin strip */
            <div className="flex flex-col items-center py-1 cursor-pointer" onClick={() => setInputCollapsed(false)} title="Expand input pane (click)">
              <GitBranch className="h-4 w-4 text-honey-400 mb-0.5" />
              <span className="text-[8px] text-ink-500 writing-mode-vertical" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>Input</span>
              {!analyzed && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-honey-400" title="Input changed — re-analyze" />}
            </div>
          ) : (
            /* Expanded: full input pane */
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/60 px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5 text-honey-400" />
                  <span className="text-[11px] font-500 text-ink-200">Plan Explorer</span>
                </div>
                <div className="flex items-center gap-0.5">
                  {/* Live preview toggle */}
                  <button
                    onClick={handleToggleLive}
                    title={livePreview ? 'Live preview ON — auto-parse on paste' : 'Live preview OFF — parse via Analyze button'}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                      livePreview ? 'bg-honey-500/20 text-honey-300' : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'
                    }`}
                  >
                    <Zap className="h-2.5 w-2.5" />
                    <span className={livePreview ? '' : 'text-ink-600'}>Live</span>
                  </button>
                  <button onClick={handleSample} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-ink-800 hover:text-ink-200" title="Load sample plan"><Sparkles className="h-2.5 w-2.5" />Sample</button>
                  <button onClick={handleClear} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-ink-800 hover:text-ink-200" title="Clear (Esc)"><Eraser className="h-2.5 w-2.5" />Clear</button>
                  {/* Hide button — always visible when there's input */}
                  {inputText.trim() && (
                    <button
                      onClick={() => setInputCollapsed(true)}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                      title="Hide input pane"
                    >
                      ◀ Hide
                    </button>
                  )}
                </div>
              </div>
              {/* Validation status line */}
              <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/40 px-3 py-1">
                {inputText.trim() ? (
                  analyzed ? (
                    <span className="flex items-center gap-1 text-[9px] text-green-400">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                      {livePreview ? 'Live' : 'Analyzed'} · {plan?.summary.nodeCount ?? 0} nodes
                      {!plan && <span className="text-red-400">· failed</span>}
                    </span>
                  ) : looksLikePlan(inputText) ? (
                    <span className="flex items-center gap-1 text-[9px] text-honey-300">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-honey-400" />
                      Plan detected — click Analyze
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[9px] text-red-400">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                      Not a valid plan
                    </span>
                  )
                ) : (
                  <span className="text-[9px] text-ink-600">Paste EXPLAIN output</span>
                )}
                <span className="flex items-center gap-2">
                  {livePreview && !analyzed && (
                    <span className="text-[9px] text-honey-300">⚡ live</span>
                  )}
                  {inputText.trim().length > 0 && (
                    <span className="text-[9px] text-ink-600">{inputText.length.toLocaleString()} chars</span>
                  )}
                </span>
              </div>
              <textarea className="flex-1 resize-none border-0 bg-transparent p-3 font-mono text-[12px] leading-relaxed text-ink-200 outline-none placeholder:text-ink-600"
                placeholder="Paste EXPLAIN output here, or drop a .plan file&#10;&#10;Example:&#10;Gather Motion 2:1  (cost=0.00..431.00 rows=1 width=48)&#10;  ->  Hash Join  (cost=0.00..431.00 rows=1 width=48)"
                value={inputText} onChange={handleInputChange} onDragOver={handleDragOver} onDrop={handleDrop} spellCheck={false}
              />
              {/* Analyze button */}
              <div className="border-t border-ink-800 bg-ink-900/60 px-3 py-2">
                <button
                  onClick={handleAnalyze}
                  disabled={!inputText.trim()}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-600 transition-colors ${
                    inputText.trim() && looksLikePlan(inputText)
                      ? 'bg-honey-500 text-ink-950 hover:bg-honey-400'
                      : 'bg-ink-700 text-ink-300 hover:bg-ink-600'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <Zap className="h-3 w-3" />
                  {analyzed ? 'Re-analyze' : 'Analyze'}
                  <span className="ml-1 rounded bg-ink-950/30 px-1 py-0.5 text-[8px] font-400">⌘↵</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Visualization pane */}
        <div className="relative flex min-h-0 flex-1 flex-col border-t border-ink-800 md:border-l md:border-t-0">
          {/* Header bar — execution/planning time + IO */}
          {plan && (
            <div className="flex items-center gap-3 border-b border-ink-800 bg-ink-900/80 px-3 py-1 text-[10px] text-ink-400">
              {plan.summary.executionTime != null && (
                <span className="flex items-center gap-1">
                  <Zap className="h-2.5 w-2.5 text-green-500" />
                  <span>Execution time: <span className="font-mono text-ink-200">{plan.summary.executionTime}ms</span></span>
                </span>
              )}
              {plan.summary.planningTime != null && (
                <span className="flex items-center gap-1">
                  <Cpu className="h-2.5 w-2.5 text-blue-400" />
                  <span>Planning time: <span className="font-mono text-ink-200">{plan.summary.planningTime}ms</span></span>
                </span>
              )}
              <span className="flex items-center gap-1">
                <Info className="h-2.5 w-2.5 text-ink-500" />
                <span>{plan.summary.totalCost.toFixed(0)} · {plan.summary.nodeCount} nodes · {plan.summary.totalRows.toLocaleString()} rows</span>
              </span>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/60 px-1">
            <div className="flex items-center">
              {TABS.map(tab => {
                const Icon = TAB_ICONS[tab]
                return (
                  <button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-500 transition-colors ${
                      activeTab === tab
                        ? 'border-b-2 border-honey-400 text-honey-300 bg-honey-500/10'
                        : 'text-ink-500 hover:text-ink-200 hover:bg-ink-800/50'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {TAB_LABELS[tab]}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-1 pr-1">
              {activeTab === 'plan' && (
                <>
                  {/* View mode toggle */}
                  <div className="flex rounded border border-ink-700 overflow-hidden">
                    <button onClick={() => handleViewMode('table')} className={`flex items-center gap-1 px-2 py-0.5 text-[9px] ${viewMode === 'table' ? 'bg-honey-500/20 text-honey-300' : 'text-ink-400 hover:bg-ink-800'}`}><ListTree className="h-2.5 w-2.5" />Table</button>
                    <button onClick={() => handleViewMode('tree')} className={`flex items-center gap-1 px-2 py-0.5 text-[9px] ${viewMode === 'tree' ? 'bg-honey-500/20 text-honey-300' : 'text-ink-400 hover:bg-ink-800'}`}><Columns3 className="h-2.5 w-2.5" />Tree</button>
                  </div>
                  {/* Metric toggle */}
                  {viewMode === 'table' && plan?.tree && (
                    <div className="flex rounded border border-ink-700 overflow-hidden">
                      {(Object.keys(METRIC_LABELS) as Metric[]).map(m => (
                        <button key={m} onClick={() => handleMetric(m)} className={`px-1.5 py-0.5 text-[9px] ${metric === m ? 'bg-ink-700 text-ink-200' : 'text-ink-500 hover:bg-ink-800'}`} title={METRIC_LABELS[m]}>{m === 'time' ? 'ms' : m === 'estimation' ? '~' : m.slice(0, 2)}</button>
                      ))}
                    </div>
                  )}
                  {/* Tree metric toggle */}
                  {viewMode === 'tree' && plan?.tree && (
                    <div className="flex rounded border border-ink-700 overflow-hidden">
                      {(['none', 'duration', 'rows', 'cost'] as TreeMetric[]).map(m => (
                        <button key={m} onClick={() => handleTreeMetric(m)} className={`px-1.5 py-0.5 text-[9px] ${treeMetric === m ? 'bg-ink-700 text-ink-200' : 'text-ink-500 hover:bg-ink-800'}`} title={m}>{m === 'none' ? '—' : m.slice(0, 3)}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {/* Share / Download actions */}
              {plan?.tree && (
                <>
                  <button onClick={handleShare} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-ink-400 hover:bg-ink-800 hover:text-ink-200" title="Copy share URL (⌘⇧C)"><Share2 className="h-2.5 w-2.5" /></button>
                  {viewMode === 'tree' && activeTab === 'plan' && <button onClick={handleDownloadSvg} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-ink-400 hover:bg-ink-800 hover:text-ink-200" title="Download SVG (⌘S)"><Download className="h-2.5 w-2.5" /></button>}
                  <button onClick={handleCopyText} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-ink-400 hover:bg-ink-800 hover:text-ink-200" title="Copy as text (⌘⇧T)"><Copy className="h-2.5 w-2.5" /></button>
                  {activeTab === 'plan' && (
                    <button onClick={() => setPlanTextOpen(o => !o)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-ink-400 hover:bg-ink-800 hover:text-ink-200" title="Toggle plan text reference">{planTextOpen ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}Ref</button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Plan text reference */}
          {planTextOpen && plan && activeTab === 'plan' && (
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
            <div ref={treeContainerRef} className="relative flex-1 overflow-auto" onDragOver={handleDragOver} onDrop={handleDrop}>

              {/* ── Empty / Error states ── */}
              {!plan?.tree && !error && (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="text-center text-sm text-ink-500">
                    <GitBranch className="mx-auto mb-3 h-10 w-10 text-ink-700" />
                    <p className="mb-2">Paste EXPLAIN output on the left</p>
                    <p className="text-xs text-ink-600">See interactive tree, grid, and stats</p>
                  </div>
                </div>
              )}
              {error && (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="max-w-md rounded-lg border border-red-800/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">{error}</div>
                </div>
              )}

              {/* ── PLAN TAB ── */}
              {plan?.tree && activeTab === 'plan' && viewMode === 'table' && (
                <div className="divide-y divide-ink-800/50">
                  <div className="flex items-center gap-2 px-2 py-1 text-[9px] font-500 text-ink-500 uppercase tracking-wider">
                    <span className="w-6 text-center">#</span>
                    <span className="flex-1">Node</span>
                    <span className="w-16 text-right">{METRIC_LABELS[metric]}</span>
                    <span className="w-24">{metric === 'buffers' || metric === 'io' ? 'Blocks' : 'Progress'}</span>
                  </div>
                  {flatRows.map((row) => {
                    const val = getMetricValue(row.node, metric)
                    const val2 = getMetricValue2(row.node, metric)
                    const pct = maxMetric > 0 ? (val / maxMetric) * 100 : 0
                    const pct2 = maxMetric > 0 ? (val2 / maxMetric) * 100 : 0
                    const isSelected = row.node === selectedNode
                    const isBottleneck = row.node.cost.total === plan.summary.bottleneck?.cost
                    const keyInfo = getNodeKeyInfo(row.node)
                    const displayLabel = keyInfo ? `${row.node.label} ${keyInfo}` : row.node.label
                    return (
                      <div
                        key={row._id}
                        onClick={() => handleRowSelect(row)}
                        className={`flex cursor-pointer items-center gap-2 px-2 py-1 text-[11px] transition-colors hover:bg-ink-800/50 ${isSelected ? 'bg-honey-500/10' : ''}`}
                      >
                        {/* Row number */}
                        <span className="w-6 shrink-0 text-center text-[10px] text-ink-500 font-mono">#{row.nodeIndex}</span>
                        {/* Tree connector */}
                        <div className="flex shrink-0 items-center" style={{ width: Math.max(0, row.depth * 14) }}>
                          {row.depth > 0 && (
                            <span className="text-[10px] text-ink-500 font-mono">
                              {row.hasChildren && !row.isCollapsed ? '└' : '├'}
                            </span>
                          )}
                        </div>
                        {/* Collapse icon — separate click handler */}
                        <div className="flex shrink-0 items-center w-3" onClick={row.hasChildren ? (e) => handleCollapseToggle(row, e) : undefined}>
                          {row.hasChildren ? (
                            <span className="text-[8px] text-ink-500 hover:text-ink-200 cursor-pointer">{row.isCollapsed ? '▶' : '▼'}</span>
                          ) : (
                            <span className="w-3" />
                          )}
                        </div>
                        {/* Color dot */}
                        <span className="mt-0.5 block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getNodeColor(row.node.type) }} />
                        {/* Node name */}
                        <span className="min-w-0 flex-1 truncate font-mono text-ink-200">
                          {row.node.label}
                          {keyInfo && <span className="text-ink-500 ml-1">— {keyInfo}</span>}
                        </span>
                        {/* Bottleneck badge */}
                        {isBottleneck && <span className="shrink-0 rounded bg-red-900/30 px-1 py-0.5 text-[9px] text-red-300">⚠️</span>}
                        {/* Metric value */}
                        <span className="shrink-0 font-mono text-ink-400 w-12 text-right">{formatMetricShort(val)}</span>
                        {/* Dual progress bars */}
                        <div className="h-3.5 w-20 shrink-0 overflow-hidden rounded-full bg-ink-800 relative">
                          {/* Secondary bar (behind) */}
                          <div
                            className="absolute inset-0 rounded-full transition-all duration-200 opacity-40"
                            style={{ width: `${Math.max(pct2, 2)}%`, backgroundColor: getNodeColor(row.node.type) }}
                          />
                          {/* Primary bar (front) */}
                          <div
                            className="absolute inset-y-0 left-0 rounded-full transition-all duration-200"
                            style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: getNodeColor(row.node.type) }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* D3 Tree View */}
              {plan?.tree && activeTab === 'plan' && viewMode === 'tree' && (
                <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block', minHeight: '450px' }} />
              )}

              {/* ── GRID TAB ── */}
              {plan?.tree && activeTab === 'grid' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      {/* Top header row: group headers */}
                      <tr className="border-b border-ink-800 bg-ink-900/60 text-ink-500">
                        <th className="sticky top-0 px-2 py-1 text-left font-medium w-8"></th>
                        <th className="sticky top-0 px-2 py-1 text-center font-medium" colSpan={2}>io</th>
                        <th className="sticky top-0 px-2 py-1 text-center font-medium" colSpan={5}></th>
                        <th className="sticky top-0 px-2 py-1 text-center font-medium" colSpan={4}>shared</th>
                      </tr>
                      {/* Bottom header row: column names */}
                      <tr className="border-b border-ink-800 bg-ink-900/40 text-ink-500">
                        <th className="sticky top-0 px-2 py-1 text-left font-medium">#</th>
                        <th className="sticky top-0 px-2 py-1 text-right font-medium">time</th>
                        <th className="sticky top-0 px-2 py-1 text-right font-medium">read</th>
                        <th className="sticky top-0 px-2 py-1 text-right font-medium">rows</th>
                        <th className="sticky top-0 px-2 py-1 text-right font-medium">estim</th>
                        <th className="sticky top-0 px-2 py-1 text-right font-medium">cost</th>
                        <th className="sticky top-0 px-2 py-1 text-right font-medium">loops</th>
                        <th className="sticky top-0 px-2 py-1 text-right font-medium">filter</th>
                        <th className="sticky top-0 px-2 py-1 text-right font-medium">heap</th>
                        <th className="sticky top-0 px-2 py-1 text-left font-medium min-w-[200px]">Node</th>
                        <th className="sticky top-0 px-2 py-1 text-right font-medium">hit</th>
                        <th className="sticky top-0 px-2 py-1 text-right font-medium">read</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gridRows.map((row) => {
                        const isSelected = row.node === selectedNode
                        const time = row.node.actualTime?.last ?? 0
                        const ioRead = row.node.buffers?.sharedRead ?? 0
                        const loops = row.node.loops ?? 1
                        const hit = row.node.buffers?.sharedHit ?? 0
                        const heapRead = row.node.buffers?.tempRead ?? 0
                        const sharedRead = row.node.buffers?.sharedRead ?? 0
                        const filterAnn = row.node.annotations.find(a => a.startsWith('Filter:'))
                        const filterPct = filterAnn ? '8%' : ''
                        const hasHighCost = row.node.cost.total > (plan?.summary.totalCost || 1) * 0.3
                        // Estimation quality: actual rows / planned rows
                        const plannedRows = row.node.details.rows ? Number(row.node.details.rows) : null
                        const actualRows = row.node.rows
                        let estimStr = ''
                        if (row.node.actualTime && plannedRows && plannedRows > 0) {
                          const ratio = actualRows / plannedRows
                          const arrow = ratio > 1 ? '▴' : '▾'
                          estimStr = `${ratio.toFixed(1)}×${arrow}`
                        } else if (row.node.actualTime) {
                          estimStr = `~${actualRows.toLocaleString()}`
                        }
                        return (
                          <tr
                            key={row.index}
                            onClick={() => { setSelectedNode(row.node === selectedNode ? null : row.node); setDetailTab('general') }}
                            className={`border-b border-ink-800/30 cursor-pointer transition-colors hover:bg-ink-800/40 ${isSelected ? 'bg-honey-500/10' : ''}`}
                          >
                            <td className="px-2 py-1 text-ink-500">#{row.index}</td>
                            <td className={`px-2 py-1 text-right ${time > 0 ? 'text-ink-200' : 'text-ink-500'}`}>
                              {time > 0 ? time.toFixed(2) : '-'}
                            </td>
                            <td className={`px-2 py-1 text-right ${ioRead > 0 ? 'text-orange-300' : 'text-ink-500'}`}>
                              {ioRead > 0 ? ioRead : '-'}
                            </td>
                            <td className="px-2 py-1 text-right text-ink-200">{row.node.rows.toLocaleString()}</td>
                            <td className={`px-2 py-1 text-right ${estimStr ? 'text-yellow-400' : 'text-ink-500'}`}>
                              {estimStr || '-'}
                            </td>
                            <td className={`px-2 py-1 text-right ${hasHighCost ? 'text-red-300 font-600' : 'text-ink-200'}`}>
                              {row.node.cost.total.toFixed(1)}
                            </td>
                            <td className="px-2 py-1 text-right text-ink-400">{loops > 1 ? loops : '-'}</td>
                            <td className="px-2 py-1 text-right text-ink-500">{filterPct || '-'}</td>
                            <td className="px-2 py-1 text-right text-ink-500">{heapRead > 0 ? heapRead : '-'}</td>
                            <td className="px-2 py-1 text-ink-200 whitespace-nowrap">
                              <span className="text-ink-500">{row.treePrefix}</span>
                              <span className="ml-0.5" style={{ color: getNodeColor(row.node.type) }}>{row.node.label}</span>
                            </td>
                            <td className="px-2 py-1 text-right text-ink-400">{hit > 0 ? hit : '-'}</td>
                            <td className="px-2 py-1 text-right text-ink-400">{sharedRead > 0 ? sharedRead : '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── RAW TAB ── */}
              {plan?.tree && activeTab === 'raw' && (
                <pre className="overflow-auto p-4 text-[11px] leading-relaxed text-ink-300 font-mono whitespace-pre-wrap">{inputText}</pre>
              )}

              {/* ── QUERY TAB ── */}
              {plan?.tree && activeTab === 'query' && (
                <div className="p-4">
                  {queryStatus === 'hidden' ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-ink-500">
                      <Terminal className="h-8 w-8 text-ink-700" />
                      <p className="text-sm">No SQL query detected.</p>
                      <p className="text-xs text-ink-600">Paste the SQL query along with the EXPLAIN output.</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.readText().then(text => {
                            if (text) {
                              setQueryText(text)
                              setQueryStatus('manual')
                              toast.push('Query pasted from clipboard!', { variant: 'success' })
                            }
                          }).catch(() => {
                            toast.push('Could not read clipboard. Type or paste the query manually.', { variant: 'info' })
                            setQueryStatus('manual')
                          })
                        }}
                        className="rounded bg-ink-800 px-3 py-1.5 text-[11px] text-ink-300 hover:bg-ink-700"
                      >
                        Paste from clipboard
                      </button>
                      <button onClick={() => setQueryStatus('manual')} className="text-[10px] text-ink-600 hover:text-ink-400">
                        Type manually
                      </button>
                    </div>
                  ) : (
                    <textarea
                      className="w-full h-full min-h-[200px] resize-none border-0 bg-transparent p-2 font-mono text-[11px] leading-relaxed text-ink-200 outline-none placeholder:text-ink-600"
                      placeholder="Paste or type the SQL query here..."
                      value={queryText}
                      onChange={(e) => setQueryText(e.target.value)}
                      spellCheck={false}
                    />
                  )}
                </div>
              )}

              {/* ── STATS TAB ── */}
              {plan?.tree && activeTab === 'stats' && (
                <div className="flex flex-col gap-4 p-3">
                  {/* Table stats */}
                  {statsByTable.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5">
                        <Database className="h-3 w-3 text-honey-400" />
                        <span className="text-[10px] font-500 text-ink-300 uppercase tracking-wider">Tables</span>
                      </div>
                      <table className="w-full text-[10px] font-mono">
                        <thead>
                          <tr className="border-b border-ink-800 text-ink-500">
                            <th className="px-2 py-1 text-left font-medium">Table</th>
                            <th className="px-2 py-1 text-right font-medium">Count</th>
                            <th className="px-2 py-1 text-right font-medium">Time</th>
                            <th className="px-2 py-1 text-right font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statsByTable.map(stat => (
                            <tr key={stat.name} className="border-b border-ink-800/30 hover:bg-ink-800/30">
                              <td className="px-2 py-1 text-ink-200">{stat.name}</td>
                              <td className="px-2 py-1 text-right text-ink-400">{stat.count}</td>
                              <td className="px-2 py-1 text-right text-ink-200">{stat.time.toFixed(2)}ms</td>
                              <td className="px-2 py-1 text-right">
                                <span className="text-ink-400">{stat.timePct.toFixed(0)}%</span>
                                <div className="mt-0.5 h-1 w-full rounded-full bg-ink-800">
                                  <div className="h-full rounded-full bg-honey-500/60" style={{ width: `${Math.max(stat.timePct, 2)}%` }} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Node Type stats */}
                  {statsByNodeType.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5">
                        <Layers className="h-3 w-3 text-honey-400" />
                        <span className="text-[10px] font-500 text-ink-300 uppercase tracking-wider">Node Types</span>
                      </div>
                      <table className="w-full text-[10px] font-mono">
                        <thead>
                          <tr className="border-b border-ink-800 text-ink-500">
                            <th className="px-2 py-1 text-left font-medium">Node Type</th>
                            <th className="px-2 py-1 text-right font-medium">Count</th>
                            <th className="px-2 py-1 text-right font-medium">Time</th>
                            <th className="px-2 py-1 text-right font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statsByNodeType.map(stat => (
                            <tr key={stat.name} className="border-b border-ink-800/30 hover:bg-ink-800/30">
                              <td className="px-2 py-1">
                                <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: getNodeColor(stat.name as NodeType) }} />
                                <span className="text-ink-200 capitalize">{stat.name}</span>
                              </td>
                              <td className="px-2 py-1 text-right text-ink-400">{stat.count}</td>
                              <td className="px-2 py-1 text-right text-ink-200">{stat.time.toFixed(2)}ms</td>
                              <td className="px-2 py-1 text-right">
                                <span className="text-ink-400">{stat.timePct.toFixed(0)}%</span>
                                <div className="mt-0.5 h-1 w-full rounded-full bg-ink-800">
                                  <div className="h-full rounded-full" style={{ width: `${Math.max(stat.timePct, 2)}%`, backgroundColor: getNodeColor(stat.name as NodeType) }} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Index stats */}
                  {statsByIndex.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5">
                        <ArrowUpDown className="h-3 w-3 text-honey-400" />
                        <span className="text-[10px] font-500 text-ink-300 uppercase tracking-wider">Indexes</span>
                      </div>
                      <table className="w-full text-[10px] font-mono">
                        <thead>
                          <tr className="border-b border-ink-800 text-ink-500">
                            <th className="px-2 py-1 text-left font-medium">Index</th>
                            <th className="px-2 py-1 text-right font-medium">Count</th>
                            <th className="px-2 py-1 text-right font-medium">Time</th>
                            <th className="px-2 py-1 text-right font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statsByIndex.map(stat => (
                            <tr key={stat.name} className="border-b border-ink-800/30 hover:bg-ink-800/30">
                              <td className="px-2 py-1 text-ink-200 font-mono text-[9px]">{stat.name}</td>
                              <td className="px-2 py-1 text-right text-ink-400">{stat.count}</td>
                              <td className="px-2 py-1 text-right text-ink-200">{stat.time.toFixed(2)}ms</td>
                              <td className="px-2 py-1 text-right">
                                <span className="text-ink-400">{stat.timePct.toFixed(0)}%</span>
                                <div className="mt-0.5 h-1 w-full rounded-full bg-ink-800">
                                  <div className="h-full rounded-full bg-purple-500/60" style={{ width: `${Math.max(stat.timePct, 2)}%` }} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Function stats */}
                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <Terminal className="h-3 w-3 text-honey-400" />
                      <span className="text-[10px] font-500 text-ink-300 uppercase tracking-wider">Functions</span>
                    </div>
                    {statsByFunction.length > 0 ? (
                      <table className="w-full text-[10px] font-mono">
                        <thead>
                          <tr className="border-b border-ink-800 text-ink-500">
                            <th className="px-2 py-1 text-left font-medium">Function</th>
                            <th className="px-2 py-1 text-right font-medium">Count</th>
                            <th className="px-2 py-1 text-right font-medium">Time</th>
                            <th className="px-2 py-1 text-right font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statsByFunction.map(stat => (
                            <tr key={stat.name} className="border-b border-ink-800/30 hover:bg-ink-800/30">
                              <td className="px-2 py-1 text-ink-200 font-mono">{stat.name}()</td>
                              <td className="px-2 py-1 text-right text-ink-400">{stat.count}</td>
                              <td className="px-2 py-1 text-right text-ink-200">{stat.time.toFixed(2)}ms</td>
                              <td className="px-2 py-1 text-right">
                                <span className="text-ink-400">{stat.timePct.toFixed(0)}%</span>
                                <div className="mt-0.5 h-1 w-full rounded-full bg-ink-800">
                                  <div className="h-full rounded-full bg-teal-500/60" style={{ width: `${Math.max(stat.timePct, 2)}%` }} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="rounded border border-ink-800 bg-ink-900/40 px-3 py-2 text-[11px] text-ink-500">
                        No function used
                      </div>
                    )}
                  </div>

                  {statsByTable.length === 0 && statsByNodeType.length === 0 && statsByIndex.length === 0 && statsByFunction.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-ink-500">
                      <BarChart3 className="h-8 w-8 text-ink-700 mb-3" />
                      <p className="text-sm">No stats available.</p>
                      <p className="text-xs text-ink-600 mt-1">Use EXPLAIN (ANALYZE, BUFFERS) for richer stats.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Right side panel: detail or legend ── */}
            {selectedNode && activeTab === 'plan' ? (
              <div className="w-64 shrink-0 border-l border-ink-800 bg-ink-900/80 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5">
                  <span className="text-[9px] font-500 text-ink-500 uppercase tracking-wider">Node Detail</span>
                  <button onClick={() => setSelectedNode(null)} className="text-ink-500 hover:text-ink-200 text-[11px]">✕</button>
                </div>
                {/* Detail tabs */}
                <div className="flex border-b border-ink-800 overflow-x-auto">
                  {(['general', 'io', 'output', 'workers', 'misc'] as DetailTab[]).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setDetailTab(tab)}
                      className={`px-2 py-1 text-[9px] whitespace-nowrap ${
                        detailTab === tab
                          ? 'border-b-2 border-honey-400 text-honey-300 bg-honey-500/10'
                          : 'text-ink-500 hover:text-ink-200'
                      }`}
                    >
                      {tab === 'general' ? 'General' : tab === 'io' ? 'IO & Buffers' : tab === 'output' ? 'Output' : tab === 'workers' ? 'Workers' : 'Misc'}
                    </button>
                  ))}
                </div>
                <div className="p-2.5 text-[11px] leading-relaxed [&_.dr]:flex [&_.dr]:items-baseline [&_.dr]:justify-between [&_.dr]:gap-2 [&_.dr]:py-0.5 [&_.dl]:text-ink-500 [&_.dl]:text-[10px] [&_.ml-2]:ml-2"
                  dangerouslySetInnerHTML={{
                    __html: detailTab === 'general' ? buildGeneralDetail(selectedNode)
                      : detailTab === 'io' ? buildIODetail(selectedNode)
                      : detailTab === 'output' ? buildOutputDetail(selectedNode)
                      : detailTab === 'workers' ? buildWorkersDetail(selectedNode)
                      : buildMiscDetail(selectedNode)
                  }}
                />
              </div>
            ) : legendOpen && plan?.tree && activeTab === 'plan' ? (
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
            {!selectedNode && !legendOpen && plan?.tree && activeTab === 'plan' && (
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