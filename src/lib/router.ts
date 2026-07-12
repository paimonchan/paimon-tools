/**
 * router.ts — minimal history-based routing for the SPA.
 */

import { TOOL_SEO } from './seo'
import type { ToolId } from '../engine/registry'

const SEO = TOOL_SEO as Record<string, (typeof TOOL_SEO)[keyof typeof TOOL_SEO]>; // index signature for dynamic lookup

/**
 * Detect the active tool from the URL.
 */
export function toolIdFromLocation(): string | null {
  const segments = window.location.pathname.split('/').filter(Boolean)
  for (const seg of segments) {
    const seo = Object.values(SEO).find((s) => s.path === seg)
    if (seo) {
      return Object.keys(SEO).find((key) => SEO[key].path === seg) ?? null
    }
  }
  return null
}

/**
 * Compute the stable base path (everything in URL except the tool segment).
 */
function detectBase(): string {
  const segments = window.location.pathname.split('/').filter(Boolean)
  const toolPaths = new Set(Object.values(SEO).map((s) => s.path))
  const withoutTool = segments.filter((s) => !toolPaths.has(s))
  return withoutTool.length ? '/' + withoutTool.join('/') : ''
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
 * Update the document title to match the active tool.
 */
export function syncDocumentTitle(toolId: string | null): void {
  const seo = toolId ? SEO[toolId] : null
  if (seo) {
    document.title = seo.title
  }
}
