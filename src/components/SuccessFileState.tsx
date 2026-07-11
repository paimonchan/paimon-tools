/**
 * SuccessFileState — shown when a file-type conversion is ready to download.
 */
import { Download, FileCheck2 } from 'lucide-react'

interface SuccessFileStateProps {
  filename: string
  onDownload: () => void
}

export default function SuccessFileState({ filename, onDownload }: SuccessFileStateProps) {
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
        <FileCheck2 className="h-6 w-6 text-emerald-400" />
      </div>
      <div className="text-sm font-500 text-emerald-300">Workbook ready</div>
      <code className="font-mono text-xs text-emerald-400/80">{filename}</code>
      <button
        onClick={onDownload}
        className="mt-1 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-500 text-emerald-200 transition-colors hover:bg-emerald-500/20"
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </button>
    </div>
  )
}
