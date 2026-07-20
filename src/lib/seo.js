     1|/**
     2| * seo.js — per-tool SEO metadata, kept in a dependency-free module so it can
     3| * be imported both by the app (registry.ts) and by the prerender build script
     4| * (which runs in plain Node, no JSX/bundler).
     5| *
     6| * This is the single source of truth for titles, descriptions and keywords.
     7| * registry.ts and the prerender script both derive from it.
     8| */
     9|
    10|/** Base site URL — used for canonical URLs, OG, sitemap. */
    11|export const SITE_URL = 'https://paimonchan.github.io/paimon-tools'
    12|
    13|const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.webp`
    14|const DEFAULT_OG_ALT = 'Paimon Tools — convert JSON, CSV and Excel data, 100% in your browser'
    15|
    16|export const HOME_SEO = {
    17|  title: 'Paimon Tools — Free JSON, CSV & Excel Converter',
    18|  description:
    19|    'Free, private, in-browser data converter: JSON to CSV, CSV to Excel, Excel to JSON, JSON formatter and minifier. No sign-up, no uploads — your data never leaves your device. Open source.',
    20|  path: '',
    21|  ogImage: DEFAULT_OG_IMAGE,
    22|  ogImageAlt: DEFAULT_OG_ALT,
    23|  bodyHtml: `<h1>Paimon Tools — Free Converter for JSON, CSV &amp; Excel</h1>
    24|<p>Convert between <strong>JSON, CSV, and Excel</strong> entirely in your browser — no uploads, no sign-up, no servers. Your data never leaves your device.</p>
    25|<h2>Available conversion tools</h2>
    26|<ul>
    27|  <li><a href="json-to-csv/">JSON to CSV</a> — convert JSON arrays to CSV tables</li>
    28|  <li><a href="csv-to-json/">CSV to JSON</a> — convert CSV tables to JSON arrays</li>
    29|  <li><a href="json-to-excel/">JSON to Excel (.xlsx)</a> — export JSON as spreadsheets</li>
    30|  <li><a href="excel-to-json/">Excel to JSON</a> — extract JSON from .xlsx files</li>
    31|  <li><a href="csv-to-excel/">CSV to Excel</a> — turn CSV into .xlsx</li>
    32|  <li><a href="excel-to-csv/">Excel to CSV</a> — extract CSV from .xlsx sheets</li>
    33|  <li><a href="json-formatter/">JSON Formatter</a> — pretty-print and validate JSON</li>
    34|  <li><a href="json-minifier/">JSON Minifier</a> — compress JSON by stripping whitespace</li>
    35|  <li><a href="code/">Code Playground</a> — run JavaScript, Python &amp; HTML online</li>
    36|  <li><a href="base64-encode/">Base64 Encode</a> — encode text to Base64</li>
    37|  <li><a href="base64-decode/">Base64 Decode</a> — decode Base64 back to text</li>
    38|  <li><a href="yaml-to-json/">YAML to JSON</a> — convert YAML to JSON</li>
    39|  <li><a href="json-to-yaml/">JSON to YAML</a> — convert JSON to YAML</li>
    40|  <li><a href="hash-generator/">SHA-256 Hash</a> — generate SHA-256 checksum</li>
    41|  <li><a href="combine-files/">Combine Files</a> — merge multiple CSV &amp; Excel files into one
    42|  <li><a href="diff-tool/">Diff Tool</a> — compare two texts side by side
    43|</ul>
    44|<p><em>100% client-side, open source, privacy-first. Enable JavaScript for the full interactive experience.</em></p>`,
    45|}
    46|
    47|/**
    48| * Per-tool SEO. `path` is the URL segment (e.g. 'json-to-csv' → /json-to-csv).
    49| * Keep these aligned with the `id` field in registry.ts.
    50| */
    51|export const TOOL_SEO = {
    52|  'json-to-csv': {
    53|    title: 'JSON to CSV Converter — Free, Private, In-Browser | Paimon Tools',
    54|    description:
    55|      'Convert JSON to CSV instantly in your browser. Paste a JSON array and get a clean CSV table — no uploads, no sign-up, your data never leaves your device.',
    56|    path: 'json-to-csv',
    57|    ogImage: DEFAULT_OG_IMAGE,
    58|    ogImageAlt: DEFAULT_OG_ALT,
    59|    h1: 'JSON to CSV Converter',
    60|    breadcrumb: 'Convert / JSON to CSV',
    61|    preloads: ['converter'],
    bodyHtml: `<h2>JSON to CSV Converter</h2>
