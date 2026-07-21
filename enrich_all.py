#!/usr/bin/env python3
"""Enrich all remaining converter tools with content depth + internal links."""
import re, sys

with open('src/lib/seo.js', 'r', encoding='utf-8') as f:
    content = f.read()

replacements = {}

# json-to-excel
replacements["""    bodyHtml: `<h2>JSON to Excel (.xlsx) Converter</h2>
<p>Export a JSON array as a downloadable Excel spreadsheet (.xlsx) entirely in your browser. Your data is processed locally — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'excel-to-json': {"""] = """    bodyHtml: `<h2>JSON to Excel (.xlsx) Converter</h2>
<p>Export a JSON array as a downloadable Excel spreadsheet (.xlsx) entirely in your browser. Your data is processed locally - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Convert API JSON responses into formatted Excel reports for stakeholders</li>
  <li>Create shareable .xlsx files from JSON datasets for non-technical teams</li>
  <li>Generate Excel-compatible reports from database export JSON</li>
</ul>
<h3>How It Works</h3>
<p>Paste a JSON array of objects into the input pane. SheetJS creates a .xlsx workbook in your browser with the data in a sheet named "Data". Click download to save - all processing happens locally with zero uploads.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../excel-to-json/">Excel to JSON Converter</a> - reverse: extract JSON from .xlsx</li>
  <li><a href="../json-to-csv/">JSON to CSV Converter</a> - export as CSV instead</li>
  <li><a href="../csv-to-excel/">CSV to Excel Converter</a> - convert CSV to .xlsx</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'excel-to-json': {"""}

# excel-to-json
replacements["""    bodyHtml: `<h2>Excel to JSON Converter</h2>
<p>Extract JSON data from an Excel (.xlsx) spreadsheet entirely in your browser. Drop a file and get a JSON array from the first sheet — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'csv-to-excel': {"""] = """    bodyHtml: `<h2>Excel to JSON Converter</h2>
<p>Extract JSON data from an Excel (.xlsx) spreadsheet entirely in your browser. Drop a file and get a JSON array from the first sheet - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Extract spreadsheet data from clients for use in web applications</li>
  <li>Convert .xlsx reports into JSON for data processing pipelines</li>
  <li>Parse Excel exports into structured JSON without any server upload</li>
</ul>
<h3>How It Works</h3>
<p>Drop or select an .xlsx file. SheetJS reads the first sheet in your browser and converts each row to a JSON object. The header row defines the object keys. All processing is local - your file never leaves your device.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../json-to-excel/">JSON to Excel Converter</a> - reverse: convert JSON to .xlsx</li>
  <li><a href="../excel-to-csv/">Excel to CSV Converter</a> - extract CSV instead</li>
  <li><a href="../combine-files/">Combine Files</a> - merge multiple Excel files</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'csv-to-excel': {"""}

# csv-to-excel
replacements["""    bodyHtml: `<h2>CSV to Excel (.xlsx) Converter</h2>
<p>Turn a CSV table into a downloadable Excel spreadsheet (.xlsx) entirely in your browser. Your data is processed locally — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'excel-to-csv': {"""] = """    bodyHtml: `<h2>CSV to Excel (.xlsx) Converter</h2>
<p>Turn a CSV table into a downloadable Excel spreadsheet (.xlsx) entirely in your browser. Your data is processed locally - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Convert CSV reports downloaded from analytics into professional .xlsx</li>
  <li>Create formatted Excel files from plain CSV data for presentations</li>
  <li>Transform database CSV exports into Excel for client delivery</li>
</ul>
<h3>How It Works</h3>
<p>Paste CSV data with headers. SheetJS creates a formatted .xlsx file in your browser, preserving your data structure and column order. Click to download - all processing is local with no uploads.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../excel-to-csv/">Excel to CSV Converter</a> - reverse: extract CSV from .xlsx</li>
  <li><a href="../csv-to-json/">CSV to JSON Converter</a> - convert CSV to JSON instead</li>
  <li><a href="../json-to-excel/">JSON to Excel Converter</a> - convert JSON to .xlsx</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'excel-to-csv': {"""}

