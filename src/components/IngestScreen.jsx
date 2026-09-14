import { useState, useRef, useEffect } from 'react'

const MEDIA_EXTS = new Set(['.mp4','.mov','.avi','.mkv','.m4v','.wmv','.flv','.jpg','.jpeg','.png','.heic','.heif','.tiff','.webp'])

export default function IngestScreen({ ingest, onDone, onOpenEventModal }) {
  const [folderPath, setFolderPath] = useState('')
  const [filePaths, setFilePaths] = useState([])   // individual files mode
  const [isDragging, setIsDragging] = useState(false)
  const logEndRef = useRef(null)

  const { start, startFiles, reset, running, logs, progress, summary, currentFile } = ingest
  const isFilesMode = filePaths.length > 0

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  const handleBrowseFolder = async () => {
    const path = await window.beacon?.pickFolder()
    if (path) { setFolderPath(path); setFilePaths([]) }
  }

  const handleBrowseFiles = async () => {
    const paths = await window.beacon?.pickFiles()
    if (paths?.length) { setFilePaths(paths); setFolderPath('') }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const items = Array.from(e.dataTransfer.items || [])
    const files = items.filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean)
    if (!files.length) return

    // Check if any dropped item is a folder (size === 0 and type === '')
    const hasFolders = files.some(f => f.type === '' && f.size === 0)
    if (hasFolders) {
      // Treat first item as folder
      const f = files[0]
      if (f?.path) { setFolderPath(f.path); setFilePaths([]) }
    } else {
      // Individual media files
      const mediaPaths = files
        .map(f => f.path)
        .filter(p => p && MEDIA_EXTS.has('.' + p.split('.').pop().toLowerCase()))
      if (mediaPaths.length > 0) { setFilePaths(mediaPaths); setFolderPath('') }
      else if (files[0]?.path) { setFolderPath(files[0].path); setFilePaths([]) }
    }
  }

  const handleStart = (reingest = false) => {
    if (isFilesMode) { startFiles(filePaths); return }
    if (!folderPath) return
    start(folderPath, reingest)
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  if (summary && !running) {
    return <CompletionScreen summary={summary} total={progress.total} onReset={reset} onDone={onDone} />
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-8 overflow-y-auto bg-bg">
      <div className="w-full max-w-[600px] space-y-5 pt-4">
        {/* Header */}
        <div>
          <h1 className="text-[24px] font-bold text-text-primary tracking-tight">Ingest Media</h1>
          <p className="text-[13px] text-text-muted mt-1">
            Drop a folder <em>or</em> individual files. Beacon classifies, transcribes, and indexes everything.
          </p>
        </div>

        {/* Drop zone */}
        {!running && (
          <>
            <div
              className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-accent bg-accent/5'
                  : 'border-border hover:border-accent/40 hover:bg-surface/50 bg-surface'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={!folderPath && !isFilesMode ? handleBrowseFolder : undefined}
            >
              <div className={`text-4xl mb-3 transition-transform ${isDragging ? 'scale-110' : ''}`}>
                {isDragging ? '📥' : '🎬'}
              </div>
              <p className="text-[15px] font-semibold text-text-primary mb-1">
                {isDragging ? 'Drop here to import' : 'Drop folder or files here'}
              </p>
              <p className="text-[11px] text-text-muted mb-5">
                MP4 · MOV · MKV · AVI · JPG · PNG · HEIC · WEBP
              </p>
              {!folderPath && !isFilesMode && (
                <div className="flex items-center justify-center gap-2.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBrowseFolder() }}
                    className="px-4 h-9 rounded-xl text-[12px] font-semibold bg-surface2 hover:bg-surface3 text-text-primary border border-border transition-colors inline-flex items-center gap-2"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    Browse Folder
                  </button>
                  <span className="text-[11px] text-text-dim">or</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBrowseFiles() }}
                    className="px-4 h-9 rounded-xl text-[12px] font-semibold bg-surface2 hover:bg-surface3 text-text-primary border border-border transition-colors inline-flex items-center gap-2"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    Select Files
                  </button>
                </div>
              )}
            </div>

            {/* Selected: folder */}
            {folderPath && (
              <div className="flex items-center gap-2 bg-surface rounded-xl px-4 py-3 border border-border shadow-sm">
                <span className="text-accent text-lg">📂</span>
                <span className="flex-1 text-[12px] text-text-primary truncate font-mono">{folderPath}</span>
                <button onClick={() => setFolderPath('')} className="text-text-dim hover:text-text-primary p-1 rounded-lg hover:bg-surface2 transition-colors">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            )}

            {/* Selected: individual files */}
            {isFilesMode && (
              <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="text-[11px] font-semibold text-text-primary">{filePaths.length} file{filePaths.length !== 1 ? 's' : ''} selected</span>
                  <button onClick={() => setFilePaths([])} className="text-text-dim hover:text-text-primary transition-colors">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                <div className="max-h-[120px] overflow-y-auto p-2 space-y-0.5">
                  {filePaths.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg">
                      <span className="text-[10px] opacity-50">
                        {['jpg','jpeg','png','heic','heif','tiff','webp'].includes(p.split('.').pop().toLowerCase()) ? '🖼' : '🎬'}
                      </span>
                      <span className="text-[11px] text-text-muted truncate font-mono">{p.split('/').pop()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(folderPath || isFilesMode) && (
              <div className="flex gap-2.5">
                <button
                  onClick={() => isFilesMode ? handleStart() : (onOpenEventModal ? onOpenEventModal(folderPath) : handleStart(false))}
                  className="flex-1 h-11 rounded-xl text-[14px] font-bold bg-accent hover:bg-accent-hover text-white transition-all shadow-lg shadow-accent/25 hover:shadow-accent/40 flex items-center justify-center gap-2"
                >
                  {isFilesMode ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      Import {filePaths.length} File{filePaths.length !== 1 ? 's' : ''}
                    </>
                  ) : onOpenEventModal ? (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      Tag Event & Ingest
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      Ingest New Files
                    </>
                  )}
                </button>
                {!isFilesMode && (
                  <>
                    <button
                      onClick={() => handleStart(false)}
                      className="px-4 h-11 rounded-xl text-[12px] font-semibold bg-surface hover:bg-surface2 text-text-muted border border-border transition-colors"
                      title="Quick ingest without tagging"
                    >
                      Quick Start
                    </button>
                    <button
                      onClick={() => handleStart(true)}
                      className="px-4 h-11 rounded-xl text-[12px] font-semibold bg-surface hover:bg-surface2 text-text-muted border border-border transition-colors"
                      title="Re-classify all files (slower)"
                    >
                      Re-ingest
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { icon: '⚡', label: 'CLIP Fast Classification' },
                { icon: '👤', label: 'Face Recognition' },
                { icon: '🎨', label: 'Color Extraction' },
                { icon: '🎙', label: 'Speech Transcription' },
              ].map((f) => (
                <span key={f.label} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border text-[11px] text-text-muted">
                  <span>{f.icon}</span>
                  <span>{f.label}</span>
                </span>
              ))}
            </div>
          </>
        )}

        {/* Progress */}
        {running && (
          <div className="space-y-4">
            <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent text-sm animate-pulse">▲</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-text-primary">Indexing in progress</p>
                  <p className="text-[11px] text-text-muted">You can navigate away — indexing continues in the background</p>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-text-muted truncate max-w-[380px]">
                    {currentFile?.split('/').pop() || 'Starting…'}
                  </span>
                  <span className="text-[11px] font-bold text-accent tabular-nums ml-4">
                    {progress.current}/{progress.total} · {pct}%
                  </span>
                </div>
                <div className="h-2.5 bg-surface2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, white))',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Live log */}
            <div className="bg-surface rounded-2xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-semibold text-text-dim uppercase tracking-wider">Live Log</span>
              </div>
              <div className="p-3 h-[200px] overflow-y-auto space-y-0.5">
                {logs.map((log, i) => (
                  <div key={i} className={`log-line ${log.type} text-[11px]`}>
                    {log.type === 'classified' ? (
                      <span>
                        {log.text}
                        {log.category && <span className="ml-2 text-accent font-semibold">[{log.category}]</span>}
                      </span>
                    ) : log.text}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CompletionScreen({ summary, total, onReset, onDone }) {
  const entries = Object.entries(summary).sort((a, b) => b[1] - a[1])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-bg">
      <div className="w-full max-w-[440px] space-y-6">
        {/* Hero */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-500/15 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-[22px] font-bold text-text-primary tracking-tight">Ingest Complete</h2>
          <p className="text-[13px] text-text-muted mt-1">{total} files classified and indexed</p>
        </div>

        {/* Summary card */}
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider">By Category</p>
          </div>
          <div className="p-3 space-y-1">
            {entries.map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between px-1 py-1">
                <span className="text-[13px] text-text-primary">{cat}</span>
                <span className="text-[13px] font-bold text-accent tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            onClick={onReset}
            className="flex-1 h-11 rounded-xl text-[13px] font-semibold bg-surface hover:bg-surface2 text-text-muted border border-border transition-colors"
          >
            Ingest More
          </button>
          <button
            onClick={onDone}
            className="flex-1 h-11 rounded-xl text-[13px] font-bold bg-accent hover:bg-accent-hover text-white transition-all shadow-lg shadow-accent/25"
          >
            View Library →
          </button>
        </div>
      </div>
    </div>
  )
}
