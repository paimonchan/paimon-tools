/**
 * router.js — minimal history-based routing for the SPA.
 *
 * The app is config-driven: each tool has an `id` and (in seo.js) a `path`.
 * This module maps between the current URL and the active tool id, and pushes
 * new history entries when the user switches tools.
 *
 * We use real history routes (not hash routes) so each tool has a clean,
 * crawlable URL: /json-to-csv, /json-formatter, etc. The prerender script
 * generates a static HTML file at each of those paths, so deep links land on
 * fully-formed pages and the SPA just hydrates on top.
 */

import { TOOL_SEO } from './seo'

/** Reverse lookup: path segment -> tool id. */
const PATH_TO_ID = Object.fromEntries(
  Object.entries(TOOL_SEO).map(([id, seo]) => [seo.path, id])
)

/** Strip the GitHub Pages subpath prefix if present (dev = none, prod = /paimon-tools). */
function normalizePath(pathname) {
  // Match either "/paimon-tools/<tool>" (prod) or "/<tool>" (dev/preview).
  // We rely on the known tool paths to detect the segment robustly.
  const segments = pathname.split('/').filter(Boolean)
  for (let i = segments.length - 1; i >= 0; i--) {
    if (PATH_TO_ID[segments[i]]) {
      return segments[i] // return the tool path segment
    }
  }
  return '' // home
}

/** Read the active tool id from the current URL. */
export function toolIdFromLocation() {
  const seg = normalizePath(window.location.pathname)
  return PATH_TO_ID[seg] || null
}

/** Push a history entry for a tool. No-op if the tool isn't routable. */
export function pushTool(toolId) {
  const seo = TOOL_SEO[toolId]
  if (!seo) return
  const current = normalizePath(window.location.pathname)
  if (current === seo.path) return // already there
  // Build the new URL relative to the current base (handles both dev & prod).
  const base = window.location.pathname.replace(/\/[^/]*$/, '').replace(/\/+$/, '')
  const next = `${base}/${seo.path}`
  window.history.pushState({ toolId }, '', next)
}

/** Update the document title to match the active tool (good for tabs + SEO). */
export function syncDocumentTitle(toolId) {
  const seo = TOOL_SEO[toolId]
  if (seo) {
    document.title = seo.title
  }
}
