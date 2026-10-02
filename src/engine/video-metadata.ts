/**
 * video-metadata.ts — pure logic for the Video Metadata tool.
 *
 * Two tiers, no React, no DOM (layer rule: engine/ stays pure):
 *
 *   1. INSTANT tier — reads the MP4/MOV box tree (`moov`, `tkhd`, `stsd`,
 *      `stsz`, `esds`, `ilst`) from bytes the caller already sliced. Costs zero
 *      network: the facts are stored in the file itself. Verified field-for-field
 *      against `ffmpeg -i` (see references/mp4-box-parse.md in the skill).
 *   2. DEEP tier — parses the `ffmpeg -i` stderr log, which knows things the box
 *      table simply does not carry (pixel format, SAR/DAR, colour info, every
 *      stream type, chapters, attachments).
 *
 * Everything here is a pure function over bytes or strings.
 */

import { formatBytes } from './video-slice'

// ── Types ─────────────────────────────────────────────

export interface Mp4Track {
  kind: 'video' | 'audio' | 'other'
  /** Sample-entry fourcc, lowercased: `avc1`, `hvc1`, `av01`, `mp4a`, … */
  codec: string
  handler: string
  width?: number
  height?: number
  /** Degrees clockwise, decoded from the tkhd display matrix. */
  rotation?: number
  mediaTimescale?: number
  mediaDurationSec?: number
  /** Sample table entry count — the exact frame count for a video track. */
  sampleCount?: number
  /** Sum of every sample's bytes — the real payload, not a header claim. */
  payloadBytes?: number
  streamKbps?: number
  /** avcC profile_idc / level_idc / profile_compatibility (H.264). */
  avcProfile?: number
  avcCompat?: number
  avcLevel?: number
  /** DecoderConfigDescriptor objectTypeIndication + the declared bitrates. */
  objectTypeIndication?: number
  maxBitrate?: number
  avgBitrate?: number
  /** AudioSpecificConfig — authoritative for AAC, unlike the sample entry. */
  aacObjectType?: number
  ascSampleRate?: number
  ascChannels?: number
}

export interface Mp4Container {
  majorBrand: string
  minorVersion: number
  compatibleBrands: string[]
}

export interface Mp4Metadata {
  container: Mp4Container | null
  movieTimescale: number
  durationSec: number
  /** ISO string, or null when the file carries no creation time. */
  createdUtc: string | null
  tracks: Mp4Track[]
  tags: Record<string, string>
  /** Total bytes of the file, filled in by the caller. */
  fileSize: number
}

export interface FfmpegStream {
  index: string
  kind: 'video' | 'audio' | 'subtitle' | 'data' | 'attachment' | 'other'
  codec: string
  profile?: string
  fourcc?: string
  pixFmt?: string
  width?: number
  height?: number
  sar?: string
  dar?: string
  fps?: string
  tbr?: string
  tbn?: string
  bitrateKbps?: number
  sampleRate?: number
  channels?: string
  sampleFmt?: string
  language?: string
  isDefault: boolean
  /** The original log line, kept so nothing is silently dropped. */
  raw: string
}

export interface FfmpegChapter {
  title?: string
  start: string
  end: string
}

export interface FfmpegInfo {
  container: string
  containerLong?: string
  duration?: string
  start?: string
  bitrateKbps?: number
  tags: Record<string, string>
  streams: FfmpegStream[]
  chapters: FfmpegChapter[]
}

/** One rendered line in the readout. */
export interface MetaRow {
  label: string
  value: string
  /** Render in a monospace font (numbers, codecs, ids). */
  mono?: boolean
  /** Small muted caveat after the value. */
  note?: string
}

/** A titled card of rows. */
export interface MetaGroup {
  title: string
  rows: MetaRow[]
}

// ── Box walking ───────────────────────────────────────

const CONTAINER_BOXES = new Set([
  'moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'udta', 'meta', 'ilst', 'wave', 'dinf', 'stsd',
])

interface Box {
  type: string
  body: number
  end: number
}

/**
 * Walk the sibling boxes in [start, end). Children of known container boxes are
 * collected too, so callers can `find` any nested box by type.
 *
 * `meta` and `stsd` are containers whose children start after a fixed header
 * (version/flags, and version/flags + entry_count) rather than right after the
 * 8-byte box header.
 */
