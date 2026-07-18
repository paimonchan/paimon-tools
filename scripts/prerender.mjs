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
 *   2. this script reads dist/index.html, strips unnecessary modulepreload links
 *      (per-tool: only preload what each page actually needs), fills SEO tokens,
 *      rewrites relative asset paths, and writes per-tool index.html files.
 *
 * Conditional modulepreload (T002):
 *   Vite injects ALL vendor chunks as preloads — including 610KB CodeMirror
 *   and 476KB SheetJS on pages that don't need them. We strip preloads from
 *   the template and re-add only the relevant ones per tool category.
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
const { HOME_SEO, TOOL_SEO, SITE_URL, jsonLdFor, breadcrumbLdFor, noscriptBodyFor, faqLdFor, howToLdFor } = seoModule

// Categories for modulepreload filtering (T002).
// Maps tool preloads category → vendor chunk name patterns to include.
const PRELOAD_ALWAYS = ['rolldown-runtime', 'vendor-react']
const PRELOAD_BY_CATEGORY = {
  converter: ['vendor-xlsx', 'vendor-papaparse'],
  playground: ['vendor-codemirror-core'],
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

async function main() {
  const templatePath = join(DIST, 'index.html')
  if (!existsSync(templatePath)) {
    console.error('[prerender] dist/index.html not found. Run vite build first.')
    process.exit(1)
  }
  let template = await readFile(templatePath, 'utf8')

  // --- Strip ALL modulepreloads from template, categorize by content ---
  // Vite injects preloads for every chunk. We remove them and re-add
  // per-tool based on actual dependencies.
  const preloads = extractModulepreloads(template)
  console.log(`[prerender] Extracted ${preloads.length} modulepreloads from template`)
  console.log(`[prerender] Template has 'modulepreload': ${template.includes('modulepreload')}, first 200 chars: ${template.substring(0, 200).replace(/\n/g, '\\n')}`)
  template = stripModulepreloads(template)
  const basePreloadLines = filterPreloadLines(preloads, PRELOAD_ALWAYS)
  const preloadByCategory = {}
  for (const [cat, patterns] of Object.entries(PRELOAD_BY_CATEGORY)) {
    preloadByCategory[cat] = filterPreloadLines(preloads, patterns)
  }
  console.log(`[prerender] Base preloads: ${basePreloadLines.length}, Converter: ${(preloadByCategory.converter||[]).length}, Playground: ${(preloadByCategory.playground||[]).length}`)

  // Add base preloads (always needed: runtime, React, main CSS) to template
  template = injectPreloads(template, basePreloadLines)
  const afterPreloadCount = (template.match(/modulepreload/g) || []).length
  console.log(`[prerender] After inject: ${afterPreloadCount} modulepreloads in template`)

  const tools = Object.entries(TOOL_SEO)
  // Track pages generated for sitemap (exclude 404 from sitemap)
  const sitemapUrls = []

  // --- Home page (root dist/index.html) ---
  const homeHtml = fillSeo(template, {
    title: HOME_SEO.title,
    description: HOME_SEO.description,
    canonical: `${SITE_URL}/`,
    ogImage: HOME_SEO.ogImage || `${SITE_URL}/og-image.png`,
    ogImageAlt: HOME_SEO.ogImageAlt || 'Paimon Tools — convert JSON, CSV and Excel data, 100% in your browser',
    jsonLd: JSON.stringify(jsonLdFor(null)),
    breadcrumbLd: JSON.stringify(breadcrumbLdFor(null)),
    noscript: noscriptBodyFor(null),
    bodyHtml: HOME_SEO.bodyHtml,
  })
  await writeFile(templatePath, homeHtml, 'utf8')
  console.log(`[prerender] ✓ home (index.html)`)
  sitemapUrls.push({ loc: `${SITE_URL}/`, priority: '1.0', freq: 'weekly' })

  // Custom 404 page — write to dist root (GitHub Pages reads dist/404.html)
  const _404seo = TOOL_SEO['404']
  if (_404seo) {
    let html404 = fillSeo(template, {
      title: _404seo.title,
      description: _404seo.description,
      canonical: `${SITE_URL}/404/`,
      ogImage: _404seo.ogImage || `${SITE_URL}/og-image.png`,
      ogImageAlt: _404seo.ogImageAlt || 'Paimon Tools — page not found',
      jsonLd: JSON.stringify(jsonLdFor('404')),
      breadcrumbLd: JSON.stringify(breadcrumbLdFor('404')),
      noscript: noscriptBodyFor('404'),
      bodyHtml: _404seo.bodyHtml,
    })
    await writeFile(join(DIST, '404.html'), html404, 'utf8')
    console.log(`[prerender] ✓ 404/index.html`)
  }

  // --- Per-tool pages (dist/<path>/index.html) ---
  for (const [toolId, seo] of tools) {
    if (toolId === '404') continue // handled above, excluded from sitemap

    // Build per-tool preloads: base (always) + category-specific
    const toolPreloadLines = [...basePreloadLines]
    if (seo.preloads && Array.isArray(seo.preloads)) {
      for (const cat of seo.preloads) {
        if (preloadByCategory[cat]) {
          toolPreloadLines.push(...preloadByCategory[cat])
        }
      }
    }

    // Apply filtered preloads to the template
    let tpl = injectPreloads(template, toolPreloadLines)

    const html = fillSeo(tpl, {
      title: seo.title,
      description: seo.description,
      canonical: `${SITE_URL}/${seo.path}/`,
      ogImage: seo.ogImage || `${SITE_URL}/og-image.png`,
      ogImageAlt: seo.ogImageAlt || 'Paimon Tools — convert JSON, CSV and Excel data, 100% in your browser',
      jsonLd: JSON.stringify(jsonLdFor(toolId)),
      breadcrumbLd: JSON.stringify(breadcrumbLdFor(toolId)),
      noscript: noscriptBodyFor(toolId),
      bodyHtml: seo.bodyHtml,
    })
    const depth = seo.path.split('/').length
    const deep = rewriteRelativePaths(html, depth)
    const dir = join(DIST, seo.path)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), deep, 'utf8')
    console.log(`[prerender] ✓ ${seo.path}/index.html`)
    sitemapUrls.push({ loc: `${SITE_URL}/${seo.path}/`, priority: '0.9', freq: 'monthly' })
  }

  console.log(`[prerender] Done: 1 home + 1 (404) + ${tools.length - 1} tool pages.`)

  // --- Sitemap ---
  const today = new Date().toISOString().split('T')[0]
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}
</urlset>`
  await writeFile(join(DIST, 'sitemap.xml'), sitemap, 'utf8')
  console.log(`[prerender] ✓ sitemap.xml (${sitemapUrls.length} URLs, lastmod: ${today})`)

  // --- .nojekyll ---
  await writeFile(join(DIST, '.nojekyll'), '', 'utf8')
  console.log(`[prerender] ✓ .nojekyll`)
}

// --- Modulepreload utilities (T002) ---

/**
 * Extract all modulepreload link lines from the HTML template.
 * Returns them as an array of full `<link>` strings.
 */
function extractModulepreloads(html) {
  const regex = /<link rel="modulepreload"[^>]*\/>/g
  const matches = []
  let match
  while ((match = regex.exec(html)) !== null) {
    matches.push(match[0])
  }
  return matches
}

/**
 * Remove all modulepreload link lines from HTML.
 */
function stripModulepreloads(html) {
  return html.replace(/<link rel="modulepreload"[^>]*>\n?/g, '')
}

/**
 * Filter preload lines to only those matching given filename patterns.
 */
function filterPreloadLines(preloads, patterns) {
  return preloads.filter((line) =>
    patterns.some((pat) => line.includes(pat))
  )
}

/**
 * Inject preload lines into the HTML template right before `</head>`.
 * Deduplicates to avoid double-injecting always-required preloads.
 */
function injectPreloads(html, preloadLines) {
  // Remove any existing preload lines first to avoid duplication
  let result = html.replace(/<link rel="modulepreload"[^>]*>\n?/g, '')
  // Insert before </head>
  const headEnd = result.indexOf('</head>')
  if (headEnd === -1) return result
  const insert = preloadLines.map((l) => l + '\n').join('')
  return result.slice(0, headEnd) + insert + result.slice(headEnd)
}

/** Replace the %%SEO%% tokens with per-page values. */
function fillSeo(tpl, { title, description, canonical, ogImage, ogImageAlt, jsonLd, breadcrumbLd, noscript, bodyHtml }) {
  return tpl
    .replace(/%%TITLE%%/g, escapeHtml(title))
    .replace(/%%DESCRIPTION%%/g, escapeHtml(description))
    .replace(/%%CANONICAL%%/g, escapeHtml(canonical))
    .replace(/%%OG_IMAGE%%/g, ogImage)
    .replace(/%%OG_IMAGE_ALT%%/g, escapeHtml(ogImageAlt))
    .replace(/%%JSONLD%%/g, jsonLd)
    .replace(/%%BREADCRUMBLD%%/g, breadcrumbLd)
    .replace(/%%NOSCRIPT%%/g, noscript)
    .replace(/%%PRERENDER_BODY%%/g, bodyHtml || '')
}

/**
 * Rewrite "./assets/..." and other root-relative "./" references to "../" (or
 * "../../" for deeper paths) so they resolve correctly from deeper directories.
 * Only touches local asset references; leaves https:// URLs untouched.
 */
function rewriteRelativePaths(html, depth = 1) {
  const prefix = '../'.repeat(depth)
  return html.replace(/(href|src)="\.\/(?!\/)/g, `$1="${prefix}`)
}

function escapeHtml(s) {
  return String(s)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

main().catch((e) => {
  console.error('[prerender] failed:', e)
  process.exit(1)
})
