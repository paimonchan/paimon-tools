/**
 * video-metadata.ts (lib) — browser I/O for the Video Metadata tool.
 *
 * INSTANT TIER ONLY. Reads an MP4/MOV box tree by SLICING the file: first a few
 * 16-byte reads to map the top-level boxes, then the `moov` box itself. A 2 GB
 * file therefore costs kilobytes of reading, and nothing at all over the wire —
 * no ffmpeg core, no upload, no decode. The deep tier (ffmpeg `-i`) lives in
 * video-media.ts, where the rest of the wasm plumbing is.
 *
 * Parsing itself is pure and lives in engine/video-metadata.ts.
 */

import {
  MAX_MOOV_BYTES,
  parseFtyp,
  parseMoov,
  type Mp4Metadata,
} from '../engine/video-metadata'

export interface BoxReadResult {
  meta: Mp4Metadata | null
  /** Why the instant read failed, phrased for the user. */
  reason?: string
  /** True when the file looks like MP4/MOV at all (extension or ftyp). */
  isMp4: boolean
  /** Bytes actually read from disk (to prove the instant claim in the UI). */
  bytesRead: number
}

const MP4_EXT = /\.(mp4|m4v|mov|m4a|3gp|3g2)$/i

interface BoxRef {
  start: number
  size: number
  headerLen: number
}

/**
 * Map the top-level boxes. Each step reads only a 16-byte header and then jumps
 * by the declared size — the box bodies are never touched, so mdat (usually
 * almost the whole file) is skipped for free.
 */
async function scanTopLevel(file: File, wanted: Set<string>): Promise<{ found: Map<string, BoxRef>; bytesRead: number }> {
  const found = new Map<string, BoxRef>()
  let bytesRead = 0
  let offset = 0
  // A file has a handful of top-level boxes; a high count means a malformed
  // chain, so stop rather than spin.
  for (let guard = 0; guard < 64 && offset + 8 <= file.size; guard++) {
    const head = new DataView(await file.slice(offset, Math.min(offset + 16, file.size)).arrayBuffer())
    bytesRead += head.byteLength
    if (head.byteLength < 8) break

    let size = head.getUint32(0)
    const type = String.fromCharCode(
      head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7),
    )
    let headerLen = 8
    if (size === 1) {
      if (head.byteLength < 16) break
      size = Number(head.getBigUint64(8))
      headerLen = 16
    } else if (size === 0) {
      size = file.size - offset
    }
    if (size < headerLen || offset + size > file.size) break

    if (wanted.has(type)) found.set(type, { start: offset, size, headerLen })
    // `moov` is the goal; `mdat` can be huge and is jumped over either way.
    offset += size
  }
  return { found, bytesRead }
}

/**
 * Read an MP4/MOV file's own metadata table. Never loads the whole file and
 * never loads wasm — resolve `meta: null` with a `reason` to fall back.
 */
export async function readBoxMetadata(file: File): Promise<BoxReadResult> {
  const isMp4 = MP4_EXT.test(file.name)
  if (file.size < 16) {
    return { meta: null, reason: 'The file is too small to be a video.', isMp4, bytesRead: 0 }
  }

  const { found, bytesRead } = await scanTopLevel(file, new Set(['ftyp', 'moov']))
  let read = bytesRead

  const ftypRef = found.get('ftyp')
  const moovRef = found.get('moov')

  if (!moovRef) {
    return {
      meta: null,
      reason: 'No MP4/MOV index box (moov) found in this file.',
      isMp4: isMp4 || !!ftypRef,
      bytesRead: read,
    }
  }

  if (moovRef.size > MAX_MOOV_BYTES) {
    return {
      meta: null,
      reason: 'This file’s index box is unusually large — use the full read.',
      isMp4: !!ftypRef,
      bytesRead: read,
    }
  }

  const moovBuf = await file.slice(moovRef.start, moovRef.start + moovRef.size).arrayBuffer()
  read += moovBuf.byteLength
  const meta = parseMoov(moovBuf)
  if (!meta) {
    return {
      meta: null,
      reason: 'The index box could not be read — the file may be damaged.',
      isMp4: !!ftypRef,
      bytesRead: read,
    }
  }

  // The brand list sits in `ftyp`, a handful of bytes near the front.
  if (ftypRef) {
    const ftypBuf = await file.slice(ftypRef.start, ftypRef.start + ftypRef.size).arrayBuffer()
    read += ftypBuf.byteLength
    meta.container = parseFtyp(ftypBuf)
  }

  meta.fileSize = file.size
  return { meta, isMp4: true, bytesRead: read }
}

/** True when a browser can play the file well enough to preview it. */
export function isProbablyPlayable(name: string): boolean {
  return /\.(mp4|m4v|mov|webm|mkv|ogv)$/i.test(name)
}