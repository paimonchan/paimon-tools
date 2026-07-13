/**
 * icon-map.ts — adapter layer mapping IconName strings to React components.
 *
 * This file is the ONLY place in the codebase that imports lucide-react
 * icons for tool rendering. The domain layer (engine/) never touches React.
 *
 * To add a new icon, import it from lucide-react below and add it to ICON_MAP.
 */
import { ArrowLeftRight, Braces, FileCode, FileSpreadsheet, FileJson, FileText, Fingerprint, Hash, Minimize2, Play } from 'lucide-react'
import type { IconName } from '../engine/registry'

export const ICON_MAP: Record<IconName, React.ComponentType<{ className?: string }>> = {
  'arrow-left-right': ArrowLeftRight,
  braces: Braces,
  'file-code': FileCode,
  'file-spreadsheet': FileSpreadsheet,
  'file-json': FileJson,
  'file-text': FileText,
  fingerprint: Fingerprint,
  hash: Hash,
  'minimize-2': Minimize2,
  play: Play,
}
