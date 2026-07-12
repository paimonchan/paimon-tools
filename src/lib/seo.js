/**
 * seo.js — per-tool SEO metadata, kept in a dependency-free module so it can
 * be imported both by the app (registry.ts) and by the prerender build script
 * (which runs in plain Node, no JSX/bundler).
 *
 * This is the single source of truth for titles, descriptions and keywords.
 * registry.ts and the prerender script both derive from it.
 */

export const HOME_SEO = {
  title: 'Paimon Tools — Free JSON, CSV & Excel Converter',
  description:
    'Free, private, in-browser data converter: JSON to CSV, CSV to Excel, Excel to JSON, JSON formatter and minifier. No sign-up, no uploads — your data never leaves your device. Open source.',
  keywords:
    'json to csv, csv to json, json to excel, excel to json, csv to excel, json formatter, json minifier, json beautifier, convert json, data converter, online json tools, privacy-first tools',
  path: '',
  bodyHtml: `<h1>Paimon Tools — Free Converter for JSON, CSV &amp; Excel</h1>
<p>Convert between <strong>JSON, CSV, and Excel</strong> entirely in your browser — no uploads, no sign-up, no servers. Your data never leaves your device.</p>
<h2>Available conversion tools</h2>
<ul>
  <li><a href="json-to-csv/">JSON to CSV</a> — convert JSON arrays to CSV tables</li>
  <li><a href="csv-to-json/">CSV to JSON</a> — convert CSV tables to JSON arrays</li>
  <li><a href="json-to-excel/">JSON to Excel (.xlsx)</a> — export JSON as spreadsheets</li>
  <li><a href="excel-to-json/">Excel to JSON</a> — extract JSON from .xlsx files</li>
  <li><a href="csv-to-excel/">CSV to Excel</a> — turn CSV into .xlsx</li>
  <li><a href="excel-to-csv/">Excel to CSV</a> — extract CSV from .xlsx sheets</li>
  <li><a href="json-formatter/">JSON Formatter</a> — pretty-print and validate JSON</li>
  <li><a href="json-minifier/">JSON Minifier</a> — compress JSON by stripping whitespace</li>
</ul>
<p><em>100% client-side, open source, privacy-first. Enable JavaScript for the full interactive experience.</em></p>`,
}

