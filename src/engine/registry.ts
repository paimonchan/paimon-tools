/**
 * registry.ts — typed tool registry.
 *
 * Two discrimated types:
 *   ConverterTool — full conversion pipeline (input, output, convert)
 *   ToolRef       — references a non-converter tool (e.g. Playground, Diff)
 *                   rendered via a separate component, not ConversionTool.
 *
 * Both share base fields (id, name, category, icon) for sidebar/palette.
 */
import type { Result } from './result'
import { encodeBase64, decodeBase64 } from './converters/base64-io'
import { csvToJson, jsonToCsv } from './converters/csv-io'
import { generateUuid, generateUuids } from './converters/uuid-gen'
import { sha256 } from './converters/hash-gen'
import { formatJson, minifyJson } from './converters/json-io'
import { jsonToXlsx, xlsxToJson, csvToXlsx, xlsxToCsv } from './converters/xlsx-io'
import { yamlToJson, jsonToYaml } from './converters/yaml-io'
// ── Types ─────────────────────────────────────────────
export type ToolId = string
export interface ToolInput {
  type: 'text' | 'file'
  accept?: string
  label: string
  placeholder?: string
}
export interface ToolOutput {
  type: 'text' | 'file'
  label: string
  ext?: string
}
/** Fields shared by every tool — enough for sidebar rendering & palette search. */
export type IconName =
  'arrow-left-right' | 'braces' | 'file-code' | 'file-spreadsheet' | 'file-json' | 'file-text' | 'fingerprint' | 'git-compare' | 'hash' | 'layers' | 'minimize-2' | 'play'