<p>Convert a JSON array to a CSV table entirely in your browser. Paste your JSON data and get clean CSV output — no uploads, no sign-up, fully private.</p>
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
  <li><a href="../csv-to-json/">CSV to JSON Converter</a> — reverse conversion back to JSON</li>
  <li><a href="../json-to-excel/">JSON to Excel Converter</a> — export JSON as .xlsx spreadsheet</li>
  <li><a href="../json-formatter/">JSON Formatter</a> — pretty-print and validate JSON first</li>
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
    68|    title: 'CSV to JSON Converter — Free, Private, In-Browser | Paimon Tools',
    69|    description:
    70|      'Convert CSV to JSON online, entirely in your browser. Paste a CSV table with headers and get a JSON array — no uploads, no sign-up, fully private.',
    71|    path: 'csv-to-json',
    72|    ogImage: DEFAULT_OG_IMAGE,
    73|    ogImageAlt: DEFAULT_OG_ALT,
    74|    h1: 'CSV to JSON Converter',
    75|    breadcrumb: 'Convert / CSV to JSON',
    76|    preloads: ['converter'],
    bodyHtml: `<h2>CSV to JSON Converter</h2>
<p>Convert a CSV table to a JSON array entirely in your browser. Paste CSV data with headers and get clean JSON — no uploads, no sign-up, fully private.</p>
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
  <li><a href="../json-to-csv/">JSON to CSV Converter</a> — reverse conversion back to CSV</li>
  <li><a href="../excel-to-json/">Excel to JSON Converter</a> — extract JSON from .xlsx files</li>
  <li><a href="../csv-to-excel/">CSV to Excel Converter</a> — convert CSV to .xlsx instead</li>
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
    83|    title: 'JSON to Excel (.xlsx) Converter — Free & Private | Paimon Tools',
    84|    description:
    85|      'Convert JSON to Excel (.xlsx) instantly in your browser. Export a JSON array as a downloadable spreadsheet — no uploads, no sign-up, your data stays local.',
    86|    path: 'json-to-excel',
    87|    ogImage: DEFAULT_OG_IMAGE,
    88|    ogImageAlt: DEFAULT_OG_ALT,
    89|    h1: 'JSON to Excel Converter',
    90|    breadcrumb: 'Convert / JSON to Excel',
    91|    preloads: ['converter'],
    92|    bodyHtml: `<h2>JSON to Excel (.xlsx) Converter</h2>
    93|<p>Export a JSON array as a downloadable Excel spreadsheet (.xlsx) entirely in your browser. Your data is processed locally — no uploads, no sign-up, fully private.</p>
    94|<p><a href="../">← Back to all Paimon Tools</a></p>`,
    95|  },
    96|  'excel-to-json': {
    97|    title: 'Excel to JSON Converter — Free & Private, In-Browser | Paimon Tools',
    98|    description:
    99|      'Convert Excel (.xlsx) to JSON in your browser. Drop a spreadsheet and get a JSON array of its first sheet — no uploads, no sign-up, fully private.',
   100|    path: 'excel-to-json',
   101|    ogImage: DEFAULT_OG_IMAGE,
   102|    ogImageAlt: DEFAULT_OG_ALT,
   103|    h1: 'Excel to JSON Converter',
   104|    breadcrumb: 'Convert / Excel to JSON',
   105|    preloads: ['converter'],
   106|    bodyHtml: `<h2>Excel to JSON Converter</h2>
   107|<p>Extract JSON data from an Excel (.xlsx) spreadsheet entirely in your browser. Drop a file and get a JSON array from the first sheet — no uploads, no sign-up, fully private.</p>
   108|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   109|  },
   110|  'csv-to-excel': {
   111|    title: 'CSV to Excel (.xlsx) Converter — Free & Private | Paimon Tools',
   112|    description:
   113|      'Convert CSV to Excel (.xlsx) instantly in your browser. Turn a CSV table into a downloadable spreadsheet — no uploads, no sign-up, your data stays local.',
   114|    path: 'csv-to-excel',
   115|    ogImage: DEFAULT_OG_IMAGE,
   116|    ogImageAlt: DEFAULT_OG_ALT,
   117|    h1: 'CSV to Excel Converter',
   118|    breadcrumb: 'Convert / CSV to Excel',
   119|    preloads: ['converter'],
   120|    bodyHtml: `<h2>CSV to Excel (.xlsx) Converter</h2>
   121|<p>Turn a CSV table into a downloadable Excel spreadsheet (.xlsx) entirely in your browser. Your data is processed locally — no uploads, no sign-up, fully private.</p>
   122|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   123|  },
   124|  'excel-to-csv': {
   125|    title: 'Excel to CSV Converter — Free & Private, In-Browser | Paimon Tools',
   126|    description:
   127|      'Convert Excel (.xlsx) to CSV in your browser. Drop a spreadsheet and get CSV from its first sheet — no uploads, no sign-up, fully private.',
   128|    path: 'excel-to-csv',
   129|    ogImage: DEFAULT_OG_IMAGE,
   130|    ogImageAlt: DEFAULT_OG_ALT,
   131|    h1: 'Excel to CSV Converter',
   132|    breadcrumb: 'Convert / Excel to CSV',
   133|    preloads: ['converter'],
   134|    bodyHtml: `<h2>Excel to CSV Converter</h2>
   135|<p>Extract CSV data from an Excel (.xlsx) spreadsheet entirely in your browser. Drop a file and get CSV from the first sheet — no uploads, no sign-up, fully private.</p>
   136|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   137|  },
   138|  'json-formatter': {
   139|    title: 'JSON Formatter & Beautifier — Pretty Print JSON Free | Paimon Tools',
   140|    description:
   141|      'Format and beautify JSON online, in your browser. Validate syntax and pretty-print with 2 spaces, 4 spaces, or tabs — no uploads, fully private.',
   142|    keywords:
   143|      'json formatter, json beautifier, pretty print json, format json, json validator, indent json',
   144|    path: 'json-formatter',
   145|    ogImage: DEFAULT_OG_IMAGE,
   146|    ogImageAlt: DEFAULT_OG_ALT,
   147|    h1: 'JSON Formatter & Beautifier',
   148|    breadcrumb: 'Format / JSON Formatter',
    bodyHtml: `<h2>JSON Formatter &amp; Beautifier</h2>
    <p>Format, beautify, and validate JSON entirely in your browser. Pretty-print with 2 spaces, 4 spaces, or tabs — your data never leaves your device.</p>
    <p>Validates JSON syntax on the fly, highlighting errors as you type.</p>
    <p><a href="../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'Does it validate as I type?',
        a: 'Yes. JSON is auto-validated on every keystroke with inline error messages showing exactly where the error is.' },
      { q: 'What indentation options are available?',
        a: '2 spaces, 4 spaces, or tabs. Choose from the dropdown above the output pane.' },
    ],
  },
  'json-minifier': {
   155|    title: 'JSON Minifier — Compress & Minify JSON Free | Paimon Tools',
   156|    description:
   157|      'Minify JSON online, in your browser. Strip all whitespace to compress your JSON — validates syntax as it goes — no uploads, fully private.',
   158|    path: 'json-minifier',
   159|    ogImage: DEFAULT_OG_IMAGE,
   160|    ogImageAlt: DEFAULT_OG_ALT,
   161|    h1: 'JSON Minifier',
   162|    breadcrumb: 'Format / JSON Minifier',
   163|    bodyHtml: `<h2>JSON Minifier</h2>
   164|<p>Minify and compress JSON entirely in your browser. Strips all unnecessary whitespace to reduce file size — validates syntax as it goes. No uploads, fully private.</p>
   165|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   166|  },
   167|  'base64-encode': {
   168|    title: 'Base64 Encode — Free Online Base64 Encoder | Paimon Tools',
   169|    description:
   170|      'Encode text to Base64 online, free. UTF-8 safe — handles Unicode, emoji & special characters. 100% in-browser, no uploads, no sign-up, fully private.',
   171|    path: 'base64-encode',
   172|    ogImage: DEFAULT_OG_IMAGE,
   173|    ogImageAlt: DEFAULT_OG_ALT,
   174|    h1: 'Base64 Encode',
   175|    breadcrumb: 'Convert / Base64 Encode',
   176|    bodyHtml: `<h2>Base64 Encode</h2>
   177|<p>Encode any text to Base64 entirely in your browser. UTF-8 safe — handles Unicode, emoji, and special characters. No uploads, no sign-up, fully private.</p>
   178|<p>Example input: <code>Hello, World!</code> → <code>SGVsbG8sIFdvcmxkIQ==</code></p>
   179|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   180|  },
   181|  'base64-decode': {
   182|    title: 'Base64 Decode — Free Online Base64 Decoder | Paimon Tools',
   183|    description:
   184|      'Decode Base64 to text online, free. Convert Base64 strings back to readable text — 100% in-browser, no uploads, no sign-up, fully private.',
   185|    path: 'base64-decode',
   186|    ogImage: DEFAULT_OG_IMAGE,
   187|    ogImageAlt: DEFAULT_OG_ALT,
   188|    h1: 'Base64 Decode',
   189|    breadcrumb: 'Convert / Base64 Decode',
   190|    bodyHtml: `<h2>Base64 Decode</h2>
   191|<p>Decode Base64 strings back to readable text entirely in your browser. Supports standard Base64 encoded strings. No uploads, no sign-up, fully private.</p>
   192|<p>Example input: <code>SGVsbG8sIFdvcmxkIQ==</code> → <code>Hello, World!</code></p>
   193|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   194|  },
   195|  'uuid-generator': {
   196|    title: 'UUID Generator — Free Online UUID v4 Generator | Paimon Tools',
   197|    description:
   198|      'Generate UUID v4 identifiers online, free. Create random UUIDs instantly — 100% in-browser, no uploads, no sign-up, fully private.',
   199|    path: 'uuid-generator',
   200|    ogImage: DEFAULT_OG_IMAGE,
   201|    ogImageAlt: DEFAULT_OG_ALT,
   202|    h1: 'UUID Generator',
   203|    breadcrumb: 'Tools / UUID Generator',
   204|    bodyHtml: `<h2>UUID Generator</h2>
   205|<p>Generate random UUID v4 identifiers entirely in your browser. Click to generate — no uploads, no sign-up, fully private.</p>
   206|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   207|  },
   208|  'yaml-to-json': {
   209|    title: 'YAML to JSON Converter — Free Online | Paimon Tools',
   210|    description:
   211|      'Convert YAML to JSON online, free. Paste YAML and get formatted JSON — 100% in-browser, no uploads, no sign-up, fully private.',
   212|    path: 'yaml-to-json',
   213|    ogImage: DEFAULT_OG_IMAGE,
   214|    ogImageAlt: DEFAULT_OG_ALT,
   215|    h1: 'YAML to JSON Converter',
   216|    breadcrumb: 'Convert / YAML to JSON',
    bodyHtml: `<h2>YAML to JSON Converter</h2>
    <p>Convert YAML to JSON entirely in your browser. Paste YAML and get clean, formatted JSON — no uploads, no sign-up, fully private.</p>
    <p><a href="../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'What YAML features are supported?',
        a: 'Standard YAML 1.2 — strings, numbers, booleans, arrays, nested objects, and multiline strings.' },
    ],
  },
  'json-to-yaml': {
   222|    title: 'JSON to YAML Converter — Free Online | Paimon Tools',
   223|    description:
   224|      'Convert JSON to YAML online, free. Paste JSON and get clean YAML output — 100% in-browser, no uploads, no sign-up, fully private.',
   225|    path: 'json-to-yaml',
   226|    ogImage: DEFAULT_OG_IMAGE,
   227|    ogImageAlt: DEFAULT_OG_ALT,
   228|    h1: 'JSON to YAML Converter',
   229|    breadcrumb: 'Convert / JSON to YAML',
   230|    bodyHtml: `<h2>JSON to YAML Converter</h2>
   231|<p>Convert JSON to YAML entirely in your browser. Paste JSON and get clean, readable YAML output — no uploads, no sign-up, fully private.</p>
   232|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   233|  },
   234|  'hash-generator': {
   235|    title: 'SHA-256 Hash Generator — Free Online | Paimon Tools',
   236|    description:
   237|      'Generate SHA-256 hash of any text online, free. Pure JS implementation — 100% in-browser, no uploads, no sign-up, fully private.',
   238|    path: 'hash-generator',
   239|    ogImage: DEFAULT_OG_IMAGE,
   240|    ogImageAlt: DEFAULT_OG_ALT,
   241|    h1: 'SHA-256 Hash Generator',
   242|    breadcrumb: 'Tools / Hash Generator',
   243|    bodyHtml: `<h2>SHA-256 Hash Generator</h2>
   244|<p>Generate SHA-256 hash of any text entirely in your browser. Pure JavaScript implementation — your data never leaves your device. No uploads, no sign-up, fully private.</p>
   245|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   246|  },
   247|  'combine-files': {
   248|    title: 'Free Online File Combiner — Merge CSV & Excel Files | Paimon Tools',
   249|    description:
   250|      'Combine multiple CSV and Excel files into one, free. Append rows from 2+ files, auto-detect format, union columns — 100% in your browser, no uploads, no sign-up.',
   251|    path: 'combine-files',
   252|    ogImage: DEFAULT_OG_IMAGE,
   253|    ogImageAlt: DEFAULT_OG_ALT,
   254|    h1: 'Combine CSV & Excel Files',
   255|    breadcrumb: 'Tools / Combine Files',
   256|    preloads: ['converter'],
   257|    bodyHtml: `<h2>Combine CSV &amp; Excel Files</h2>
   258|<p>Merge multiple CSV, TSV and Excel files into one file entirely in your browser. Append rows from 2+ files, auto-detect format, union columns — no uploads, no sign-up, fully private. Supports mixed formats.</p>
   259|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   260|  },
   261|  'diff-tool': {
   262|    title: 'Free Online Diff Tool — Compare Text Files Side by Side | Paimon Tools',
   263|    description:
   264|      'Compare two texts or files online free. Side-by-side diff viewer with color-coded lines. Paste text or drop files — 100% in your browser, no uploads, no limits, no sign-up.',
   265|    path: 'diff-tool',
   266|    ogImage: DEFAULT_OG_IMAGE,
   267|    ogImageAlt: DEFAULT_OG_ALT,
   268|    h1: 'Diff Tool — Compare Text Side by Side',
   269|    breadcrumb: 'Tools / Diff Tool',
    bodyHtml: `<h2>Diff Tool — Compare Text Side by Side</h2>
    <p>Compare two texts or files entirely in your browser. Side-by-side or unified diff view with color-coded added/removed lines. Paste text or drop files — no uploads, no sign-up, fully private. Unlimited size.</p>
    <p><a href="../">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'What is the maximum file size?',
        a: 'There is no hard limit. Diffs are processed entirely in your browser — larger texts may take slightly longer but are fully supported.' },
    ],
  },
  'text-delimiter': {
   275|    title: 'Text Delimiter Tool — Join & Wrap List Items Free | Paimon Tools',
   276|    description:
   277|      'Join list items with custom delimiter, quotes, and wrapping. Perfect for SQL IN clauses, HTML lists, and array literals. 100% in your browser, no uploads, free.',
   278|    path: 'text-delimiter',
   279|    ogImage: DEFAULT_OG_IMAGE,
   280|    ogImageAlt: 'Paimon Tools Text Delimiter — join list items with custom separator',
   281|    h1: 'Text Delimiter Tool',
   282|    breadcrumb: 'Tools / Text Delimiter',
   283|    bodyHtml: `<h2>Text Delimiter Tool</h2>
   284|<p>Join list items with custom delimiter, quotes, and wrapping — entirely in your browser. Perfect for SQL IN clauses, HTML lists (with &lt;li&gt; wrapping), and array literals.</p>
   285|<h2>Common Use Cases</h2>
   286|<ul>
   287|  <li>Generate SQL <code>IN ('a', 'b', 'c')</code> from a list</li>
   288|  <li>Create HTML lists with <code>&lt;li&gt;</code> tags</li>
   289|  <li>Build JavaScript array literals <code>["a", "b", "c"]</code></li>
   290|  <li>Convert column data to pipe-separated values</li>
   291|</ul>
   292|<h2>How It Works</h2>
   293|<p>Paste your items (one per line), choose a delimiter and optional quoting/wrapping. The output updates instantly. All processing happens locally — no uploads, fully private.</p>
   294|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   295|  },
   296|  playground: {
   297|    title: 'Online Code Playground — Free In-Browser Code Editor | Paimon Tools',
   298|    description:
   299|      'Write and run JavaScript, Python & HTML online, free. Code playground with live preview, Pyodide WASM Python (fetched from CDN, cached locally), syntax highlighting, and sandboxed execution — 100% client-side, no sign-up.',
   300|    path: 'code',
   301|    ogImage: DEFAULT_OG_IMAGE,
   302|    ogImageAlt: 'Paimon Tools Code Playground — run JavaScript, Python & HTML in your browser',
   303|    h1: 'Online Code Playground',
   304|    breadcrumb: 'Tools / Playground',
   305|    bodyHtml: `<h2>Online Code Playground</h2>
   306|<p>Write and run code in your browser. Choose from <strong>JavaScript</strong> (sandboxed execution), <strong>Python</strong> (via Pyodide WASM), <strong>HTML</strong> (live iframe preview), or <strong>JSON</strong> (format &amp; validate). Everything runs locally — no uploads, no sign-up, fully private.</p>
   307|<p><strong>Try a specific language:</strong></p>
   308|<ul>
   309|  <li><a href="code/javascript/">JavaScript Playground</a> — sandboxed JS execution</li>
   310|  <li><a href="code/typescript/">TypeScript Playground</a> — transpile & run via esbuild</li>
   311|  <li><a href="code/python/">Python Playground</a> — Pyodide WASM Python</li>
   312|  <li><a href="code/html/">HTML Playground</a> — live iframe preview</li>
   313|  <li><a href="code/json/">JSON Playground</a> — format &amp; validate</li>
   314|</ul>
   315|<p><a href="../">← Back to all Paimon Tools</a></p>`,
   316|  },
   317|
   318|  // Per-language playground sub-pages (deep links at /code/<language>/)
   319|  'playground-javascript': {
   320|    title: 'JavaScript Online — Run JS Code in Browser | Paimon Tools',
   321|    description:
   322|      'Write and run JavaScript online, free. Code playground with sandboxed execution, console output, syntax highlighting, and instant results — 100% in your browser, no sign-up.',
   323|    path: 'code/javascript',
   324|    ogImage: DEFAULT_OG_IMAGE,
   325|    ogImageAlt: 'JavaScript Online Playground — run JS code in your browser, free',
   326|    h1: 'JavaScript Online Playground',
   327|    breadcrumb: 'Playground / JavaScript',
   328|    preloads: ['playground'],
   329|    bodyHtml: `<h2>JavaScript Online Playground</h2>
   330|<p>Write and run JavaScript code in your browser. Sandboxed execution (Web Worker) with full console output, CodeMirror syntax highlighting, and instant results — no uploads, no sign-up, fully private.</p>
   331|<h2>Features</h2>
   332|<ul>
   333|  <li>Sandboxed execution via Web Worker — your code runs in isolation with no DOM access</li>
   334|  <li>Async callback capture — setTimeout, setInterval, fetch.then tracked automatically</li>
   335|  <li>CodeMirror 6 with oneDark theme, bracket matching, and line numbers</li>
   336|  <li>Share code via compressed URL hash (lz-string) — no server needed</li>
   337|</ul>
   338|<h2>Example: Fetch API with Async/Await</h2>
   339|<pre>async function getData() {
   340|  const res = await fetch('https://api.example.com/data');
   341|  const json = await res.json();
   342|  console.log(json);
   343|}
   344|getData();</pre>
   345|<h2>How It Works</h2>
   346|<p>Your JavaScript runs in a dedicated Web Worker with its own event loop. Console output is streamed back in real time. Async callbacks are tracked — the playground waits for them to complete before finalizing. Everything is sandboxed: no DOM access, no localStorage, no cross-origin requests beyond standard fetch.</p>
   347|<p><a href="../../">← Back to all Paimon Tools</a></p>`,
   348|    faq: [
   349|      { q: 'Does the playground support setTimeout and fetch?',
   350|        a: 'Yes. Async callbacks are tracked automatically via API instrumentation. The playground waits for all pending operations before finalizing.' },
   351|      { q: 'Can I use ES modules?',
   352|        a: 'In Plain JavaScript, use dynamic import(). For full npm import support, switch to the TypeScript playground which bundles via esbuild-wasm.' },
   353|    ],
   354|  },
   355|
   356|  'playground-typescript': {
   357|    title: 'TypeScript Online — Run TS Code in Browser | Paimon Tools',
   358|    description:
   359|      'Write and run TypeScript online, free. Transpiled via esbuild-wasm with npm import support, sandboxed execution, console output, and syntax highlighting — 100% in your browser, no sign-up.',
   360|    path: 'code/typescript',
   361|    ogImage: DEFAULT_OG_IMAGE,
   362|    ogImageAlt: 'TypeScript Online Playground — transpile and run TS code in your browser, free',
   363|    h1: 'TypeScript Online Playground',
   364|    breadcrumb: 'Playground / TypeScript',
   365|    preloads: ['playground'],
   366|    bodyHtml: `<h2>TypeScript Online Playground</h2>
   367|<p>Write and run TypeScript code in your browser. Powered by <strong>esbuild-wasm</strong> for fast transpilation with npm import support via esm.sh CDN. Sandboxed execution, full console output, and CodeMirror syntax highlighting — no uploads, no sign-up, fully private.</p>
   368|<h2>Features</h2>
   369|<ul>
   370|  <li>TypeScript transpilation via esbuild-wasm — runs in your browser, no server</li>
   371|  <li>npm import support via esm.sh CDN — use any npm package</li>
   372|  <li>Sandboxed execution (Web Worker) with full console capture</li>
   373|  <li>CodeMirror 6 with TypeScript syntax highlighting</li>
   374|</ul>
   375|<h2>Example: Using an npm Package</h2>
   376|<pre>import lodash from 'lodash';
   377|const arr = [1, 2, 3, 4, 5];
   378|console.log(lodash.chunk(arr, 2));</pre>
   379|<h2>Example: TypeScript Types</h2>
   380|<pre>interface User { id: number; name: string; }
   381|const user: User = { id: 1, name: 'Alice' };
   382|console.log(user);</pre>
   383|<p><a href="../../">← Back to all Paimon Tools</a></p>`,
   384|    faq: [
   385|      { q: 'Does it support npm imports?',
   386|        a: 'Yes. Bare imports are bundled via esbuild-wasm with packages resolved from esm.sh CDN.' },
   387|      { q: 'Is compilation server-side?',
   388|        a: 'No. esbuild-wasm runs entirely in your browser as a WebAssembly binary.' },
   389|    ],
   390|  },
   391|
   392|  'playground-python': {
   393|    title: 'Python Online — Run Python in Browser (Pyodide) | Paimon Tools',
   394|    description:
   395|      'Write and run Python online in your browser, free. Powered by Pyodide WASM (fetched from CDN, cached locally) — no server, no setup. Full Python with syntax highlighting and stdout output.',
   396|    path: 'code/python',
   397|    ogImage: DEFAULT_OG_IMAGE,
   398|    ogImageAlt: 'Python Online Playground — Pyodide WASM Python in your browser',
   399|    h1: 'Python Online Playground',
   400|    breadcrumb: 'Playground / Python',
   401|    preloads: ['playground'],
   402|    bodyHtml: `<h2>Python Online Playground</h2>
   403|<p>Write and run Python code in your browser, powered by <strong>Pyodide WASM</strong> (fetched from CDN, cached locally). Full Python with syntax highlighting and stdout output — no server, no setup, fully private.</p>
   404|<h2>Features</h2>
   405|<ul>
   406|  <li>Full CPython runtime via Pyodide WASM (~12 MB, cached after first load)</li>
   407|  <li>Standard library support: math, json, random, statistics, collections</li>
   408|  <li>Print output captured and displayed in real time</li>
   409|  <li>CodeMirror 6 with Python syntax highlighting</li>
   410|</ul>
   411|<h2>Example: List Comprehensions</h2>
   412|<pre>squares = [x**2 for x in range(10)]
   413|print(f"Squares: {squares}")</pre>
   414|<h2>Example: JSON Processing</h2>
   415|<pre>import json
   416|data = {"name": "Paimon", "tools": ["JSON", "CSV", "Excel"]}
   417|print(json.dumps(data, indent=2))</pre>
   418|<p><a href="../../">← Back to all Paimon Tools</a></p>`,
   419|    faq: [
   420|      { q: 'Does it include numpy or pandas?',
   421|        a: 'Pyodide includes many scientific libraries, but numpy and pandas are not bundled by default. Standard library modules (math, json, random, statistics) are fully supported.' },
   422|      { q: 'Why is the first run slow?',
   423|        a: 'The first Python run downloads the Pyodide WASM binary (~12 MB). After that, it is cached by your browser and subsequent runs are instant.' },
   424|    ],
   425|  },
   426|
   427|
   428|  'playground-html': {
   429|    title: 'HTML Online — Live Preview HTML Editor | Paimon Tools',
   430|    description:
   431|      'Write HTML online with live iframe preview, free. Edit HTML, CSS and JavaScript in a live-reload sandbox — no uploads, no sign-up, 100% in your browser.',
   432|    path: 'code/html',
   433|    ogImage: DEFAULT_OG_IMAGE,
   434|    ogImageAlt: 'HTML Online Playground — live preview HTML editor in your browser',
   435|    h1: 'HTML Online Playground',
   436|    breadcrumb: 'Playground / HTML',
   437|    preloads: ['playground'],
   438|    bodyHtml: `<h2>HTML Online Playground</h2>
   439|<p>Write HTML, CSS and JavaScript with a live iframe preview — updates in real time. Edit and see results instantly, no uploads, no sign-up, fully private.</p>
   440|<h2>Features</h2>
   441|<ul>
   442|  <li>Live iframe preview with srcdoc — edit HTML/CSS/JS and see changes instantly</li>
   443|  <li>Sandboxed execution — your page runs in isolation from the parent</li>
   444|  <li>Supports full HTML documents including &lt;style&gt; and &lt;script&gt; tags</li>
   445|  <li>CodeMirror 6 with HTML syntax highlighting</li>
   446|</ul>
   447|<h2>Example: Interactive Page</h2>
   448|<pre>&lt;!DOCTYPE html&gt;
   449|&lt;html&gt;
   450|&lt;head&gt;
   451|  &lt;style&gt;body { font-family: system-ui; }&lt;/style&gt;
   452|&lt;/head&gt;
   453|&lt;body&gt;
   454|  &lt;h1&gt;Hello!&lt;/h1&gt;
   455|  &lt;button onclick="alert('Hi')"&gt;Click&lt;/button&gt;
   456|  &lt;script&gt;console.log('loaded');&lt;/script&gt;
   457|&lt;/body&gt;
   458|&lt;/html&gt;</pre>
   459|<p><a href="../../">← Back to all Paimon Tools</a></p>`,
   460|    faq: [
   461|      { q: 'Is the HTML preview sandboxed?',
   462|        a: 'Yes. The preview runs in a sandboxed iframe using srcdoc. It has no access to the parent page, cookies, or localStorage.' },
   463|    ],
   464|  },
   465|
   466|
   467|  'playground-json': {
   468|    title: 'JSON Online — Format, Validate & Edit JSON | Paimon Tools',
   469|    description:
   470|      'Format, validate and edit JSON online, free. Syntax highlighting, auto-validation, and pretty-printing — 100% client-side, no uploads, fully private.',
   471|    path: 'code/json',
   472|    ogImage: DEFAULT_OG_IMAGE,
   473|    ogImageAlt: 'JSON Online Playground — format, validate and edit JSON in your browser',
   474|    h1: 'JSON Online Playground',
   475|    breadcrumb: 'Playground / JSON',
   476|    preloads: ['playground'],
   477|    bodyHtml: `<h2>JSON Online Playground</h2>
   478|<p>Format, validate and edit JSON in your browser. Syntax highlighting with auto-validation, pretty-printing, and formatting tools — no uploads, no sign-up, fully private.</p>
   479|<h2>Features</h2>
   480|<ul>
   481|  <li>Real-time JSON validation with inline error highlighting</li>
   482|  <li>Auto-formatting with configurable indentation</li>
   483|  <li>CodeMirror 6 with JSON syntax highlighting and bracket matching</li>
   484|</ul>
   485|<h2>Example</h2>
   486|<pre>{
   487|  "name": "Paimon Tools",
   488|  "version": "1.0",
   489|  "features": ["JSON", "CSV", "Excel"]
   490|}</pre>
   491|<p><a href="../../">← Back to all Paimon Tools</a></p>`,
   492|    faq: [
   493|      { q: 'Does it validate as I type?',
   494|        a: 'Yes. JSON is auto-validated on every keystroke with inline error messages.' },
   495|    ],
   496|  },
   497|
   498|  '404': {
   499|    title: 'Page Not Found — Paimon Tools',
   500|    description: 'The page you are looking for does not exist. Browse our free JSON, CSV and Excel conversion tools, code playground, and developer utilities.',
   501|    path: '404',
   502|    ogImage: DEFAULT_OG_IMAGE,
   503|    ogImageAlt: 'Paimon Tools — page not found',
   504|    h1: 'Page Not Found (404)',
   505|    breadcrumb: 'Error / 404',
   506|    bodyHtml: `<h2>Page Not Found (404)</h2>
   507|<p>The page or tool you are looking for does not exist. It may have been moved or the URL might be incorrect.</p>
   508|<h2>Browse our free tools</h2>
   509|<ul>
   510|  <li><a href="../">Home — all Paimon Tools</a></li>
   511|  <li><a href="../json-to-csv/">JSON to CSV Converter</a></li>
   512|  <li><a href="../csv-to-json/">CSV to JSON Converter</a></li>
   513|  <li><a href="../json-to-excel/">JSON to Excel (.xlsx)</a></li>
   514|  <li><a href="../excel-to-json/">Excel to JSON</a></li>
   515|  <li><a href="../code/">Code Playground</a></li>
   516|  <li><a href="../diff-tool/">Diff Tool</a></li>
   517|  <li><a href="../combine-files/">Combine Files</a></li>
   518|</ul>
   519|<p>Or <a href="../">return to the homepage</a>.</p>`,
   520|  },
   521|};
   522|
   523|/**
   524| * Build BreadcrumbList JSON-LD for a tool page.
   525| */
   526|export function breadcrumbLdFor(toolId) {
   527|  const items = [
   528|    {
   529|      '@type': 'ListItem',
   530|      position: 1,
   531|      name: 'Paimon Tools',
   532|      item: `${SITE_URL}/`,
   533|    },
   534|  ]
   535|
   536|  if (toolId && TOOL_SEO[toolId]) {
   537|    const seo = TOOL_SEO[toolId]
   538|    const parts = seo.breadcrumb.split(' / ')
   539|    items.push({
   540|      '@type': 'ListItem',
   541|      position: 2,
   542|      name: parts[0],
   543|      // Link position 2 to the nearest actual page:
   544|      // "Playground" → /code/, everything else → home
   545|      item: parts[0].toLowerCase() === 'playground'
   546|        ? `${SITE_URL}/code/`
   547|        : `${SITE_URL}/`,
   548|    })
   549|    items.push({
   550|      '@type': 'ListItem',
   551|      position: 3,
   552|      name: seo.h1,
   553|      item: `${SITE_URL}/${seo.path}/`,
   554|    })
   555|  }
   556|
   557|  return {
   558|    '@context': 'https://schema.org',
   559|    '@type': 'BreadcrumbList',
   560|    itemListElement: items,
   561|  }
   562|}
   563|
   564|
   565|
   566|/**
   567| * Build FAQPage JSON-LD for a tool page with FAQ content.
   568| */
   569|export function faqLdFor(toolId) {
   570|  const seo = TOOL_SEO[toolId]
   571|  if (!seo || !seo.faq || seo.faq.length === 0) return null
   572|
   573|  return {
   574|    '@context': 'https://schema.org',
   575|    '@type': 'FAQPage',
   576|    mainEntity: seo.faq.map((f, i) => ({
   577|      '@type': 'Question',
   578|      name: f.q,
   579|      acceptedAnswer: {
   580|        '@type': 'Answer',
   581|        text: f.a,
   582|      },
   583|    })),
   584|  }
   585|}
   586|
   587|/**
   588| * Build HowTo JSON-LD for converter tools (step-by-step workflow).
   589| */
   590|export function howToLdFor(toolId) {
   591|  const CONVERTER_TOOLS = new Set([
   592|    'json-to-csv', 'csv-to-json', 'json-to-excel', 'excel-to-json',
   593|    'csv-to-excel', 'excel-to-csv', 'yaml-to-json', 'json-to-yaml',
   594|  ])
   595|  if (!CONVERTER_TOOLS.has(toolId)) return null
   596|
   597|  const seo = TOOL_SEO[toolId]
   598|  return {
   599|    '@context': 'https://schema.org',
   600|    '@type': 'HowTo',
   601|    name: seo.h1,
   602|    description: seo.description,
   603|    step: [
   604|      {
   605|        '@type': 'HowToStep',
   606|        position: 1,
   607|        name: 'Add your data',
   608|        text: 'Type or paste your data into the input area, or upload a file from your device. All processing happens locally in your browser.',
   609|      },
   610|      {
   611|        '@type': 'HowToStep',
   612|        position: 2,
   613|        name: 'Convert',
   614|        text: 'The conversion happens instantly as you type or paste. View the results in the output pane alongside your input.',
   615|      },
   616|      {
   617|        '@type': 'HowToStep',
   618|        position: 3,
   619|        name: 'Download or copy',
   620|        text: 'Download the converted result as a file, or copy the output to your clipboard. Your data never leaves your device.',
   621|      },
   622|    ],
   623|  }
   624|}
   625|
   626|/**
   627| * Build JSON-LD structured data for a tool (or home) page. Read from raw HTML
   628| * by Google regardless of client-side rendering. Includes WebApplication,
   629| * optional FAQPage, and optional HowTo schemas.
   630| */
   631|export function jsonLdFor(toolId) {
   632|  const base = {
   633|    '@context': 'https://schema.org',
   634|    '@type': 'WebApplication',
   635|    name: 'Paimon Tools',
   636|    url: `${SITE_URL}/`,
   637|    applicationCategory: 'DeveloperApplication',
   638|    applicationSubCategory: 'Data Conversion',
   639|    operatingSystem: 'Any (web browser)',
   640|    browserRequirements: 'Requires a modern web browser with JavaScript enabled.',
   641|    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
   642|    isAccessibleForFree: true,
   643|    author: { '@type': 'Person', name: 'paimonchan' },
   644|    publisher: { '@type': 'Person', name: 'paimonchan' },
   645|    inLanguage: 'en',
   646|  }
   647|
   648|  if (!toolId || !TOOL_SEO[toolId]) {
   649|    // Home page (no toolId)
   650|    return {
   651|      ...base,
   652|      description: HOME_SEO.description,
   653|      featureList: Object.values(TOOL_SEO).map((s) => s.h1),
   654|      }
   655|  }
   656|
   657|  // 404 page — not a WebApplication, just a generic WebPage
   658|  if (toolId === '404') {
   659|    return {
   660|      '@context': 'https://schema.org',
   661|      '@type': 'WebPage',
   662|      name: '404 — Page Not Found',
   663|      description: TOOL_SEO['404'].description,
   664|      url: `${SITE_URL}/404/`,
   665|      isPartOf: { '@type': 'WebApplication', name: 'Paimon Tools', url: `${SITE_URL}/` },
   666|    }
   667|  }
   668|
   669|  const seo = TOOL_SEO[toolId]
   670|  const result = {
   671|    ...base,
   672|    name: seo.h1,
   673|    url: `${SITE_URL}/${seo.path}/`,
   674|    description: seo.description,
   675|    isPartOf: { '@type': 'WebApplication', name: 'Paimon Tools', url: `${SITE_URL}/` },
   676|  }
   677|
   678|  const faqLd = faqLdFor(toolId)
   679|  if (faqLd) result.faq = faqLd
   680|  const howToLd = howToLdFor(toolId)
   681|  if (howToLd) result.howTo = howToLd
   682|
   683|  return result
   684|}
   685|
   686|/** Crawlable noscript body for a tool (or home) page. */
   687|export function noscriptBodyFor(toolId) {
   688|  if (!toolId || !TOOL_SEO[toolId]) {
   689|    return `<h1>Paimon Tools — Free In-Browser Data Converter</h1>
   690|      <p>Convert between <strong>JSON, CSV, and Excel</strong> entirely in your browser.
   691|        No backend, no uploads, no sign-up — your data never leaves your device.</p>
   692|      <h2>Available tools</h2>
   693|      <ul>
   694|        <li><a href="${SITE_URL}/json-to-csv/">JSON to CSV converter</a></li>
   695|        <li><a href="${SITE_URL}/csv-to-json/">CSV to JSON converter</a></li>
   696|        <li><a href="${SITE_URL}/json-to-excel/">JSON to Excel (.xlsx) converter</a></li>
   697|        <li><a href="${SITE_URL}/excel-to-json/">Excel to JSON converter</a></li>
   698|        <li><a href="${SITE_URL}/csv-to-excel/">CSV to Excel converter</a></li>
   699|        <li><a href="${SITE_URL}/excel-to-csv/">Excel to CSV converter</a></li>
   700|        <li><a href="${SITE_URL}/json-formatter/">JSON formatter and beautifier</a></li>
   701|        <li><a href="${SITE_URL}/json-minifier/">JSON minifier</a></li>
   702|        <li><a href="${SITE_URL}/base64-encode/">Base64 encoder</a></li>
   703|        <li><a href="${SITE_URL}/base64-decode/">Base64 decoder</a></li>
   704|        <li><a href="${SITE_URL}/yaml-to-json/">YAML to JSON converter</a></li>
   705|        <li><a href="${SITE_URL}/json-to-yaml/">JSON to YAML converter</a></li>
   706|        <li><a href="${SITE_URL}/hash-generator/">SHA-256 hash generator</a></li>
   707|        <li><a href="${SITE_URL}/combine-files/">Combine Files</a> — merge multiple CSV &amp; Excel files</li>
   708|        <li><a href="${SITE_URL}/diff-tool/">Diff Tool</a> — compare two texts side by side</li>
   709|        <li><a href="${SITE_URL}/code/">Code Playground</a> — run JavaScript, Python &amp; HTML</li>
   710|      </ul>
   711|      <p>Open-source and privacy-first. Enable JavaScript to use it.</p>`
   712|  }
   713|
   714|  const seo = TOOL_SEO[toolId]
   715|  return `<h1>${seo.h1}</h1>
   716|      <p>${seo.description}</p>
   717|      <p>This tool runs entirely in your browser — no uploads, no sign-up.
   718|        Enable JavaScript to use it, or return to the
   719|        <a href="${SITE_URL}/">full list of data conversion tools</a>.</p>`
   720|}
   721|