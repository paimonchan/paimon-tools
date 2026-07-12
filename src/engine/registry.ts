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
import type { ComponentType } from 'react'
import {
ArrowLeftRight,
Braces,
FileSpreadsheet,
FileJson,
FileText,
Minimize2,
Play,
} from 'lucide-react'
import type { Result } from './result'
import { csvToJson, jsonToCsv } from './converters/csv-io'
import { formatJson, minifyJson } from './converters/json-io'
import { jsonToXlsx, xlsxToJson, csvToXlsx, xlsxToCsv } from './converters/xlsx-io'
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
export interface ToolBase {
id: ToolId
name: string
category: 'Convert' | 'Format' | 'Tools'
icon: ComponentType<{ className?: string }>
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
icon: ArrowLeftRight,
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
icon: ArrowLeftRight,
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
icon: FileSpreadsheet,
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
icon: FileJson,
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
icon: FileSpreadsheet,
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
icon: FileText,
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
icon: Braces,
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
icon: Minimize2,
keywords: ['compact', 'compress', 'minify', 'uglify'],
description: 'Strip all whitespace from JSON. Validates syntax in the process.',
input: { type: 'text', label: 'JSON input', accept: '.json', placeholder: 'Paste JSON to minify' },
output: { type: 'text', label: 'Minified JSON', ext: 'json' },
acceptsLenient: true,
sample: SAMPLE.json,
convert: (v, opts) => minifyJson(v as string, opts ?? {}),
},
{
    id: 'playground',
    name: 'Playground',
    category: 'Tools',
    type: 'ref',
    icon: Play,
    keywords: ['code', 'run', 'javascript', 'python', 'html', 'editor', 'script', 'playground'],
    description: 'Write and run JavaScript, Python & HTML in your browser. JS via sandboxed Worker, Python via Pyodide WASM (fetched from CDN, cached locally), HTML with live iframe preview — 100% client-side, no sign-up.',
  },
]
// ── Lookup helpers ────────────────────────────────────

export const TOOLS_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<string, ToolDefinition>

export const TOOLS_BY_CATEGORY = CATEGORIES.map((cat) => ({
  category: cat,
  tools: TOOLS.filter((t) => t.category === cat),
}))
