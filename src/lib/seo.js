/**
 * seo.js - per-tool SEO metadata, kept in a dependency-free module so it can
 * be imported both by the app (registry.ts) and by the prerender build script
 * (which runs in plain Node, no JSX/bundler).
 *
 * This is the single source of truth for titles, descriptions and keywords.
 * registry.ts and the prerender script both derive from it.
 */

/** Base site URL - used for canonical URLs, OG, sitemap. */
export const SITE_URL = 'https://paimonchan.github.io/paimon-tools'

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.webp`
const DEFAULT_OG_ALT = 'Paimon Tools - convert JSON, CSV and Excel data, 100% in your browser'

export const HOME_SEO = {
  title: 'Paimon Tools - Free JSON, CSV & Excel Converter',
  description:
    'Free, private, in-browser data converter: JSON to CSV, CSV to Excel, Excel to JSON, JSON formatter and minifier. No sign-up, no uploads - your data never leaves your device. Open source.',
  path: '',
  ogImage: DEFAULT_OG_IMAGE,
  ogImageAlt: DEFAULT_OG_ALT,
  bodyHtml: `<h1>Paimon Tools - Free Converter for JSON, CSV &amp; Excel</h1>
<p>Convert between <strong>JSON, CSV, and Excel</strong> entirely in your browser - no uploads, no sign-up, no servers. Your data never leaves your device.</p>
<h2>Available conversion tools</h2>
<ul>
  <li><a href="json-to-csv/">JSON to CSV</a> - convert JSON arrays to CSV tables</li>
  <li><a href="csv-to-json/">CSV to JSON</a> - convert CSV tables to JSON arrays</li>
  <li><a href="json-to-excel/">JSON to Excel (.xlsx)</a> - export JSON as spreadsheets</li>
  <li><a href="excel-to-json/">Excel to JSON</a> - extract JSON from .xlsx files</li>
  <li><a href="csv-to-excel/">CSV to Excel</a> - turn CSV into .xlsx</li>
  <li><a href="excel-to-csv/">Excel to CSV</a> - extract CSV from .xlsx sheets</li>
  <li><a href="json-formatter/">JSON Formatter</a> - pretty-print and validate JSON</li>
  <li><a href="json-minifier/">JSON Minifier</a> - compress JSON by stripping whitespace</li>
  <li><a href="code/">Code Playground</a> - run JavaScript, Python &amp; HTML online</li>
  <li><a href="base64-encode/">Base64 Encode</a> - encode text to Base64</li>
  <li><a href="base64-decode/">Base64 Decode</a> - decode Base64 back to text</li>
  <li><a href="yaml-to-json/">YAML to JSON</a> - convert YAML to JSON</li>
  <li><a href="json-to-yaml/">JSON to YAML</a> - convert JSON to YAML</li>
  <li><a href="hash-generator/">SHA-256 Hash</a> - generate SHA-256 checksum</li>
  <li><a href="combine-files/">Combine Files</a> - merge multiple CSV &amp; Excel files into one
  <li><a href="diff-tool/">Diff Tool</a> - compare two texts side by side
</ul>
<p><em>100% client-side, open source, privacy-first. Enable JavaScript for the full interactive experience.</em></p>`,
}

/**
 * Per-tool SEO. `path` is the URL segment (e.g. 'json-to-csv' → /json-to-csv).
 * Keep these aligned with the `id` field in registry.ts.
 */
export const TOOL_SEO = {
  'json-to-csv': {
    title: 'JSON to CSV Converter - Free, Private, In-Browser | Paimon Tools',
    description:
      'Convert JSON to CSV instantly in your browser. Paste a JSON array and get a clean CSV table - no uploads, no sign-up, your data never leaves your device.',
    path: 'json-to-csv',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'JSON to CSV Converter',
    breadcrumb: 'Convert / JSON to CSV',
    preloads: ['converter'],
    bodyHtml: `<h2>JSON to CSV Converter</h2>
<p>Convert a JSON array to a CSV table entirely in your browser. Paste your JSON data and get clean CSV output - no uploads, no sign-up, fully private.</p>
<p>Example input: <code>[{"name":"Alice","age":30},{"name":"Bob","age":25}]</code></p>
<h3>Common Use Cases</h3>
<ul>
  <li>Export API response data to spreadsheet-friendly CSV format</li>
  <li>Convert MongoDB/Airtable exports from JSON to tabular data</li>
  <li>Prepare JSON data for import into Google Sheets or Excel</li>
