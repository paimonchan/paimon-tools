/**
 * explain-parser.ts — pure EXPLAIN plan parser.
 *
 * Parses raw PostgreSQL EXPLAIN (text format) into a typed tree structure.
 * Zero React, zero browser API — pure functions only.
 *
 * Supports:
 * - Basic EXPLAIN (cost, rows, width per node)
 * - Multi-line annotations (Hash Cond, Sort Key, Filter, etc.)
 * - EXPLAIN ANALYZE (actual time, loops, buffers)
 * - Summary lines (Planning Time, Execution Time, Triggers)
 */

// ── Types ─────────────────────────────────────────────

export interface ExplainNode {
  depth: number
  label: string       // e.g. "Hash Join", "Seq Scan on users"
  type: NodeType      // normalized type for color coding
  details: Record<string, string | number>
  annotations: string[]
  children: ExplainNode[]
  cost: Cost
  rows: number
  /** Planner's row estimate (from the cost line). `rows` holds actual rows when ANALYZE is present. */
  plannedRows: number
  width: number
  actualTime?: ActualTime
  loops?: number
  buffers?: Buffers
  ioTimings?: IOTimings
}

export interface Cost {
  startup: number
  total: number
}

export interface ActualTime {
  first: number
  last: number
}

export interface Buffers {
  sharedHit: number
  sharedRead: number
  sharedWritten: number
  localHit: number
  localRead: number
  tempRead: number
  tempWritten: number
}

/** I/O timings from track_io_timing (EXPLAIN ANALYZE). Milliseconds per node. */
export interface IOTimings {
  read: number
  write: number
}

export type NodeType =
  | 'scan'          // Seq Scan, Index Scan, Index Only Scan, Bitmap Scan
  | 'join'          // Hash Join, Nested Loop, Merge Join
  | 'aggregate'     // Aggregate, GroupAggregate, HashAggregate
  | 'sort'          // Sort, Incremental Sort
  | 'hash'          // Hash
  | 'motion'        // Gather Motion, Redistribute Motion, Broadcast Motion
  | 'setop'         // Append, Union, Except, Intersect
  | 'limit'         // Limit, LimitSort
  | 'subquery'      // Subquery Scan, SubPlan
  | 'other'         // Everything else

export interface ExplainPlan {
  tree: ExplainNode | null
  summary: PlanSummary
  planSize: number      // raw input size in chars
  parseTime: number     // ms
  warnings: string[]
}

export interface PlanSummary {
  totalCost: number
  totalRows: number
  planningTime?: number
  executionTime?: number
  nodeCount: number
  bottleneck: { label: string; cost: number } | null
}

// ── Node type detection ───────────────────────────────

const SCAN_PATTERN = /^(?:Seq\s*Scan|Index\s*Scan|Index\s*Only\s*Scan|Bitmap\s*(?:Heap|Index|And|Or)?\s*Scan|CTE\s*Scan|Foreign\s*Scan|Function\s*Scan|Values\s*Scan|WorkTable\s*Scan)/i
const JOIN_PATTERN = /^(?:Hash\s*Join|Nested\s*Loop|Merge\s*Join)/i
const AGGREGATE_PATTERN = /^(?:Aggregate|Group\s*Aggregate|Hash\s*Aggregate|Plain\s*Aggregate|Mixed\s*Aggregate)/i
const SORT_PATTERN = /^(?:Sort|Incremental\s*Sort|Top-N\s*Sort)/i
const HASH_PATTERN = /^Hash\b/i
const MOTION_PATTERN = /^(?:Gather\s*Motion|Redistribute\s*Motion|Broadcast\s*Motion|Gather|Slice)/i
const SETOP_PATTERN = /^(?:Append|Union|Except|Intersect|Merge\s*Append)/i
const LIMIT_PATTERN = /^Limit\b/i
const SUBQUERY_PATTERN = /^(?:Subquery\s*Scan|SubPlan|Materialize|Result|Unique|SetOp)/i

function detectNodeType(label: string): NodeType {
  if (SCAN_PATTERN.test(label)) return 'scan'
  if (JOIN_PATTERN.test(label)) return 'join'
  if (AGGREGATE_PATTERN.test(label)) return 'aggregate'
  if (SORT_PATTERN.test(label)) return 'sort'
  if (HASH_PATTERN.test(label) && !HASH_PATTERN.test(label)) return 'hash'
  if (HASH_PATTERN.test(label)) return 'hash'
  if (MOTION_PATTERN.test(label)) return 'motion'
  if (SETOP_PATTERN.test(label)) return 'setop'
  if (LIMIT_PATTERN.test(label)) return 'limit'
  if (SUBQUERY_PATTERN.test(label)) return 'subquery'
  return 'other'
}