function walk(view: DataView, start: number, end: number, out: Box[] = []): Box[] {
  let off = start
  while (off + 8 <= end) {
    let size = view.getUint32(off)
    const type = readFourcc(view, off + 4)
    let body = off + 8
    if (size === 1) {
      if (off + 16 > end) break
      size = Number(view.getBigUint64(off + 8))
      body = off + 16
    } else if (size === 0) {
      size = end - off
    }
    // A size below the header means a corrupt or non-box file: stop rather than
    // loop forever.
    if (size < 8 || off + size > end) break

    out.push({ type, body, end: off + size })

    if (CONTAINER_BOXES.has(type)) {
      const childStart = type === 'meta' ? body + 4 : type === 'stsd' ? body + 8 : body
      walk(view, childStart, off + size, out)
    }
    off += size
  }
  return out
}

function readFourcc(view: DataView, off: number): string {
  return String.fromCharCode(
    view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3),
  )
}

/** iTunes atoms are fourccs starting with the © byte (0xA9). */
function isIlstAtom(type: string): boolean {
  return type.charCodeAt(0) === 0xa9
}

const MAC_EPOCH_OFFSET = 2082844800 // seconds from 1904-01-01 to 1970-01-01

export const MAX_MOOV_BYTES = 16 * 1024 * 1024

/**
 * Parse a `moov` box. `buf` must start AT the moov box header, so all internal
 * offsets stay relative — that is what lets the caller slice just this box out
 * of a multi-GB file and never load the rest.
 *
 * Returns null when the bytes are not a moov box (or carry no tracks).
 */
