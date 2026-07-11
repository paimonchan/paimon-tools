/**
 * prerender.mjs — post-build step that turns the single-page app into a set of
 * pre-rendered static HTML files, one per tool (plus the home page).
 *
 * Why: GitHub Pages serves static files. By generating one HTML file per tool,
 * each with its own <title>, meta description, canonical URL and JSON-LD, search
 * engines can index every tool individually AND crawl keyword-rich content from
 * the raw HTML (no need to execute the SPA's JavaScript).
 *
 * The SPA still hydrates and works exactly as before — these are just richer
 * entry points that share the same JS/CSS bundle.
 *
 * Flow:
 *   1. vite build writes dist/index.html with %%TOKEN%% placeholders filled by
 *      Vite's normal asset resolution (./assets/index-HASH.js, ./favicon.svg, …)
 *   2. this script reads dist/index.html, fills the SEO tokens for home + each
 *      tool, rewrites relative asset paths to "../" for the deeper tool pages,
 *      and writes dist/index.html (home) and dist/<path>/index.html (per tool)
 *
 * Run via: `npm run build` (already wired in package.json).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

// Import the SEO source of truth. This file is plain JS (no JSX, no bundler
// needed) so Node can import it directly.
const seoModule = await import('../src/lib/seo.js')
const { HOME_SEO, TOOL_SEO, SITE_URL, jsonLdFor, noscriptBodyFor } = seoModule

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

async function main() {
  const templatePath = join(DIST, 'index.html')
  if (!existsSync(templatePath)) {
    console.error('[prerender] dist/index.html not found. Run vite build first.')
    process.exit(1)
  }
  const template = await readFile(templatePath, 'utf8')

  const tools = Object.entries(TOOL_SEO)

  // --- Home page (root dist/index.html) ---
  // Asset paths stay "./" — no rewriting needed.
  const homeHtml = fillSeo(template, {
    title: HOME_SEO.title,
    description: HOME_SEO.description,
    keywords: HOME_SEO.keywords,
    canonical: `${SITE_URL}/`,
    jsonLd: JSON.stringify(jsonLdFor(null)),
    noscript: noscriptBodyFor(null),
  })
  await writeFile(templatePath, homeHtml, 'utf8')
  console.log(`[prerender] ✓ home (index.html)`)

  // --- Per-tool pages (dist/<path>/index.html) ---
  // These live one directory deeper, so "./" asset paths must become "../".
  for (const [toolId, seo] of tools) {
    const html = fillSeo(template, {
      title: seo.title,
      description: seo.description,
      keywords: seo.keywords,
      canonical: `${SITE_URL}/${seo.path}/`,
      jsonLd: JSON.stringify(jsonLdFor(toolId)),
      noscript: noscriptBodyFor(toolId),
    })
    const deep = rewriteRelativePaths(html) // ./ → ../
    const dir = join(DIST, seo.path)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), deep, 'utf8')
    console.log(`[prerender] ✓ ${seo.path}/index.html`)
  }

  console.log(`[prerender] Done: 1 home + ${tools.length} tool pages.`)
}

/** Replace the %%SEO%% tokens with per-page values. */
function fillSeo(tpl, { title, description, keywords, canonical, jsonLd, noscript }) {
  return tpl
    .replace(/%%TITLE%%/g, escapeHtml(title))
    .replace(/%%DESCRIPTION%%/g, escapeHtml(description))
    .replace(/%%KEYWORDS%%/g, escapeHtml(keywords))
    .replace(/%%CANONICAL%%/g, escapeHtml(canonical))
    .replace(/%%JSONLD%%/g, jsonLd)
    .replace(/%%NOSCRIPT%%/g, noscript)
}

/**
 * Rewrite "./assets/..." and other root-relative "./" references to "../" so
 * they resolve correctly from a deeper directory (dist/<tool>/index.html).
 * Only touches local asset references; leaves https:// URLs untouched.
 */
function rewriteRelativePaths(html) {
  return html.replace(/(href|src)="\.\/(?!\/)/g, '$1="../')
}

function escapeHtml(s) {
  // For <title> text and meta content: keep & literal (browsers render it
  // correctly), only escape the chars that would break the HTML structure.
  return String(s)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

main().catch((e) => {
  console.error('[prerender] failed:', e)
  process.exit(1)
})