// ── Line regex ────────────────────────────────────────

// Matches: "  ->  Hash Join  (cost=0.00..431.00 rows=1 width=48)"
// Label may contain parens/quotes: "Function Scan on jsonb_path_query_first(x)",
// "Custom Scan (TidScan) on t", 'Seq Scan on "Order Items"'.
// Non-greedy label + lookahead for " (cost=" ensures we stop at the cost group.
const NODE_LINE_RE = /^(\s*)(?:->\s*)?(.+?)\s*\(cost=([\d.]+)\.\.([\d.]+)\s+rows=(\d+)\s+width=(\d+)\)/

// Matches EXPLAIN ANALYZE actual time: "  Actual Time: 0.123..12.345  Rows: 1000  Loops: 1"  (PG ≤ 9.x)
const ACTUAL_TIME_RE = /Actual\s*(?:Time|time):\s*([\d.]+)\.\.([\d.]+)\s+Rows:\s*(\d+)\s+Loops:\s*(\d+)/i

// Matches inline actual time in modern PG (10+):
//   "  ->  Seq Scan on a  (cost=0.00..32.60 rows=2260 width=8) (actual time=0.011..0.012 rows=10 loops=1)"
const INLINE_ACTUAL_RE = /\(actual\s+time=([\d.]+)\.\.([\d.]+)\s+rows=(\d+)\s+loops=(\d+)\)/i

// Matches "never executed" nodes: "  (actual time=never executed rows=0 loops=0)"
const NEVER_EXECUTED_RE = /\(actual\s+time=never\s+executed\s+rows=(\d+)\s+loops=(\d+)\)/i

// Matches buffer info line: "  Buffers: shared hit=123 read=45 written=0 temp read=12 temp written=3"
const BUFFERS_LINE_RE = /^\s*Buffers:\s*(.*)$/i

/**
 * Parse the token list after "Buffers:" into a Buffers object.
 * Postgres output omits the "shared" prefix on later tokens:
 *   "shared hit=12000 read=3405 written=0 temp read=120 temp written=45"
 * so we walk tokens in order: [modifier]? key=value.
 */
function parseBuffers(line: string): Buffers | null {
  const m = line.match(BUFFERS_LINE_RE)
  if (!m) return null
  const tokens = m[1].trim().split(/\s+/).filter(Boolean)
  const b: Buffers = {
    sharedHit: 0, sharedRead: 0, sharedWritten: 0,
    localHit: 0, localRead: 0, tempRead: 0, tempWritten: 0,
  }
  let mod: string | null = null
  for (const tok of tokens) {
    if (tok === 'shared' || tok === 'local' || tok === 'temp') {
      mod = tok
      continue
    }
    const kv = tok.match(/^(\w+)=(\d+)$/)
    if (!kv) continue
    const key = kv[1]
    const val = parseInt(kv[2], 10)
    switch (key) {
      case 'hit':
        if (mod === 'shared') b.sharedHit = val
        else if (mod === 'local') b.localHit = val
        break
      case 'read':
        if (mod === 'local') b.localRead = val
        else if (mod === 'temp') b.tempRead = val
        else b.sharedRead = val
        break
      case 'written':
        if (mod === 'temp') b.tempWritten = val
        else b.sharedWritten = val
        break
    }
    // Modifier persists until the next explicit modifier (PG output:
    // "shared hit=N read=M written=K temp read=L") — do NOT reset here.
  }
  return b
}

// Matches I/O timings: "  I/O Timings: read=12.345 write=6.789" (track_io_timing)
const IO_TIMINGS_RE = /I\/O\s*Timings?:\s*read=([\d.]+)(?:\s+write=([\d.]+))?/i

// Matches annotation lines: "  Hash Cond: (a.id = b.a_id)" or "  Sort Key: created_at DESC"
const ANNOTATION_RE = /^\s+(?:[\w\s]+):\s+(.+)/

// Matches summary lines
const PLANNING_TIME_RE = /Planning\s*Time:\s*([\d.]+)\s*ms/i
const EXECUTION_TIME_RE = /Execution\s*Time:\s*([\d.]+)\s*ms/i

// ── Parser ────────────────────────────────────────────

