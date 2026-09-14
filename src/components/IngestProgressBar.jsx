export default function IngestProgressBar({ currentFile, progress, onClick }) {
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
  const filename = currentFile ? currentFile.split('/').pop() : 'Starting…'

  return (
    <div
      onClick={onClick}
      className="fixed bottom-0 left-0 right-0 z-40 cursor-pointer group"
      title="Click to view ingest progress"
    >
      {/* Progress bar fill */}
      <div className="h-0.5 bg-surface2">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Info strip */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface/95 border-t border-border backdrop-blur-sm group-hover:bg-surface transition-colors">
        {/* Pulsing dot */}
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-text-primary truncate">
            Indexing — {filename}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[11px] tabular-nums text-text-muted">
            {progress.current} / {progress.total} files
          </span>
          <span className="text-[11px] font-semibold text-accent tabular-nums w-8 text-right">
            {pct}%
          </span>
          <span className="text-[10px] text-text-dim group-hover:text-text-muted transition-colors">
            Click to view →
          </span>
        </div>
      </div>
    </div>
  )
}
