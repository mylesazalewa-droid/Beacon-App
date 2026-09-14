import { useState, useEffect, useRef } from 'react'
import { thumbnailUrl, hideClip, getSimilarClips, rotateClip, getProjects, addClipToProject, removeClipFromProject, getTranscriptSegments, getClipScripture, enrichDescriptions, markClipUsed } from '../utils/api'

const BASE_URL = 'http://localhost:7842'

const STATUS_OPTIONS = [
  { value: 'unreviewed', label: 'Unreviewed', color: '#9090A8' },
  { value: 'approved',   label: 'Approved',   color: '#2ECC71' },
  { value: 'in_use',     label: 'In Use',      color: '#6B8FFF' },
  { value: 'archived',   label: 'Archived',    color: '#AAAABC' },
]

const SHOT_TYPES = [
  { value: 'wide',      label: 'Wide' },
  { value: 'close-up',  label: 'Close-Up' },
  { value: 'crowd',     label: 'Crowd' },
  { value: 'speaker',   label: 'Speaker' },
  { value: 'worship',   label: 'Worship' },
  { value: 'baptism',   label: 'Baptism' },
  { value: 'outdoor',   label: 'Outdoor' },
  { value: 'kids',      label: 'Kids' },
  { value: 'prayer',    label: 'Prayer' },
  { value: 'candid',    label: 'Candid' },
]