</ul>
<h3>How It Works</h3>
<p>Paste a JSON array of objects into the input pane. Keys become CSV column headers, values become rows. Nested objects are stringified. All processing happens locally in your browser.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../csv-to-json/">CSV to JSON Converter</a> - reverse conversion back to JSON</li>
  <li><a href="../json-to-excel/">JSON to Excel Converter</a> - export JSON as .xlsx spreadsheet</li>
  <li><a href="../json-formatter/">JSON Formatter</a> - pretty-print and validate JSON first</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'What JSON format is supported?',
        a: 'Standard JSON arrays of objects. Keys become column headers, values become rows. Nested objects are stringified in the output.' },
      { q: 'Is my data uploaded anywhere?',
        a: 'No. Everything runs entirely in your browser. Your data never leaves your device.' },
    ],
  },
  'csv-to-json': {
    title: 'CSV to JSON Converter - Free, Private, In-Browser | Paimon Tools',
    description:
      'Convert CSV to JSON online, entirely in your browser. Paste a CSV table with headers and get a JSON array - no uploads, no sign-up, fully private.',
    path: 'csv-to-json',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'CSV to JSON Converter',
    breadcrumb: 'Convert / CSV to JSON',
    preloads: ['converter'],
    bodyHtml: `<h2>CSV to JSON Converter</h2>
<p>Convert a CSV table to a JSON array entirely in your browser. Paste CSV data with headers and get clean JSON - no uploads, no sign-up, fully private.</p>
<p>Example input: <code>name,age\\nAlice,30\\nBob,25</code></p>
<h3>Common Use Cases</h3>
<ul>
  <li>Transform CSV reports from Google Sheets into JSON for web apps</li>
  <li>Convert legacy database exports into structured JSON data</li>
  <li>Parse downloaded CSV data from analytics platforms into JSON objects</li>
</ul>
<h3>How It Works</h3>
<p>Paste CSV data with a header row. The first row defines object keys; subsequent rows become array values. Supports quoted fields, escaped commas, and empty cells (become null). All processing is local.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../json-to-csv/">JSON to CSV Converter</a> - reverse conversion back to CSV</li>
  <li><a href="../excel-to-json/">Excel to JSON Converter</a> - extract JSON from .xlsx files</li>
  <li><a href="../csv-to-excel/">CSV to Excel Converter</a> - convert CSV to .xlsx instead</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'Does it support escaped commas/quotes?',
        a: 'Yes. Standard CSV escaping with quoted fields and escaped quotes is fully supported.' },
      { q: 'What about empty cells?',
        a: 'Empty cells become null values in the JSON output.' },
    ],
  },
  'json-to-excel': {
    title: 'JSON to Excel (.xlsx) Converter - Free & Private | Paimon Tools',
    description:
      'Convert JSON to Excel (.xlsx) instantly in your browser. Export a JSON array as a downloadable spreadsheet - no uploads, no sign-up, your data stays local.',
    path: 'json-to-excel',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'JSON to Excel Converter',
    breadcrumb: 'Convert / JSON to Excel',
    preloads: ['converter'],
    bodyHtml: `<h2>JSON to Excel (.xlsx) Converter</h2>
<p>Export a JSON array as a downloadable Excel spreadsheet (.xlsx) entirely in your browser. Your data is processed locally - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Convert API JSON responses into formatted Excel reports for stakeholders</li>
  <li>Create shareable .xlsx files from JSON datasets for non-technical teams</li>
  <li>Generate Excel-compatible reports from database export JSON</li>
</ul>
<h3>How It Works</h3>
<p>Paste a JSON array of objects. SheetJS creates a .xlsx workbook in your browser with data in a sheet named "Data". Click download - all processing is local.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../excel-to-json/">Excel to JSON Converter</a> - reverse: extract JSON from .xlsx</li>
  <li><a href="../json-to-csv/">JSON to CSV Converter</a> - export as CSV instead</li>
  <li><a href="../csv-to-excel/">CSV to Excel Converter</a> - convert CSV to .xlsx</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'excel-to-json': {
    title: 'Excel to JSON Converter - Free & Private, In-Browser | Paimon Tools',
    description:
      'Convert Excel (.xlsx) to JSON in your browser. Drop a spreadsheet and get a JSON array of its first sheet - no uploads, no sign-up, fully private.',
    path: 'excel-to-json',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'Excel to JSON Converter',
    breadcrumb: 'Convert / Excel to JSON',
    preloads: ['converter'],
    bodyHtml: `<h2>Excel to JSON Converter</h2>
<p>Extract JSON data from an Excel (.xlsx) spreadsheet entirely in your browser. Drop a file and get a JSON array from the first sheet - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Extract spreadsheet data from clients for use in web applications</li>
  <li>Convert .xlsx reports into JSON for data processing pipelines</li>
  <li>Parse Excel exports into structured JSON without any server upload</li>
</ul>
<h3>How It Works</h3>
<p>Drop or select an .xlsx file. SheetJS reads the first sheet in your browser and converts each row to a JSON object. Header row defines the keys. All processing is local.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../json-to-excel/">JSON to Excel Converter</a> - reverse: convert JSON to .xlsx</li>
  <li><a href="../excel-to-csv/">Excel to CSV Converter</a> - extract CSV instead</li>
  <li><a href="../combine-files/">Combine Files</a> - merge multiple Excel files</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'csv-to-excel': {
    title: 'CSV to Excel (.xlsx) Converter - Free & Private | Paimon Tools',
    description:
      'Convert CSV to Excel (.xlsx) instantly in your browser. Turn a CSV table into a downloadable spreadsheet - no uploads, no sign-up, your data stays local.',
    path: 'csv-to-excel',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'CSV to Excel Converter',
    breadcrumb: 'Convert / CSV to Excel',
    preloads: ['converter'],
    bodyHtml: `<h2>CSV to Excel (.xlsx) Converter</h2>
<p>Turn a CSV table into a downloadable Excel spreadsheet (.xlsx) entirely in your browser. Your data is processed locally - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Convert CSV reports from analytics into professional .xlsx spreadsheets</li>
  <li>Create formatted Excel files from plain CSV data for presentations</li>
  <li>Transform database CSV exports into Excel for client delivery</li>
</ul>
<h3>How It Works</h3>
<p>Paste CSV data with headers. SheetJS creates a .xlsx file preserving your data structure. Click download - all processing is local with no uploads.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../excel-to-csv/">Excel to CSV Converter</a> - reverse: extract CSV from .xlsx</li>
  <li><a href="../csv-to-json/">CSV to JSON Converter</a> - convert CSV to JSON instead</li>
  <li><a href="../json-to-excel/">JSON to Excel Converter</a> - convert JSON to .xlsx</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'excel-to-csv': {
    title: 'Excel to CSV Converter - Free & Private, In-Browser | Paimon Tools',
    description:
      'Convert Excel (.xlsx) to CSV in your browser. Drop a spreadsheet and get CSV from its first sheet - no uploads, no sign-up, fully private.',
    path: 'excel-to-csv',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'Excel to CSV Converter',
    breadcrumb: 'Convert / Excel to CSV',
    preloads: ['converter'],
    bodyHtml: `<h2>Excel to CSV Converter</h2>
<p>Extract CSV data from an Excel (.xlsx) spreadsheet entirely in your browser. Drop a file and get CSV from the first sheet - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Convert Excel spreadsheets to CSV for database import pipelines</li>
  <li>Extract raw tabular data from .xlsx files for legacy systems</li>
  <li>Prepare Excel data for ETL processes that only accept CSV input</li>
</ul>
<h3>How It Works</h3>
<p>Drop or select an .xlsx file. SheetJS reads the first sheet and converts rows to CSV format preserving headers. All processing happens locally.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../csv-to-excel/">CSV to Excel Converter</a> - reverse: convert CSV to .xlsx</li>
  <li><a href="../excel-to-json/">Excel to JSON Converter</a> - extract JSON instead</li>
  <li><a href="../combine-files/">Combine Files</a> - merge multiple Excel files</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'json-formatter': {
    title: 'JSON Formatter & Beautifier - Pretty Print JSON Free | Paimon Tools',
    description:
      'Format and beautify JSON online, in your browser. Validate syntax and pretty-print with 2 spaces, 4 spaces, or tabs - no uploads, fully private.',
    keywords:
      'json formatter, json beautifier, pretty print json, format json, json validator, indent json',
    path: 'json-formatter',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'JSON Formatter & Beautifier',
    breadcrumb: 'Format / JSON Formatter',
    bodyHtml: `<h2>JSON Formatter &amp; Beautifier</h2>
     <p>Format, beautify, and validate JSON entirely in your browser. Pretty-print with 2 spaces, 4 spaces, or tabs - your data never leaves your device.</p>
     <p>Validates JSON syntax on the fly, highlighting errors as you type.</p>
    <h3>Common Use Cases</h3>
    <ul>
    <li>Clean up minified JSON from API responses for debugging</li>
    <li>Validate JSON syntax before deploying configuration files</li>
    <li>Apply consistent indentation to JSON for code review</li>
    </ul>
    <h3>Related Tools</h3>
    <ul>
    <li><a href="../json-minifier/">JSON Minifier</a> - compress JSON by stripping whitespace</li>
    <li><a href="../json-to-yaml/">JSON to YAML Converter</a> - convert JSON to YAML</li>
    <li><a href="../json-to-csv/">JSON to CSV Converter</a> - convert JSON data to tabular format</li>
    </ul>
     <p><a href="../">← Back to all Paimon Tools</a></p>`,
     faq: [
      { q: 'Does it validate as I type?',
        a: 'Yes. JSON is auto-validated on every keystroke with inline error messages showing exactly where the error is.' },
      { q: 'What indentation options are available?',
        a: '2 spaces, 4 spaces, or tabs. Choose from the dropdown above the output pane.' },
    ],
  },
  'json-minifier': {
    title: 'JSON Minifier - Compress & Minify JSON Free | Paimon Tools',
    description:
      'Minify JSON online, in your browser. Strip all whitespace to compress your JSON - validates syntax as it goes - no uploads, fully private.',
    path: 'json-minifier',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'JSON Minifier',
    breadcrumb: 'Format / JSON Minifier',
    bodyHtml: `<h2>JSON Minifier</h2>
<p>Minify and compress JSON entirely in your browser. Strips all unnecessary whitespace to reduce file size - validates syntax as it goes. No uploads, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Reduce JSON payload size for API requests and storage</li>
  <li>Compact configuration files for production deployment</li>
  <li>Prepare JSON for bandwidth-constrained environments</li>
</ul>
<h3>How It Works</h3>
<p>Paste your JSON and get an instantly minified version with all whitespace removed. Syntax is validated during compression. All processing is local.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../json-formatter/">JSON Formatter</a> - reverse: pretty-print minified JSON</li>
  <li><a href="../json-to-csv/">JSON to CSV Converter</a> - convert JSON to tabular format</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'base64-encode': {
    title: 'Base64 Encode - Free Online Base64 Encoder | Paimon Tools',
    description:
      'Encode text to Base64 online, free. UTF-8 safe - handles Unicode, emoji & special characters. 100% in-browser, no uploads, no sign-up, fully private.',
    path: 'base64-encode',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'Base64 Encode',
    breadcrumb: 'Convert / Base64 Encode',
    bodyHtml: `<h2>Base64 Encode</h2>
<p>Encode any text to Base64 entirely in your browser. UTF-8 safe - handles Unicode, emoji, and special characters. No uploads, no sign-up, fully private.</p>
<p>Example input: <code>Hello, World!</code> → <code>SGVsbG8sIFdvcmxkIQ==</code></p>
<h3>Common Use Cases</h3>
<ul>
  <li>Encode binary data for embedding in JSON or HTML documents</li>
  <li>Prepare data for HTTP headers that require Base64 encoding</li>
  <li>Convert credentials or tokens for basic auth headers</li>
</ul>
<h3>How It Works</h3>
<p>Type or paste text in the input pane. The browser's built-in btoa() function with UTF-8 encoding converts it to Base64 instantly. All processing is local.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../base64-decode/">Base64 Decode</a> - reverse: decode Base64 back to text</li>
  <li><a href="../hash-generator/">SHA-256 Hash Generator</a> - generate secure hashes</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'base64-decode': {
    title: 'Base64 Decode - Free Online Base64 Decoder | Paimon Tools',
    description:
      'Decode Base64 to text online, free. Convert Base64 strings back to readable text - 100% in-browser, no uploads, no sign-up, fully private.',
    path: 'base64-decode',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'Base64 Decode',
    breadcrumb: 'Convert / Base64 Decode',
    bodyHtml: `<h2>Base64 Decode</h2>
<p>Decode Base64 strings back to readable text entirely in your browser. Supports standard Base64 encoded strings. No uploads, no sign-up, fully private.</p>
<p>Example input: <code>SGVsbG8sIFdvcmxkIQ==</code> → <code>Hello, World!</code></p>
<h3>Common Use Cases</h3>
<ul>
  <li>Decode Base64 data from API responses and JWT token payloads</li>
  <li>Read Base64-encoded environment variables and config values</li>
  <li>Convert inline image data URLs back to readable text</li>
</ul>
<h3>How It Works</h3>
<p>Paste a Base64 string in the input pane. The browser's built-in atob() function decodes it back to readable text with full UTF-8 support. Results update instantly.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../base64-encode/">Base64 Encode</a> - reverse: encode text to Base64</li>
  <li><a href="../hash-generator/">SHA-256 Hash Generator</a> - generate secure hashes</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'uuid-generator': {
    title: 'UUID Generator - Free Online UUID v4 Generator | Paimon Tools',
    description:
      'Generate UUID v4 identifiers online, free. Create random UUIDs instantly - 100% in-browser, no uploads, no sign-up, fully private.',
    path: 'uuid-generator',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'UUID Generator',
    breadcrumb: 'Tools / UUID Generator',
    bodyHtml: `<h2>UUID Generator</h2>
<p>Generate random UUID v4 identifiers entirely in your browser. Click to generate - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Generate unique primary keys for database records and APIs</li>
  <li>Create session tokens, request IDs, and correlation IDs</li>
  <li>Generate identifiers for distributed system entities</li>
</ul>
<h3>How It Works</h3>
<p>Uses the Web Crypto API's crypto.randomUUID() for cryptographically secure UUID v4 generation. Generate individually or in batch mode. All processing is local.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../hash-generator/">SHA-256 Hash Generator</a> - generate secure hashes</li>
  <li><a href="../base64-encode/">Base64 Encode</a> - encode UUIDs to Base64</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'yaml-to-json': {
    title: 'YAML to JSON Converter - Free Online | Paimon Tools',
    description:
      'Convert YAML to JSON online, free. Paste YAML and get formatted JSON - 100% in-browser, no uploads, no sign-up, fully private.',
    path: 'yaml-to-json',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'YAML to JSON Converter',
    breadcrumb: 'Convert / YAML to JSON',
    bodyHtml: `<h2>YAML to JSON Converter</h2>
    <p>Convert YAML to JSON entirely in your browser. Paste YAML and get clean, formatted JSON - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Convert Docker Compose and Kubernetes YAML to JSON for scripting</li>
  <li>Transform CI/CD pipeline configurations between formats</li>
  <li>Parse YAML config files for use in JavaScript applications</li>
</ul>
<h3>Related Tools</h3>
<ul>
  <li><a href="../json-to-yaml/">JSON to YAML Converter</a> - reverse: convert JSON to YAML</li>
  <li><a href="../json-formatter/">JSON Formatter</a> - pretty-print the resulting JSON</li>
</ul>
    <p><a href="../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'What YAML features are supported?',
        a: 'Standard YAML 1.2 - strings, numbers, booleans, arrays, nested objects, and multiline strings.' },
    ],
  },
  'json-to-yaml': {
    title: 'JSON to YAML Converter - Free Online | Paimon Tools',
    description:
      'Convert JSON to YAML online, free. Paste JSON and get clean YAML output - 100% in-browser, no uploads, no sign-up, fully private.',
    path: 'json-to-yaml',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'JSON to YAML Converter',
    breadcrumb: 'Convert / JSON to YAML',
   bodyHtml: `<h2>JSON to YAML Converter</h2>
   <p>Convert JSON to YAML entirely in your browser. Paste JSON and get clean, readable YAML output - no uploads, no sign-up, fully private.</p>
   <h3>Common Use Cases</h3>
   <ul>
   <li>Convert JSON API documentation examples to YAML format</li>
   <li>Transform app config files from JSON to YAML for Ansible, Docker</li>
   <li>Prepare JSON data for platforms that prefer YAML format</li>
   </ul>
   <h3>How It Works</h3>
   <p>Paste valid JSON in the input pane. The js-yaml library converts it to clean YAML output preserving your data structure. All processing is local.</p>
   <h3>Related Tools</h3>
   <ul>
   <li><a href="../yaml-to-json/">YAML to JSON Converter</a> - reverse: convert YAML to JSON</li>
   <li><a href="../json-formatter/">JSON Formatter</a> - pretty-print JSON before conversion</li>
   </ul>
   <p><a href="../">← Back to all Paimon Tools</a></p>`,
   },
   'hash-generator': {
    title: 'SHA-256 Hash Generator - Free Online | Paimon Tools',
    description:
      'Generate SHA-256 hash of any text online, free. Pure JS implementation - 100% in-browser, no uploads, no sign-up, fully private.',
    path: 'hash-generator',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'SHA-256 Hash Generator',
    breadcrumb: 'Tools / Hash Generator',
   bodyHtml: `<h2>SHA-256 Hash Generator</h2>
   <p>Generate SHA-256 hash of any text entirely in your browser. Pure JavaScript implementation using the Web Crypto API - your data never leaves your device. No uploads, no sign-up, fully private.</p>
   <h3>Common Use Cases</h3>
   <ul>
   <li>Verify file integrity by comparing SHA-256 checksums</li>
   <li>Generate password hashes for secure storage and testing</li>
   <li>Create content-addressed identifiers for deduplication</li>
   </ul>
   <h3>How It Works</h3>
   <p>Type or paste text (or drop a file) and the Web Crypto API computes its SHA-256 hash instantly. The same algorithm used in HTTPS and Git. All processing is local.</p>
   <h3>Related Tools</h3>
   <ul>
   <li><a href="../uuid-generator/">UUID Generator</a> - generate random identifiers</li>
   <li><a href="../base64-encode/">Base64 Encode</a> - encode hash output to Base64</li>
   </ul>
   <p><a href="../">← Back to all Paimon Tools</a></p>`,
   },
   'combine-files': {
    title: 'Free Online File Combiner - Merge CSV & Excel Files | Paimon Tools',
    description:
      'Combine multiple CSV and Excel files into one, free. Append rows from 2+ files, auto-detect format, union columns - 100% in your browser, no uploads, no sign-up.',
    path: 'combine-files',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'Combine CSV & Excel Files',
    breadcrumb: 'Tools / Combine Files',
    preloads: ['converter'],
   bodyHtml: `<h2>Combine CSV &amp; Excel Files</h2>
   <p>Merge multiple CSV, TSV and Excel files into one file entirely in your browser. Append rows from 2+ files, auto-detect format, union columns - no uploads, no sign-up, fully private. Supports mixed formats.</p>
   <h3>Common Use Cases</h3>
   <ul>
   <li>Merge monthly CSV reports into a single annual dataset</li>
   <li>Combine Excel spreadsheets from different departments into one file</li>
   <li>Union CSV exports from multiple sources for unified analysis</li>
   </ul>
   <h3>How It Works</h3>
   <p>Add two or more files (CSV, TSV, or Excel). The tool auto-detects each format, unions all columns, and appends rows. Download as CSV or Excel. All processing is local.</p>
   <h3>Related Tools</h3>
   <ul>
   <li><a href="../csv-to-excel/">CSV to Excel Converter</a> - convert individual CSVs to .xlsx</li>
   <li><a href="../excel-to-csv/">Excel to CSV Converter</a> - extract CSV from .xlsx files</li>
   <li><a href="../diff-tool/">Diff Tool</a> - compare two files side by side</li>
   </ul>
   <p><a href="../">← Back to all Paimon Tools</a></p>`,
   },
   'diff-tool': {
    title: 'Free Online Diff Tool - Compare Text Files Side by Side | Paimon Tools',
    description:
      'Compare two texts or files online free. Side-by-side diff viewer with color-coded lines. Paste text or drop files - 100% in your browser, no uploads, no limits, no sign-up.',
    path: 'diff-tool',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    h1: 'Diff Tool - Compare Text Side by Side',
    breadcrumb: 'Tools / Diff Tool',
    bodyHtml: `<h2>Diff Tool - Compare Text Side by Side</h2>
    <p>Compare two texts or files entirely in your browser. Side-by-side or unified diff view with color-coded added/removed lines. Paste text or drop files - no uploads, no sign-up, fully private. Unlimited size.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Compare code revisions to see exactly what changed</li>
  <li>Review document edits before and after modifications</li>
  <li>Find discrepancies between config files across environments</li>
</ul>
<h3>How It Works</h3>
<p>Paste text A in the left pane and text B in the right pane. The diff engine compares them line by line with word-level tokenization. Added lines appear in green, removed in red, modified in yellow.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../text-delimiter/">Text Delimiter Tool</a> - join and wrap list items</li>
  <li><a href="../combine-files/">Combine Files</a> - merge multiple files into one</li>
</ul>
    <p><a href="../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'What is the maximum file size?',
        a: 'There is no hard limit. Diffs are processed entirely in your browser - larger texts may take slightly longer but are fully supported.' },
    ],
  },
  'text-delimiter': {
    title: 'Text Delimiter Tool - Join & Wrap List Items Free | Paimon Tools',
    description:
      'Join list items with custom delimiter, quotes, and wrapping. Perfect for SQL IN clauses, HTML lists, and array literals. 100% in your browser, no uploads, free.',
    path: 'text-delimiter',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Paimon Tools Text Delimiter - join list items with custom separator',
    h1: 'Text Delimiter Tool',
    breadcrumb: 'Tools / Text Delimiter',
    bodyHtml: `<h2>Text Delimiter Tool</h2>
<p>Join list items with custom delimiter, quotes, and wrapping - entirely in your browser. Perfect for SQL IN clauses, HTML lists (with &lt;li&gt; wrapping), and array literals.</p>
<h2>Common Use Cases</h2>
<ul>
  <li>Generate SQL <code>IN ('a', 'b', 'c')</code> from a list</li>
  <li>Create HTML lists with <code>&lt;li&gt;</code> tags</li>
  <li>Build JavaScript array literals <code>["a", "b", "c"]</code></li>
  <li>Convert column data to pipe-separated values</li>
</ul>
<h2>How It Works</h2>
<p>Paste your items (one per line), choose a delimiter and optional quoting/wrapping. The output updates instantly. All processing happens locally - no uploads, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  playground: {
    title: 'Online Code Playground - Free In-Browser Code Editor | Paimon Tools',
    description:
      'Write and run JavaScript, Python & HTML online, free. Code playground with live preview, Pyodide WASM Python (fetched from CDN, cached locally), syntax highlighting, and sandboxed execution - 100% client-side, no sign-up.',
    path: 'code',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Paimon Tools Code Playground - run JavaScript, Python & HTML in your browser',
    h1: 'Online Code Playground',
    breadcrumb: 'Tools / Playground',
    bodyHtml: `<h2>Online Code Playground</h2>
<p>Write and run code in your browser. Choose from <strong>JavaScript</strong> (sandboxed execution), <strong>Python</strong> (via Pyodide WASM), <strong>HTML</strong> (live iframe preview), or <strong>JSON</strong> (format &amp; validate). Everything runs locally - no uploads, no sign-up, fully private.</p>
<p><strong>Try a specific language:</strong></p>
<ul>
  <li><a href="code/javascript/">JavaScript Playground</a> - sandboxed JS execution</li>
  <li><a href="code/typescript/">TypeScript Playground</a> - transpile & run via esbuild</li>
  <li><a href="code/python/">Python Playground</a> - Pyodide WASM Python</li>
  <li><a href="code/html/">HTML Playground</a> - live iframe preview</li>
  <li><a href="code/json/">JSON Playground</a> - format &amp; validate</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },

  // Per-language playground sub-pages (deep links at /code/<language>/)
  'playground-javascript': {
    title: 'JavaScript Online - Run JS Code in Browser | Paimon Tools',
    description:
      'Write and run JavaScript online, free. Code playground with sandboxed execution, console output, syntax highlighting, and instant results - 100% in your browser, no sign-up.',
    path: 'code/javascript',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'JavaScript Online Playground - run JS code in your browser, free',
    h1: 'JavaScript Online Playground',
    breadcrumb: 'Playground / JavaScript',
    preloads: ['playground'],
    bodyHtml: `<h2>JavaScript Online Playground</h2>
<p>Write and run JavaScript code in your browser. Sandboxed execution (Web Worker) with full console output, CodeMirror syntax highlighting, and instant results - no uploads, no sign-up, fully private.</p>
<h2>Features</h2>
<ul>
  <li>Sandboxed execution via Web Worker - your code runs in isolation with no DOM access</li>
  <li>Async callback capture - setTimeout, setInterval, fetch.then tracked automatically</li>
  <li>CodeMirror 6 with oneDark theme, bracket matching, and line numbers</li>
  <li>Share code via compressed URL hash (lz-string) - no server needed</li>
</ul>
<h2>Example: Fetch API with Async/Await</h2>
<pre>async function getData() {
  const res = await fetch('https://api.example.com/data');
  const json = await res.json();
  console.log(json);
}
getData();</pre>
<h2>How It Works</h2>
<p>Your JavaScript runs in a dedicated Web Worker with its own event loop. Console output is streamed back in real time. Async callbacks are tracked - the playground waits for them to complete before finalizing. Everything is sandboxed: no DOM access, no localStorage, no cross-origin requests beyond standard fetch.</p>
<p><a href="../../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'Does the playground support setTimeout and fetch?',
        a: 'Yes. Async callbacks are tracked automatically via API instrumentation. The playground waits for all pending operations before finalizing.' },
      { q: 'Can I use ES modules?',
        a: 'In Plain JavaScript, use dynamic import(). For full npm import support, switch to the TypeScript playground which bundles via esbuild-wasm.' },
    ],
  },

  'playground-typescript': {
    title: 'TypeScript Online - Run TS Code in Browser | Paimon Tools',
    description:
      'Write and run TypeScript online, free. Transpiled via esbuild-wasm with npm import support, sandboxed execution, console output, and syntax highlighting - 100% in your browser, no sign-up.',
    path: 'code/typescript',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'TypeScript Online Playground - transpile and run TS code in your browser, free',
    h1: 'TypeScript Online Playground',
    breadcrumb: 'Playground / TypeScript',
    preloads: ['playground'],
    bodyHtml: `<h2>TypeScript Online Playground</h2>
<p>Write and run TypeScript code in your browser. Powered by <strong>esbuild-wasm</strong> for fast transpilation with npm import support via esm.sh CDN. Sandboxed execution, full console output, and CodeMirror syntax highlighting - no uploads, no sign-up, fully private.</p>
<h2>Features</h2>
<ul>
  <li>TypeScript transpilation via esbuild-wasm - runs in your browser, no server</li>
  <li>npm import support via esm.sh CDN - use any npm package</li>
  <li>Sandboxed execution (Web Worker) with full console capture</li>
  <li>CodeMirror 6 with TypeScript syntax highlighting</li>
</ul>
<h2>Example: Using an npm Package</h2>
<pre>import lodash from 'lodash';
const arr = [1, 2, 3, 4, 5];
console.log(lodash.chunk(arr, 2));</pre>
<h2>Example: TypeScript Types</h2>
<pre>interface User { id: number; name: string; }
const user: User = { id: 1, name: 'Alice' };
console.log(user);</pre>
<p><a href="../../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'Does it support npm imports?',
        a: 'Yes. Bare imports are bundled via esbuild-wasm with packages resolved from esm.sh CDN.' },
      { q: 'Is compilation server-side?',
        a: 'No. esbuild-wasm runs entirely in your browser as a WebAssembly binary.' },
    ],
  },

  'playground-python': {
    title: 'Python Online - Run Python in Browser (Pyodide) | Paimon Tools',
    description:
      'Write and run Python online in your browser, free. Powered by Pyodide WASM (fetched from CDN, cached locally) - no server, no setup. Full Python with syntax highlighting and stdout output.',
    path: 'code/python',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Python Online Playground - Pyodide WASM Python in your browser',
    h1: 'Python Online Playground',
    breadcrumb: 'Playground / Python',
    preloads: ['playground'],
    bodyHtml: `<h2>Python Online Playground</h2>
<p>Write and run Python code in your browser, powered by <strong>Pyodide WASM</strong> (fetched from CDN, cached locally). Full Python with syntax highlighting and stdout output - no server, no setup, fully private.</p>
<h2>Features</h2>
<ul>
  <li>Full CPython runtime via Pyodide WASM (~12 MB, cached after first load)</li>
  <li>Standard library support: math, json, random, statistics, collections</li>
  <li>Print output captured and displayed in real time</li>
  <li>CodeMirror 6 with Python syntax highlighting</li>
</ul>
<h2>Example: List Comprehensions</h2>
<pre>squares = [x**2 for x in range(10)]
print(f"Squares: {squares}")</pre>
<h2>Example: JSON Processing</h2>
<pre>import json
data = {"name": "Paimon", "tools": ["JSON", "CSV", "Excel"]}
print(json.dumps(data, indent=2))</pre>
<p><a href="../../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'Does it include numpy or pandas?',
        a: 'Pyodide includes many scientific libraries, but numpy and pandas are not bundled by default. Standard library modules (math, json, random, statistics) are fully supported.' },
      { q: 'Why is the first run slow?',
        a: 'The first Python run downloads the Pyodide WASM binary (~12 MB). After that, it is cached by your browser and subsequent runs are instant.' },
    ],
  },


  'playground-html': {
    title: 'HTML Online - Live Preview HTML Editor | Paimon Tools',
    description:
      'Write HTML online with live iframe preview, free. Edit HTML, CSS and JavaScript in a live-reload sandbox - no uploads, no sign-up, 100% in your browser.',
    path: 'code/html',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'HTML Online Playground - live preview HTML editor in your browser',
    h1: 'HTML Online Playground',
    breadcrumb: 'Playground / HTML',
    preloads: ['playground'],
    bodyHtml: `<h2>HTML Online Playground</h2>
<p>Write HTML, CSS and JavaScript with a live iframe preview - updates in real time. Edit and see results instantly, no uploads, no sign-up, fully private.</p>
<h2>Features</h2>
<ul>
  <li>Live iframe preview with srcdoc - edit HTML/CSS/JS and see changes instantly</li>
  <li>Sandboxed execution - your page runs in isolation from the parent</li>
  <li>Supports full HTML documents including &lt;style&gt; and &lt;script&gt; tags</li>
  <li>CodeMirror 6 with HTML syntax highlighting</li>
</ul>
<h2>Example: Interactive Page</h2>
<pre>&lt;!DOCTYPE html&gt;
&lt;html&gt;
&lt;head&gt;
  &lt;style&gt;body { font-family: system-ui; }&lt;/style&gt;
&lt;/head&gt;
&lt;body&gt;
  &lt;h1&gt;Hello!&lt;/h1&gt;
  &lt;button onclick="alert('Hi')"&gt;Click&lt;/button&gt;
  &lt;script&gt;console.log('loaded');&lt;/script&gt;
&lt;/body&gt;
&lt;/html&gt;</pre>
<p><a href="../../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'Is the HTML preview sandboxed?',
        a: 'Yes. The preview runs in a sandboxed iframe using srcdoc. It has no access to the parent page, cookies, or localStorage.' },
    ],
  },


  'playground-json': {
    title: 'JSON Online - Format, Validate & Edit JSON | Paimon Tools',
    description:
      'Format, validate and edit JSON online, free. Syntax highlighting, auto-validation, and pretty-printing - 100% client-side, no uploads, fully private.',
    path: 'code/json',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'JSON Online Playground - format, validate and edit JSON in your browser',
    h1: 'JSON Online Playground',
    breadcrumb: 'Playground / JSON',
    preloads: ['playground'],
    bodyHtml: `<h2>JSON Online Playground</h2>
<p>Format, validate and edit JSON in your browser. Syntax highlighting with auto-validation, pretty-printing, and formatting tools - no uploads, no sign-up, fully private.</p>
<h2>Features</h2>
<ul>
  <li>Real-time JSON validation with inline error highlighting</li>
  <li>Auto-formatting with configurable indentation</li>
  <li>CodeMirror 6 with JSON syntax highlighting and bracket matching</li>
</ul>
<h2>Example</h2>
<pre>{
  "name": "Paimon Tools",
  "version": "1.0",
  "features": ["JSON", "CSV", "Excel"]
}</pre>
<p><a href="../../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'Does it validate as I type?',
        a: 'Yes. JSON is auto-validated on every keystroke with inline error messages.' },
    ],
  },

  '404': {
    title: 'Page Not Found - Paimon Tools',
    description: 'The page you are looking for does not exist. Browse our free JSON, CSV and Excel conversion tools, code playground, and developer utilities.',
    path: '404',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Paimon Tools - page not found',
    h1: 'Page Not Found (404)',
    breadcrumb: 'Error / 404',
    bodyHtml: `<h2>Page Not Found (404)</h2>
<p>The page or tool you are looking for does not exist. It may have been moved or the URL might be incorrect.</p>
<h2>Browse our free tools</h2>
<ul>
  <li><a href="../">Home - all Paimon Tools</a></li>
  <li><a href="../json-to-csv/">JSON to CSV Converter</a></li>
  <li><a href="../csv-to-json/">CSV to JSON Converter</a></li>
  <li><a href="../json-to-excel/">JSON to Excel (.xlsx)</a></li>
  <li><a href="../excel-to-json/">Excel to JSON</a></li>
  <li><a href="../code/">Code Playground</a></li>
  <li><a href="../diff-tool/">Diff Tool</a></li>
  <li><a href="../combine-files/">Combine Files</a></li>
</ul>
<p>Or <a href="../">return to the homepage</a>.</p>`,
  },
};

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
 * Build FAQPage JSON-LD for a tool page with FAQ content.
 */
