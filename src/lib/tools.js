/**
 * tools.js — the tool registry.
 *
 * The UI is generic (see ConversionTool.jsx). Each entry declares:
 *   id          unique slug
 *   name        display label
 *   category    sidebar grouping
 *   description short helper text shown in the tool header
 *   icon        lucide-react component (imported below)
 *   keywords    extra terms for fuzzy search in the command palette
 *   input       { type: 'text' | 'file', accept?: string, label, placeholder }
 *   output      { type: 'text' | 'file', label, ext? }   // 'file' => downloadable binary
 *   sample      a representative input string for "Load sample"
 *   convert     (inputValue, opts) => Result   (see converters.js)
 *
 * For reversible pairs, a `swap` field declares the partner tool id; the UI
 * renders a swap button that flips direction and moves the output into the
 * input of the partner tool.
 */

import {
  ArrowLeftRight,
  Braces,
  FileSpreadsheet,
  FileJson,
  FileText,
  Minimize2,
} from 'lucide-react'

import {
  csvToJson,
  csvToXlsx,
  formatJson,
  jsonToCsv,
  jsonToXlsx,
  minifyJson,
  xlsxToCsv,
  xlsxToJson,
} from './converters'
import { TOOL_SEO } from './seo'

export const CATEGORIES = ['Convert', 'Format']

// Shared sample dataset so conversions feel consistent across tools.
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

export const TOOLS = [
  {
    id: 'json-to-csv',
    name: 'JSON to CSV',
    category: 'Convert',
    icon: ArrowLeftRight,
    keywords: ['export', 'table', 'flatten', 'excel'],
    description: 'Flatten an array of JSON objects into a comma-separated values table.',
    swap: 'csv-to-json',
    input: { type: 'text', label: 'JSON input', accept: '.json', placeholder: 'Paste JSON, or drop a .json file' },
    output: { type: 'text', label: 'CSV output', ext: 'csv' },
    sample: SAMPLE.json,
    acceptsLenient: true,
    convert: (v, opts) => jsonToCsv(v, opts),
  },
  {
    id: 'csv-to-json',
    name: 'CSV to JSON',
    category: 'Convert',
    icon: ArrowLeftRight,
    keywords: ['parse', 'import', 'table'],
    description: 'Parse a CSV table (with header row) into an array of JSON objects.',
    swap: 'json-to-csv',
    input: { type: 'text', label: 'CSV input', accept: '.csv,.txt', placeholder: 'Paste CSV, or drop a .csv file' },
    output: { type: 'text', label: 'JSON output', ext: 'json' },
    sample: SAMPLE.csv,
    convert: (v) => csvToJson(v),
  },
  {
    id: 'json-to-excel',
    name: 'JSON to Excel',
    category: 'Convert',
    icon: FileSpreadsheet,
    keywords: ['xlsx', 'spreadsheet', 'export', 'workbook'],
    description: 'Export an array of JSON objects into a downloadable .xlsx workbook.',
    swap: 'excel-to-json',
    input: { type: 'text', label: 'JSON input', accept: '.json', placeholder: 'Paste JSON, or drop a .json file' },
    output: { type: 'file', label: '.xlsx download', ext: 'xlsx' },
    sample: SAMPLE.json,
    acceptsLenient: true,
    convert: (v, opts) => jsonToXlsx(v, opts),
  },
  {
    id: 'excel-to-json',
    name: 'Excel to JSON',
    category: 'Convert',
    icon: FileJson,
    keywords: ['xlsx', 'spreadsheet', 'import', 'workbook'],
    description: 'Read the first sheet of an .xlsx file into an array of JSON objects.',
    swap: 'json-to-excel',
    input: { type: 'file', label: 'Drop an .xlsx file', accept: '.xlsx,.xls' },
    output: { type: 'text', label: 'JSON output', ext: 'json' },
    convert: (v) => xlsxToJson(v),
  },
  {
    id: 'csv-to-excel',
    name: 'CSV to Excel',
    category: 'Convert',
    icon: FileSpreadsheet,
    keywords: ['xlsx', 'spreadsheet', 'export', 'workbook'],
    description: 'Convert a CSV table into a downloadable .xlsx workbook.',
    swap: 'excel-to-csv',
    input: { type: 'text', label: 'CSV input', accept: '.csv,.txt', placeholder: 'Paste CSV, or drop a .csv file' },
    output: { type: 'file', label: '.xlsx download', ext: 'xlsx' },
    sample: SAMPLE.csv,
    convert: (v) => csvToXlsx(v),
  },
  {
    id: 'excel-to-csv',
    name: 'Excel to CSV',
    category: 'Convert',
    icon: FileText,
    keywords: ['xlsx', 'spreadsheet', 'import'],
    description: 'Read the first sheet of an .xlsx file and emit CSV.',
    swap: 'csv-to-excel',
    input: { type: 'file', label: 'Drop an .xlsx file', accept: '.xlsx,.xls' },
    output: { type: 'text', label: 'CSV output', ext: 'csv' },
    convert: (v) => xlsxToCsv(v),
  },
  {
    id: 'json-formatter',
    name: 'JSON Formatter',
    category: 'Format',
    icon: Braces,
    keywords: ['beautify', 'prettify', 'pretty', 'validate', 'indent'],
    description: 'Validate and pretty-print JSON. Choose your indentation below.',
    input: { type: 'text', label: 'JSON input', accept: '.json', placeholder: 'Paste JSON to format' },
    output: { type: 'text', label: 'Formatted JSON', ext: 'json' },
    hasOptions: true,
    acceptsLenient: true,
    sample: SAMPLE.uglyJson,
    convert: (v, opts) => formatJson(v, opts),
  },
  {
    id: 'json-minifier',
    name: 'JSON Minifier',
    category: 'Format',
    icon: Minimize2,
    keywords: ['compact', 'compress', 'minify', 'uglify'],
    description: 'Strip all whitespace from JSON. Validates syntax in the process.',
    input: { type: 'text', label: 'JSON input', accept: '.json', placeholder: 'Paste JSON to minify' },
    output: { type: 'text', label: 'Minified JSON', ext: 'json' },
    acceptsLenient: true,
    sample: SAMPLE.json,
    convert: (v) => minifyJson(v),
  },
]

/** Quick lookup by id. */
export const TOOLS_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]))

/** Tools grouped by category for the sidebar. */
export const TOOLS_BY_CATEGORY = CATEGORIES.map((cat) => ({
  category: cat,
  tools: TOOLS.filter((t) => t.category === cat),
}))
