import { useState, useEffect, useRef } from 'react'
import { getShotLists, createShotList, deleteShotList, getShotListItems, addClipToShotList, removeShotListItem, reorderShotListItems, exportFcpXml, thumbnailUrl } from '../utils/api'

const BASE_URL = 'http://localhost:7842'

function getDragClipId(e) {
  try {
    const raw = e.dataTransfer.getData('application/beacon-clip')
    if (raw) return JSON.parse(raw)
  } catch (_) {}
  return null
}

export default function ShotListPanel({ onClose }) {
  const [shotLists, setShotLists] = useState([])
  const [activeList, setActiveList] = useState(null)   // { id, name, items: [{item_id, position, note, clip}] }
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [dragOverListId, setDragOverListId] = useState(null)
  const [dragItem, setDragItem] = useState(null)
  const [dragOverItemId, setDragOverItemId] = useState(null)
  const [showPdfPrompt, setShowPdfPrompt] = useState(false)
  const [pdfIncludeNotes, setPdfIncludeNotes] = useState(true)
  const nameRef = useRef(null)

  useEffect(() => { loadLists() }, [])
  useEffect(() => { if (showNew) setTimeout(() => nameRef.current?.focus(), 50) }, [showNew])

  const loadLists = async () => {
    try {
      const data = await getShotLists()
      setShotLists(data.shot_lists || [])
    } catch (e) { console.error(e) }
  }

  const loadListDetail = async (list) => {
    try {
      const data = await getShotListItems(list.id)
      setActiveList({ ...list, items: data.items || [] })
    } catch (e) { console.error(e) }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const data = await createShotList(newName.trim())
      const newList = { ...data, items: [] }
      setShotLists(prev => [newList, ...prev])
      setNewName('')
      setShowNew(false)
      setActiveList(newList)
    } catch (e) { console.error(e) }
    finally { setCreating(false) }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    try {
      await deleteShotList(id)
      setShotLists(prev => prev.filter(l => l.id !== id))
      if (activeList?.id === id) setActiveList(null)
    } catch (e) { console.error(e) }
  }

  const handleDropOnList = async (e, list) => {
    e.preventDefault()
    setDragOverListId(null)
    const clipData = getDragClipId(e)
    if (!clipData) return
    try {
      await addClipToShotList(list.id, clipData.id)
      loadLists()
      if (activeList?.id === list.id) await loadListDetail(activeList)
    } catch (ex) { console.error(ex) }
  }

  const handleRemoveItem = async (itemId) => {
    try {
      await removeShotListItem(activeList.id, itemId)
      setActiveList(prev => ({ ...prev, items: prev.items.filter(i => i.item_id !== itemId) }))
      loadLists()
    } catch (e) { console.error(e) }
  }

  // Drag-to-reorder within the shot list
  const handleItemDragStart = (e, item) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragItem(item)
  }

  const handleItemDragOver = (e, item) => {
    if (!dragItem || dragItem.item_id === item.item_id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverItemId(item.item_id)
  }

  const handleItemDrop = async (e, targetItem) => {
    e.preventDefault()
    setDragOverItemId(null)
    if (!dragItem || dragItem.item_id === targetItem.item_id) { setDragItem(null); return }

    const items = [...activeList.items]
    const fromIdx = items.findIndex(i => i.item_id === dragItem.item_id)
    const toIdx = items.findIndex(i => i.item_id === targetItem.item_id)
    if (fromIdx === -1 || toIdx === -1) return

    const reordered = [...items]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setActiveList(prev => ({ ...prev, items: reordered }))

    try {
      await reorderShotListItems(activeList.id, reordered.map(it => it.item_id))
    } catch (ex) { console.error(ex) }
    setDragItem(null)
  }

  const handleExportFcp = async () => {
    if (!activeList?.items?.length) return
    const clipIds = activeList.items.map(i => i.clip.id)
    await exportFcpXml(clipIds, activeList.name)
  }

  const handlePrintPDF = async (includeNotes) => {
    if (!activeList?.items?.length) return
    setShowPdfPrompt(false)

    // Always fetch fresh data so any notes/description edits made since loading are included
    let freshItems = activeList.items
    try {
      const fresh = await getShotListItems(activeList.id)
      freshItems = fresh.items || activeList.items
    } catch (_) { /* use cached data if refresh fails */ }

    const rows = freshItems.map((item, idx) => {
      const clipNotes = includeNotes && item.clip.notes ? item.clip.notes.trim() : ''
      return `
      <tr style="page-break-inside:avoid">
        <td style="width:36px;padding:6px 8px;font-weight:bold;color:#666;vertical-align:top;font-size:12px">${idx + 1}</td>
        <td style="width:120px;padding:6px 8px;vertical-align:top">
          <img src="${BASE_URL}/thumbnail/${item.clip.id}" style="width:110px;height:62px;object-fit:cover;border-radius:4px" />
        </td>
        <td style="padding:6px 8px;vertical-align:top">
          <div style="font-weight:600;font-size:11px;margin-bottom:4px">${item.clip.filename || 'Unnamed'}</div>
          <div style="font-size:10px;color:#555;line-height:1.4">${item.clip.description || ''}</div>
          ${item.note ? `<div style="font-size:10px;color:#777;margin-top:5px;font-style:italic;padding-left:6px;border-left:2px solid #ccc">Shot note: ${item.note}</div>` : ''}
          ${clipNotes ? `<div style="font-size:10px;color:#3a6bc4;margin-top:5px;font-weight:500;padding:4px 6px;border-left:3px solid #6B8FFF;background:#f0f4ff;border-radius:0 4px 4px 0">📝 ${clipNotes}</div>` : ''}
        </td>
      </tr>
    `}).join('')

    const html = `<!DOCTYPE html>
<html><head>
  <title>Shot List: ${activeList.name}</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 24px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .sub { font-size: 12px; color: #888; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    tr:nth-child(odd) { background: #f9f9f9; }
    td { border-bottom: 1px solid #eee; }
    @media print { body { padding: 0; } }
  </style>
</head><body>
  <h1>${activeList.name}</h1>
  <p class="sub">${freshItems.length} shot${freshItems.length !== 1 ? 's' : ''} · Beacon Shot List</p>
  <table><tbody>${rows}</tbody></table>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close() }</script>
</body></html>`

    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  return (
    <div className="relative w-[380px] flex-shrink-0 h-full flex flex-col animate-slide-in-right"
      style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border-mid)', boxShadow: '-8px 0 32px rgba(0,0,0,0.08)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-solid)' }}>
          <div>
            <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
              {activeList ? activeList.name : 'Shot Lists'}
            </p>
            {activeList && (
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
                {activeList.items?.length || 0} shot{activeList.items?.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {activeList && (
              <button onClick={() => setActiveList(null)}
                className="px-3 h-7 rounded-lg text-[10.5px] font-semibold transition-all"
                style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border-solid)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface2)'}
              >
                ← All Lists
              </button>
            )}
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-xl transition-all"
              style={{ background: 'var(--surface2)', color: 'var(--text-dim)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {!activeList ? (
          /* ── List index ──────────────────────────────────────── */
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {showNew ? (
              <div className="p-3 rounded-2xl space-y-2"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)', boxShadow: 'var(--shadow-inset)' }}>
                <input
                  ref={nameRef}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNew(false) }}
                  placeholder="Shot list name…"
                  className="w-full h-8 px-3 rounded-xl text-[12px] outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                />
                <div className="flex gap-1.5">
                  <button onClick={() => setShowNew(false)}
                    className="flex-1 h-8 rounded-xl text-[11px] font-semibold"
                    style={{ background: 'var(--surface3)', color: 'var(--text-muted)', border: '1px solid var(--border-solid)' }}>
                    Cancel
                  </button>
                  <button onClick={handleCreate} disabled={!newName.trim() || creating}
                    className="flex-1 h-8 rounded-xl text-[11px] font-bold text-white disabled:opacity-40 btn-primary">
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowNew(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-[12px] font-semibold transition-all"
                style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid rgba(107,143,255,0.2)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(107,143,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface2)'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New Shot List
              </button>
            )}

            {shotLists.length === 0 && !showNew && (
              <div className="flex flex-col items-center py-12 gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--surface2)', boxShadow: 'var(--shadow-md)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </div>
                <p className="text-[13px] font-semibold" style={{ color: 'var(--text-muted)' }}>No shot lists yet</p>
                <p className="text-[11px] leading-relaxed max-w-[200px]" style={{ color: 'var(--text-dim)' }}>
                  Create a list, then drag clips from the grid to build your sequence
                </p>
              </div>
            )}

            {shotLists.map(list => (
              <ShotListDropTarget
                key={list.id}
                list={list}
                onSelect={() => loadListDetail(list)}
                onDelete={(e) => handleDelete(e, list.id)}
                onDrop={(e) => handleDropOnList(e, list)}
                dragOverListId={dragOverListId}
                setDragOverListId={setDragOverListId}
              />
            ))}
          </div>
        ) : (
          /* ── List detail ────────────────────────────────────── */
          <div className="flex-1 overflow-y-auto"
            onDragOver={(e) => { if (e.dataTransfer.types.includes('application/beacon-clip')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
            onDrop={async (e) => {
              const clipData = getDragClipId(e)
              if (!clipData) return
              e.preventDefault()
              await addClipToShotList(activeList.id, clipData.id)
              await loadListDetail(activeList)
              loadLists()
            }}
          >
            <div className="px-4 py-2 text-[10px] font-medium"
              style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border-solid)', background: 'var(--surface2)' }}>
              ↓ Drag clips from the library to add · Drag rows to reorder
            </div>

            {activeList.items?.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-center px-6">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--surface2)', boxShadow: 'var(--shadow-sm)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 5v14M5 12l7 7 7-7"/>
                  </svg>
                </div>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>Empty shot list</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                  Drag clips from the grid into this panel
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-1.5">
                {activeList.items.map((item, idx) => (
                  <div
                    key={item.item_id}
                    draggable
                    onDragStart={(e) => handleItemDragStart(e, item)}
                    onDragOver={(e) => handleItemDragOver(e, item)}
                    onDrop={(e) => handleItemDrop(e, item)}
                    onDragEnd={() => { setDragItem(null); setDragOverItemId(null) }}
                    className="flex items-center gap-2.5 p-2 rounded-2xl group/item transition-all"
                    style={{
                      background: dragOverItemId === item.item_id ? 'rgba(107,143,255,0.08)' : 'var(--surface2)',
                      border: dragOverItemId === item.item_id ? '1px solid rgba(107,143,255,0.3)' : '1px solid var(--border-solid)',
                      boxShadow: dragItem?.item_id === item.item_id ? '0 4px 16px rgba(0,0,0,0.12)' : 'var(--shadow-sm)',
                      opacity: dragItem?.item_id === item.item_id ? 0.4 : 1,
                      cursor: 'grab',
                    }}
                  >
                    <div className="flex-shrink-0 w-6 text-center">
                      <span className="text-[10px] font-bold tabular-nums" style={{ color: 'var(--text-dim)' }}>{idx + 1}</span>
                    </div>
                    <div className="w-[60px] h-[34px] rounded-lg overflow-hidden flex-shrink-0"
                      style={{ background: 'var(--surface3)' }}>
                      <img src={`${BASE_URL}/thumbnail/${item.clip.id}`} alt=""
                        className="w-full h-full object-cover"
                        onError={e => { e.target.style.display = 'none' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.clip.filename}
                      </p>
                      {item.clip.description && (
                        <p className="text-[9.5px] truncate mt-0.5" style={{ color: 'var(--text-dim)' }}>
                          {item.clip.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveItem(item.item_id)}
                      className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-all"
                      style={{ color: 'var(--text-dim)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248,113,113,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PDF Options Prompt */}
        {showPdfPrompt && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
            <div className="w-full max-w-[300px] rounded-2xl p-5 space-y-4 shadow-2xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border-solid)' }}>
              <div>
                <p className="text-[13px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Print Shot List</p>
                <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>Choose what to include in the PDF</p>
              </div>
              {/* Toggle: include notes */}
              <button
                onClick={() => setPdfIncludeNotes(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
                style={{ background: pdfIncludeNotes ? 'rgba(91,139,245,0.12)' : 'var(--surface2)', border: pdfIncludeNotes ? '1.5px solid rgba(91,139,245,0.4)' : '1px solid var(--border-solid)' }}
              >
                <div className="flex items-center gap-2.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={pdfIncludeNotes ? '#6B8FFF' : 'var(--text-dim)'} strokeWidth="2.5" strokeLinecap="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  <span className="text-[11.5px] font-semibold" style={{ color: pdfIncludeNotes ? '#6B8FFF' : 'var(--text-muted)' }}>
                    Include clip notes
                  </span>
                </div>
                {/* Toggle pill */}
                <div className="w-8 h-4.5 rounded-full flex items-center px-0.5 transition-all"
                  style={{ background: pdfIncludeNotes ? '#6B8FFF' : 'var(--border-mid)', height: 18 }}>
                  <div className="w-3.5 h-3.5 rounded-full bg-white shadow transition-transform"
                    style={{ transform: pdfIncludeNotes ? 'translateX(13px)' : 'translateX(0)' }} />
                </div>
              </button>
              {pdfIncludeNotes && (
                <p className="text-[10px] italic px-1" style={{ color: 'var(--text-dim)' }}>
                  Notes from each clip's detail panel will appear highlighted in the PDF.
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowPdfPrompt(false)}
                  className="flex-1 h-8 rounded-xl text-[11px] font-semibold transition-all"
                  style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border-solid)' }}>
                  Cancel
                </button>
                <button
                  onClick={() => handlePrintPDF(pdfIncludeNotes)}
                  className="flex-1 h-8 rounded-xl text-[11px] font-semibold transition-all btn-primary">
                  Print PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Export footer */}
        {activeList && activeList.items?.length > 0 && (
          <div className="flex gap-2 px-4 py-3.5 flex-shrink-0" style={{ borderTop: '1px solid var(--border-solid)' }}>
            <button onClick={() => setShowPdfPrompt(true)}
              className="flex-1 h-9 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-2 transition-all"
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border-solid)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Print PDF
            </button>
            <button onClick={handleExportFcp}
              className="flex-1 h-9 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-2 transition-all btn-primary"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
              FCP XML
            </button>
          </div>
        )}
    </div>
  )
}

function ShotListDropTarget({ list, onSelect, onDelete, onDrop, dragOverListId, setDragOverListId }) {
  const isOver = dragOverListId === list.id

  return (
    <div
      className="group/slist relative"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/beacon-clip')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragOverListId(list.id)
        }
      }}
      onDragLeave={() => setDragOverListId(null)}
      onDrop={onDrop}
    >
      <button
        onClick={onSelect}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left text-[12px] transition-all"
        style={{
          background: isOver ? 'rgba(107,143,255,0.08)' : 'var(--surface2)',
          color: 'var(--text-muted)',
          border: isOver ? '1px solid rgba(107,143,255,0.3)' : '1px solid var(--border-solid)',
          boxShadow: isOver ? 'var(--shadow-inset)' : 'var(--shadow-sm)',
          fontWeight: 500,
        }}
        onMouseEnter={e => { if (!isOver) { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
        onMouseLeave={e => { if (!isOver) { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text-muted)' } }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 opacity-60">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        <span className="flex-1 truncate">{list.name}</span>
        <span className="text-[10px] tabular-nums font-bold px-2 py-0.5 rounded-full mr-5"
          style={{ color: 'var(--text-dim)', background: 'rgba(0,0,0,0.05)' }}>
          {list.item_count || 0}
        </span>
        {isOver && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        )}
      </button>
      <button
        onClick={onDelete}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/slist:opacity-100 transition-all w-5 h-5 flex items-center justify-center rounded-lg"
        style={{ color: 'var(--text-dim)' }}
        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}