export interface ToolBase {
  id: ToolId
  name: string
  category: 'Convert' | 'Format' | 'Tools'
  icon: IconName
  keywords: string[]
  description: string
}
/** A full converter tool — rendered via ConversionTool. */
export interface ConverterTool extends ToolBase {
  type: 'converter'
  swap?: ToolId
  input: ToolInput
  output: ToolOutput
  sample?: string
  hasOptions?: boolean
  acceptsLenient?: boolean
  convert: (value: unknown, opts?: Record<string, unknown>) => Result<unknown>
}
/** A non-converter tool — rendered via its own component (PlaygroundTool, etc.). */
export interface ToolRef extends ToolBase {
  type: 'ref'
  /** Ref tools are rendered by matching their id to a lazy-loaded component. */
}
export type ToolDefinition = ConverterTool | ToolRef
// ── Sample data ───────────────────────────────────────
const SAMPLE = {
  json: `[
{ "id": 1, "name": "Paimon", "role": "Guide", "joined": "2020-09-28" },
{ "id": 2, "name": "Lumine", "role": "Traveler", "joined": "2020-09-28" },
{ "id": 3, "name": "Zhongli", "role": "Consultant", "joined": "2020-12-01" }
]`,
  csv: `id,name,role,joined
1,Paimon,Guide,2020-09-28
2,Lumine,Traveler,2020-09-28
3,Zhongli,Consultant,2020-12-01`,
  uglyJson: `{"id":1,"name":"Paimon","role":"Guide","stats":{"hp":10164,"atk":311,"def":1234},"tags":["emergency","food","best"]}`,
}
// ── Categories ────────────────────────────────────────
export const CATEGORIES = ['Convert', 'Format', 'Tools'] as const
// ── Tool registry ─────────────────────────────────────
export const TOOLS: ToolDefinition[] = [
  {
    id: 'json-to-csv',
    name: 'JSON to CSV',
    category: 'Convert',
    type: 'converter',
    icon: 'arrow-left-right',
    keywords: ['export', 'table', 'flatten', 'excel'],
    description: 'Flatten an array of JSON objects into a comma-separated values table.',
    swap: 'csv-to-json',
    input: { type: 'text', label: 'JSON input', accept: '.json', placeholder: 'Paste JSON, or drop a .json file' },
    output: { type: 'text', label: 'CSV output', ext: 'csv' },
    sample: SAMPLE.json,
    acceptsLenient: true,
    convert: (v, opts) => jsonToCsv(v as string, opts ?? {}),
  },
  {
    id: 'csv-to-json',
    name: 'CSV to JSON',
    category: 'Convert',
    type: 'converter',
    icon: 'arrow-left-right',
    keywords: ['parse', 'import', 'table'],
    description: 'Parse a CSV table (with header row) into an array of JSON objects.',
    swap: 'json-to-csv',
    input: { type: 'text', label: 'CSV input', accept: '.csv,.txt', placeholder: 'Paste CSV, or drop a .csv file' },
    output: { type: 'text', label: 'JSON output', ext: 'json' },
    sample: SAMPLE.csv,
    convert: (v) => csvToJson(v as string),
  },
  {
    id: 'json-to-excel',
    name: 'JSON to Excel',
    category: 'Convert',
    type: 'converter',
    icon: 'file-spreadsheet',
    keywords: ['xlsx', 'spreadsheet', 'export', 'workbook'],
    description: 'Export an array of JSON objects into a downloadable .xlsx workbook.',
    swap: 'excel-to-json',
    input: { type: 'text', label: 'JSON input', accept: '.json', placeholder: 'Paste JSON, or drop a .json file' },
    output: { type: 'file', label: '.xlsx download', ext: 'xlsx' },
    sample: SAMPLE.json,
    acceptsLenient: true,
    convert: (v, opts) => jsonToXlsx(v, opts ?? {}),
  },
  {
    id: 'excel-to-json',
    name: 'Excel to JSON',
    category: 'Convert',
    type: 'converter',
    icon: 'file-json',
    keywords: ['xlsx', 'spreadsheet', 'import', 'workbook'],
    description: 'Read the first sheet of an .xlsx file into an array of JSON objects.',
    swap: 'json-to-excel',
    input: { type: 'file', label: 'Drop an .xlsx file', accept: '.xlsx,.xls' },
    output: { type: 'text', label: 'JSON output', ext: 'json' },
    convert: (v) => xlsxToJson(v as ArrayBuffer),
  },
  {
    id: 'csv-to-excel',
    name: 'CSV to Excel',
    category: 'Convert',
    type: 'converter',
    icon: 'file-spreadsheet',
    keywords: ['xlsx', 'spreadsheet', 'export', 'workbook'],
    description: 'Convert a CSV table into a downloadable .xlsx workbook.',
    swap: 'excel-to-csv',
    input: { type: 'text', label: 'CSV input', accept: '.csv,.txt', placeholder: 'Paste CSV, or drop a .csv file' },
    output: { type: 'file', label: '.xlsx download', ext: 'xlsx' },
    sample: SAMPLE.csv,
    convert: (v) => csvToXlsx(v as string),
  },
  {
    id: 'excel-to-csv',
    name: 'Excel to CSV',
    category: 'Convert',
    type: 'converter',
    icon: 'file-text',
    keywords: ['xlsx', 'spreadsheet', 'import'],
    description: 'Read the first sheet of an .xlsx file and emit CSV.',
    swap: 'csv-to-excel',
    input: { type: 'file', label: 'Drop an .xlsx file', accept: '.xlsx,.xls' },
    output: { type: 'text', label: 'CSV output', ext: 'csv' },
    convert: (v) => xlsxToCsv(v as ArrayBuffer),
  },
  {
    id: 'json-formatter',
    name: 'JSON Formatter',
    category: 'Format',
    type: 'converter',
    icon: 'braces',
    keywords: ['beautify', 'prettify', 'pretty', 'validate', 'indent'],
    description: 'Validate and pretty-print JSON. Choose your indentation below.',
    input: { type: 'text', label: 'JSON input', accept: '.json', placeholder: 'Paste JSON to format' },
    output: { type: 'text', label: 'Formatted JSON', ext: 'json' },
    hasOptions: true,
    acceptsLenient: true,
    sample: SAMPLE.uglyJson,
    convert: (v, opts) => formatJson(v as string, opts ?? {}),
  },
  {
    id: 'json-minifier',
    name: 'JSON Minifier',
    category: 'Format',
    type: 'converter',
    icon: 'minimize-2',
    keywords: ['compact', 'compress', 'minify', 'uglify'],
    description: 'Strip all whitespace from JSON. Validates syntax in the process.',
    input: { type: 'text', label: 'JSON input', accept: '.json', placeholder: 'Paste JSON to minify' },
    output: { type: 'text', label: 'Minified JSON', ext: 'json' },
    acceptsLenient: true,
    sample: SAMPLE.json,
    convert: (v, opts) => minifyJson(v as string, opts ?? {}),
  },
  {
    id: 'base64-encode',
    name: 'Base64 Encode',
    category: 'Convert',
    type: 'converter',
    icon: 'file-code',
    keywords: ['base64', 'encode', 'text to base64', 'base64 encoder'],
    description: 'Encode any text to Base64. UTF-8 safe — handles Unicode, emoji, and special characters.',
    input: {
      type: 'text',
      label: 'Text input',
      placeholder: 'Paste text to encode to Base64',
    },
    output: { type: 'text', label: 'Base64 output', ext: 'txt' },
    sample: 'Hello, Paimon! 👋',
    convert: (v) => encodeBase64(v as string),
  },
  {
    id: 'base64-decode',
    name: 'Base64 Decode',
    category: 'Convert',
    type: 'converter',
    icon: 'file-code',
    keywords: ['base64', 'decode', 'base64 to text', 'base64 decoder'],
    description: 'Decode Base64 back to readable text. Supports standard Base64 encoded strings.',
    input: {
      type: 'text',
      label: 'Base64 input',
      placeholder: 'Paste Base64 string to decode',
    },
    output: { type: 'text', label: 'Decoded text', ext: 'txt' },
    sample: 'SGVsbG8sIFBhaW1vbiEg8J+Riw==',
    convert: (v) => decodeBase64(v as string),
  },
  {
    id: 'yaml-to-json',
    name: 'YAML to JSON',
    category: 'Convert',
    type: 'converter',
    icon: 'arrow-left-right',
    swap: 'json-to-yaml',
    keywords: ['yaml', 'yml', 'to json', 'yaml converter', 'parse yaml'],
    description: 'Convert YAML to JSON. Paste YAML and get formatted JSON — 100% in your browser, no uploads.',
    input: { type: 'text', label: 'YAML input', placeholder: 'Paste YAML, or drop a .yaml file' },
    output: { type: 'text', label: 'JSON output', ext: 'json' },
    sample: 'name: Paimon\nrole: Guide\nskills:\n  - flying\n  - cooking',
    convert: (v) => yamlToJson(v as string),
  },
  {
    id: 'json-to-yaml',
    name: 'JSON to YAML',
    category: 'Convert',
    type: 'converter',
    icon: 'arrow-left-right',
    swap: 'yaml-to-json',
    keywords: ['json', 'to yaml', 'yml', 'json converter', 'json to yml'],
    description: 'Convert JSON to YAML. Paste JSON and get clean YAML output — 100% in your browser, no uploads.',
    input: { type: 'text', label: 'JSON input', accept: '.json', placeholder: 'Paste JSON' },
    output: { type: 'text', label: 'YAML output', ext: 'yaml' },
    sample: '{"name": "Paimon", "role": "Guide", "skills": ["flying", "cooking"]}',
    convert: (v) => jsonToYaml(v as string),
  },
  {
    id: 'hash-generator',
    name: 'SHA-256 Hash',
    category: 'Tools',
    type: 'converter',
    icon: 'hash',
    keywords: ['sha256', 'hash', 'sha-256', 'checksum', 'fingerprint', 'digest'],
    description: 'Generate SHA-256 hash of any text. Pure JS implementation — 100% in your browser, no uploads, no sign-up.',
    input: { type: 'text', label: 'Text input', placeholder: 'Paste text to hash' },
    output: { type: 'text', label: 'SHA-256 hash', ext: 'txt' },
    sample: 'Hello, Paimon!',
    convert: (v) => sha256(v as string),
  },
  {
    id: 'uuid-generator',
    name: 'UUID Generator',
    category: 'Tools',
    type: 'converter',
    icon: 'fingerprint',
    keywords: ['uuid', 'guid', 'id', 'generator', 'uuid v4', 'random'],
    description: 'Generate UUID v4 (random) identifiers. Create one or multiple UUIDs instantly — 100% in your browser, no uploads.',
    input: { type: 'text', label: 'Count (optional)', placeholder: 'Leave empty for 1, or enter a number (1-100)' },
    output: { type: 'text', label: 'UUID output', ext: 'txt' },
    convert: (v) => {
      const input = (v as string)?.trim()
      if (!input) return generateUuid()
      const count = parseInt(input, 10)
      if (isNaN(count) || count < 1) return generateUuid()
      return generateUuids(count)
    },
  },
  {
    id: 'playground',
    name: 'Playground',
    category: 'Tools',
    type: 'ref',
    icon: 'play',
    keywords: ['code', 'run', 'javascript', 'python', 'html', 'editor', 'script', 'playground'],
    description:
      'Write and run JavaScript, Python & HTML in your browser. JS via sandboxed Worker, Python via Pyodide WASM (fetched from CDN, cached locally), HTML with live iframe preview — 100% client-side, no sign-up.',
  },
  {
    id: 'combine-files',
    name: 'Combine Files',
    category: 'Tools',
    type: 'ref',
    icon: 'layers',
    keywords: ['merge', 'combine', 'excel', 'csv', 'xlsx', 'append', 'concat', 'gabung', 'join', 'multiple files'],
    description:
      'Merge multiple CSV and Excel files into one. Append rows from 2+ files, auto-detect format, union columns — 100% client-side, no uploads, no sign-up.',
  },
  {
    id: 'diff-tool',
    name: 'Diff Tool',
    category: 'Tools',
    type: 'ref',
    icon: 'git-compare',
    keywords: ['diff', 'compare', 'text compare', 'side by side', 'file comparison', 'patch', 'unified diff', 'code compare'],
    description:
      'Compare two texts side by side. Paste text or drop files, see line-by-line differences with color-coded added/removed lines — 100% client-side, no uploads, no sign-up.',
  },
]
// ── Lookup helpers ────────────────────────────────────

export const TOOLS_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<string, ToolDefinition>

export const TOOLS_BY_CATEGORY = CATEGORIES.map((cat) => ({
  category: cat,
  tools: TOOLS.filter((t) => t.category === cat),
}))