/**
 * Per-tool SEO. `path` is the URL segment (e.g. 'json-to-csv' → /json-to-csv).
 * Keep these aligned with the `id` field in registry.ts.
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
    bodyHtml: `<h1>JSON to CSV Converter</h1>
<p>Convert a JSON array to a CSV table entirely in your browser. Paste your JSON data and get clean CSV output — no uploads, no sign-up, fully private.</p>
<p>Example input: <code>[{"name":"Alice","age":30},{"name":"Bob","age":25}]</code></p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'csv-to-json': {
    title: 'CSV to JSON Converter — Free, Private, In-Browser | Paimon Tools',
    description:
      'Convert CSV to JSON online, entirely in your browser. Paste a CSV table with headers and get a JSON array — no uploads, no sign-up, fully private.',
    keywords: 'csv to json, convert csv to json, csv parser, csv json converter, parse csv',
    path: 'csv-to-json',
    h1: 'CSV to JSON Converter',
    breadcrumb: 'Convert / CSV to JSON',
    bodyHtml: `<h1>CSV to JSON Converter</h1>
<p>Convert a CSV table to a JSON array entirely in your browser. Paste CSV data with headers and get clean JSON — no uploads, no sign-up, fully private.</p>
<p>Example input: <code>name,age\\nAlice,30\\nBob,25</code></p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'json-to-excel': {
    title: 'JSON to Excel (.xlsx) Converter — Free & Private | Paimon Tools',
    description:
      'Convert JSON to Excel (.xlsx) instantly in your browser. Export a JSON array as a downloadable spreadsheet — no uploads, no sign-up, your data stays local.',
    keywords: 'json to excel, json to xlsx, convert json to excel, json spreadsheet export',
    path: 'json-to-excel',
    h1: 'JSON to Excel Converter',
    breadcrumb: 'Convert / JSON to Excel',
    bodyHtml: `<h1>JSON to Excel (.xlsx) Converter</h1>
<p>Export a JSON array as a downloadable Excel spreadsheet (.xlsx) entirely in your browser. Your data is processed locally — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'excel-to-json': {
    title: 'Excel to JSON Converter — Free & Private, In-Browser | Paimon Tools',
    description:
      'Convert Excel (.xlsx) to JSON in your browser. Drop a spreadsheet and get a JSON array of its first sheet — no uploads, no sign-up, fully private.',
    keywords: 'excel to json, xlsx to json, convert excel to json, spreadsheet to json',
    path: 'excel-to-json',
    h1: 'Excel to JSON Converter',
    breadcrumb: 'Convert / Excel to JSON',
    bodyHtml: `<h1>Excel to JSON Converter</h1>
<p>Extract JSON data from an Excel (.xlsx) spreadsheet entirely in your browser. Drop a file and get a JSON array from the first sheet — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'csv-to-excel': {
    title: 'CSV to Excel (.xlsx) Converter — Free & Private | Paimon Tools',
    description:
      'Convert CSV to Excel (.xlsx) instantly in your browser. Turn a CSV table into a downloadable spreadsheet — no uploads, no sign-up, your data stays local.',
    keywords: 'csv to excel, csv to xlsx, convert csv to excel, csv spreadsheet',
    path: 'csv-to-excel',
    h1: 'CSV to Excel Converter',
    breadcrumb: 'Convert / CSV to Excel',
    bodyHtml: `<h1>CSV to Excel (.xlsx) Converter</h1>
<p>Turn a CSV table into a downloadable Excel spreadsheet (.xlsx) entirely in your browser. Your data is processed locally — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'excel-to-csv': {
    title: 'Excel to CSV Converter — Free & Private, In-Browser | Paimon Tools',
    description:
      'Convert Excel (.xlsx) to CSV in your browser. Drop a spreadsheet and get CSV from its first sheet — no uploads, no sign-up, fully private.',
    keywords: 'excel to csv, xlsx to csv, convert excel to csv, spreadsheet to csv',
    path: 'excel-to-csv',
    h1: 'Excel to CSV Converter',
    breadcrumb: 'Convert / Excel to CSV',
    bodyHtml: `<h1>Excel to CSV Converter</h1>
<p>Extract CSV data from an Excel (.xlsx) spreadsheet entirely in your browser. Drop a file and get CSV from the first sheet — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
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
    bodyHtml: `<h1>JSON Formatter &amp; Beautifier</h1>
<p>Format, beautify, and validate JSON entirely in your browser. Pretty-print with 2 spaces, 4 spaces, or tabs — your data never leaves your device.</p>
<p>Validates JSON syntax on the fly, highlighting errors as you type.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'json-minifier': {
    title: 'JSON Minifier — Compress & Minify JSON Free | Paimon Tools',
    description:
      'Minify JSON online, in your browser. Strip all whitespace to compress your JSON — validates syntax as it goes — no uploads, fully private.',
    keywords: 'json minifier, minify json, compress json, json compact, reduce json size',
    path: 'json-minifier',
    h1: 'JSON Minifier',
    breadcrumb: 'Format / JSON Minifier',
    bodyHtml: `<h1>JSON Minifier</h1>
<p>Minify and compress JSON entirely in your browser. Strips all unnecessary whitespace to reduce file size — validates syntax as it goes. No uploads, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  playground: {
    title: 'Online Code Playground — Free In-Browser Editor | Paimon Tools',
    description:
      'Write and run JavaScript & JSON online, free. Code playground with syntax highlighting and Web Worker sandbox — 100% in your browser, no sign-up.',
    keywords: 'code playground, online compiler, javascript online, free code editor, run javascript',
    path: 'code',
    h1: 'Online Code Playground',
    breadcrumb: 'Tools / Playground',
    bodyHtml: `<h1>Online Code Playground</h1>
<p>Write and run code in your browser. Choose from JavaScript (with execution) or JSON (format &amp; validate). Everything runs locally — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
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
