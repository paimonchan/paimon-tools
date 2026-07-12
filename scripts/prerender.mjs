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
const { HOME_SEO, TOOL_SEO, SITE_URL, jsonLdFor, breadcrumbLdFor, noscriptBodyFor } = seoModule

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
    ogImage: HOME_SEO.ogImage || `${SITE_URL}/og-image.png`,
    ogImageAlt: HOME_SEO.ogImageAlt || 'Paimon Tools — convert JSON, CSV and Excel data, 100% in your browser',
    jsonLd: JSON.stringify(jsonLdFor(null)),
    breadcrumbLd: JSON.stringify(breadcrumbLdFor(null)),
    noscript: noscriptBodyFor(null),
    bodyHtml: HOME_SEO.bodyHtml,
  })
  await writeFile(templatePath, homeHtml, 'utf8')
  console.log(`[prerender] ✓ home (index.html)`)

  // --- Per-tool pages (dist/<path>/index.html) ---
  // These live one or more directories deeper, so "./" asset paths must become
  // "../" for single-level paths or "../../" for deeper paths.
  for (const [toolId, seo] of tools) {
    const html = fillSeo(template, {
      title: seo.title,
      description: seo.description,
      keywords: seo.keywords,
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
  }

  console.log(`[prerender] Done: 1 home + ${tools.length} tool pages.`)

  // --- Sitemap (generate XML with today's date as lastmod) ---
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', freq: 'weekly' },
    ...tools.map(([, seo]) => ({
      loc: `${SITE_URL}/${seo.path}/`,
      priority: '0.9',
      freq: 'monthly',
    })),
  ]
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}
</urlset>`
  await writeFile(join(DIST, 'sitemap.xml'), sitemap, 'utf8')
  console.log(`[prerender] ✓ sitemap.xml (${urls.length} URLs, lastmod: ${today})`)
}

/** Replace the %%SEO%% tokens with per-page values. */
function fillSeo(tpl, { title, description, keywords, canonical, ogImage, ogImageAlt, jsonLd, breadcrumbLd, noscript, bodyHtml }) {
  return tpl
    .replace(/%%TITLE%%/g, escapeHtml(title))
    .replace(/%%DESCRIPTION%%/g, escapeHtml(description))
    .replace(/%%KEYWORDS%%/g, escapeHtml(keywords))
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
