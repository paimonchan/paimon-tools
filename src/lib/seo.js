/**
 * seo.js — per-tool SEO metadata, kept in a dependency-free module so it can
 * be imported both by the app (registry.ts) and by the prerender build script
 * (which runs in plain Node, no JSX/bundler).
 *
 * This is the single source of truth for titles, descriptions and keywords.
 * registry.ts and the prerender script both derive from it.
 */

/** Base site URL — used for canonical URLs, OG, sitemap. */
export const SITE_URL = 'https://paimonchan.github.io/paimon-tools'

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`
const DEFAULT_OG_ALT = 'Paimon Tools — convert JSON, CSV and Excel data, 100% in your browser'

export const HOME_SEO = {
  title: 'Paimon Tools — Free JSON, CSV & Excel Converter',
  description:
    'Free, private, in-browser data converter: JSON to CSV, CSV to Excel, Excel to JSON, JSON formatter and minifier. No sign-up, no uploads — your data never leaves your device. Open source.',
  keywords:
    'json to csv, csv to json, json to excel, excel to json, csv to excel, json formatter, json minifier, json beautifier, convert json, data converter, online json tools, privacy-first tools',
  path: '',
  ogImage: DEFAULT_OG_IMAGE,
  ogImageAlt: DEFAULT_OG_ALT,
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
  <li><a href="code/">Code Playground</a> — run JavaScript, Python &amp; HTML online</li>
  <li><a href="base64-encode/">Base64 Encode</a> — encode text to Base64</li>
  <li><a href="base64-decode/">Base64 Decode</a> — decode Base64 back to text</li>
  <li><a href="yaml-to-json/">YAML to JSON</a> — convert YAML to JSON</li>
  <li><a href="json-to-yaml/">JSON to YAML</a> — convert JSON to YAML</li>
  <li><a href="hash-generator/">SHA-256 Hash</a> — generate SHA-256 checksum</li>
  <li><a href="combine-files/">Combine Files</a> — merge multiple CSV &amp; Excel files into one
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
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
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
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
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
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
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
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
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
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
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
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
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
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
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
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'JSON Minifier',
    breadcrumb: 'Format / JSON Minifier',
    bodyHtml: `<h1>JSON Minifier</h1>
