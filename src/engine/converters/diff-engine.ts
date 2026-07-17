/**
 * diff-engine.ts — Pure diff logic for text comparison.
 *
 * Pure JS, zero React, zero DOM, zero browser API.
 * Wraps the `diff` library (Myers algorithm) for consistent error handling.
 *
 * Phase 1: Line-level diff (side-by-side + unified view)
 * Phase 2: Word-level highlighting
 */

import { diffLines, diffWords, createTwoFilesPatch } from 'diff'
import { type Result, run } from '../result'

// ── Types ─────────────────────────────────────────────

export type DiffView = 'side-by-side' | 'unified'

export type DiffLineType = 'unchanged' | 'added' | 'removed'

export interface DiffLine {
  type: DiffLineType
  oldLine: number | null
  newLine: number | null
  text: string
}

export interface DiffResult {
  lines: DiffLine[]
  stats: {
    additions: number
    deletions: number
    unchanged: number
  }
  oldLineCount: number
  newLineCount: number
}

export interface WordToken {
  text: string
  type: 'same' | 'added' | 'removed'
}

export interface WordDiffLine {
  type: DiffLineType
  oldLine: number | null
  newLine: number | null
  oldTokens: WordToken[]
  newTokens: WordToken[]
}

// ── Line-level diff ──────────────────────────────────

/**
 * Compare two texts and return structured line-level diff.
 * Uses Myers algorithm (O(ND) time, O(N²) space).
 */
export function textDiff(oldText: string, newText: string): Result<DiffResult> {
  return run(() => {
    if (typeof oldText !== 'string' || typeof newText !== 'string') {
      throw new Error('Both inputs must be text.')
    }

    const changes = diffLines(oldText, newText)
    const lines: DiffLine[] = []
    let oldLine = 0
    let newLine = 0
    let additions = 0
    let deletions = 0
    let unchanged = 0

    for (const change of changes) {
      const count = change.count ?? 1
      const parts = change.value.split('\n')

      // Last element after split is always '' (trailing newline)
      const textLines = change.value.endsWith('\n') ? parts.slice(0, -1) : parts

      for (const text of textLines) {
        if (change.added) {
          lines.push({ type: 'added', oldLine: null, newLine: newLine + 1, text })
          newLine++
          additions++
        } else if (change.removed) {
          lines.push({ type: 'removed', oldLine: oldLine + 1, newLine: null, text })
          oldLine++
          deletions++
        } else {
          lines.push({ type: 'unchanged', oldLine: oldLine + 1, newLine: newLine + 1, text })
          oldLine++
          newLine++
          unchanged++
        }
      }
    }

    return {
      lines,
      stats: { additions, deletions, unchanged },
      oldLineCount: oldLine,
      newLineCount: newLine,
    }
  })
}

// ── Word-level diff ──────────────────────────────────

/**
 * Compute word-level tokens for a changed diff line.
 * Only meaningful for lines marked as 'changed'.
 */
export function wordDiff(
  oldText: string,
  newText: string,
): { oldTokens: WordToken[]; newTokens: WordToken[] } {
  const words = diffWords(oldText || '', newText || '')
  const oldTokens: WordToken[] = []
  const newTokens: WordToken[] = []

  for (const w of words) {
    if (w.added) {
      newTokens.push(...tokenizeWord(w.value, 'added'))
    } else if (w.removed) {
      oldTokens.push(...tokenizeWord(w.value, 'removed'))
    } else {
      oldTokens.push(...tokenizeWord(w.value, 'same'))
      newTokens.push(...tokenizeWord(w.value, 'same'))
    }
  }

  return { oldTokens, newTokens }
}

/** Split a word into individual characters (or keep as word). */
function tokenizeWord(text: string, type: WordToken['type']): WordToken[] {
  // For long unchanged blocks, keep as-is; for added/removed, keep as-is
  return [{ text, type }]
}

// ── Patch creation ───────────────────────────────────

/**
 * Generate a .patch format string (unified diff).
 * Compatible with `git apply` and standard patch tools.
 */
export function createPatch(
  oldText: string,
  newText: string,
  oldFilename = 'original',
  newFilename = 'modified',
): Result<string> {
  return run(() => {
    if (typeof oldText !== 'string' || typeof newText !== 'string') {
      throw new Error('Both inputs must be text.')
    }
    return createTwoFilesPatch(oldFilename, newFilename, oldText, newText)
  })
}

// ── Helpers ─────────────────────────────────────────

/**
 * Scan a DiffResult for lines that changed vs. pure add/remove.
 * A "changed" line is one where a removal is immediately followed by an addition.
 * Returns modified DiffResult with 'changed' type marked.
 */
export function markChangedPairs(diff: DiffResult): DiffResult {
  const merged: DiffLine[] = []
  let i = 0

  while (i < diff.lines.length) {
    const line = diff.lines[i]
    const next = diff.lines[i + 1]

    if (line.type === 'removed' && next?.type === 'added') {
      // This is a changed line pair — mark both
      merged.push(
        { type: 'removed', oldLine: line.oldLine, newLine: next.newLine, text: line.text },
        { type: 'added', oldLine: line.oldLine, newLine: next.newLine, text: next.text },
      )
      i += 2
    } else {
      merged.push(line)
      i++
    }
  }

  // Recalculate stats
  let additions = 0, deletions = 0, unchanged = 0
  for (const l of merged) {
    if (l.type === 'added') additions++
    else if (l.type === 'removed') deletions++
    else unchanged++
  }

  return { ...diff, lines: merged, stats: { additions, deletions, unchanged } }
}
