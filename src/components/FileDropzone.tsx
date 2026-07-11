import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { FileUp, CheckCircle2 } from 'lucide-react'
import { readFileAsArrayBuffer, readFileAsText } from '../lib/files'
import { useToast } from '../stores/toast-store'

interface FileValue {
  value: string | ArrayBuffer
  name: string
}

interface FileDropzoneProps {
  accept?: string
  readMode?: 'text' | 'arraybuffer'
  onFile?: (file: FileValue) => void
  currentName?: string
}

export default function FileDropzone({ accept, readMode = 'text', onFile, currentName }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const toast = useToast()

  async function handleFile(file: File | null | undefined) {
    if (!file) return
    try {
      const value = readMode === 'arraybuffer'
        ? await readFileAsArrayBuffer(file)
        : await readFileAsText(file)
      onFile?.({ value, name: file.name })
      toast.push(`Loaded ${file.name}`, { variant: 'success' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.push(`Failed to read file: ${msg}`, { variant: 'error' })
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFile(e.dataTransfer.files?.[0])
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      className={[
        'm-3 flex h-[calc(100%-1.5rem)] min-h-[20rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 text-center transition-all',
        dragging
          ? 'border-honey-400 bg-honey-400/5 scale-[1.01]'
          : 'border-ink-700 hover:border-honey-500/50 hover:bg-ink-800/30',
      ].join(' ')}
    >
      {currentName ? (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="text-sm">
            <span className="font-500 text-emerald-300">{currentName}</span>
          </div>
          <div className="text-xs text-ink-500">Click or drop to replace</div>
        </>
      ) : (
        <>
          <div className={[
            'flex h-12 w-12 items-center justify-center rounded-xl border transition-colors',
            dragging ? 'border-honey-400/50 bg-honey-400/10' : 'border-ink-700 bg-ink-800/50',
          ].join(' ')}>
            <FileUp className={['h-6 w-6 transition-colors', dragging ? 'text-honey-300' : 'text-ink-400'].join(' ')} />
          </div>
          <div className="text-sm">
            <span className="text-ink-200">Drop a file</span>
            <span className="text-ink-500"> or </span>
            <span className="text-honey-300 underline-offset-2 hover:underline">browse</span>
          </div>
          {accept && <div className="text-xs text-ink-600">Accepts {accept}</div>}
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  )
}
