/**
 * ResultPreview — reusable "check before you download" block for video/audio tools.
 *
 * Renders a native <video> or <audio> player over an object URL of a freshly
 * processed blob, plus the output filename/size and a Download button. Lets the
 * user verify the result before committing to a download (and optionally re-run).
 *
 * The object URL is created once, used by the player + download anchor, and
 * revoked only when the preview is replaced or unmounted.
 */
import { useEffect, useState } from 'react'
import { Download, FileAudio, Loader2 } from 'lucide-react'

import { formatBytes } from '../engine/video-slice'
import { downloadBlob } from '../lib/video-media'

type ResultPreviewKind = 'video' | 'audio' | 'loading'

interface ResultPreviewProps {
  kind: ResultPreviewKind
  blob?: Blob
  /** Output filename shown to the user and used for the download. */
  filename?: string
  /** Short phase label while `kind === 'loading'` (e.g. "Preparing engine…"). */
  phaseLabel?: string
  /** Optional guide text shown under the player ("Saved as-is, no re-encode…"). */
  hint?: string
  /** Called when the user clicks Download. */
  onDownload?: (blob: Blob, filename: string) => void
  /** Called when the user re-runs (fires the same action again). */
  onReRun?: () => void
  /** Rerun button label (e.g. "Slice again"). Omitted if no onReRun. */
  reRunLabel?: string
}

export default function ResultPreview({
  kind,
  blob,
  filename = 'output',
  phaseLabel = 'Working…',
  hint,
  onDownload,
  onReRun,
  reRunLabel = 'Run again',
}: ResultPreviewProps) {
  const [url, setUrl] = useState<string | null>(null)

  // Rebuild the object URL whenever the blob changes; revoke the old one so we
  // don't leak a fresh URL per process run.
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-900/40">
        {kind === 'loading' || kind === 'audio' && !blob ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-honey-400" />
            <span className="text-xs text-ink-400">{phaseLabel}</span>
          </div>
        ) : kind === 'video' && url ? (
          <video
            src={url}
            controls
            playsInline
            className="max-h-[38vh] w-full bg-black object-contain"
            preload="metadata"
          />
        ) : kind === 'audio' && url ? (
          <div className="flex h-20 flex-col items-center justify-center gap-2 px-4">
            <FileAudio className="h-5 w-5 text-honey-400" />
            <audio src={url} controls className="w-full" preload="metadata" />
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-xs text-ink-500">
            Preview unavailable
          </div>
        )}
      </div>

      {(kind === 'video' || kind === 'audio') && blob && filename && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate max-w-full text-xs text-ink-200" title={filename}>
              {filename}
            </div>
            {hint ? <div className="text-[10px] text-ink-500">{hint}</div> : null}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              onClick={() =>
                onDownload ? onDownload(blob, filename) : downloadBlob(blob, filename)
              }
              className="flex items-center gap-1.5 rounded-lg bg-honey-500 px-3 py-1.5 text-xs font-500 text-ink-950 transition-all hover:bg-honey-400 active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              Download · {formatBytes(blob.size)}
            </button>
            {onReRun ? (
              <button
                onClick={onReRun}
                className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition-all hover:border-honey-500/50 hover:text-honey-400"
              >
                {reRunLabel}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
