/**
 * makeFilename — derives a download filename from the tool def + optional source name.
 */
import type { ToolDefinition } from '../engine/registry'

export function makeFilename(tool: ToolDefinition, sourceName?: string): string {
  const base = (sourceName || 'converted').replace(/\\.[^.]+$/, '') || 'converted'
  const ext = tool.output.ext || (tool.output.type === 'file' ? 'xlsx' : 'txt')
  return `${base}.${ext}`
}
