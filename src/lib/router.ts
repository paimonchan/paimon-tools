/**
 * router.ts — minimal history-based routing for the SPA.
 */

import { TOOL_SEO } from './seo'

/**
 * Detect the active tool from the URL.
 */
export function toolIdFromLocation(): string | null {
  const segments = window.location.pathname.split('/').filter(Boolean)
  for (const seg of segments) {
    const seo = Object.values(TOOL_SEO).find((s) => s.path === seg)
    if (seo) {
      return Object.keys(TOOL_SEO).find((key) => TOOL_SEO[key].path === seg) ?? null
    }
  }
  return null
}

/**
 * Compute the stable base path (everything in URL except the tool segment).
 */
function detectBase(): string {
  const segments = window.location.pathname.split('/').filter(Boolean)
  const toolPaths = new Set(Object.values(TOOL_SEO).map((s) => s.path))
  const withoutTool = segments.filter((s) => !toolPaths.has(s))
  return withoutTool.length ? '/' + withoutTool.join('/') : ''
}

/**
 * Push a history entry for a tool. No-op if already there.
 */
export function pushTool(toolId: string): void {
  const seo = TOOL_SEO[toolId]
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
  const seo = toolId ? TOOL_SEO[toolId] : null
  if (seo) {
    document.title = seo.title
  }
}