# excel-to-csv
replacements["""    bodyHtml: `<h2>Excel to CSV Converter</h2>
<p>Extract CSV data from an Excel (.xlsx) spreadsheet entirely in your browser. Drop a file and get CSV from the first sheet — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'json-formatter': {"""] = """    bodyHtml: `<h2>Excel to CSV Converter</h2>
<p>Extract CSV data from an Excel (.xlsx) spreadsheet entirely in your browser. Drop a file and get CSV from the first sheet - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Convert Excel spreadsheets to CSV for database import pipelines</li>
  <li>Extract raw tabular data from .xlsx files for legacy systems</li>
  <li>Prepare Excel data for ETL processes that only accept CSV input</li>
</ul>
<h3>How It Works</h3>
<p>Drop or select an .xlsx file. SheetJS reads the first sheet and converts rows to CSV format preserving headers. All processing happens locally - your file never leaves your browser.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../csv-to-excel/">CSV to Excel Converter</a> - reverse: convert CSV to .xlsx</li>
  <li><a href="../excel-to-json/">Excel to JSON Converter</a> - extract JSON instead</li>
  <li><a href="../combine-files/">Combine Files</a> - merge multiple Excel files</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'json-formatter': {"""}

# json-formatter (already has FAQ)
replacements["""    bodyHtml: `<h2>JSON Formatter &amp; Beautifier</h2>
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
  'json-minifier': {"""] = """    bodyHtml: `<h2>JSON Formatter &amp; Beautifier</h2>
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
      <li><a href=\"../json-minifier/\">JSON Minifier</a> - compress JSON by stripping whitespace</li>
      <li><a href=\"../json-to-yaml/\">JSON to YAML Converter</a> - convert JSON to YAML</li>
      <li><a href=\"../json-to-csv/\">JSON to CSV Converter</a> - convert JSON data to tabular format</li>
    </ul>
    <p><a href=\"../\">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'Does it validate as I type?',
        a: 'Yes. JSON is auto-validated on every keystroke with inline error messages showing exactly where the error is.' },
      { q: 'What indentation options are available?',
        a: '2 spaces, 4 spaces, or tabs. Choose from the dropdown above the output pane.' },
    ],
  },
  'json-minifier': {"""}

# json-minifier
replacements["""    bodyHtml: `<h2>JSON Minifier</h2>
<p>Minify and compress JSON entirely in your browser. Strips all unnecessary whitespace to reduce file size — validates syntax as it goes. No uploads, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'base64-encode': {"""] = """    bodyHtml: `<h2>JSON Minifier</h2>
<p>Minify and compress JSON entirely in your browser. Strips all unnecessary whitespace to reduce file size - validates syntax as it goes. No uploads, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Reduce JSON payload size for API requests and storage</li>
  <li>Compact configuration files for production deployment</li>
  <li>Prepare JSON for bandwidth-constrained environments</li>
</ul>
<h3>How It Works</h3>
<p>Paste your JSON and get an instantly minified version with all unnecessary whitespace removed. Syntax is validated during compression. All processing is local with no uploads.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../json-formatter/">JSON Formatter</a> - reverse: pretty-print minified JSON</li>
  <li><a href="../json-to-csv/">JSON to CSV Converter</a> - convert JSON to tabular format</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'base64-encode': {"""}

# base64-encode
replacements["""    bodyHtml: `<h2>Base64 Encode</h2>
<p>Encode any text to Base64 entirely in your browser. UTF-8 safe — handles Unicode, emoji, and special characters. No uploads, no sign-up, fully private.</p>
<p>Example input: <code>Hello, World!</code> → <code>SGVsbG8sIFdvcmxkIQ==</code></p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'base64-decode': {"""] = """    bodyHtml: `<h2>Base64 Encode</h2>
<p>Encode any text to Base64 entirely in your browser. UTF-8 safe - handles Unicode, emoji, and special characters. No uploads, no sign-up, fully private.</p>
<p>Example input: <code>Hello, World!</code> to <code>SGVsbG8sIFdvcmxkIQ==</code></p>
<h3>Common Use Cases</h3>
<ul>
  <li>Encode binary data for embedding in JSON or HTML documents</li>
  <li>Prepare data for HTTP headers that require Base64 encoding</li>
  <li>Convert credentials or tokens for basic auth headers</li>
</ul>
<h3>How It Works</h3>
<p>Type or paste text in the input pane. The browser's built-in btoa() function with UTF-8 encoding converts it to Base64 instantly. All processing is local with no uploads.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../base64-decode/">Base64 Decode</a> - reverse: decode Base64 back to text</li>
  <li><a href="../hash-generator/">SHA-256 Hash Generator</a> - generate secure hashes</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'base64-decode': {"""}

