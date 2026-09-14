export default function IndexingToast({ filename, progress }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-surface border border-border rounded-xl shadow-2xl p-3 w-[280px] animate-slide-up">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin flex-shrink-0" />
        <span className="text-[11px] font-semibold text-text-primary">Indexing</span>
      </div>
      {filename && (
        <p className="text-[10px] text-text-muted truncate mb-2" title={filename}>
          {filename}
        </p>
      )}
      <div className="h-1 bg-surface2 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  )
}
