/**
 * files.js — file I/O helpers that are the ONLY place the app reads user
 * files or triggers downloads. Keeping these isolated makes it easy to audit
 * that nothing is ever sent anywhere.
 */

/**
 * Read a File into a text string (UTF-8). Used by CSV/JSON inputs.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'))
    reader.readAsText(file)
  })
}

/**
 * Read a File into an ArrayBuffer. Used by Excel (.xlsx) inputs since
 * SheetJS consumes binary data.
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Trigger a browser download of a text/blob payload.
 * @param {{ content: string|Blob, filename: string, mime?: string }} args
 */
export function downloadBlob({ content, filename, mime = 'text/plain' }) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke on next tick so the click handler has time to fire.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Trigger a download of a binary ArrayBuffer (e.g. an .xlsx workbook).
 * @param {{ arraybuffer: ArrayBuffer, filename: string, mime?: string }} args
 */
export function downloadArrayBuffer({ arraybuffer, filename, mime }) {
  downloadBlob({
    content: new Blob([arraybuffer], { type: mime ?? 'application/octet-stream' }),
    filename,
  })
}

/**
 * Helper to guess a default output filename from the active tool + input name.
 * @param {string} toolId  e.g. "json-to-csv"
 * @param {string} [fallback]
 */
export function suggestFilename(toolId, fallback = 'converted') {
  const base = (fallback || 'converted').replace(/\.[^.]+$/, '')
  const ext = toolId.includes('excel') || toolId.includes('xlsx') ? 'xlsx'
    : toolId.includes('csv') ? 'csv'
    : 'json'
  return `${base || 'converted'}.${ext}`
}