# base64-decode
replacements["""    bodyHtml: `<h2>Base64 Decode</h2>
<p>Decode Base64 strings back to readable text entirely in your browser. Supports standard Base64 encoded strings. No uploads, no sign-up, fully private.</p>
<p>Example input: <code>SGVsbG8sIFdvcmxkIQ==</code> → <code>Hello, World!</code></p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'uuid-generator': {"""] = """    bodyHtml: `<h2>Base64 Decode</h2>
<p>Decode Base64 strings back to readable text entirely in your browser. Supports standard Base64 encoded strings. No uploads, no sign-up, fully private.</p>
<p>Example input: <code>SGVsbG8sIFdvcmxkIQ==</code> to <code>Hello, World!</code></p>
<h3>Common Use Cases</h3>
<ul>
  <li>Decode Base64 data from API responses and JWT token payloads</li>
  <li>Read Base64-encoded environment variables and config values</li>
  <li>Convert inline image data URLs back to readable text</li>
</ul>
<h3>How It Works</h3>
<p>Paste a Base64 string in the input pane. The browser's atob() function decodes it back to readable text with full UTF-8 support. Results update in real-time with no server interaction.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../base64-encode/">Base64 Encode</a> - reverse: encode text to Base64</li>
  <li><a href="../hash-generator/">SHA-256 Hash Generator</a> - generate secure hashes</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'uuid-generator': {"""}

# uuid-generator
replacements["""    bodyHtml: `<h2>UUID Generator</h2>
<p>Generate random UUID v4 identifiers entirely in your browser. Click to generate — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'yaml-to-json': {"""] = """    bodyHtml: `<h2>UUID Generator</h2>
<p>Generate random UUID v4 identifiers entirely in your browser. Click to generate one or multiple at once - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Generate unique primary keys for database records and APIs</li>
  <li>Create session tokens, request IDs, and correlation IDs</li>
  <li>Generate identifiers for distributed system entities</li>
</ul>
<h3>How It Works</h3>
<p>Uses the Web Crypto API's crypto.randomUUID() for cryptographically secure UUID v4 generation. Generate individually or in batch mode. All processing is local with no server interaction.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../hash-generator/">SHA-256 Hash Generator</a> - generate secure hashes</li>
  <li><a href="../base64-encode/">Base64 Encode</a> - encode UUIDs to Base64</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'yaml-to-json': {"""}

# yaml-to-json (has FAQ)
replacements["""    bodyHtml: `<h2>YAML to JSON Converter</h2>
    <p>Convert YAML to JSON entirely in your browser. Paste YAML and get clean, formatted JSON — no uploads, no sign-up, fully private.</p>
    <p><a href=\"../\">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'What YAML features are supported?',
        a: 'Standard YAML 1.2 - strings, numbers, booleans, arrays, nested objects, and multiline strings.' },
    ],
  },
  'json-to-yaml': {"""] = """    bodyHtml: `<h2>YAML to JSON Converter</h2>
    <p>Convert YAML to JSON entirely in your browser. Paste YAML and get clean, formatted JSON - no uploads, no sign-up, fully private.</p>
    <h3>Common Use Cases</h3>
    <ul>
      <li>Convert Docker Compose and Kubernetes YAML to JSON for scripting</li>
      <li>Transform CI/CD pipeline configurations between formats</li>
      <li>Parse YAML config files for use in JavaScript applications</li>
    </ul>
    <h3>Related Tools</h3>
    <ul>
      <li><a href=\"../json-to-yaml/\">JSON to YAML Converter</a> - reverse: convert JSON to YAML</li>
      <li><a href=\"../json-formatter/\">JSON Formatter</a> - pretty-print the resulting JSON</li>
    </ul>
    <p><a href=\"../\">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'What YAML features are supported?',
        a: 'Standard YAML 1.2 - strings, numbers, booleans, arrays, nested objects, and multiline strings.' },
    ],
  },
  'json-to-yaml': {"""}

# json-to-yaml
replacements["""    bodyHtml: `<h2>JSON to YAML Converter</h2>
<p>Convert JSON to YAML entirely in your browser. Paste JSON and get clean, readable YAML output — no uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'hash-generator': {"""] = """    bodyHtml: `<h2>JSON to YAML Converter</h2>
<p>Convert JSON to YAML entirely in your browser. Paste JSON and get clean, readable YAML output - no uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Convert JSON API documentation examples to YAML format</li>
  <li>Transform app config files from JSON to YAML for Ansible, Docker, Kubernetes</li>
  <li>Prepare JSON data for tools and platforms that prefer YAML</li>
</ul>
<h3>How It Works</h3>
<p>Paste valid JSON in the input pane. The js-yaml library converts it to clean YAML output preserving your data structure. All processing is local - no uploads, fully private.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../yaml-to-json/">YAML to JSON Converter</a> - reverse: convert YAML to JSON</li>
  <li><a href="../json-formatter/">JSON Formatter</a> - pretty-print JSON before conversion</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'hash-generator': {"""}