<p>Minify and compress JSON entirely in your browser. Strips all unnecessary whitespace to reduce file size — validates syntax as it goes. No uploads, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'base64-encode': {
    title: 'Base64 Encode — Free Online Base64 Encoder | Paimon Tools',
    description:
      'Encode text to Base64 online, free. UTF-8 safe — handles Unicode, emoji & special characters. 100% in-browser, no uploads, no sign-up, fully private.',
    keywords: 'base64 encode, base64 encoder, text to base64, encode to base64, base64 encoding online',
    path: 'base64-encode',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'Base64 Encode',
    breadcrumb: 'Convert / Base64 Encode',
    bodyHtml: `<h1>Base64 Encode</h1>
<p>Encode any text to Base64 entirely in your browser. UTF-8 safe — handles Unicode, emoji, and special characters. No uploads, no sign-up, fully private.</p>
<p>Example input: <code>Hello, World!</code> → <code>SGVsbG8sIFdvcmxkIQ==</code></p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'base64-decode': {
    title: 'Base64 Decode — Free Online Base64 Decoder | Paimon Tools',
    description:
      'Decode Base64 to text online, free. Convert Base64 strings back to readable text — 100% in-browser, no uploads, no sign-up, fully private.',
    keywords: 'base64 decode, base64 decoder, base64 to text, decode base64, base64 decoding online',
    path: 'base64-decode',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'Base64 Decode',
    breadcrumb: 'Convert / Base64 Decode',
    bodyHtml: `<h1>Base64 Decode</h1>
<p>Decode Base64 strings back to readable text entirely in your browser. Supports standard Base64 encoded strings. No uploads, no sign-up, fully private.</p>
<p>Example input: <code>SGVsbG8sIFdvcmxkIQ==</code> → <code>Hello, World!</code></p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'uuid-generator': {
    title: 'UUID Generator — Free Online UUID v4 Generator | Paimon Tools',
    description:
      'Generate UUID v4 identifiers online, free. Create random UUIDs instantly — 100% in-browser, no uploads, no sign-up, fully private.',
    keywords: 'uuid generator, uuid v4, generate uuid, guid generator, random uuid, online uuid',
    path: 'uuid-generator',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'UUID Generator',
    breadcrumb: 'Tools / UUID Generator',
    bodyHtml: `<h1>UUID Generator</h1>
<p>Generate random UUID v4 identifiers entirely in your browser. Click to generate — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'yaml-to-json': {
    title: 'YAML to JSON Converter — Free Online | Paimon Tools',
    description:
      'Convert YAML to JSON online, free. Paste YAML and get formatted JSON — 100% in-browser, no uploads, no sign-up, fully private.',
    keywords: 'yaml to json, convert yaml to json, yaml parser, yaml to json converter, yml to json',
    path: 'yaml-to-json',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'YAML to JSON Converter',
    breadcrumb: 'Convert / YAML to JSON',
    bodyHtml: `<h1>YAML to JSON Converter</h1>
<p>Convert YAML to JSON entirely in your browser. Paste YAML and get clean, formatted JSON — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'json-to-yaml': {
    title: 'JSON to YAML Converter — Free Online | Paimon Tools',
    description:
      'Convert JSON to YAML online, free. Paste JSON and get clean YAML output — 100% in-browser, no uploads, no sign-up, fully private.',
    keywords: 'json to yaml, convert json to yaml, json to yml, yaml converter',
    path: 'json-to-yaml',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'JSON to YAML Converter',
    breadcrumb: 'Convert / JSON to YAML',
    bodyHtml: `<h1>JSON to YAML Converter</h1>
<p>Convert JSON to YAML entirely in your browser. Paste JSON and get clean, readable YAML output — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'hash-generator': {
    title: 'SHA-256 Hash Generator — Free Online | Paimon Tools',
    description:
      'Generate SHA-256 hash of any text online, free. Pure JS implementation — 100% in-browser, no uploads, no sign-up, fully private.',
    keywords: 'sha256, sha-256, hash generator, checksum, hash text, online hash, sha256 hash',
    path: 'hash-generator',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'SHA-256 Hash Generator',
    breadcrumb: 'Tools / Hash Generator',
    bodyHtml: `<h1>SHA-256 Hash Generator</h1>
<p>Generate SHA-256 hash of any text entirely in your browser. Pure JavaScript implementation — your data never leaves your device. No uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'combine-files': {
    title: 'Free Online File Combiner — Merge CSV & Excel Files | Paimon Tools',
    description:
      'Combine multiple CSV and Excel files into one, free. Append rows from 2+ files, auto-detect format, union columns — 100% in your browser, no uploads, no sign-up.',
    keywords: 'merge csv, combine csv, merge excel, combine excel files, gabung file csv, csv merger online, excel csv combiner, concat csv',
    path: 'combine-files',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'Combine CSV & Excel Files',
    breadcrumb: 'Tools / Combine Files',
    bodyHtml: `<h1>Combine CSV &amp; Excel Files</h1>
<p>Merge multiple CSV, TSV and Excel files into one file entirely in your browser. Append rows from 2+ files, auto-detect format, union columns — no uploads, no sign-up, fully private. Supports mixed formats.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  playground: {
    title: 'Online Code Playground — Free In-Browser Code Editor | Paimon Tools',
    description:
      'Write and run JavaScript, Python & HTML online, free. Code playground with live preview, Pyodide WASM Python (fetched from CDN, cached locally), syntax highlighting, and sandboxed execution — 100% client-side, no sign-up.',
    keywords: 'code playground, online compiler, python online, html preview, javascript online, free code editor, web ide, live html editor, run python in browser, online code runner',
    path: 'code',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Paimon Tools Code Playground — run JavaScript, Python & HTML in your browser',
    h1: 'Online Code Playground',
    breadcrumb: 'Tools / Playground',
    bodyHtml: `<h1>Online Code Playground</h1>
<p>Write and run code in your browser. Choose from <strong>JavaScript</strong> (sandboxed execution), <strong>Python</strong> (via Pyodide WASM), <strong>HTML</strong> (live iframe preview), or <strong>JSON</strong> (format &amp; validate). Everything runs locally — no uploads, no sign-up, fully private.</p>
<p><strong>Try a specific language:</strong></p>
<ul>
  <li><a href="code/javascript/">JavaScript Playground</a> — sandboxed JS execution</li>
  <li><a href="code/python/">Python Playground</a> — Pyodide WASM Python</li>
  <li><a href="code/html/">HTML Playground</a> — live iframe preview</li>
  <li><a href="code/json/">JSON Playground</a> — format &amp; validate</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },

  // Per-language playground sub-pages (deep links at /code/<language>/)
  'playground-javascript': {
    title: 'JavaScript Online — Run JS Code in Browser | Paimon Tools',
    description:
      'Write and run JavaScript online, free. Code playground with sandboxed execution, console output, syntax highlighting, and instant results — 100% in your browser, no sign-up.',
    keywords: 'javascript online, run javascript online, js playground, javascript compiler online, free javascript editor, online js runner',
    path: 'code/javascript',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'JavaScript Online Playground — run JS code in your browser, free',
    h1: 'JavaScript Online Playground',
    breadcrumb: 'Playground / JavaScript',
    bodyHtml: `<h1>JavaScript Online Playground</h1>
<p>Write and run JavaScript code in your browser. Sandboxed execution (Web Worker) with full console output, CodeMirror syntax highlighting, and instant results — no uploads, no sign-up, fully private.</p>
<p>Try <a href="../html/">HTML Playground</a> · <a href="../python/">Python Playground</a> · <a href="../json/">JSON Playground</a></p>
<p><a href="../../">← Back to all Paimon Tools</a></p>`,
  },

  'playground-python': {
    title: 'Python Online — Run Python in Browser (Pyodide) | Paimon Tools',
    description:
      'Write and run Python online in your browser, free. Powered by Pyodide WASM (fetched from CDN, cached locally) — no server, no setup. Full Python with syntax highlighting and stdout output.',
    keywords: 'python online, run python online, pyodide, python in browser, python playground, online python compiler, wasm python, free python editor',
    path: 'code/python',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Python Online Playground — Pyodide WASM Python in your browser',
    h1: 'Python Online Playground',
    breadcrumb: 'Playground / Python',
    bodyHtml: `<h1>Python Online Playground</h1>
<p>Write and run Python code in your browser, powered by <strong>Pyodide WASM</strong> (fetched from CDN, cached locally). Full Python with syntax highlighting and stdout output — no server, no setup, fully private.</p>
<p>Try <a href="../javascript/">JavaScript Playground</a> · <a href="../html/">HTML Playground</a> · <a href="../json/">JSON Playground</a></p>
<p><a href="../../">← Back to all Paimon Tools</a></p>`,
  },

  'playground-html': {
    title: 'HTML Online — Live Preview HTML Editor | Paimon Tools',
    description:
      'Write HTML online with live iframe preview, free. Edit HTML, CSS and JavaScript in a live-reload sandbox — no uploads, no sign-up, 100% in your browser.',
    keywords: 'html online, html editor, live html preview, html playground, html css editor, live preview html, web editor online, frontend playground',
    path: 'code/html',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'HTML Online Playground — live preview HTML editor in your browser',
    h1: 'HTML Online Playground',
    breadcrumb: 'Playground / HTML',
    bodyHtml: `<h1>HTML Online Playground</h1>
<p>Write HTML, CSS and JavaScript with a live iframe preview — updates in real time. Edit and see results instantly, no uploads, no sign-up, fully private.</p>
<p>Try <a href="../javascript/">JavaScript Playground</a> · <a href="../python/">Python Playground</a> · <a href="../json/">JSON Playground</a></p>
<p><a href="../../">← Back to all Paimon Tools</a></p>`,
  },

  'playground-json': {
    title: 'JSON Online — Format, Validate & Edit JSON | Paimon Tools',
    description:
      'Format, validate and edit JSON online, free. Syntax highlighting, auto-validation, and pretty-printing — 100% client-side, no uploads, fully private.',
    keywords: 'json online, json editor, json formatter online, json validator online, edit json, json beautifier online, format json',
    path: 'code/json',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'JSON Online Playground — format, validate and edit JSON in your browser',
    h1: 'JSON Online Playground',
    breadcrumb: 'Playground / JSON',
    bodyHtml: `<h1>JSON Online Playground</h1>
<p>Format, validate and edit JSON in your browser. Syntax highlighting with auto-validation, pretty-printing, and formatting tools — no uploads, no sign-up, fully private.</p>
<p>Try <a href="../javascript/">JavaScript Playground</a> · <a href="../python/">Python Playground</a> · <a href="../html/">HTML Playground</a></p>
<p><a href="../../">← Back to all Paimon Tools</a></p>`,
  },
}

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
      // Link position 2 to the nearest actual page:
      // "Playground" → /code/, everything else → home
      item: parts[0].toLowerCase() === 'playground'
        ? `${SITE_URL}/code/`
        : `${SITE_URL}/`,
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
        <li><a href="${SITE_URL}/base64-encode/">Base64 encoder</a></li>
        <li><a href="${SITE_URL}/base64-decode/">Base64 decoder</a></li>
        <li><a href="${SITE_URL}/yaml-to-json/">YAML to JSON converter</a></li>
        <li><a href="${SITE_URL}/json-to-yaml/">JSON to YAML converter</a></li>
        <li><a href="${SITE_URL}/hash-generator/">SHA-256 hash generator</a></li>
        <li><a href="${SITE_URL}/combine-files/">Combine Files</a> — merge multiple CSV &amp; Excel files</li>
        <li><a href="${SITE_URL}/code/">Code Playground</a> — run JavaScript, Python &amp; HTML</li>
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