export function faqLdFor(toolId) {
  const seo = TOOL_SEO[toolId]
  if (!seo || !seo.faq || seo.faq.length === 0) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: seo.faq.map((f, i) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  }
}

/**
 * Build HowTo JSON-LD for converter tools (step-by-step workflow).
 */
export function howToLdFor(toolId) {
  const CONVERTER_TOOLS = new Set([
    'json-to-csv', 'csv-to-json', 'json-to-excel', 'excel-to-json',
    'csv-to-excel', 'excel-to-csv', 'yaml-to-json', 'json-to-yaml',
  ])
  if (!CONVERTER_TOOLS.has(toolId)) return null

  const seo = TOOL_SEO[toolId]
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: seo.h1,
    description: seo.description,
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Add your data',
        text: 'Type or paste your data into the input area, or upload a file from your device. All processing happens locally in your browser.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Convert',
        text: 'The conversion happens instantly as you type or paste. View the results in the output pane alongside your input.',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Download or copy',
        text: 'Download the converted result as a file, or copy the output to your clipboard. Your data never leaves your device.',
      },
    ],
  }
}

/**
 * Build JSON-LD structured data for a tool (or home) page. Read from raw HTML
 * by Google regardless of client-side rendering. Includes WebApplication,
 * optional FAQPage, and optional HowTo schemas.
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
    // Home page (no toolId) — tell crawlers about every sub-tool via hasPart
    const subTools = Object.entries(TOOL_SEO)
      .filter(([id]) => id !== '404')
      .map(([, seo]) => ({
        '@type': 'SoftwareApplication',
        name: seo.h1 || seo.title.split(' — ')[0] || seo.title.split(' | ')[0],
        url: `${SITE_URL}/${seo.path}/`,
        description: seo.description,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Any (web browser)',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      }))

    return {
      ...base,
      '@type': 'SoftwareApplication',
      description: HOME_SEO.description,
      hasPart: subTools,
    }
  }

  // 404 page - not a WebApplication, just a generic WebPage
  if (toolId === '404') {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: '404 - Page Not Found',
      description: TOOL_SEO['404'].description,
      url: `${SITE_URL}/404/`,
      isPartOf: { '@type': 'WebApplication', name: 'Paimon Tools', url: `${SITE_URL}/` },
    }
  }

  const seo = TOOL_SEO[toolId]
  const result = {
    ...base,
    name: seo.h1,
    url: `${SITE_URL}/${seo.path}/`,
    description: seo.description,
    isPartOf: { '@type': 'WebApplication', name: 'Paimon Tools', url: `${SITE_URL}/` },
  }

  const faqLd = faqLdFor(toolId)
  if (faqLd) result.faq = faqLd
  const howToLd = howToLdFor(toolId)
  if (howToLd) result.howTo = howToLd

  return result
}

/** Crawlable noscript body for a tool (or home) page. */
export function noscriptBodyFor(toolId) {
  if (!toolId || !TOOL_SEO[toolId]) {
    return `<h1>Paimon Tools - Free In-Browser Data Converter</h1>
      <p>Convert between <strong>JSON, CSV, and Excel</strong> entirely in your browser.
        No backend, no uploads, no sign-up - your data never leaves your device.</p>
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
        <li><a href="${SITE_URL}/combine-files/">Combine Files</a> - merge multiple CSV &amp; Excel files</li>
        <li><a href="${SITE_URL}/diff-tool/">Diff Tool</a> - compare two texts side by side</li>
        <li><a href="${SITE_URL}/code/">Code Playground</a> - run JavaScript, Python &amp; HTML</li>
      </ul>
      <p>Open-source and privacy-first. Enable JavaScript to use it.</p>`
  }

  const seo = TOOL_SEO[toolId]
  return `<h1>${seo.h1}</h1>
      <p>${seo.description}</p>
      <p>This tool runs entirely in your browser - no uploads, no sign-up.
        Enable JavaScript to use it, or return to the
        <a href="${SITE_URL}/">full list of data conversion tools</a>.</p>`
}