# hash-generator
replacements["""    bodyHtml: `<h2>SHA-256 Hash Generator</h2>
<p>Generate SHA-256 hash of any text entirely in your browser. Pure JavaScript implementation — your data never leaves your device. No uploads, no sign-up, fully private.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'combine-files': {"""] = """    bodyHtml: `<h2>SHA-256 Hash Generator</h2>
<p>Generate SHA-256 hash of any text entirely in your browser. Pure JavaScript implementation using the Web Crypto API - your data never leaves your device. No uploads, no sign-up, fully private.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Verify file integrity by comparing SHA-256 checksums</li>
  <li>Generate password hashes for secure storage and testing</li>
  <li>Create content-addressed identifiers for deduplication</li>
</ul>
<h3>How It Works</h3>
<p>Type or paste text (or drop a file) and the Web Crypto API computes its SHA-256 hash instantly. The same cryptographic algorithm used in HTTPS certificates and Git. All processing is local.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../uuid-generator/">UUID Generator</a> - generate random identifiers</li>
  <li><a href="../base64-encode/">Base64 Encode</a> - encode hash output to Base64</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'combine-files': {"""}

# combine-files
replacements["""    bodyHtml: `<h2>Combine CSV &amp; Excel Files</h2>
<p>Merge multiple CSV, TSV and Excel files into one file entirely in your browser. Append rows from 2+ files, auto-detect format, union columns — no uploads, no sign-up, fully private. Supports mixed formats.</p>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'diff-tool': {"""] = """    bodyHtml: `<h2>Combine CSV &amp; Excel Files</h2>
<p>Merge multiple CSV, TSV and Excel files into one file entirely in your browser. Append rows from 2+ files, auto-detect format, union columns - no uploads, no sign-up, fully private. Supports mixed formats.</p>
<h3>Common Use Cases</h3>
<ul>
  <li>Merge monthly CSV reports into a single annual dataset</li>
  <li>Combine Excel spreadsheets from different departments into one file</li>
  <li>Union CSV exports from multiple sources for unified analysis</li>
</ul>
<h3>How It Works</h3>
<p>Add two or more files (CSV, TSV, or Excel). The tool auto-detects each file's format, unions all columns across files, and appends rows. Download as CSV or Excel. All processing is local.</p>
<h3>Related Tools</h3>
<ul>
  <li><a href="../csv-to-excel/">CSV to Excel Converter</a> - convert individual CSVs to .xlsx</li>
  <li><a href="../excel-to-csv/">Excel to CSV Converter</a> - extract CSV from .xlsx files</li>
  <li><a href="../diff-tool/">Diff Tool</a> - compare two files side by side</li>
</ul>
<p><a href="../">← Back to all Paimon Tools</a></p>`,
  },
  'diff-tool': {"""}

# diff-tool (has FAQ)
replacements["""    bodyHtml: `<h2>Diff Tool — Compare Text Side by Side</h2>
    <p>Compare two texts or files entirely in your browser. Side-by-side or unified diff view with color-coded added/removed lines. Paste text or drop files — no uploads, no sign-up, fully private. Unlimited size.</p>
    <p><a href=\"../\">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'What is the maximum file size?',
        a: 'There is no hard limit. Diffs are processed entirely in your browser - larger texts may take slightly longer but are fully supported.' },
    ],
  },
  'text-delimiter': {"""] = """    bodyHtml: `<h2>Diff Tool — Compare Text Side by Side</h2>
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
      <li><a href=\"../text-delimiter/\">Text Delimiter Tool</a> - join and wrap list items</li>
      <li><a href=\"../combine-files/\">Combine Files</a> - merge multiple files into one</li>
    </ul>
    <p><a href=\"../\">← Back to all Paimon Tools</a></p>`,
    faq: [
      { q: 'What is the maximum file size?',
        a: 'There is no hard limit. Diffs are processed entirely in your browser - larger texts may take slightly longer but are fully supported.' },
    ],
  },
  'text-delimiter': {"""}

# Apply all replacements
count = 0
for old, new in replacements.items():
    if old in content:
        content = content.replace(old, new, 1)
        print(f"OK: replaced ({old[20:50]}...)")
        count += 1
    else:
        print(f"MISS: could not find ({old[20:50]}...)")
        # Show what's actually in the file near that position
        for line in content.split('\n'):
            key_words = old.split('\\n')[0][30:60].strip()
            if key_words[:30] in line:
                print(f"  Nearby: '{line.strip()[:80]}'")
                break

# Count final word counts
print(f"\n{count} replacements done")

with open('src/lib/seo.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("File written!")
