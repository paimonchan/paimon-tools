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
 *
 * Robustness note: the GitHub Pages subpath prefix (e.g. /paimon-tools) and the
 * per-tool segment (e.g. /json-to-csv) can both be present, and trailing
 * slashes are inconsistent across environments. Rather than guessing the base
 * by string surgery, we strip any KNOWN tool segment and treat what remains as
 * the stable base. This avoids path-stacking bugs when navigating tool→tool.
 */

import { TOOL_SEO } from './seo'

/** All known tool path segments, used to locate & strip them reliably. */
const TOOL_PATHS = Object.values(TOOL_SEO).map((s) => s.path)

/** Reverse lookup: path segment -> tool id. */
const PATH_TO_ID = Object.fromEntries(
  Object.entries(TOOL_SEO).map(([id, seo]) => [seo.path, id])
)

/**
 * Detect the active tool from the URL by scanning path segments for a known
 * tool path. Returns the tool id, or null at the home page.
 */
export function toolIdFromLocation() {
  const segments = window.location.pathname.split('/').filter(Boolean)
  for (const seg of segments) {
    if (PATH_TO_ID[seg]) return PATH_TO_ID[seg]
  }
  return null
}

/**
 * Compute the stable base path: everything in the current URL EXCEPT the tool
 * segment (and any trailing slash). Examples (prod subpath /paimon-tools):
 *   /paimon-tools/json-to-csv/  ->  /paimon-tools
 *   /paimon-tools/json-to-csv   ->  /paimon-tools
 *   /json-to-csv/               ->  ''           (dev, no subpath)
 *   /paimon-tools/              ->  /paimon-tools
 *   /                           ->  ''
 *
 * This is the key to avoiding path-stacking: we strip the tool segment rather
 * than naively trimming the last path component.
 */
function detectBase() {
  const segments = window.location.pathname.split('/').filter(Boolean)
  const withoutTool = segments.filter((s) => !PATH_TO_ID[s])
  return withoutTool.length ? '/' + withoutTool.join('/') : ''
}

/** Push a history entry for a tool. No-op if already there. */
export function pushTool(toolId) {
  const seo = TOOL_SEO[toolId]
  if (!seo) return
  if (toolIdFromLocation() === toolId) return // already on this tool

  const base = detectBase()
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
