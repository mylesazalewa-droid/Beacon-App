import { useState, useRef } from 'react'

const BASE_URL = 'http://localhost:7842'

const ORGANIZE_OPTIONS = [
  { value: 'category',      label: 'By Category',         desc: 'Worship/ · Sermon/ · Baptism/ …' },
  { value: 'date',          label: 'By Month',            desc: '2024-11/ · 2024-12/ · 2025-01/ …' },
  { value: 'category_date', label: 'Category + Month',    desc: 'Worship/2024-11/ · Worship/2024-12/ …' },
]

export default function ExportModal({ onClose, selectedClipIds, totalClips }) {
  const [destFolder, setDestFolder] = useState('')
  const [organizeBy, setOrganizeBy] = useState('category')
  const [includeMetadata, setIncludeMetadata] = useState(true)
  const [exportAll, setExportAll] = useState(!selectedClipIds?.size)
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [done, setDone] = useState(null)
  const logRef = useRef(null)

  const handlePickFolder = async () => {
    if (window.beacon?.pickFolder) {
      const path = await window.beacon.pickFolder()
      if (path) setDestFolder(path)
    } else {
      // Dev fallback
      const p = prompt('Enter destination folder path:')
      if (p) setDestFolder(p)
    }
  }

  const handleExport = async () => {
    if (!destFolder) return
    setRunning(true)
    setLogs([])
    setProgress({ current: 0, total: 0 })
    setDone(null)

    const clipIds = (!exportAll && selectedClipIds?.size)
      ? Array.from(selectedClipIds)
      : null

    const body = {
      dest_folder: destFolder,
      organize_by: organizeBy,
      clip_ids: clipIds,
      include_metadata: includeMetadata,
    }

    try {
      const res = await fetch(`${BASE_URL}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const pump = () => reader.read().then(({ done: d, value }) => {
        if (d) return
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'progress') {
                setProgress({ current: data.index, total: data.total })
                setLogs(prev => {
                  const last = prev[prev.length - 1]
                  const entry = { type: 'progress', text: `[${String(data.index).padStart(3,'0')}/${data.total}] ${data.filename} → ${data.stage}` }
                  if (last?.type === 'progress' && last.text.includes(data.filename)) {
                    return [...prev.slice(0, -1), entry]
                  }
                  return [...prev, entry]
                })
                setTimeout(() => logRef.current?.scrollTo({ top: 99999 }), 50)
              } else if (data.type === 'error') {
                setLogs(prev => [...prev, { type: 'error', text: `✗ ${data.filename}: ${data.error}` }])
              } else if (data.type === 'complete') {
                setRunning(false)
                setDone(data)
                return
              }
            } catch (_) {}
          }
        }
        pump()
      })
      pump()
    } catch (e) {
      setRunning(false)
      setLogs(prev => [...prev, { type: 'error', text: `Error: ${e.message}` }])
    }
  }

  const clipCount = exportAll ? totalClips : (selectedClipIds?.size || 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[520px] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-solid)', boxShadow: 'var(--shadow-xl)', maxHeight: '85vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-solid)' }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>Export Library</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Copy footage to an organized folder structure
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-dim)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Destination */}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>
              Destination Folder
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 h-9 rounded-xl text-[12px] truncate"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)', color: destFolder ? 'var(--text-primary)' : 'var(--text-dim)' }}>
                {destFolder || 'No folder selected'}
              </div>
              <button onClick={handlePickFolder}
                className="px-4 h-9 rounded-xl text-[12px] font-semibold flex-shrink-0 transition-colors"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)', color: 'var(--text-primary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface2)'}>
                Browse…
              </button>
            </div>
          </div>

          {/* What to export */}
          {selectedClipIds?.size > 0 && (
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>
                What to Export
              </label>
              <div className="flex gap-2">
                {[
                  { v: false, label: `Selected (${selectedClipIds.size})` },
                  { v: true,  label: `All clips (${totalClips})` },
                ].map(opt => (
                  <button key={String(opt.v)} onClick={() => setExportAll(opt.v)}
                    className="flex-1 h-9 rounded-xl text-[12px] font-semibold transition-all"
                    style={{
                      background: exportAll === opt.v ? 'var(--accent)' : 'var(--surface2)',
                      color: exportAll === opt.v ? '#fff' : 'var(--text-muted)',
                      border: exportAll === opt.v ? '1px solid var(--accent)' : '1px solid var(--border-solid)',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Organize by */}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>
              Folder Structure
            </label>
            <div className="space-y-1.5">
              {ORGANIZE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setOrganizeBy(opt.value)}
                  className="w-full flex items-center gap-3 px-3 h-12 rounded-xl text-left transition-all"
                  style={{
                    background: organizeBy === opt.value ? 'var(--accent-dim)' : 'var(--surface2)',
                    border: organizeBy === opt.value ? '1px solid rgba(75,126,232,0.5)' : '1px solid var(--border-solid)',
                  }}>
                  <div className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                    style={{ borderColor: organizeBy === opt.value ? 'var(--accent)' : 'var(--border-solid)' }}>
                    {organizeBy === opt.value && (
                      <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
                    )}
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</p>
                    <p className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Metadata toggle */}
          <div className="flex items-center justify-between py-2 px-3 rounded-xl"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}>
            <div>
              <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>Include metadata files</p>
              <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Saves a .json sidecar next to each file with description, keywords, transcript</p>
            </div>
            <button onClick={() => setIncludeMetadata(v => !v)}
              className="w-10 h-6 rounded-full transition-all flex-shrink-0 ml-3 flex items-center px-0.5"
              style={{ background: includeMetadata ? 'var(--accent)' : 'var(--surface3)' }}>
              <span className="w-5 h-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: includeMetadata ? 'translateX(16px)' : 'translateX(0)' }} />
            </button>
          </div>

          {/* Progress log */}
          {(running || logs.length > 0) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Progress</label>
                {running && (
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {progress.current}/{progress.total}
                  </span>
                )}
              </div>
              {running && (
                <div className="h-1 rounded-full mb-2 overflow-hidden" style={{ background: 'var(--surface2)' }}>
                  <div className="h-full rounded-full transition-all duration-300" style={{
                    width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%',
                    background: 'var(--accent)',
                  }} />
                </div>
              )}
              <div ref={logRef} className="h-32 overflow-y-auto rounded-xl p-3 font-mono text-[10px] leading-5 space-y-0.5"
                style={{ background: 'var(--bg)', border: '1px solid var(--border-solid)' }}>
                {logs.map((l, i) => (
                  <div key={i} style={{ color: l.type === 'error' ? '#f87171' : 'var(--text-dim)' }}>{l.text}</div>
                ))}
              </div>
            </div>
          )}

          {/* Done state */}
          {done && (
            <div className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <span className="text-xl flex-shrink-0">✅</span>
              <div>
                <p className="text-[13px] font-bold" style={{ color: '#4ade80' }}>Export complete</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {done.copied} file{done.copied !== 1 ? 's' : ''} copied
                  {done.errors > 0 ? ` · ${done.errors} error${done.errors !== 1 ? 's' : ''}` : ''}
                </p>
                <p className="text-[10px] mt-1 font-mono" style={{ color: 'var(--text-dim)' }}>{done.dest}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border-solid)' }}>
          <button onClick={onClose}
            className="flex-1 h-10 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border-solid)' }}>
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button
              onClick={handleExport}
              disabled={!destFolder || running}
              className="flex-[2] h-10 rounded-xl text-[13px] font-bold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)', boxShadow: running ? 'none' : 'var(--shadow-accent)' }}>
              {running ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Exporting {clipCount} clips…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Export {clipCount} clip{clipCount !== 1 ? 's' : ''}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
