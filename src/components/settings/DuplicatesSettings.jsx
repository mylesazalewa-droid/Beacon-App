import { useState, useCallback } from 'react'
import { findDuplicates, bulkDeleteClips, thumbnailUrl } from '../../utils/api'

export default function DuplicatesSettings() {
  const [scanning, setScanning] = useState(false)
  const [groups, setGroups] = useState(null)   // null = not scanned yet
  const [totals, setTotals] = useState(null)
  // For each group index, which clip IDs are selected for deletion
  const [toDelete, setToDelete] = useState({})  // { groupIdx: Set<id> }
  const [deleting, setDeleting] = useState(false)
  const [trashFiles, setTrashFiles] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')

  const scan = useCallback(async () => {
    setScanning(true)
    setGroups(null)
    setToDelete({})
    setDoneMsg('')
    try {
      const data = await findDuplicates()
      setGroups(data.exact_groups || [])
      setTotals({ groups: data.total_groups, dupes: data.total_duplicates })
      // Auto-select all but the first clip in each group for deletion
      const autoSel = {}
      ;(data.exact_groups || []).forEach((group, gi) => {
        autoSel[gi] = new Set(group.slice(1).map(c => c.id))
      })
      setToDelete(autoSel)
    } catch (e) {
      console.error(e)
    }
    setScanning(false)
  }, [])

  const toggleClip = (groupIdx, clipId) => {
    setToDelete(prev => {
      const next = { ...prev }
      const set = new Set(next[groupIdx] || [])
      // Must keep at least one clip per group
      const group = groups[groupIdx]
      if (set.has(clipId)) {
        // Only uncheck if at least one OTHER is still checked
        const others = group.filter(c => c.id !== clipId && set.has(c.id))
        if (others.length >= 1) set.delete(clipId)
      } else {
        set.add(clipId)
      }
      next[groupIdx] = set
      return next
    })
  }

  const totalSelected = Object.values(toDelete).reduce((sum, s) => sum + s.size, 0)

  const handleDelete = async () => {
    const ids = Object.values(toDelete).flatMap(s => [...s])
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await bulkDeleteClips(ids, trashFiles)
      setDoneMsg(`Removed ${res.deleted} duplicate${res.deleted !== 1 ? 's' : ''} from Beacon${trashFiles && res.trashed ? ` · ${res.trashed} moved to Trash` : ''}.`)
      // Remove deleted clips from groups
      setGroups(prev => prev
        .map(g => g.filter(c => !ids.includes(c.id)))
        .filter(g => g.length >= 2)
      )
      setToDelete({})
    } catch (e) {
      console.error(e)
    }
    setDeleting(false)
  }

  return (
    <div className="space-y-5">
      {/* Intro card */}
      <div className="rounded-2xl p-4 border border-[var(--border-solid)]" style={{ background: 'var(--surface)' }}>
        <h3 className="text-[12px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-dim)' }}>Find Duplicates</h3>
        <p className="text-[12px] mb-3" style={{ color: 'var(--text-muted)' }}>
          Scans your library for exact duplicate files (same content, different path). By default, the oldest copy is kept and extras are selected for removal.
        </p>
        <button
          onClick={scan}
          disabled={scanning}
          className="w-full h-9 rounded-xl text-[12px] font-semibold transition-all btn-primary disabled:opacity-50"
        >
          {scanning ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
              Scanning library…
            </span>
          ) : groups === null ? '🔍 Scan for Duplicates' : '🔄 Re-scan'}
        </button>
      </div>

      {/* Results summary */}
      {groups !== null && (
        <>
          {groups.length === 0 ? (
            <div className="rounded-2xl p-5 text-center border border-[var(--border-solid)]" style={{ background: 'var(--surface)' }}>
              <div className="text-3xl mb-2">✅</div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>No duplicates found</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-dim)' }}>Your library looks clean.</p>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="rounded-2xl p-3 flex items-center justify-between border border-[var(--border-solid)]"
                style={{ background: 'var(--surface2)' }}>
                <div>
                  <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    {totals.dupes} duplicate{totals.dupes !== 1 ? 's' : ''} found
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                    {totals.groups} group{totals.groups !== 1 ? 's' : ''} · {totalSelected} selected for removal
                  </p>
                </div>
                {doneMsg && (
                  <p className="text-[11px] text-green-500 font-medium">{doneMsg}</p>
                )}
              </div>

              {/* Duplicate groups */}
              <div className="space-y-4">
                {groups.map((group, gi) => (
                  <div key={gi} className="rounded-2xl border border-[var(--border-solid)] overflow-hidden" style={{ background: 'var(--surface)' }}>
                    <div className="px-3 py-2 border-b border-[var(--border-solid)]" style={{ background: 'var(--surface2)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
                        Group {gi + 1} · {group.length} copies
                      </p>
                    </div>
                    <div className="divide-y divide-[var(--border-solid)]">
                      {group.map((clip, ci) => {
                        const selected = toDelete[gi]?.has(clip.id)
                        const isKept = !selected
                        return (
                          <div
                            key={clip.id}
                            onClick={() => toggleClip(gi, clip.id)}
                            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all"
                            style={{ background: selected ? 'rgba(239,68,68,0.06)' : isKept ? 'rgba(34,197,94,0.06)' : 'transparent' }}
                          >
                            {/* Checkbox */}
                            <div className="w-4 h-4 flex-shrink-0 rounded flex items-center justify-center border transition-all"
                              style={{
                                background: selected ? '#ef4444' : 'var(--surface2)',
                                borderColor: selected ? '#ef4444' : 'var(--border-solid)'
                              }}>
                              {selected && (
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              )}
                            </div>

                            {/* Thumbnail */}
                            <div className="w-16 h-9 rounded-md overflow-hidden flex-shrink-0" style={{ background: 'var(--surface2)' }}>
                              {clip.thumbnail_path ? (
                                <img src={thumbnailUrl(clip.id)} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-lg opacity-30">📁</div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                {clip.filename}
                              </p>
                              <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-dim)' }}>
                                {clip.original_path}
                              </p>
                              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
                                {clip.date_ingested ? new Date(clip.date_ingested).toLocaleDateString() : ''} · {clip.media_type?.toUpperCase()}
                              </p>
                            </div>

                            {/* Keep / Remove badge */}
                            <span className="text-[9.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{
                                background: selected ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
                                color: selected ? '#ef4444' : '#22c55e'
                              }}>
                              {selected ? 'Remove' : 'Keep'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Delete actions */}
              <div className="rounded-2xl p-4 border border-[var(--border-solid)] space-y-3" style={{ background: 'var(--surface)' }}>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setTrashFiles(v => !v)}
                    className="relative flex-shrink-0 overflow-hidden rounded-full transition-colors"
                    style={{ width: 36, height: 20, background: trashFiles ? 'var(--accent)' : 'var(--surface3)' }}
                  >
                    <span className="absolute bg-white rounded-full shadow transition-transform"
                      style={{ top: 2, width: 16, height: 16, transform: trashFiles ? 'translateX(18px)' : 'translateX(2px)' }} />
                  </button>
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>Also move original files to Trash</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                      {trashFiles ? 'Files will be moved to your macOS Trash (recoverable).' : 'Only removes clips from Beacon — original files stay on disk.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDelete}
                  disabled={deleting || totalSelected === 0}
                  className="w-full h-9 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-40"
                  style={{
                    background: totalSelected > 0 ? 'rgba(239,68,68,0.15)' : 'var(--surface2)',
                    color: totalSelected > 0 ? '#ef4444' : 'var(--text-dim)',
                    border: `1px solid ${totalSelected > 0 ? 'rgba(239,68,68,0.4)' : 'var(--border-solid)'}`,
                  }}
                >
                  {deleting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                      Removing…
                    </span>
                  ) : totalSelected === 0
                    ? 'No duplicates selected'
                    : `Remove ${totalSelected} duplicate${totalSelected !== 1 ? 's' : ''} from Beacon`
                  }
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
