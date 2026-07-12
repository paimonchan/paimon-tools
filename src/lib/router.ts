/**
 * router.ts — minimal history-based routing for the SPA.
 *
 * Supports multi-segment paths (e.g. "code/javascript") by matching the
 * longest suffix of the pathname against TOOL_SEO paths.
 */

import { TOOL_SEO } from './seo'
import type { ToolId } from '../engine/registry'

const SEO = TOOL_SEO as Record<string, (typeof TOOL_SEO)[keyof typeof TOOL_SEO]>; // index signature for dynamic lookup

/**
 * Parse the current location into { base, toolId }.
 * base = everything before the tool path segment(s).
 * toolId = key into TOOL_SEO (null for home page).
 */
export function parseLocation(): { base: string; toolId: string | null } {
  const segments = window.location.pathname.split('/').filter(Boolean)

  // Try to find the longest path suffix that matches a tool.
  // This handles multi-segment paths like "code/javascript" while still
  // working with single-segment paths like "json-to-csv".
  for (let start = 0; start < segments.length; start++) {
    const remaining = segments.slice(start).join('/')
    const seo = Object.values(SEO).find((s) => s.path === remaining)
    if (seo) {
      const toolId = Object.keys(SEO).find((key) => SEO[key].path === remaining) ?? null
      const base = segments.slice(0, start).join('/')
      return { base: base ? '/' + base : '', toolId }
    }
  }

  return { base: '', toolId: null }
}

/**
 * Detect the active tool from the URL.
 */
export function toolIdFromLocation(): string | null {
  return parseLocation().toolId
}

/**
 * Compute the stable base path (everything in URL except the tool segment(s)).
 */
function detectBase(): string {
  return parseLocation().base
}

/**
 * Push a history entry for a tool. No-op if already there.
 */
export function pushTool(toolId: string): void {
  const seo = SEO[toolId]
  if (!seo) return
  if (toolIdFromLocation() === toolId) return

  const base = detectBase()
  const next = `${base}/${seo.path}`
  window.history.pushState({ toolId }, '', next)
}

/**
 * Replace the current history entry for a tool (no new entry created).
 * Use this for in-tool sub-navigation (e.g. playground language tabs)
 * to avoid polluting back/forward history.
 */
export function replaceTool(toolId: string): void {
  const seo = SEO[toolId]
  if (!seo) return
  if (toolIdFromLocation() === toolId) return

  const base = detectBase()
  const next = `${base}/${seo.path}`
  window.history.replaceState({ toolId }, '', next)
  if (seo.title) {
    document.title = seo.title
  }
}

/**
 * Update the document title to match the active tool.
 */
export function syncDocumentTitle(toolId: string | null): void {
  const seo = toolId ? SEO[toolId] : null
  if (seo) {
    document.title = seo.title
  }
}