export function parseMoov(buf: ArrayBuffer): Mp4Metadata | null {
  if (buf.byteLength < 16) return null
  const view = new DataView(buf)
  if (readFourcc(view, 4) !== 'moov') return null

  const boxes = walk(view, 0, buf.byteLength)
  const mvhd = boxes.find((b) => b.type === 'mvhd')
  if (!mvhd) return null

  const meta: Mp4Metadata = {
    container: null,
    movieTimescale: 0,
    durationSec: 0,
    createdUtc: null,
    tracks: [],
    tags: {},
    fileSize: 0,
  }

  // mvhd carries the movie-level duration and (maybe) a creation time.
  const v = view.getUint8(mvhd.body)
  const clock = v === 1 ? mvhd.body + 4 + 16 : mvhd.body + 4 + 8
  const duration = v === 1 ? Number(view.getBigUint64(mvhd.body + 4 + 20)) : view.getUint32(mvhd.body + 4 + 12)
  const created = v === 1 ? Number(view.getBigUint64(mvhd.body + 4)) : view.getUint32(mvhd.body + 4)
  meta.movieTimescale = view.getUint32(clock)
  if (meta.movieTimescale > 0) {
    meta.durationSec = round3(duration / meta.movieTimescale)
  }
  // 0 means "not set" — ffmpeg omits it too, so never render 1904.
  if (created > 0) {
    meta.createdUtc = new Date((created - MAC_EPOCH_OFFSET) * 1000).toISOString()
  }

  for (const trak of boxes.filter((b) => b.type === 'trak')) {
    const kids = walk(view, trak.body, trak.end)
    const hdlr = kids.find((b) => b.type === 'hdlr')
    const mdhd = kids.find((b) => b.type === 'mdhd')
    const tkhd = kids.find((b) => b.type === 'tkhd')
    const stsd = kids.find((b) => b.type === 'stsd')

    const handler = hdlr ? readFourcc(view, hdlr.body + 8) : ''
    const track: Mp4Track = {
      kind: handler === 'vide' ? 'video' : handler === 'soun' ? 'audio' : 'other',
      codec: '',
      handler,
    }

    // tkhd: width/height are 16.16 fixed and sit 4 bytes further along in v1
    // files. Getting this wrong yields a plausible 16384 instead of an error.
    if (tkhd) {
      const tv = view.getUint8(tkhd.body)
      const dimOff = tv === 1 ? tkhd.body + 88 : tkhd.body + 76
      const matrixOff = tv === 1 ? tkhd.body + 48 : tkhd.body + 40
      track.width = view.getUint32(dimOff) / 65536
      track.height = view.getUint32(dimOff + 4) / 65536
      const a = view.getInt32(matrixOff) / 65536
      const b = view.getInt32(matrixOff + 4) / 65536
      track.rotation = (Math.round((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360
    }

    if (mdhd) {
      const mv = view.getUint8(mdhd.body)
      track.mediaTimescale = mv === 1 ? view.getUint32(mdhd.body + 4 + 16) : view.getUint32(mdhd.body + 4 + 8)
      const d = mv === 1 ? Number(view.getBigUint64(mdhd.body + 4 + 20)) : view.getUint32(mdhd.body + 4 + 12)
      if (track.mediaTimescale > 0) track.mediaDurationSec = round3(d / track.mediaTimescale)
    }

    // The stsd sample entry is itself a box, so its fourcc is a child header —
    // never raw bytes at a guessed offset.
    if (stsd) {
      const entry = walk(view, stsd.body + 8, stsd.end)[0]
      if (entry) {
        track.codec = entry.type
        readSampleEntry(view, entry, track)
      }
    }

    // stsz: how many samples, and how many bytes they add up to. This is the
    // exact payload, so the bitrate it yields is exact — ffmpeg -i doesn't even
    // print the frame count.
    const stsz = kids.find((b) => b.type === 'stsz')
    if (stsz) {
      const uniform = view.getUint32(stsz.body + 4)
      const count = view.getUint32(stsz.body + 8)
      track.sampleCount = count
      if (uniform > 0) {
        track.payloadBytes = uniform * count
      } else {
        // Guard against a truncated table: only sum what is actually present.
        const available = Math.floor((stsz.end - (stsz.body + 12)) / 4)
        const n = Math.min(count, available)
        let total = 0
        for (let i = 0; i < n; i++) total += view.getUint32(stsz.body + 12 + i * 4)
        track.payloadBytes = total
      }
      if (track.mediaDurationSec && track.payloadBytes) {
        track.streamKbps = Math.round((track.payloadBytes * 8) / track.mediaDurationSec / 1000)
      }
    }

    meta.tracks.push(track)
  }

  // udta/meta/ilst — the user-facing tags (title, comment, encoder).
  const ilst = boxes.find((b) => b.type === 'ilst')
  if (ilst) {
    for (const item of walk(view, ilst.body, ilst.end)) {
      if (!isIlstAtom(item.type)) continue
      const data = walk(view, item.body, item.end).find((b) => b.type === 'data')
      if (!data) continue
      // A `data` box declares its text type in ONE of two places, and writers
      // disagree: ffmpeg puts it in the flags byte (0x000001), iTunes in the
      // well-known-type field. Type 1 is UTF-8, 2 is UTF-16; anything else is
      // binary — track numbers and cover art live there, and decoding those as
      // text yields garbage. When neither field claims a type, fall back to
      // accepting the bytes only if they actually look like text.
      const flagsType = view.getUint8(data.body + 3)
      const wellKnownType = view.getUint32(data.body + 4)
      const declared = flagsType === 1 || wellKnownType === 1
        ? 'utf-8'
        : flagsType === 2 || wellKnownType === 2
          ? 'utf-16be'
          : null
      const start = data.body + 8
      const bytes = new Uint8Array(buf, start, Math.max(0, data.end - start))
      const text = new TextDecoder(declared ?? 'utf-8').decode(bytes).trim()
      if (!text) continue
      if (!declared && !looksLikeText(text)) continue
      meta.tags[item.type.slice(1)] = text
    }
  }

  return meta
}

/**
 * Pull codec parameters out of a sample entry. `avcC` / `esds` sit AFTER the
 * entry's fixed field block — 78 bytes for VisualSampleEntry, 28 for
 * AudioSampleEntry. Walking from the entry body without that prefix reads
 * garbage as a box and silently reports nothing.
 */
function readSampleEntry(view: DataView, entry: Box, track: Mp4Track): void {
  const visual = entry.type === 'avc1' || entry.type === 'hvc1' || entry.type === 'av01'
  const audio = entry.type === 'mp4a'
  if (!visual && !audio) return

  const subs = walk(view, entry.body + (visual ? 78 : 28), entry.end)

  const avcC = subs.find((b) => b.type === 'avcC')
  if (avcC) {
    track.avcProfile = view.getUint8(avcC.body + 1)
    // profile_compatibility carries the constraint flags, which is where
    // "Constrained Baseline" comes from — ffmpeg prints that, so we should too.
    track.avcCompat = view.getUint8(avcC.body + 2)
    track.avcLevel = view.getUint8(avcC.body + 3)
  }

  const esds = subs.find((b) => b.type === 'esds')
  if (!esds) return

  // Tag/length/value descriptors, each with fixed fields BEFORE the next tag.
  // Chaining readTag() blindly returns nothing at all — silently.
  let off = esds.body + 4 // version/flags
  const readTag = (): { tag: number; len: number; at: number } => {
    const tag = view.getUint8(off)
    off += 1
    let len = 0
    let b = 0
    do {
      b = view.getUint8(off)
      off += 1
      len = (len << 7) | (b & 0x7f)
    } while (b & 0x80)
    return { tag, len, at: off }
  }

  const es = readTag() // 0x03 ES_Descriptor
  if (es.tag !== 0x03) return
  off = es.at + 3 // ES_ID(2) + flags(1)

  const dc = readTag() // 0x04 DecoderConfigDescriptor
  if (dc.tag !== 0x04) return
  track.objectTypeIndication = view.getUint8(dc.at)
  track.maxBitrate = view.getUint32(dc.at + 5)
  track.avgBitrate = view.getUint32(dc.at + 9)

  off = dc.at + 13
  const dsi = readTag() // 0x05 DecoderSpecificInfo (AudioSpecificConfig)
  if (dsi.tag !== 0x05 || dsi.len < 2 || dsi.at + 2 > esds.end) return
  const b0 = view.getUint8(dsi.at)
  const b1 = view.getUint8(dsi.at + 1)
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]
  track.aacObjectType = b0 >> 3
  track.ascSampleRate = rates[((b0 & 0x07) << 1) | (b1 >> 7)]
  track.ascChannels = (b1 >> 3) & 0x0f
}

/** Parse an `ftyp` box (buffer starts at its header). */
export function parseFtyp(buf: ArrayBuffer): Mp4Container | null {
  if (buf.byteLength < 16) return null
  const view = new DataView(buf)
  if (readFourcc(view, 4) !== 'ftyp') return null
  const brands: string[] = []
  for (let off = 16; off + 4 <= buf.byteLength; off += 4) {
    brands.push(readFourcc(view, off).trim())
  }
  return {
    majorBrand: readFourcc(view, 8).trim(),
    minorVersion: view.getUint32(12),
    compatibleBrands: brands.filter(Boolean),
  }
}

// ── The ffmpeg -i log (deep tier) ─────────────────────

/**
 * Parse the stderr log of `ffmpeg -i <file>`. Deliberately pulls out only what
 * is safe to regex for; the raw lines are kept on every stream so nothing is
 * lost, and the UI can always show the untouched log.
 */
export function parseFfmpegLog(text: string): FfmpegInfo {
  const lines = text.split('\n')
  const info: FfmpegInfo = { container: '', tags: {}, streams: [], chapters: [] }

  // The demuxer list is comma-joined ("mov,mp4,m4a,3gp,3g2,mj2"), so a
  // comma-free capture group fails outright.
  const input = text.match(/Input #0,\s*([A-Za-z0-9,]+?),?\s*from/)
  if (input) info.container = input[1].trim().replace(/,+$/, '')
  const longName = text.match(/Input #0,[^\n]*\n\s*Metadata:[\s\S]*?/)?.[0]
  if (longName && /:/.test(longName)) {
    // (kept simple: the demuxer's own long name lives on the "Input #0" line in
    // newer builds; older ones print a second indented line)
    const m = longName.match(/\n\s*([A-Z][^\n]*),\s*from/)
    if (m) info.containerLong = m[1].trim()
  }

  const dur = text.match(/Duration:\s*([\d:.]+),\s*start:\s*([\d.-]+),\s*bitrate:\s*(\d+)\s*kb\/s/)
  if (dur) {
    info.duration = dur[1]
    info.start = dur[2]
    info.bitrateKbps = Number(dur[3])
  } else {
    const durNoRate = text.match(/Duration:\s*([\d:.]+)/)
    if (durNoRate) info.duration = durNoRate[1]
  }

  // Container-level tags: the lines nested UNDER the input's `Metadata:` block.
  // Indentation is the reliable separator — tag lines sit deeper than
  // "Metadata:", while `Duration:` and `Stream #…` return to its level. (Do not
  // key off spaces before the colon: the longest tag name gets none.)
  const head = text.split(/\n\s*Stream #0:/)[0]
  const lines0 = head.split(/\n/)
  const metaAt = lines0.findIndex((l) => /^\s*Metadata:/.test(l))
  if (metaAt >= 0) {
    const baseIndent = lines0[metaAt].match(/^\s*/)?.[0].length ?? 0
    for (const line of lines0.slice(metaAt + 1)) {
      if (line.trim() === '') continue
      const indent = line.match(/^\s*/)?.[0].length ?? 0
      if (indent <= baseIndent) break // block ended
      const m = line.match(/^\s+([A-Za-z0-9_.-]+)\s*:\s*(.+?)\s*$/)
      if (m) info.tags[m[1]] = m[2]
    }
  }

  for (const line of lines) {
    const m = line.match(/Stream #(\d+:\d+)(?:\[[^\]]*\])?(?:\((\w{2,3})\))?:\s*(\w+):\s*(.*)$/)
    if (!m) continue
    const [, index, lang, kindWord, rest] = m
    const kind = kindWord.toLowerCase()

    const stream: FfmpegStream = {
      index,
      kind: kind === 'video' || kind === 'audio' || kind === 'subtitle' || kind === 'data' || kind === 'attachment'
        ? kind
        : 'other',
      codec: (rest.match(/^([\w-]+)/)?.[1] ?? '').toLowerCase(),
      isDefault: /\(default\)/.test(rest),
      raw: line.trim(),
    }
    if (lang) stream.language = lang

    const profile = rest.match(/^\w+\s*\(([^)]+)\)/)
    if (profile) stream.profile = profile[1]

    const fourcc = rest.match(/\((\w{4})\s*\/\s*0x[0-9a-fA-F]+\)/)
    if (fourcc) stream.fourcc = fourcc[1]

    const dims = rest.match(/(\d{2,5})x(\d{2,5})/)
    if (dims) {
      stream.width = Number(dims[1])
      stream.height = Number(dims[2])
    }
    const sar = rest.match(/\[SAR\s+([\d:]+)\s+DAR\s+([\d:]+)\]/)
    if (sar) {
      stream.sar = sar[1]
      stream.dar = sar[2]
    }

    if (kind === 'video') {
      // "yuv420p(progressive)" sits right before the resolution.
      const pix = rest.match(/,\s*([a-z][a-z0-9_]+)(?:\([^)]*\))?,\s*\d{2,5}x\d{2,5}/)
      if (pix) stream.pixFmt = pix[1]
      stream.fps = rest.match(/,\s*(\d+(?:\.\d+)?(?:\/\d+)?)\s*fps/)?.[1]
      stream.tbr = rest.match(/(\d+(?:\.\d+)?(?:\/\d+)?)\s*tbr/)?.[1]
      stream.tbn = rest.match(/(\d+)\s*tbn/)?.[1]
    }

    if (kind === 'audio') {
      stream.sampleRate = Number(rest.match(/(\d+)\s*Hz/)?.[1]) || undefined
      // "44100 Hz, mono, fltp, 124 kb/s" — the layout word, then the sample fmt.
      const after = rest.split(/\d+\s*Hz,\s*/)[1]
      if (after) {
        const parts = after.split(',').map((s) => s.trim())
        stream.channels = parts[0]?.replace(/\s*\(default\)/, '').trim() || undefined
        stream.sampleFmt = parts[1]?.replace(/\s*\(default\)/, '').trim() || undefined
      }
    }

    const kbps = rest.match(/(\d+)\s*kb\/s/)
    if (kbps) stream.bitrateKbps = Number(kbps[1])

    info.streams.push(stream)
  }

  // Chapters: `Chapter #0:0: start 0.000000, end 10.000000` + an optional title.
  const chapterBlocks = text.split(/\n(?=\s*Chapter #)/).slice(1)
  for (const block of chapterBlocks) {
    const m = block.match(/Chapter #[\d:]+:\s*start\s*([\d.]+),\s*end\s*([\d.]+)/)
    if (!m) continue
    const title = block.match(/title\s*:\s*(.+)/)?.[1]?.trim()
    info.chapters.push({ title, start: m[1], end: m[2] })
  }

  return info
}

// ── Labels ────────────────────────────────────────────

/**
 * Cheap guard for undeclared tag payloads: rejects control bytes and the
 * replacement characters a failed UTF-8 decode leaves behind, so binary atoms
 * are skipped rather than shown as mojibake.
 */
function looksLikeText(s: string): boolean {
  if (s.includes('\uFFFD')) return false
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s)
}

/** Human names for the iTunes-style tag atoms the file carries. */
const TAG_LABELS: Record<string, string> = {
  nam: 'Title',
  too: 'Encoder',
  cmt: 'Comment',
  day: 'Date',
  ART: 'Artist',
  aART: 'Album artist',
  alb: 'Album',
  gen: 'Genre',
  cpy: 'Copyright',
  des: 'Description',
  mak: 'Camera make',
  mod: 'Camera model',
  swr: 'Software',
  enc: 'Encoded by',
  grp: 'Grouping',
  lyr: 'Lyrics',
}

/** `nam` → `Title`; unknown atoms keep their code so nothing is hidden. */
export function tagLabel(code: string): string {
  return TAG_LABELS[code] ?? code
}

const AVC_PROFILES: Record<number, string> = {
  66: 'Baseline', 77: 'Main', 88: 'Extended', 100: 'High', 110: 'High 10',
  122: 'High 4:2:2', 244: 'High 4:4:4',
}

const AAC_OBJECT_TYPES: Record<number, string> = {
  1: 'Main', 2: 'LC', 3: 'SSR', 4: 'LTP', 5: 'HE (SBR)', 29: 'HE v2 (PS)',
}

/** Human codec name for a sample-entry fourcc. */
export function videoCodecName(fourcc: string): string {
  const f = fourcc.toLowerCase()
  if (f === 'avc1' || f === 'avc3') return 'H.264 / AVC'
  if (f === 'hvc1' || f === 'hev1') return 'H.265 / HEVC'
  if (f === 'av01') return 'AV1'
  if (f === 'vp09') return 'VP9'
  if (f === 'mp4v') return 'MPEG-4 Visual'
  return fourcc.toUpperCase()
}

export function audioCodecName(fourcc: string, objectTypeIndication?: number): string {
  const f = fourcc.toLowerCase()
  if (f === 'mp4a') return objectTypeIndication === 64 ? 'AAC' : `MPEG audio (OTI ${objectTypeIndication ?? '?'})`
  if (f === 'opus') return 'Opus'
  if (f === 'alac') return 'ALAC (lossless)'
  if (f === 'ac-3') return 'AC-3'
  return fourcc.toUpperCase()
}

export function avcProfileLabel(profile?: number, level?: number, compat?: number): string | undefined {
  if (profile == null) return undefined
  let name = AVC_PROFILES[profile] ?? `profile ${profile}`
  // constraint_set1_flag on Baseline is exactly ffmpeg's "Constrained Baseline".
  if (profile === 66 && compat != null && compat & 0x40) name = 'Constrained Baseline'
  if (level == null) return name
  return `${name}, Level ${Math.floor(level / 10)}.${level % 10}`
}

export function aacProfileLabel(objectType?: number): string | undefined {
  if (objectType == null) return undefined
  return AAC_OBJECT_TYPES[objectType] ?? `object type ${objectType}`
}

/** `1280x720` → `720p`. Vertical video keeps its orientation. */
export function resolutionLabel(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined
  const landscape = width >= height
  const shortSide = landscape ? height : width
  const known: Record<number, string> = {
    2160: '2160p (4K)', 1440: '1440p (2K)', 1080: '1080p (Full HD)', 720: '720p (HD)',
    576: '576p', 480: '480p', 360: '360p', 240: '240p',
  }
  const tier = known[shortSide] ?? `${shortSide}p`
  return landscape ? tier : `${tier} vertical`
}

/** Aspect ratio in lowest terms, e.g. `16:9`. */
export function aspectLabel(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const w = Math.round(width)
  const h = Math.round(height)
  const g = gcd(w, h)
  if (!g) return undefined
  return `${w / g}:${h / g}`
}

export function channelLabel(count?: number): string | undefined {
  if (count == null) return undefined
  const named: Record<number, string> = { 1: 'mono', 2: 'stereo', 6: '5.1', 8: '7.1' }
  return named[count] ?? `${count} channels`
}

export function bitrateLabel(kbps?: number): string | undefined {
  if (!kbps) return undefined
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(2)} Mbps` : `${kbps} kbps`
}

/** Seconds → `1:23.456` / `0:03.000`, matching how editors show time. */
export function formatTimecode(seconds?: number): string | undefined {
  if (seconds == null || !Number.isFinite(seconds)) return undefined
  const total = Math.max(0, seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const secs = s.toFixed(3).padStart(6, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${secs}` : `${m}:${secs}`
}

export function frameRateLabel(timescale?: number, sampleCount?: number, seconds?: number): string | undefined {
  if (!timescale || !sampleCount || !seconds) return undefined
  return `${(sampleCount / seconds).toFixed(3).replace(/\.?0+$/, '')} fps`
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

// ── Readout builders ──────────────────────────────────

export interface InstantMetaInput {
  name: string
  size: number
  meta: Mp4Metadata
}

/** Fields the box table cannot carry — said out loud instead of guessed. */
export const BOX_TIER_LIMITS = [
  'pixel format (yuv420p / yuv422p …)',
  'pixel aspect ratio (SAR / DAR)',
  'colour range and primaries',
  'subtitle and attachment streams',
  'chapters',
  'every container tag',
]

/** Build the instant-tier readout: groups of label/value rows. */
export function buildInstantGroups({ name, size, meta }: InstantMetaInput): MetaGroup[] {
  const groups: MetaGroup[] = []

  const containerRows: MetaRow[] = [
    { label: 'File name', value: name },
    { label: 'File size', value: `${size.toLocaleString()} bytes · ${formatBytes(size)}` },
    { label: 'Container', value: 'MP4 / MOV (ISO base media)', note: 'read from the box table' },
  ]
  if (meta.container) {
    containerRows.push({ label: 'Major brand', value: meta.container.majorBrand, mono: true })
    containerRows.push({ label: 'Minor version', value: String(meta.container.minorVersion), mono: true })
    if (meta.container.compatibleBrands.length) {
      containerRows.push({
        label: 'Compatible brands',
        value: meta.container.compatibleBrands.join(', '),
        mono: true,
      })
    }
  }
  if (meta.createdUtc) containerRows.push({ label: 'Created', value: meta.createdUtc })
  groups.push({ title: 'Container', rows: containerRows })

  const movieRows: MetaRow[] = [
    { label: 'Duration', value: formatTimecode(meta.durationSec) ?? '—', mono: true },
    { label: 'Duration (seconds)', value: `${meta.durationSec} s`, mono: true },
  ]
  if (meta.movieTimescale) movieRows.push({ label: 'Movie timescale', value: `${meta.movieTimescale} ticks/s`, mono: true })
  const trackCount = meta.tracks.length
  movieRows.push({
    label: 'Tracks',
    value: `${trackCount} (${meta.tracks.map((t) => t.handler || '?').join(', ')})`,
    mono: true,
  })
  if (size > 0 && meta.durationSec > 0) {
    movieRows.push({
      label: 'Overall bitrate',
      value: bitrateLabel(Math.round((size * 8) / meta.durationSec / 1000)) ?? '—',
      mono: true,
      note: 'file size ÷ duration',
    })
  }
  groups.push({ title: 'Movie', rows: movieRows })

  meta.tracks.forEach((track, i) => {
    const rows: MetaRow[] = []
    if (track.kind === 'video') {
      rows.push({ label: 'Codec', value: `${videoCodecName(track.codec)} (${track.codec})` })
      const profile = avcProfileLabel(track.avcProfile, track.avcLevel, track.avcCompat)
      if (profile) rows.push({ label: 'Profile / level', value: profile })
      rows.push({
        label: 'Resolution',
        value: `${Math.round(track.width ?? 0)} × ${Math.round(track.height ?? 0)}${track.width && track.height ? ` pixels` : ''}`,
        mono: true,
      })
      const res = resolutionLabel(track.width, track.height)
      if (res) rows.push({ label: 'Resolution tier', value: res })
      const aspect = aspectLabel(track.width, track.height)
      if (aspect) rows.push({ label: 'Aspect ratio', value: aspect, mono: true, note: 'from the stored dimensions' })
      const fps = frameRateLabel(track.mediaTimescale, track.sampleCount, track.mediaDurationSec)
      if (fps) rows.push({ label: 'Frame rate', value: fps, mono: true })
      if (track.sampleCount != null) {
        rows.push({
          label: 'Frame count',
          value: track.sampleCount.toLocaleString(),
          mono: true,
          note: 'counted from the sample table',
        })
      }
      if (track.streamKbps) {
        rows.push({
          label: 'Video bitrate',
          value: bitrateLabel(track.streamKbps) ?? '—',
          mono: true,
          note: 'exact: sum of every sample',
        })
      }
      if (track.rotation) rows.push({ label: 'Rotation', value: `${track.rotation}°`, mono: true })
    } else if (track.kind === 'audio') {
      rows.push({ label: 'Codec', value: `${audioCodecName(track.codec, track.objectTypeIndication)} (${track.codec})` })
      const aac = aacProfileLabel(track.aacObjectType)
      if (aac) rows.push({ label: 'Profile', value: aac })
      if (track.ascSampleRate) rows.push({ label: 'Sample rate', value: `${track.ascSampleRate.toLocaleString()} Hz`, mono: true })
      const ch = channelLabel(track.ascChannels)
      if (ch) rows.push({ label: 'Channels', value: ch })
      if (track.sampleCount != null) rows.push({ label: 'Audio frames', value: track.sampleCount.toLocaleString(), mono: true })
      if (track.avgBitrate) rows.push({ label: 'Average bitrate', value: bitrateLabel(Math.round(track.avgBitrate / 1000)) ?? '—', mono: true, note: 'declared by the encoder' })
      if (track.maxBitrate) rows.push({ label: 'Maximum bitrate', value: bitrateLabel(Math.round(track.maxBitrate / 1000)) ?? '—', mono: true })
      if (track.streamKbps) rows.push({ label: 'Actual bitrate', value: bitrateLabel(track.streamKbps) ?? '—', mono: true, note: 'sum of every audio frame' })
    } else {
      rows.push({ label: 'Handler', value: track.handler || 'unknown', mono: true })
      if (track.codec) rows.push({ label: 'Codec', value: track.codec, mono: true })
    }
    if (track.mediaDurationSec != null) {
      rows.push({ label: 'Track duration', value: `${track.mediaDurationSec} s`, mono: true })
    }
    const label = track.kind === 'video' ? 'Video track' : track.kind === 'audio' ? 'Audio track' : `Track ${i}`
    groups.push({ title: label, rows })
  })

  const tagEntries = Object.entries(meta.tags)
  if (tagEntries.length) {
    groups.push({
      title: 'Tags',
      rows: tagEntries.map(([k, v]) => ({ label: tagLabel(k), value: v, note: k })),
    })
  }

  return groups
}

/** Build the deep-tier readout from a parsed `ffmpeg -i` log. */
export function buildDeepGroups(info: FfmpegInfo, size: number): MetaGroup[] {
  const groups: MetaGroup[] = []

  const containerRows: MetaRow[] = [
    { label: 'Format', value: info.container || 'unknown', mono: true },
  ]
  if (info.containerLong) containerRows.push({ label: 'Format (long name)', value: info.containerLong })
  if (info.duration) containerRows.push({ label: 'Duration', value: info.duration, mono: true })
  if (info.start) containerRows.push({ label: 'Start', value: info.start, mono: true })
  if (info.bitrateKbps) containerRows.push({ label: 'Overall bitrate', value: bitrateLabel(info.bitrateKbps) ?? '—', mono: true })
  containerRows.push({ label: 'File size', value: `${size.toLocaleString()} bytes · ${formatBytes(size)}` })
  groups.push({ title: 'Container', rows: containerRows })

  const tagEntries = Object.entries(info.tags)
  if (tagEntries.length) {
    groups.push({ title: 'Container tags', rows: tagEntries.map(([k, v]) => ({ label: k, value: v })) })
  }

  info.streams.forEach((s, i) => {
    const rows: MetaRow[] = [{ label: 'Codec', value: s.profile ? `${s.codec} (${s.profile})` : s.codec }]
    if (s.fourcc) rows.push({ label: 'Sample entry', value: s.fourcc, mono: true })
    if (s.pixFmt) rows.push({ label: 'Pixel format', value: s.pixFmt, mono: true })
    if (s.width && s.height) {
      rows.push({ label: 'Resolution', value: `${s.width} × ${s.height} pixels`, mono: true })
      const res = resolutionLabel(s.width, s.height)
      if (res) rows.push({ label: 'Resolution tier', value: res })
    }
    if (s.dar) rows.push({ label: 'Aspect ratio', value: `SAR ${s.sar} · DAR ${s.dar}`, mono: true })
    if (s.fps) rows.push({ label: 'Frame rate', value: `${s.fps} fps`, mono: true })
    if (s.tbr) rows.push({ label: 'tbr', value: s.tbr, mono: true })
    if (s.tbn) rows.push({ label: 'tbn', value: s.tbn, mono: true })
    if (s.sampleRate) rows.push({ label: 'Sample rate', value: `${s.sampleRate.toLocaleString()} Hz`, mono: true })
    if (s.channels) rows.push({ label: 'Channels', value: s.channels })
    if (s.sampleFmt) rows.push({ label: 'Sample format', value: s.sampleFmt, mono: true })
    if (s.bitrateKbps) rows.push({ label: 'Stream bitrate', value: bitrateLabel(s.bitrateKbps) ?? '—', mono: true })
    if (s.language) rows.push({ label: 'Language', value: s.language, mono: true })
    rows.push({ label: 'Default stream', value: s.isDefault ? 'yes' : 'no' })
    groups.push({ title: `Stream ${s.index} · ${s.kind}`, rows })
  })

  if (info.chapters.length) {
    groups.push({
      title: `Chapters (${info.chapters.length})`,
      rows: info.chapters.map((c, i) => ({
        label: c.title ? `#${i + 1} ${c.title}` : `#${i + 1}`,
        value: `${c.start} → ${c.end}`,
        mono: true,
      })),
    })
  }

  return groups
}

/** The readout as plain text, for the clipboard. */
export function groupsToText(title: string, groups: MetaGroup[]): string {
  const lines = [title, '='.repeat(title.length)]
  for (const g of groups) {
    lines.push('', `[${g.title}]`)
    for (const r of g.rows) lines.push(`  ${r.label}: ${r.value}`)
  }
  return lines.join('\n')
}

/** Shape the clipboard JSON the same way the UI shows it. */
export function groupsToJson(source: 'box' | 'ffmpeg', groups: MetaGroup[]): string {
  return JSON.stringify({ source, groups }, null, 2)
}
