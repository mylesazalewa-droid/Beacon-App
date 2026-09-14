import { useState, useRef } from 'react'
import {
  createCategory, updateCategory, deleteCategory, reorderCategories,
} from '../../utils/api'

const COLORS = [
  '#E74C3C', '#E67E22', '#F39C12', '#2ECC71',
  '#1ABC9C', '#3498DB', '#9B59B6', '#E91E63',
  '#FF5722', '#00BCD4', '#8BC34A', '#607D8B',
]

export default function CategoryManager({ categories, onRefresh }) {
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [draggingId, setDraggingId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [colorPickerId, setColorPickerId] = useState(null)
  const editInputRef = useRef(null)
  const nonSystem = categories.filter((c) => !c.is_system)
  const system = categories.filter((c) => c.is_system)

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      await createCategory(name)
      setNewName('')
      onRefresh()
    } catch (e) {
      alert(e.message)
    } finally {
      setAdding(false)
    }
  }

  const handleRenameStart = (cat) => {
    setEditingId(cat.id)
    setEditName(cat.name)
    setTimeout(() => editInputRef.current?.focus(), 50)
  }

  const handleRenameSave = async (id) => {
    const name = editName.trim()
    if (!name) { setEditingId(null); return }
    try {
      await updateCategory(id, { name })
      onRefresh()
    } catch (e) {
      alert(e.message)
    }
    setEditingId(null)
  }

  const handleColorChange = async (cat, colorIndex) => {
    setColorPickerId(null)
    try {
      await updateCategory(cat.id, { name: cat.name, color_index: colorIndex })
      onRefresh()
    } catch (e) {
      alert(e.message)
    }
  }

  const handleDelete = async (cat) => {
    if (deleteConfirm === cat.id) {
      try {
        await deleteCategory(cat.id)
        setDeleteConfirm(null)
        onRefresh()
      } catch (e) {
        alert(e.message)
      }
    } else {
      setDeleteConfirm(cat.id)
      setTimeout(() => setDeleteConfirm((v) => v === cat.id ? null : v), 4000)
    }
  }

  // Drag-to-reorder
  const dragOverId = useRef(null)

  const handleDragStart = (e, id) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, id) => {
    e.preventDefault()
    dragOverId.current = id
  }

  const handleDrop = async (e, targetId) => {
    e.preventDefault()
    if (!draggingId || draggingId === targetId) { setDraggingId(null); return }
    const ids = nonSystem.map((c) => c.id)
    const fromIdx = ids.indexOf(draggingId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx === -1 || toIdx === -1) { setDraggingId(null); return }
    const reordered = [...ids]
    reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, draggingId)
    setDraggingId(null)
    await reorderCategories(reordered)
    onRefresh()
  }

  return (
    <div className="space-y-3">
      {/* Add new */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="New category name…"
          className="flex-1 h-9 px-3 rounded-lg text-[13px]"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || adding}
          className="px-4 h-9 rounded-lg text-[12px] font-semibold bg-accent hover:bg-accent-hover text-white disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>

      {/* List */}
      <div className="space-y-1">
        {nonSystem.map((cat) => (
          <div
            key={cat.id}
            draggable
            onDragStart={(e) => handleDragStart(e, cat.id)}
            onDragOver={(e) => handleDragOver(e, cat.id)}
            onDrop={(e) => handleDrop(e, cat.id)}
            onDragEnd={() => setDraggingId(null)}
            className={`flex items-center gap-2 px-2 py-2 rounded-lg bg-surface border border-border group transition-opacity ${draggingId === cat.id ? 'opacity-40' : ''}`}
          >
            {/* Drag handle */}
            <span className="drag-handle text-text-dim text-[14px] flex-shrink-0">⠿</span>

            {/* Color dot — click to change */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setColorPickerId(colorPickerId === cat.id ? null : cat.id)}
                className="w-3.5 h-3.5 rounded-full transition-transform hover:scale-125"
                title="Change color"
                style={{ backgroundColor: COLORS[cat.color_index % COLORS.length], boxShadow: '0 0 0 1.5px rgba(0,0,0,0.12)' }}
              />
              {colorPickerId === cat.id && (
                <div className="absolute left-0 top-5 z-50 p-2 rounded-xl shadow-xl flex flex-wrap gap-1.5"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border-solid)', width: 116 }}>
                  {COLORS.map((c, i) => (
                    <button key={c} onClick={() => handleColorChange(cat, i)}
                      className="w-5 h-5 rounded-full transition-transform hover:scale-125"
                      style={{
                        backgroundColor: c,
                        boxShadow: cat.color_index % COLORS.length === i
                          ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${c}` : '0 0 0 1px rgba(0,0,0,0.1)',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Name (editable) */}
            {editingId === cat.id ? (
              <input
                ref={editInputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => handleRenameSave(cat.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSave(cat.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                className="flex-1 h-6 px-1.5 rounded text-[12px] bg-surface2"
              />
            ) : (
              <span
                className="flex-1 text-[12px] text-text-primary cursor-text"
                onDoubleClick={() => handleRenameStart(cat)}
              >
                {cat.name}
              </span>
            )}

            {/* Clip count */}
            <span className="text-[11px] text-text-dim tabular-nums w-6 text-right">{cat.clip_count}</span>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleRenameStart(cat)}
                className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface2"
                title="Rename"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button
                onClick={() => handleDelete(cat)}
                className={`p-1 rounded text-[10px] font-medium transition-colors ${deleteConfirm === cat.id ? 'bg-red-900/40 text-red-400' : 'text-text-muted hover:text-red-400 hover:bg-red-900/20'}`}
                title={deleteConfirm === cat.id ? 'Click again to confirm delete' : 'Delete'}
              >
                {deleteConfirm === cat.id ? 'Confirm?' : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                )}
              </button>
            </div>
          </div>
        ))}

        {/* System categories (unclassified) */}
        {system.map((cat) => (
          <div key={cat.id} className="flex items-center gap-2 px-2 py-2 rounded-lg bg-surface border border-border opacity-50">
            <span className="w-3 flex-shrink-0" />
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[cat.color_index % COLORS.length] }} />
            <span className="flex-1 text-[12px] text-text-muted">{cat.name}</span>
            <span className="text-[10px] text-text-dim">system</span>
            <span className="text-[11px] text-text-dim tabular-nums">{cat.clip_count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
