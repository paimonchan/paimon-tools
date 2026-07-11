/**
 * seo.js — per-tool SEO metadata, kept in a dependency-free module so it can
 * be imported both by the app (tools.js) and by the prerender build script
 * (which runs in plain Node, no JSX/bundler).
 *
 * This is the single source of truth for titles, descriptions and keywords.
 * tools.js and the prerender script both derive from it.
 */

export const HOME_SEO = {
  title: 'Paimon Tools — Free JSON ⇄ CSV ⇄ Excel Converter (Runs In Your Browser)',
  description:
    'Free, private, in-browser data converter: JSON to CSV, CSV to Excel, Excel to JSON, JSON formatter and minifier. No sign-up, no uploads — your data never leaves your device. Open source.',
  keywords:
    'json to csv, csv to json, json to excel, excel to json, csv to excel, json formatter, json minifier, json beautifier, convert json, data converter, online json tools, privacy-first tools',
  path: '',
}

/**
 * Per-tool SEO. `path` is the URL segment (e.g. 'json-to-csv' → /json-to-csv).
 * Keep these aligned with the `id` field in tools.js.
 */
export const TOOL_SEO = {
  'json-to-csv': {
    title: 'JSON to CSV Converter — Free, Private, In-Browser | Paimon Tools',
    description:
      'Convert JSON to CSV instantly in your browser. Paste a JSON array and get a clean CSV table — no uploads, no sign-up, your data never leaves your device.',
    keywords: 'json to csv, convert json to csv, json array to csv, csv export, json csv converter',
    path: 'json-to-csv',
    h1: 'JSON to CSV Converter',
    breadcrumb: 'Convert / JSON to CSV',
  },
  'csv-to-json': {
    title: 'CSV to JSON Converter — Free, Private, In-Browser | Paimon Tools',
    description:
      'Convert CSV to JSON online, entirely in your browser. Paste a CSV table with headers and get a JSON array — no uploads, no sign-up, fully private.',
    keywords: 'csv to json, convert csv to json, csv parser, csv json converter, parse csv',
    path: 'csv-to-json',
    h1: 'CSV to JSON Converter',
    breadcrumb: 'Convert / CSV to JSON',
  },
  'json-to-excel': {
    title: 'JSON to Excel (.xlsx) Converter — Free & Private | Paimon Tools',
    description:
      'Convert JSON to Excel (.xlsx) instantly in your browser. Export a JSON array as a downloadable spreadsheet — no uploads, no sign-up, your data stays local.',
    keywords: 'json to excel, json to xlsx, convert json to excel, json spreadsheet export',
    path: 'json-to-excel',
    h1: 'JSON to Excel Converter',
    breadcrumb: 'Convert / JSON to Excel',
  },
  'excel-to-json': {
    title: 'Excel to JSON Converter — Free & Private, In-Browser | Paimon Tools',
    description:
      'Convert Excel (.xlsx) to JSON in your browser. Drop a spreadsheet and get a JSON array of its first sheet — no uploads, no sign-up, fully private.',
    keywords: 'excel to json, xlsx to json, convert excel to json, spreadsheet to json',
    path: 'excel-to-json',
    h1: 'Excel to JSON Converter',
    breadcrumb: 'Convert / Excel to JSON',
  },
  'csv-to-excel': {
    title: 'CSV to Excel (.xlsx) Converter — Free & Private | Paimon Tools',
    description:
      'Convert CSV to Excel (.xlsx) instantly in your browser. Turn a CSV table into a downloadable spreadsheet — no uploads, no sign-up, your data stays local.',
    keywords: 'csv to excel, csv to xlsx, convert csv to excel, csv spreadsheet',
    path: 'csv-to-excel',
    h1: 'CSV to Excel Converter',
    breadcrumb: 'Convert / CSV to Excel',
  },
  'excel-to-csv': {
    title: 'Excel to CSV Converter — Free & Private, In-Browser | Paimon Tools',
    description:
      'Convert Excel (.xlsx) to CSV in your browser. Drop a spreadsheet and get CSV from its first sheet — no uploads, no sign-up, fully private.',
    keywords: 'excel to csv, xlsx to csv, convert excel to csv, spreadsheet to csv',
    path: 'excel-to-csv',
    h1: 'Excel to CSV Converter',
    breadcrumb: 'Convert / Excel to CSV',
  },
  'json-formatter': {
    title: 'JSON Formatter & Beautifier — Pretty Print JSON Free | Paimon Tools',
    description:
      'Format and beautify JSON online, in your browser. Validate syntax and pretty-print with 2 spaces, 4 spaces, or tabs — no uploads, fully private.',
    keywords:
      'json formatter, json beautifier, pretty print json, format json, json validator, indent json',
    path: 'json-formatter',
    h1: 'JSON Formatter & Beautifier',
    breadcrumb: 'Format / JSON Formatter',
  },
  'json-minifier': {
    title: 'JSON Minifier — Compress & Minify JSON Free | Paimon Tools',
    description:
      'Minify JSON online, in your browser. Strip all whitespace to compress your JSON — validates syntax as it goes — no uploads, fully private.',
    keywords: 'json minifier, minify json, compress json, json compact, reduce json size',
    path: 'json-minifier',
    h1: 'JSON Minifier',
    breadcrumb: 'Format / JSON Minifier',
  },
}