export default function DetailPanel({ clip, onClose, onSearch, onRefresh, onDownload, onShowSimilar, onColorFilter, onShotTypeFilter }) {
  const [findingSimilar, setFindingSimilar] = useState(false)
  const [copyDone, setCopyDone] = useState(false)
  const [thumbError, setThumbError] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [thumbBust, setThumbBust] = useState(0)
  const [people, setPeople] = useState([])
  const [copiedHex, setCopiedHex] = useState(null)
  const [categories, setCategories] = useState([])
  const [editingCategory, setEditingCategory] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [notes, setNotes] = useState(clip.notes || '')
  const [notesSaving, setNotesSaving] = useState(false)
  const [localStatus, setLocalStatus] = useState(clip.status || 'unreviewed')
  const [savingStatus, setSavingStatus] = useState(false)
  const [projects, setProjects] = useState([])
  const [addingProject, setAddingProject] = useState(false)
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [editingShotType, setEditingShotType] = useState(false)
  const [localShotType, setLocalShotType] = useState(clip.shot_type || null)
  const [customShotInput, setCustomShotInput] = useState('')
  const [editingMeta, setEditingMeta] = useState(false)
  const [localDescription, setLocalDescription] = useState(clip.description || '')
  const [localKeywords, setLocalKeywords] = useState(clip.keywords || [])
  const [newKeyword, setNewKeyword] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)
  const [transcriptSegments, setTranscriptSegments] = useState([])
  const [scriptureRefs, setScriptureRefs] = useState([])
  const [enriching, setEnriching] = useState(false)
  const [enrichDone, setEnrichDone] = useState(false)
  const projectPickerRef = useRef(null)

  // Sync localStatus / shot type whenever a new clip is selected
  useEffect(() => { setLocalStatus(clip.status || 'unreviewed') }, [clip?.id, clip?.status])
  useEffect(() => { setLocalShotType(clip.shot_type || null); setEditingShotType(false); setCustomShotInput('') }, [clip?.id])
  useEffect(() => { setNotes(clip.notes || '') }, [clip?.id])
  useEffect(() => { setLocalDescription(clip.description || ''); setLocalKeywords(clip.keywords || []); setEditingMeta(false) }, [clip?.id])

  useEffect(() => {
    getProjects().then(d => setProjects(d.projects || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!showProjectPicker) return
    const close = (e) => { if (projectPickerRef.current && !projectPickerRef.current.contains(e.target)) setShowProjectPicker(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [showProjectPicker])

  const handleChangeStatus = async (newStatus) => {
    setLocalStatus(newStatus)  // optimistic — updates the UI instantly
    setSavingStatus(true)
    try {
      await fetch(`${BASE_URL}/clips/${clip.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      onRefresh?.()
    } catch (e) {
      setLocalStatus(clip.status || 'unreviewed')  // revert on error
      console.error('Status update failed:', e)
    }
    finally { setSavingStatus(false) }
  }

  const handleChangeShotType = async (newType) => {
    const val = newType === '' ? null : newType
    setLocalShotType(val)
    setEditingShotType(false)
    try {
      await fetch(`${BASE_URL}/clips/${clip.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shot_type: val }),
      })
      onRefresh?.()
    } catch (e) { console.error('Shot type update failed:', e) }
  }

  const handleSaveMeta = async () => {
    setSavingMeta(true)
    try {
      await fetch(`${BASE_URL}/clips/${clip.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: localDescription, keywords: localKeywords }),
      })
      setEditingMeta(false)
      onRefresh?.()
    } catch (e) { console.error('Meta update failed:', e) }
    finally { setSavingMeta(false) }
  }

  const handleAddToProject = async (projectId) => {
    setAddingProject(true)
    setShowProjectPicker(false)
    try {
      await addClipToProject(clip.id, projectId)
      onRefresh?.()
    } catch (e) { console.error('addClipToProject failed:', e) }
    finally { setAddingProject(false) }
  }

  const handleRemoveFromProject = async (projectId) => {
    try {
      await removeClipFromProject(clip.id, projectId)
      onRefresh?.()
    } catch (e) { console.error('removeClipFromProject failed:', e) }
  }

  const handleNotesSave = async () => {
    if (notes === (clip.notes || '')) return
    setNotesSaving(true)
    try {
      await fetch(`${BASE_URL}/clips/${clip.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      onRefresh?.()
    } finally { setNotesSaving(false) }
  }

  useEffect(() => {
    setThumbError(false)
    setThumbBust(0)
    setPeople([])
    setEditingCategory(false)
    setTranscriptSegments([])
    setScriptureRefs([])
    setEnrichDone(false)
    if (!clip?.id) return
    fetch(`${BASE_URL}/clips/${clip.id}/people`)
      .then(r2 => r2.ok ? r2.json() : { people: [] })
      .then(d2 => setPeople(d2.people || []))
      .catch(() => {})
    if (clip.media_type === 'video') {
      getTranscriptSegments(clip.id)
        .then(d => setTranscriptSegments(d.segments || []))
        .catch(() => {})
      getClipScripture(clip.id)
        .then(d => setScriptureRefs(d.scripture_refs || []))
        .catch(() => {})
    }
  }, [clip?.id])

  useEffect(() => {
    fetch(`${BASE_URL}/categories`)
      .then(r => r.ok ? r.json() : { categories: [] })
      .then(data => setCategories(data.categories || []))
      .catch(() => {})
  }, [])

  const handleCopyPath = () => {
    navigator.clipboard.writeText(clip.original_path).then(() => {
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 1500)
    })
  }

  const handleOpenFinder = () => {
    window.beacon?.openInFinder(clip.original_path)
  }

  const handleOpenFile = () => {
    window.beacon?.openFile(clip.original_path)
  }

  const handleCopyHex = (hex) => {
    navigator.clipboard.writeText(hex).then(() => {
      setCopiedHex(hex)
      setTimeout(() => setCopiedHex(null), 1500)
    })
  }

  const handleChangeCategory = async (newCategoryId) => {
    setSavingCategory(true)
    try {
      await fetch(`${BASE_URL}/clips/${clip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: newCategoryId === '' ? null : parseInt(newCategoryId) }),
      })
      onRefresh?.()
    } catch (e) {
      console.error('Category update failed:', e)
    } finally {
      setSavingCategory(false)
      setEditingCategory(false)
    }
  }

  const handleRotate = async (direction) => {
    setRotating(true)
    try {
      await rotateClip(clip.id, direction)
      setThumbBust(b => b + 1)  // force thumbnail reload
      onRefresh?.()
    } catch (e) {
      console.error('Rotate failed:', e)
    } finally {
      setRotating(false)
    }
  }

  const handleHide = async () => {
    await hideClip(clip.id, true)
    onRefresh?.()
    onClose()
  }

  const handleMarkUsed = async () => {
    try { await markClipUsed(clip.id); onRefresh?.() } catch (e) {}
  }

  const handleEnrich = () => {
    setEnriching(true)
    enrichDescriptions(
      () => {},
      () => { setEnriching(false); setEnrichDone(true); onRefresh?.() },
      () => setEnriching(false),
    )
  }

  const handleFindSimilar = async () => {
    setFindingSimilar(true)
    try {
      const data = await getSimilarClips(clip.id, 24)
      if (data.clips?.length) {
        onShowSimilar?.(data.clips)
        onClose()
      }
    } catch (e) {
      console.error('Similar search failed:', e)
    } finally {
      setFindingSimilar(false)
    }
  }

  const confidence = Math.round((clip.confidence || 0) * 100)
  const duration = formatDuration(clip.duration_secs)
  const fileSize = formatSize(clip.file_size_bytes)

  return (
    <div className="w-[288px] flex-shrink-0 flex flex-col overflow-hidden animate-slide-in-right"
      style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border-solid)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-solid)' }}>
        <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Details</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-text-dim hover:text-text-primary transition-colors"
          style={{ background: 'var(--surface2)' }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Thumbnail */}
        <div className="relative aspect-video group/thumb" style={{ background: 'var(--surface2)' }}>
          {!thumbError && clip.thumbnail_path ? (
            <img
              src={`${thumbnailUrl(clip.id)}${thumbBust ? `?v=${thumbBust}` : ''}`}
              alt={clip.filename}
              className="w-full h-full object-cover"
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">📹</div>
          )}
          {clip.media_type === 'video' && (
            <button
              onClick={handleOpenFile}
              className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.45)' }}
            >
              <div className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            </button>
          )}
          {/* Rotate buttons — photos only */}
          {clip.media_type === 'photo' && (
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/thumb:opacity-100 transition-opacity"
              style={{ opacity: rotating ? 1 : undefined }}>
              <button
                onClick={() => handleRotate('ccw')}
                disabled={rotating}
                title="Rotate left"
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-40"
                style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </button>
              <button
                onClick={() => handleRotate('cw')}
                disabled={rotating}
                title="Rotate right"
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-40"
                style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                </svg>
              </button>
            </div>
          )}
          {/* Depth highlight */}
          <div className="absolute inset-x-0 bottom-0 h-12" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.5))' }} />
        </div>

        <div className="p-4 space-y-4">
          {/* Filename */}
          <div>
            <p className="text-[13px] font-semibold text-text-primary break-words leading-snug">{clip.filename}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {duration && <span className="text-[11px] text-text-muted">{duration}</span>}
              {fileSize && <span className="text-[11px] text-text-dim">·</span>}
              {fileSize && <span className="text-[11px] text-text-muted">{fileSize}</span>}
            </div>
          </div>

          {/* Category + confidence */}
          <div>
            <div className="flex items-center justify-between gap-2">
              {!editingCategory ? (
                <span
                  className="category-badge"
                  style={{ color: clip.category_color || '#9090A8' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: clip.category_color || '#9090A8' }} />
                  {clip.category_name || 'Unclassified'}
                </span>
              ) : (
                <select
                  autoFocus
                  defaultValue={clip.category_id || ''}
                  onChange={(e) => handleChangeCategory(e.target.value)}
                  disabled={savingCategory}
                  className="flex-1 text-[11px] bg-surface2 border border-accent/50 rounded px-2 py-0.5 text-text-primary outline-none"
                >
                  <option value="">— Unclassified —</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setEditingCategory(v => !v)}
                className="text-text-dim hover:text-accent transition-colors flex-shrink-0"
                title="Change category"
              >
                {editingCategory
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                }
              </button>
            </div>
            {clip.category_name && !editingCategory && (
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${confidence}%` }}
                  />
                </div>
                <span className="text-[10px] text-text-muted tabular-nums">{confidence}%</span>
              </div>
            )}
          </div>

          {/* ── STATUS card ─────────────────────────────────────── */}
          <div className="rounded-2xl p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}>
            <p className="text-[9.5px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--text-dim)' }}>Status</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STATUS_OPTIONS.map(opt => {
                const isActive = localStatus === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleChangeStatus(opt.value)}
                    disabled={savingStatus}
                    className="h-8 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 w-full"
                    style={{
                      background: isActive ? `${opt.color}22` : 'var(--surface)',
                      color: isActive ? opt.color : 'var(--text-dim)',
                      border: isActive ? `1.5px solid ${opt.color}55` : '1px solid var(--border-solid)',
                      boxShadow: isActive ? `0 2px 8px ${opt.color}22` : 'none',
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: isActive ? opt.color : 'var(--text-dim)', opacity: isActive ? 1 : 0.4 }} />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── SHOT TYPE tag ────────────────────────────────────── */}
          <div className="rounded-2xl p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Shot Tag</p>
              <button onClick={() => setEditingShotType(v => !v)}
                className="text-text-dim hover:text-accent transition-colors"
                title="Change shot type">
                {editingShotType
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                }
              </button>
            </div>
            {editingShotType ? (
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => handleChangeShotType('')}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                  style={{ background: !localShotType ? 'rgba(107,143,255,0.15)' : 'var(--surface)', color: !localShotType ? 'var(--accent)' : 'var(--text-dim)', border: !localShotType ? '1.5px solid rgba(107,143,255,0.4)' : '1px solid var(--border-solid)' }}>
                  None
                </button>
                {SHOT_TYPES.map(st => (
                  <button key={st.value} onClick={() => handleChangeShotType(st.value)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                    style={{ background: localShotType === st.value ? 'rgba(91,139,245,0.18)' : 'var(--surface)', color: localShotType === st.value ? '#6B8FFF' : 'var(--text-dim)', border: localShotType === st.value ? '1.5px solid rgba(91,139,245,0.45)' : '1px solid var(--border-solid)' }}>
                    {st.label}
                  </button>
                ))}
                <div className="w-full mt-1 flex gap-1.5">
                  <input
                    type="text"
                    value={customShotInput}
                    onChange={e => setCustomShotInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customShotInput.trim()) {
                        handleChangeShotType(customShotInput.trim().toLowerCase())
                        setCustomShotInput('')
                      } else if (e.key === 'Escape') {
                        setCustomShotInput('')
                        setEditingShotType(false)
                      }
                    }}
                    placeholder="Custom tag…"
                    className="flex-1 px-2 py-1 rounded-lg text-[10px] outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border-solid)', color: 'var(--text)', caretColor: 'var(--accent)' }}
                  />
                  <button
                    disabled={!customShotInput.trim()}
                    onClick={() => { handleChangeShotType(customShotInput.trim().toLowerCase()); setCustomShotInput('') }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-30"
                    style={{ background: 'rgba(91,139,245,0.18)', color: '#6B8FFF', border: '1.5px solid rgba(91,139,245,0.45)' }}>
                    Add
                  </button>
                </div>
              </div>
            ) : localShotType ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onShotTypeFilter?.(localShotType)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all hover:scale-105"
                  style={{ background: 'rgba(91,139,245,0.18)', color: '#6B8FFF', border: '1px solid rgba(91,139,245,0.4)' }}
                  title="Click to filter all clips with this tag">
                  {localShotType}
                </button>
                <span className="text-[10px] italic" style={{ color: 'var(--text-dim)' }}>click to filter</span>
              </div>
            ) : (
              <p className="text-[11px] italic" style={{ color: 'var(--text-dim)' }}>No tag — click ✏ to assign one</p>
            )}
          </div>

          {/* ── PROJECTS card ───────────────────────────────────── */}
          <div className="rounded-2xl p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Projects</p>
              <div className="relative" ref={projectPickerRef}>
                <button
                  onClick={() => setShowProjectPicker(v => !v)}
                  disabled={addingProject}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 h-6 rounded-lg transition-all"
                  style={{
                    background: 'rgba(107,143,255,0.12)',
                    color: 'var(--accent)',
                    border: '1px solid rgba(107,143,255,0.3)',
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  Add
                </button>
                {showProjectPicker && (
                  <div className="absolute right-0 top-full mt-1 z-50 rounded-xl py-1 min-w-[160px]"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border-mid)', boxShadow: 'var(--shadow-menu)' }}>
                    {projects.filter(p => !clip.projects?.find(cp => cp.id === p.id)).map(p => (
                      <button key={p.id}
                        onClick={() => handleAddToProject(p.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </button>
                    ))}
                    {projects.filter(p => !clip.projects?.find(cp => cp.id === p.id)).length === 0 && (
                      <p className="px-3 py-2 text-[10px] italic" style={{ color: 'var(--text-dim)' }}>All projects assigned</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            {clip.projects?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {clip.projects.map(p => (
                  <div key={p.id} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold group/ptag"
                    style={{ background: `${p.color}18`, color: p.color, border: `1px solid ${p.color}40` }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    {p.name}
                    <button
                      onClick={() => handleRemoveFromProject(p.id)}
                      className="opacity-0 group-hover/ptag:opacity-100 transition-opacity ml-0.5"
                      style={{ color: p.color }}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] italic" style={{ color: 'var(--text-dim)' }}>Not in any project</p>
            )}
          </div>

          {/* ── AI METADATA card (description + keywords) ───────── */}
          {true && (
            <div className="rounded-2xl p-3 space-y-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}>
              {/* Header row with edit toggle */}
              <div className="flex items-center justify-between">
                <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Description &amp; Keywords</p>
                <button onClick={() => { setEditingMeta(v => !v); setLocalDescription(clip.description || ''); setLocalKeywords(clip.keywords || []); setNewKeyword('') }}
                  className="text-text-dim hover:text-accent transition-colors"
                  title={editingMeta ? 'Cancel' : 'Edit description & keywords'}>
                  {editingMeta
                    ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  }
                </button>
              </div>

              {editingMeta ? (
                <>
                  {/* Editable description */}
                  <textarea
                    value={localDescription}
                    onChange={e => setLocalDescription(e.target.value)}
                    rows={3}
                    placeholder="Add a description…"
                    className="w-full px-2.5 py-2 rounded-xl text-[12px] leading-relaxed resize-none outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border-solid)', color: 'var(--text)', caretColor: 'var(--accent)' }}
                  />

                  {/* Editable keywords */}
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-dim)' }}>Keywords</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {localKeywords.map((kw) => (
                        <span key={kw} className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-medium"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border-solid)', color: 'var(--text-muted)' }}>
                          {kw}
                          <button onClick={() => setLocalKeywords(prev => prev.filter(k => k !== kw))}
                            className="hover:text-red-400 transition-colors leading-none" style={{ color: 'var(--text-dim)' }}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newKeyword}
                        onChange={e => setNewKeyword(e.target.value)}
                        onKeyDown={e => {
                          if ((e.key === 'Enter' || e.key === ',') && newKeyword.trim()) {
                            e.preventDefault()
                            const kw = newKeyword.trim().toLowerCase().replace(/,$/, '')
                            if (!localKeywords.includes(kw)) setLocalKeywords(prev => [...prev, kw])
                            setNewKeyword('')
                          }
                        }}
                        placeholder="Add keyword…"
                        className="flex-1 px-2 py-1 rounded-lg text-[10.5px] outline-none"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border-solid)', color: 'var(--text)', caretColor: 'var(--accent)' }}
                      />
                      <button
                        disabled={!newKeyword.trim()}
                        onClick={() => {
                          const kw = newKeyword.trim().toLowerCase()
                          if (kw && !localKeywords.includes(kw)) setLocalKeywords(prev => [...prev, kw])
                          setNewKeyword('')
                        }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-30"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border-solid)', color: 'var(--text-muted)' }}>
                        + Add
                      </button>
                    </div>
                  </div>

                  <button onClick={handleSaveMeta} disabled={savingMeta}
                    className="w-full h-8 rounded-xl text-[11px] font-semibold transition-all btn-primary disabled:opacity-50">
                    {savingMeta ? 'Saving…' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <>
                  {!localDescription && localKeywords.length === 0 && (
                    <p className="text-[11px] italic" style={{ color: 'var(--text-dim)' }}>No description yet — click ✏ to add one</p>
                  )}
                  {localDescription && (
                    <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{localDescription}</p>
                  )}
                  {localDescription && localKeywords.length > 0 && (
                    <div style={{ height: '1px', background: 'var(--border-solid)' }} />
                  )}
                  {localKeywords.length > 0 && (
                    <div>
                      <p className="text-[9.5px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>Keywords</p>
                      <div className="flex flex-wrap gap-1.5">
                        {localKeywords.map((kw) => (
                          <button key={kw} onClick={() => onSearch?.(kw)} className="keyword-chip">{kw}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Color palette */}
          {clip.color_data?.palette?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Colors</p>
              <div className="flex flex-wrap gap-2.5">
                {clip.color_data.palette.map((hex, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 group/swatch">
                    <button
                      onClick={() => handleCopyHex(hex)}
                      className="w-8 h-8 rounded-xl shadow-sm transition-all hover:scale-110 hover:shadow-md relative"
                      style={{ backgroundColor: hex, border: '2px solid rgba(255,255,255,0.3)' }}
                      title={`Copy ${hex}`}
                    >
                      {copiedHex === hex && (
                        <span className="absolute inset-0 flex items-center justify-center rounded-xl text-white text-[10px] font-bold"
                          style={{ background: 'rgba(0,0,0,0.45)' }}>✓</span>
                      )}
                    </button>
                    <span
                      className="text-[8.5px] font-mono tabular-nums cursor-pointer transition-colors hover:text-accent"
                      style={{ color: copiedHex === hex ? 'var(--accent)' : 'var(--text-dim)' }}
                      onClick={() => handleCopyHex(hex)}
                      title="Click to copy"
                    >
                      {copiedHex === hex ? 'Copied!' : hex}
                    </span>
                  </div>
                ))}
              </div>
              {clip.color_data?.family && onColorFilter && (
                <button
                  onClick={() => onColorFilter(clip.color_data.family)}
                  className="text-[9.5px] font-semibold px-2.5 py-1 rounded-full transition-all mt-2 flex items-center gap-1"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(107,143,255,0.2)' }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  Filter by {clip.color_data.family}
                </button>
              )}
            </div>
          )}

          {/* People */}
          {people.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>People</p>
              <div className="flex flex-wrap gap-1.5">
                {people.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSearch?.(p.name)}
                    className="flex items-center gap-1.5 px-2 py-1 bg-surface2 hover:bg-surface3 border border-border rounded-full text-[11px] text-text-muted hover:text-text-primary transition-colors"
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ backgroundColor: stringToColor(p.name) }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scripture References */}
          {scriptureRefs.length > 0 && (
            <div className="rounded-2xl p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}>
              <p className="text-[9.5px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>Scripture Referenced</p>
              <div className="flex flex-wrap gap-1.5">
                {scriptureRefs.map((ref, i) => (
                  <button
                    key={i}
                    onClick={() => onSearch?.(ref.reference)}
                    className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition-all hover:scale-105"
                    style={{ background: 'rgba(251,191,36,0.12)', color: '#D97706', border: '1px solid rgba(251,191,36,0.3)' }}
                    title={`Search for ${ref.reference}`}
                  >
                    {ref.reference}
                  </button>
                ))}
              </div>
              <p className="text-[9px] mt-2 italic" style={{ color: 'var(--text-dim)' }}>Click to find other clips referencing the same passage</p>
            </div>
          )}

          {/* Transcript (timestamped) */}
          {clip.transcript && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Transcript</p>
              {transcriptSegments.length > 0 ? (
                <div className="rounded-xl overflow-hidden max-h-[180px] overflow-y-auto"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}>
                  {transcriptSegments.map((seg, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        handleMarkUsed()
                        window.beacon?.seekVideo?.(clip.original_path, seg.start)
                      }}
                      className="w-full text-left flex items-start gap-2 px-2.5 py-1.5 transition-colors group/seg"
                      style={{ borderBottom: i < transcriptSegments.length - 1 ? '1px solid var(--border-solid)' : 'none' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      title="Click to seek to this moment"
                    >
                      <span className="text-[9.5px] font-mono tabular-nums flex-shrink-0 mt-0.5 opacity-60 group-hover/seg:opacity-100 transition-opacity"
                        style={{ color: 'var(--accent)' }}>
                        {formatTimestamp(seg.start)}
                      </span>
                      <span className="text-[11px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{seg.text}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl p-2 max-h-[100px] overflow-y-auto"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{clip.transcript}</p>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Notes {notesSaving && <span className="ml-1 opacity-50 normal-case font-normal">saving…</span>}
            </p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={handleNotesSave}
              placeholder="Add a note… (e.g. great for reel, don't use)"
              rows={3}
              className="w-full text-[11px] rounded-xl px-2.5 py-2 resize-none outline-none leading-relaxed"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-inset)', fontFamily: 'inherit' }}
            />
          </div>

          {/* File path */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>File Path</p>
            <div className="rounded-xl px-2.5 py-2" style={{ background: 'var(--surface2)', boxShadow: 'var(--shadow-inset)', border: '1px solid var(--border-solid)' }}>
              <p className="font-mono text-[10px] text-text-muted break-all leading-relaxed">
                {clip.original_path}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pb-2">
            {/* Download */}
            <button
              onClick={() => onDownload?.(clip)}
              className="btn-primary w-full h-10 rounded-xl text-[12px] font-bold flex items-center justify-center gap-2"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </button>

            {/* Find Similar */}
            <button
              onClick={handleFindSimilar}
              disabled={findingSimilar}
              className="btn-secondary w-full h-9 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>
              {findingSimilar ? 'Searching…' : 'Find Similar Clips'}
            </button>

            {/* Enrich description with LLaVA */}
            <button
              onClick={handleEnrich}
              disabled={enriching || enrichDone}
              className="w-full h-9 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              style={{ background: enrichDone ? 'rgba(46,204,113,0.12)' : 'rgba(107,143,255,0.08)', color: enrichDone ? '#2ECC71' : 'var(--accent)', border: `1px solid ${enrichDone ? 'rgba(46,204,113,0.3)' : 'rgba(107,143,255,0.2)'}` }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 8v4l3 3"/><path d="M18 2v4h4"/></svg>
              {enriching ? 'Enriching with AI…' : enrichDone ? 'Descriptions Enriched' : 'Enrich Descriptions (AI)'}
            </button>

            {/* Open In... */}
            <OpenInDropdown filePath={clip.original_path} />

            <div className="flex gap-1.5">
              <button onClick={handleOpenFinder} className="btn-secondary flex-1 h-8 rounded-xl text-[11px] font-medium">
                Show in Finder
              </button>
              <button onClick={handleCopyPath} className="btn-secondary flex-1 h-8 rounded-xl text-[11px] font-medium">
                {copyDone ? '✓ Copied!' : 'Copy Path'}
              </button>
            </div>

            <button
              onClick={handleHide}
              className="w-full h-8 rounded-xl text-[11px] font-medium text-text-dim transition-all"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}
              onMouseEnter={e => { e.currentTarget.style.color='#F87171'; e.currentTarget.style.borderColor='rgba(248,113,113,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.color=''; e.currentTarget.style.borderColor='' }}
            >
              Hide Clip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function OpenInDropdown({ filePath }) {
  const [open, setOpen] = useState(false)
  const APPS = [
    { name: 'Final Cut Pro', icon: '🎬' },
    { name: 'DaVinci Resolve', icon: '🎥' },
    { name: 'QuickTime Player', icon: '▶️' },
    { name: 'Preview', icon: '🖼️' },
  ]
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="btn-secondary w-full h-9 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-2 relative">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        Open In…
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-50 absolute right-3">
          {open ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
        </svg>
      </button>
      {open && (
        <div className="mt-1 rounded-2xl overflow-hidden py-1"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border-mid)', boxShadow: 'var(--shadow-menu)' }}>
          {APPS.map(app => (
            <button key={app.name}
              onClick={() => { window.beacon?.openWithApp(app.name, filePath); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[12px] transition-all"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
              <span>{app.icon}</span>
              {app.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function stringToColor(str) {
  if (!str) return '#555570'
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const colors = ['#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#F39C12', '#1ABC9C', '#E91E63', '#FF5722']
  return colors[Math.abs(hash) % colors.length]
}

function formatTimestamp(secs) {
  if (secs == null) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDuration(secs) {
  if (!secs) return null
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatSize(bytes) {
  if (!bytes) return null
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}
