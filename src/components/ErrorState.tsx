/**
 * ErrorState — shown when a conversion produces an error result.
 */
import { AlertCircle } from 'lucide-react'

interface ErrorStateProps {
  message: string
}

export default function ErrorState({ message }: ErrorStateProps) {
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
        <AlertCircle className="h-5 w-5 text-red-400" />
      </div>
      <div className="text-sm font-500 text-red-300">Could not convert</div>
      <code className="max-w-md rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 font-mono text-xs text-red-300/90">
        {message}
      </code>
    </div>
  )
}
