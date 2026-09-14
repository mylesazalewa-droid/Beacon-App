import { useState, useEffect, useCallback } from 'react'
import { getPersons, updatePerson, reclusterFaces, getPersonClips, personThumbnailUrl } from '../utils/api'

export default function PeopleView({ onSelectPerson, onRecluster }) {
  const [persons, setPersons] = useState([])
  const [loading, setLoading] = useState(true)
  const [clustering, setClustering] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPersons()
      setPersons(data.persons || [])
    } catch (e) {
      console.error('getPersons failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRecluster = async () => {
    setClustering(true)
    try {
      await reclusterFaces()
      await load()
      onRecluster?.()
    } finally {
      setClustering(false)
    }
  }

  const handleSaveName = async (id) => {
    try {
      await updatePerson(id, { name: editName.trim() || null })
      setPersons(prev => prev.map(p => p.id === id ? { ...p, name: editName.trim() || null } : p))
    } catch (e) {
      console.error('updatePerson failed:', e)
    }
    setEditingId(null)
  }

  const startEdit = (person) => {
    setEditingId(person.id)
    setEditName(person.name || '')
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <span className="text-[13px] animate-pulse" style={{ color: 'var(--text-dim)' }}>Loading people…</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 h-[42px] flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-solid)', background: 'var(--bg)' }}>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
            People
          </span>
          <span className="text-[11px] tabular-nums font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            {persons.length} {persons.length === 1 ? 'person' : 'people'}
          </span>
        </div>
        <button
          onClick={handleRecluster}
          disabled={clustering}
          className="flex items-center gap-2 px-3 h-7 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
          style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border-solid)' }}
        >
          {clustering ? (
            <>
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Clustering…
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
              </svg>
              Re-cluster
            </>
          )}
        </button>
      </div>

      {/* Empty state */}
      {persons.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-5"
            style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-solid)' }}>
            👤
          </div>
          <p className="font-bold text-[16px] mb-1" style={{ color: 'var(--text-primary)' }}>No people detected yet</p>
          <p className="text-[13px] mb-5" style={{ color: 'var(--text-muted)' }}>
            Import footage with face recognition enabled to detect people automatically.
          </p>
          <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
            Make sure <strong>Face Recognition</strong> is enabled in Settings → Ingest
          </p>
        </div>
      )}

      {/* Person grid */}
      {persons.length > 0 && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
            {persons.map(person => (
              <PersonCard
                key={person.id}
                person={person}
                isEditing={editingId === person.id}
                editName={editName}
                onEditNameChange={setEditName}
                onStartEdit={() => startEdit(person)}
                onSave={() => handleSaveName(person.id)}
                onCancelEdit={() => setEditingId(null)}
                onSelect={() => onSelectPerson(person)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PersonCard({ person, isEditing, editName, onEditNameChange, onStartEdit, onSave, onCancelEdit, onSelect }) {
  const [imgError, setImgError] = useState(false)
  const thumbUrl = personThumbnailUrl(person.id)

  return (
    <div
      className="flex flex-col items-center gap-2 p-3 rounded-2xl cursor-pointer transition-all group"
      style={{ background: 'var(--surface)', border: '1px solid var(--border-solid)', boxShadow: 'var(--shadow-sm)' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none' }}
      onClick={() => { if (!isEditing) onSelect() }}
    >
      {/* Face thumbnail */}
      <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 relative"
        style={{ background: 'var(--surface2)', border: '2px solid var(--border-solid)' }}>
        {!imgError ? (
          <img
            src={thumbUrl}
            alt={person.name || `Person ${person.id}`}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">
            👤
          </div>
        )}
      </div>

      {/* Name (editable) */}
      {isEditing ? (
        <div className="w-full" onClick={e => e.stopPropagation()}>
          <input
            autoFocus
            value={editName}
            onChange={e => onEditNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancelEdit() }}
            placeholder="Enter name…"
            className="w-full text-center text-[11px] font-semibold px-2 py-1 rounded-lg outline-none"
            style={{ background: 'var(--surface2)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}
          />
          <div className="flex gap-1 mt-1.5">
            <button onClick={onCancelEdit} className="flex-1 text-[10px] py-0.5 rounded-md" style={{ color: 'var(--text-dim)' }}>
              Cancel
            </button>
            <button onClick={onSave} className="flex-1 text-[10px] py-0.5 rounded-md font-semibold text-white" style={{ background: 'var(--accent)' }}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center w-full">
          <button
            onClick={e => { e.stopPropagation(); onStartEdit() }}
            className="text-[12px] font-semibold text-center w-full truncate transition-colors hover:text-accent"
            style={{ color: person.name ? 'var(--text-primary)' : 'var(--text-dim)' }}
            title={person.name ? `Rename ${person.name}` : 'Click to name'}
          >
            {person.name || `Person ${person.id}`}
          </button>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
            {person.clip_count} {person.clip_count === 1 ? 'clip' : 'clips'}
          </p>
        </div>
      )}
    </div>
  )
}