interface RawNode {
  depth: number
  label: string
  type: NodeType
  cost: Cost
  rows: number
  plannedRows: number
  width: number
  actualTime?: ActualTime
  loops?: number
  buffers?: Buffers
  ioTimings?: IOTimings
  annotations: string[]
}

function parseNodeLine(line: string): RawNode | null {
  const m = line.match(NODE_LINE_RE)
  if (!m) return null
  const indent = m[1]
  const depth = Math.floor(indent.length / 2)
  const label = m[2].trim()
  const node: RawNode = {
    depth,
    label,
    type: detectNodeType(label),
    cost: { startup: parseFloat(m[3]), total: parseFloat(m[4]) },
    rows: parseInt(m[5], 10),
    plannedRows: parseInt(m[5], 10),
    width: parseInt(m[6], 10),
    annotations: [],
  }

  // Modern PG (10+): inline actual stats in the same line:
  //   "  ->  Seq Scan on a  (cost=..) (actual time=0.011..0.012 rows=10 loops=1)"
  const neverMatch = line.match(NEVER_EXECUTED_RE)
  if (neverMatch) {
    node.loops = parseInt(neverMatch[2] || '0', 10)
    node.annotations.push('actual time=never executed')
  } else {
    const inline = line.match(INLINE_ACTUAL_RE)
    if (inline) {
      node.actualTime = { first: parseFloat(inline[1]), last: parseFloat(inline[2]) }
      const rows = parseInt(inline[3], 10)
      if (!isNaN(rows)) node.rows = rows
      node.loops = parseInt(inline[4], 10)
    }
  }
  return node
}

/**
 * Parse raw EXPLAIN text into a structured tree.
 */
export function parseExplain(text: string): ExplainPlan {
  const start = performance.now()
  const lines = text.split('\n')
  const rawNodes: RawNode[] = []
  const warnings: string[] = []
  let currentRaw: RawNode | null = null
  let summary: PlanSummary = {
    totalCost: 0,
    totalRows: 0,
    nodeCount: 0,
    bottleneck: null,
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) continue

    // Try to parse as a node line first
    const node = parseNodeLine(line)
    if (node) {
      currentRaw = node
      rawNodes.push(node)
      // Check for annotations on the next line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1]
        const nextTrimmed = nextLine.trim()
        // Check if next line is an annotation (not a node, not a summary)
        if (nextTrimmed && !nextTrimmed.match(NODE_LINE_RE) && !nextTrimmed.match(PLANNING_TIME_RE) && !nextTrimmed.match(EXECUTION_TIME_RE)) {
          // Check for actual time, buffers, or other annotations
          const actualMatch = nextLine.match(ACTUAL_TIME_RE)
          if (actualMatch) {
            node.actualTime = { first: parseFloat(actualMatch[1]), last: parseFloat(actualMatch[2]) }
            const rows = parseInt(actualMatch[3], 10)
            if (!isNaN(rows)) node.rows = rows
            node.loops = parseInt(actualMatch[4], 10)
            i++ // consume
            continue
          }
          const bufferMatch = parseBuffers(nextLine)
          if (bufferMatch) {
            node.buffers = bufferMatch
            i++ // consume
            continue
          }
          // Check for I/O timings (track_io_timing): "  I/O Timings: read=12.345 write=6.789"
          const ioMatch = nextLine.match(IO_TIMINGS_RE)
          if (ioMatch) {
            node.ioTimings = {
              read: parseFloat(ioMatch[1] || '0'),
              write: parseFloat(ioMatch[2] || '0'),
            }
            i++ // consume
            continue
          }
          // Check if it's a multi-line annotation
          const annotMatch = nextLine.match(ANNOTATION_RE)
          if (annotMatch && !nextLine.includes('->')) {
            node.annotations.push(nextTrimmed)
            i++ // consume
          }
        }
      }
      continue
    }

    // Check for summary lines
    const planMatch = line.match(PLANNING_TIME_RE)
    if (planMatch) {
      summary.planningTime = parseFloat(planMatch[1])
      continue
    }
    const execMatch = line.match(EXECUTION_TIME_RE)
    if (execMatch) {
      summary.executionTime = parseFloat(execMatch[1])
      continue
    }

    // If we have a current node and this line is indented, it might be an annotation
    if (currentRaw && line.startsWith(' ') && !line.includes('->')) {
      const annotMatch = line.match(ANNOTATION_RE)
      if (annotMatch) {
        currentRaw.annotations.push(trimmed)
      }
    }
  }

  // Build tree from flat nodes
  const tree = buildTree(rawNodes)

  // Calculate summary
  summary.nodeCount = rawNodes.length
  if (tree) {
    summary.totalCost = tree.cost.total
    summary.totalRows = tree.rows
    summary.bottleneck = findBottleneck(tree)
  }

  const parseTime = Math.max(0, performance.now() - start)

  return {
    tree,
    summary,
    planSize: text.length,
    parseTime,
    warnings,
  }
}

