/**
 * delimiter-tool.ts — Pure function for joining/wrapping list items.
 *
 * Transforms a newline-separated list into delimited text with optional
 * quoting, wrapping, and global wrapper — like delim.co.
 * Zero React, zero DOM, zero dependencies.
 */

/**
 * Processing order:
 *   1. Split input by newlines
 *   2. Skip first N lines (header)
 *   3. Filter: remove empty lines (if skipEmpty)
 *   4. Trim each line (if trim)
 *   5. Quote: wrap each value with quote chars
 *   6. Wrap: apply wrapOpen + wrapClose around each quoted value
 *   7. Join all items with delimiter
 *   8. Apply wrapperOpen + wrapperClose around the entire result
 */

export interface DelimiterOptions {
  /** Delimiter between items (default: ',') */
  delimiter: string
  /** Quote style: 'none' | 'single' | 'double' */
  quote: 'none' | 'single' | 'double'
  /** Lines to skip from the top (header) */
  skipLines: number
  /** String to prepend to each quoted item (e.g. '<li>') */
  wrapOpen: string
  /** String to append to each quoted item (e.g. '</li>') */
  wrapClose: string
  /** Global wrapper before all items (e.g. '<ul>') */
  wrapperOpen: string
  /** Global wrapper after all items (e.g. '</ul>') */
  wrapperClose: string
  /** Trim whitespace from each line */
  trim: boolean
  /** Skip empty lines */
  skipEmpty: boolean
}

const DEFAULT_OPTS: DelimiterOptions = {
  delimiter: ',',
  quote: 'none',
  skipLines: 0,
  wrapOpen: '',
  wrapClose: '',
  wrapperOpen: '',
  wrapperClose: '',
  trim: true,
  skipEmpty: true,
}

/**
 * Apply quote character(s) around a value.
 */
function applyQuote(value: string, quote: DelimiterOptions['quote']): string {
  if (quote === 'none') return value
  const q = quote === 'single' ? "'" : '"'
  return q + value + q
}

/**
 * Transform a newline-separated list into delimited text.
 */
export function delimitText(input: string, opts?: Partial<DelimiterOptions>): string {
  const options: DelimiterOptions = { ...DEFAULT_OPTS, ...opts }

  if (typeof input !== 'string' || input.trim() === '') {
    return ''
  }

  // 1. Split input by newlines
  let lines = input.split('\n')

  // 2. Skip first N lines (header)
  if (options.skipLines > 0) {
    lines = lines.slice(options.skipLines)
  }

  // 3–4. Filter empty lines + trim
  const items: string[] = []
  for (const line of lines) {
    let item = options.trim ? line.trim() : line
    if (options.skipEmpty && item === '') continue
    items.push(item)
  }

  // 5–7. Quote → Wrap → Join
  const processed = items.map((item) => {
    const quoted = applyQuote(item, options.quote)
    return options.wrapOpen + quoted + options.wrapClose
  })

  const joined = processed.join(options.delimiter)

  // 8. Global wrapper
  return options.wrapperOpen + joined + options.wrapperClose
}
