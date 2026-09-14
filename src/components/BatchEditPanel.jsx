import { useState, useEffect } from 'react'
import { batchUpdateClips } from '../utils/api'

const BASE_URL = 'http://localhost:7842'

const STATUS_OPTIONS = [
  { value: 'unreviewed', label: 'Unreviewed', color: '#9090A8' },
  { value: 'approved',   label: 'Approved',   color: '#2ECC71' },
  { value: 'in_use',     label: 'In Use',      color: '#6B8FFF' },
  { value: 'archived',   label: 'Archived',    color: '#AAAABC' },
]

export default function BatchEditPanel({ selectedClipIds, onClose, onApply }) {
  const [categories, setCategories] = useState([])
  const [newCategory, setNewCategory] = useState('')      // '' = no change
  const [newStatus, setNewStatus] = useState('')          // '' = no change
  const [newRating, setNewRating] = useState(0)           // 0 = no change
  const [addKeywords, setAddKeywords] = useState('')
  const [applying, setApplying] = useState(false)
  const [hoverStar, setHoverStar] = useState(0)

  useEffect(() => {
    fetch(`${BASE_URL}/categories`)
      .then(r => r.ok ? r.json() : { categories: [] })
      .then(d => setCategories(d.categories || []))
      .catch(() => {})
  }, [])

  const hasChanges = newCategory !== '' || newStatus !== '' || newRating > 0 || addKeywords.trim()

  const handleApply = async () => {
    if (!hasChanges) return
    setApplying(true)
    try {
      const updates = {}
      if (newCategory !== '') updates.category_id = newCategory === 'null' ? null : parseInt(newCategory)
      if (newStatus !== '') updates.status = newStatus
      if (newRating > 0) updates.rating = newRating
      if (addKeywords.trim()) updates.add_keywords = addKeywords.trim().split(',').map(k => k.trim()).filter(Boolean)

      await batchUpdateClips(Array.from(selectedClipIds), updates)
      onApply?.()
      onClose()
    } catch (e) {
      console.error('Batch edit failed:', e)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-[440px] rounded-3xl flex flex-col overflow-hidden animate-slide-in-right"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border-mid)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 8px 32px rgba(0,0,0,0.12)',
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-solid)' }}>
          <div>
            <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Edit {selectedClipIds.size} Clips</p>
            <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-dim)' }}>Only filled fields will be updated</p>
          </div>
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Category */}
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>Category</p>
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              className="w-full h-9 px-3 rounded-xl text-[12px]"
              style={{
                background: 'var(--surface2)',
                color: newCategory ? 'var(--text-primary)' : 'var(--text-muted)',
                border: '1px solid var(--border-solid)',
                boxShadow: 'var(--shadow-inset)',
              }}
            >
              <option value="">— No change —</option>
              <option value="null">Remove category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>Status</p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setNewStatus('')}
                className="px-3 py-1.5 rounded-xl text-[10.5px] font-semibold transition-all"
                style={{
                  background: newStatus === '' ? 'rgba(107,143,255,0.15)' : 'var(--surface2)',
                  color: newStatus === '' ? 'var(--accent)' : 'var(--text-dim)',
                  border: newStatus === '' ? '1px solid rgba(107,143,255,0.3)' : '1px solid var(--border-solid)',
                  boxShadow: newStatus === '' ? 'none' : 'var(--shadow-inset)',
                }}
              >
                No change
              </button>
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setNewStatus(opt.value)}
                  className="flex-1 py-1.5 rounded-xl text-[10.5px] font-bold transition-all"
                  style={{
                    background: newStatus === opt.value ? `${opt.color}20` : 'var(--surface2)',
                    color: newStatus === opt.value ? opt.color : 'var(--text-dim)',
                    border: newStatus === opt.value ? `1px solid ${opt.color}50` : '1px solid var(--border-solid)',
                    boxShadow: newStatus === opt.value ? `0 2px 8px ${opt.color}15` : 'var(--shadow-inset)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>
              Rating {newRating === 0 ? <span className="font-normal normal-case opacity-60">(no change)</span> : `→ ${newRating} star${newRating > 1 ? 's' : ''}`}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex gap-1" onMouseLeave={() => setHoverStar(0)}>
                {[1,2,3,4,5].map(s => (
                  <button
                    key={s}
                    onClick={() => setNewRating(newRating === s ? 0 : s)}
                    onMouseEnter={() => setHoverStar(s)}
                    className="transition-transform hover:scale-110"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24"
                      fill={(hoverStar || newRating) >= s ? '#F5B944' : 'none'}
                      stroke={(hoverStar || newRating) >= s ? '#F5B944' : 'var(--text-dim)'}
                      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  </button>
                ))}
              </div>
              {newRating > 0 && (
                <button onClick={() => setNewRating(0)} className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Clear</button>
              )}
            </div>
          </div>

          {/* Add Keywords */}
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>Add Keywords</p>
            <input
              value={addKeywords}
              onChange={e => setAddKeywords(e.target.value)}
              placeholder="worship, baptism, outdoor… (comma-separated)"
              className="w-full h-9 px-3 rounded-xl text-[12px] outline-none"
              style={{
                background: 'var(--surface2)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-solid)',
                boxShadow: 'var(--shadow-inset)',
                fontFamily: 'inherit',
              }}
            />
            <p className="text-[9px] mt-1.5" style={{ color: 'var(--text-dim)' }}>Keywords will be merged with existing ones, not replaced.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border-solid)' }}>
          <button onClick={onClose}
            className="flex-1 h-10 rounded-xl text-[12px] font-semibold transition-all"
            style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border-solid)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!hasChanges || applying}
            className="flex-1 h-10 rounded-xl text-[12px] font-bold text-white transition-all disabled:opacity-40"
            style={{ background: hasChanges ? 'var(--grad-accent)' : 'var(--surface3)' }}
          >
            {applying ? 'Applying…' : `Apply to ${selectedClipIds.size} clips`}
          </button>
        </div>
      </div>
    </div>
  )
}
