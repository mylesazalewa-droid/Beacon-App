import { useState, useEffect } from 'react'
import { getPersons, updatePerson, deletePerson, mergePersons, reclusterFaces, personThumbnailUrl } from '../../utils/api'

export default function PeopleSettings() {
  const [persons, setPersons] = useState([])
  const [loading, setLoading] = useState(true)
  const [clustering, setClustering] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [mergingFrom, setMergingFrom] = useState(null)
  const [error, setError] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const data = await getPersons()
      setPersons(data.persons || [])
    } catch (e) {
      setError('Could not load people. Run an ingest first to detect faces.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSaveName = async (id) => {
    await updatePerson(id, { name: editName })
    setPersons((prev) => prev.map((p) => p.id === id ? { ...p, name: editName } : p))
    setEditingId(null)
    setEditName('')
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this person from all clips?')) return
    await deletePerson(id)
    setPersons((prev) => prev.filter((p) => p.id !== id))
  }

  const handleMerge = async (targetId) => {
    if (!mergingFrom || mergingFrom === targetId) {
      setMergingFrom(null)
      return
    }
    if (!confirm(`Merge these two people into one?`)) return
    await mergePersons(targetId, mergingFrom)
    setMergingFrom(null)
    load()
  }

  const handleRecluster = async () => {
    setClustering(true)
    try {
      const result = await reclusterFaces()
      await load()
    } catch (e) {
      setError('Re-clustering failed')
    } finally {
      setClustering(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-muted text-[13px]">
        <span className="animate-pulse">Loading people…</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-semibold text-text-primary">People</h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            Faces detected automatically during ingest. Name them to make them searchable.
          </p>
        </div>
        <button
          onClick={handleRecluster}
          disabled={clustering}
          className="flex items-center gap-2 px-3 h-8 rounded-lg text-[11px] font-medium bg-surface2 hover:bg-surface3 text-text-muted border border-border transition-colors disabled:opacity-50"
        >
          {clustering ? (
            <>
              <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
              Re-clustering…
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-2.3M22 12.5a10 10 0 0 1-18.8 2.2"/></svg>
              Re-cluster Faces
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-surface2 border border-border rounded-lg px-3 py-2.5 text-[12px] text-text-muted">
          {error}
        </div>
      )}

      {mergingFrom && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 text-[12px] text-accent flex items-center justify-between">
          <span>Click another person to merge them together, or cancel below.</span>
          <button onClick={() => setMergingFrom(null)} className="text-text-muted hover:text-text-primary ml-3">Cancel</button>
        </div>
      )}

      {persons.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <div className="text-4xl mb-3">👤</div>
          <p className="text-[13px] font-medium text-text-primary mb-1">No people detected yet</p>
          <p className="text-[12px]">Ingest media with Face Recognition enabled to auto-detect people.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {persons.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              isEditing={editingId === person.id}
              editName={editName}
              isMergeSource={mergingFrom === person.id}
              onStartEdit={() => { setEditingId(person.id); setEditName(person.name || '') }}
              onEditChange={setEditName}
              onSave={() => handleSaveName(person.id)}
              onCancelEdit={() => { setEditingId(null); setEditName('') }}
              onDelete={() => handleDelete(person.id)}
              onStartMerge={() => mergingFrom ? handleMerge(person.id) : setMergingFrom(person.id)}
              mergingFrom={mergingFrom}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FaceThumb({ person }) {
  const [imgOk, setImgOk] = useState(true)
  const src = personThumbnailUrl(person.id)
  if (imgOk) {
    return (
      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-border shadow-sm flex-shrink-0">
        <img
          src={src}
          alt={person.name || 'Unknown'}
          className="w-full h-full object-cover"
          onError={() => setImgOk(false)}
        />
      </div>
    )
  }
  // Fallback: initial or icon
  return (
    <div className="w-14 h-14 rounded-full bg-surface3 flex items-center justify-center overflow-hidden">
      {person.name ? (
        <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold"
          style={{ backgroundColor: stringToColor(person.name) }}>
          {person.name.charAt(0).toUpperCase()}
        </div>
      ) : (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      )}
    </div>
  )
}

function PersonCard({ person, isEditing, editName, isMergeSource, onStartEdit, onEditChange, onSave, onCancelEdit, onDelete, onStartMerge, mergingFrom }) {
  const displayName = person.name || `Unknown Person`
  const isUnnamed = !person.name

  return (
    <div className={`bg-surface2 rounded-xl border transition-all overflow-hidden ${
      isMergeSource ? 'border-accent' : mergingFrom ? 'border-border cursor-pointer hover:border-accent' : 'border-border'
    }`}
    onClick={mergingFrom && !isMergeSource ? onStartMerge : undefined}
    >
      {/* Face avatar area */}
      <div className="h-20 bg-surface flex items-center justify-center border-b border-border">
        <FaceThumb person={person} />
      </div>

      <div className="p-2.5 space-y-2">
        {isEditing ? (
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={editName}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancelEdit() }}
              placeholder="Enter name…"
              className="flex-1 bg-surface border border-border rounded px-2 py-1 text-[12px] text-text-primary focus:outline-none focus:border-accent"
            />
            <button onClick={onSave} className="text-accent hover:text-accent-hover text-[11px] font-semibold px-1.5">Save</button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-1">
            <div>
              <p className={`text-[12px] font-semibold ${isUnnamed ? 'text-text-dim italic' : 'text-text-primary'}`}>
                {displayName}
              </p>
              <p className="text-[10px] text-text-muted">
                {person.clip_count} clip{person.clip_count !== 1 ? 's' : ''} · {person.face_count} face{person.face_count !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={onStartEdit}
              className="text-text-dim hover:text-accent w-6 h-6 flex items-center justify-center rounded hover:bg-surface"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        )}

        {/* Actions */}
        {!isEditing && (
          <div className="flex gap-1">
            <button
              onClick={onStartMerge}
              title={mergingFrom ? 'Merge with this person' : 'Merge with another person'}
              className={`flex-1 h-6 rounded text-[10px] font-medium border transition-colors ${
                isMergeSource
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface hover:bg-surface3 text-text-dim border-border'
              }`}
            >
              {isMergeSource ? 'Merging…' : 'Merge'}
            </button>
            <button
              onClick={onDelete}
              className="flex-1 h-6 rounded text-[10px] font-medium bg-surface hover:bg-red-900/20 text-text-dim hover:text-red-400 border border-border hover:border-red-800/50 transition-colors"
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function stringToColor(str) {
  if (!str) return '#555570'
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const colors = ['#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#F39C12', '#1ABC9C', '#E91E63', '#FF5722', '#00BCD4', '#8BC34A']
  return colors[Math.abs(hash) % colors.length]
}