/** Base site URL — used for canonical URLs, OG, sitemap. */
export const SITE_URL = 'https://paimonchan.github.io/paimon-tools'

/**
 * Build BreadcrumbList JSON-LD for a tool page.
 */
export function breadcrumbLdFor(toolId) {
  const items = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Paimon Tools',
      item: `${SITE_URL}/`,
    },
  ]

  if (toolId && TOOL_SEO[toolId]) {
    const seo = TOOL_SEO[toolId]
    const parts = seo.breadcrumb.split(' / ')
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: parts[0],
      item: `${SITE_URL}/#${parts[0].toLowerCase()}`,
    })
    items.push({
      '@type': 'ListItem',
      position: 3,
      name: seo.h1,
      item: `${SITE_URL}/${seo.path}/`,
    })
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  }
}

/**
 * Build JSON-LD structured data for a tool (or home) page. Read from raw HTML
 * by Google regardless of client-side rendering.
 */
export function jsonLdFor(toolId) {
  const base = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Paimon Tools',
    url: `${SITE_URL}/`,
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: 'Data Conversion',
    operatingSystem: 'Any (web browser)',
    browserRequirements: 'Requires a modern web browser with JavaScript enabled.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    isAccessibleForFree: true,
    author: { '@type': 'Person', name: 'paimonchan' },
    publisher: { '@type': 'Person', name: 'paimonchan' },
    inLanguage: 'en',
  }

  if (!toolId || !TOOL_SEO[toolId]) {
    // Home page
    return {
      ...base,
      description: HOME_SEO.description,
      featureList: Object.values(TOOL_SEO).map((s) => s.h1),
      keywords: HOME_SEO.keywords,
    }
  }

  const seo = TOOL_SEO[toolId]
  return {
    ...base,
    name: seo.h1,
    url: `${SITE_URL}/${seo.path}/`,
    description: seo.description,
    keywords: seo.keywords,
    isPartOf: { '@type': 'WebApplication', name: 'Paimon Tools', url: `${SITE_URL}/` },
  }
}

/** Crawlable noscript body for a tool (or home) page. */
export function noscriptBodyFor(toolId) {
  if (!toolId || !TOOL_SEO[toolId]) {
    return `<h1>Paimon Tools — Free In-Browser Data Converter</h1>
      <p>Convert between <strong>JSON, CSV, and Excel</strong> entirely in your browser.
        No backend, no uploads, no sign-up — your data never leaves your device.</p>
      <h2>Available tools</h2>
      <ul>
        <li><a href="${SITE_URL}/json-to-csv/">JSON to CSV converter</a></li>
        <li><a href="${SITE_URL}/csv-to-json/">CSV to JSON converter</a></li>
        <li><a href="${SITE_URL}/json-to-excel/">JSON to Excel (.xlsx) converter</a></li>
        <li><a href="${SITE_URL}/excel-to-json/">Excel to JSON converter</a></li>
        <li><a href="${SITE_URL}/csv-to-excel/">CSV to Excel converter</a></li>
        <li><a href="${SITE_URL}/excel-to-csv/">Excel to CSV converter</a></li>
        <li><a href="${SITE_URL}/json-formatter/">JSON formatter and beautifier</a></li>
        <li><a href="${SITE_URL}/json-minifier/">JSON minifier</a></li>
      </ul>
      <p>Open-source and privacy-first. Enable JavaScript to use it.</p>`
  }

  const seo = TOOL_SEO[toolId]
  return `<h1>${seo.h1}</h1>
      <p>${seo.description}</p>
      <p>This tool runs entirely in your browser — no uploads, no sign-up.
        Enable JavaScript to use it, or return to the
        <a href="${SITE_URL}/">full list of data conversion tools</a>.</p>`
}
