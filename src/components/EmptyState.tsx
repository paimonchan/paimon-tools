/**
 * EmptyState — placeholder shown when there's no input yet.
 */
interface EmptyStateProps {
  isFileInput: boolean
}

export default function EmptyState({ isFileInput }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-2 bg-dotgrid px-6 text-center">
      <div className="text-sm text-ink-400">{isFileInput ? 'Drop a file to begin' : 'Paste or type to begin'}</div>
      <div className="text-xs text-ink-600">Output appears here in real time</div>
    </div>
  )
}
