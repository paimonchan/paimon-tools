/**
 * PreviewPane — iframe that renders HTML/CSS/JS output.
 */

import { useRef, useEffect } from 'react'
import { Eye } from 'lucide-react'

interface PreviewPaneProps {
  html: string
}

export default function PreviewPane({ html }: PreviewPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!iframeRef.current) return
    const iframe = iframeRef.current
    // Write content via srcdoc — sandboxed with no parent access
    iframe.srcdoc = html
  }, [html])

  if (!html) {
    return (
      <div className="flex flex-1 flex-col rounded-lg border border-ink-800 bg-ink-900/50">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Eye className="mx-auto mb-2 h-6 w-6 text-ink-600" />
            <p className="text-xs text-ink-500">Run HTML code to see a live preview</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-ink-800 bg-ink-900/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <Eye className="h-3 w-3 text-ink-500" />
          <span className="text-[11px] text-ink-400">Preview</span>
        </div>
      </div>

      {/* Iframe */}
      <div className="flex-1">
        <iframe
          ref={iframeRef}
          title="Preview"
          sandbox="allow-scripts"
          className="h-full w-full"
          style={{ border: 'none' }}
        />
      </div>
    </div>
  )
}