/**
 * Build a tree from flat node list using indentation depth.
 */
function buildTree(rawNodes: RawNode[]): ExplainNode | null {
  if (rawNodes.length === 0) return null

  const root = rawNodes[0]
  const rootNode: ExplainNode = {
    depth: root.depth,
    label: root.label,
    type: root.type,
    details: { cost: `${root.cost.startup}..${root.cost.total}`, rows: root.rows, width: root.width },
    annotations: root.annotations,
    children: [],
    cost: root.cost,
    rows: root.rows,
    plannedRows: root.plannedRows,
    width: root.width,
    actualTime: root.actualTime,
    loops: root.loops,
    buffers: root.buffers,
    ioTimings: root.ioTimings,
  }

  // Stack-based approach: maintain a stack of parent nodes
  const stack: { node: ExplainNode; depth: number }[] = [{ node: rootNode, depth: root.depth }]

  for (let i = 1; i < rawNodes.length; i++) {
    const raw = rawNodes[i]

    // Pop parents that are less deep than current node
    while (stack.length > 0 && stack[stack.length - 1].depth >= raw.depth) {
      stack.pop()
    }

    const child: ExplainNode = {
      depth: raw.depth,
      label: raw.label,
      type: raw.type,
      details: { cost: `${raw.cost.startup}..${raw.cost.total}`, rows: raw.rows, width: raw.width },
      annotations: raw.annotations,
      children: [],
      cost: raw.cost,
      rows: raw.rows,
      plannedRows: raw.plannedRows,
      width: raw.width,
      actualTime: raw.actualTime,
      loops: raw.loops,
      buffers: raw.buffers,
      ioTimings: raw.ioTimings,
    }

    if (stack.length > 0) {
      stack[stack.length - 1].node.children.push(child)
    }

    stack.push({ node: child, depth: raw.depth })
  }

  return rootNode
}

/**
 * Find the bottleneck node — the node with highest total cost.
 */
function findBottleneck(node: ExplainNode): { label: string; cost: number } | null {
  let maxCost = node.cost.total
  let maxLabel = node.label

  function walk(n: ExplainNode) {
    if (n.cost.total > maxCost) {
      maxCost = n.cost.total
      maxLabel = n.label
    }
    for (const child of n.children) {
      walk(child)
    }
  }

  walk(node)
  return { label: maxLabel, cost: maxCost }
}

/**
 * Format a plan tree as indented text (for debugging / copy-as-text).
 */
export function formatTreeAsText(node: ExplainNode, depth = 0): string {
  const indent = '  '.repeat(depth)
  const costStr = `${node.cost.startup}..${node.cost.total}`
  let result = `${indent}${node.label}  (cost=${costStr} rows=${node.rows} width=${node.width})`
  for (const ann of node.annotations) {
    result += `\n${indent}  ${ann}`
  }
  for (const child of node.children) {
    result += '\n' + formatTreeAsText(child, depth + 1)
  }
  return result
}

/**
 * Get the node type display color.
 */
export function nodeTypeColor(type: NodeType): string {
  switch (type) {
    case 'scan': return '#3b82f6'        // blue
    case 'join': return '#22c55e'        // green
    case 'aggregate': return '#f97316'   // orange
    case 'sort': return '#a855f7'        // purple
    case 'hash': return '#ec4899'        // pink
    case 'motion': return '#06b6d4'      // cyan
    case 'setop': return '#14b8a6'       // teal
    case 'limit': return '#f59e0b'       // amber
    case 'subquery': return '#8b5cf6'    // violet
    default: return '#6b7280'            // gray
  }
}

/**
 * Get a human-readable label for a node type.
 */
export function nodeTypeLabel(type: NodeType): string {
  switch (type) {
    case 'scan': return 'Scan'
    case 'join': return 'Join'
    case 'aggregate': return 'Aggregate'
    case 'sort': return 'Sort'
    case 'hash': return 'Hash'
    case 'motion': return 'Motion'
    case 'setop': return 'Set Operation'
    case 'limit': return 'Limit'
    case 'subquery': return 'Subquery'
    default: return 'Other'
  }
}