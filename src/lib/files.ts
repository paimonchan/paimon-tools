/**
 * files.js → files.ts — file I/O helpers (browser API).
 *
 * This is the ONLY place the app reads user files or triggers downloads.
 * Isolated here for easy audit: nothing is ever sent anywhere.
 */

/**
 * Read a File as text (UTF-8).
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'))
    reader.readAsText(file)
  })
}

/**
 * Read a File as ArrayBuffer (for binary data like .xlsx).
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Trigger a browser download of a text/blob payload.
 */
export function downloadBlob({
  content,
  filename,
  mime = 'text/plain',
}: {
  content: string | Blob
  filename: string
  mime?: string
}): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Trigger a download of an ArrayBuffer (e.g. .xlsx workbook).
 */
export function downloadArrayBuffer({
  arraybuffer,
  filename,
  mime,
}: {
  arraybuffer: ArrayBuffer
  filename: string
  mime?: string
}): void {
  downloadBlob({
    content: new Blob([arraybuffer], { type: mime ?? 'application/octet-stream' }),
    filename,
  })
}
