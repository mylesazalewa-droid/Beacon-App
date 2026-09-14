import { useRef, useEffect, useState, useCallback } from 'react'

const QUICK_SEARCHES = [
  'worship', 'sermon', 'baptism', 'kids', 'prayer', 'praise', 'preaching', 'congregation',
]
const MAX_RECENT = 6

function useRecentSearches() {
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('beacon_recent_searches') || '[]') } catch { return [] }
  })
  const add = useCallback((q) => {
    if (!q || q.trim().length < 2) return
    setRecent((prev) => {
      const next = [q, ...prev.filter((r) => r !== q)].slice(0, MAX_RECENT)
      localStorage.setItem('beacon_recent_searches', JSON.stringify(next))
      return next
    })
  }, [])
  return [recent, add]
}

export default function TopBar({ query, onQuery, view, onViewChange, searchInputRef, onExport, onShortcuts, onHelp }) {
  const [focused, setFocused] = useState(false)
  const [recent, addRecent] = useRecentSearches()
  const containerRef = useRef(null)

  const handleBlur = () => {
    setTimeout(() => setFocused(false), 150)
    if (query.trim()) addRecent(query.trim())
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && query.trim()) { addRecent(query.trim()); searchInputRef.current?.blur() }
    if (e.key === 'Escape') { onQuery(''); searchInputRef.current?.blur() }
  }

  const handleSuggestionClick = (term) => {
    onQuery(term); addRecent(term); setFocused(false); onViewChange('library')
  }

  const showDropdown = focused && (recent.length > 0 || !query)

  return (
    <div className="flex items-center gap-4 px-5 h-[56px] flex-shrink-0"
      style={{ background: 'var(--bg)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>

      {/* ── Search bar (pressed/inset neumorphic) ── */}
      <div className="flex-1 relative max-w-2xl" ref={containerRef}>
        <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200"
          style={{ color: focused ? 'var(--accent)' : 'var(--text-dim)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </span>
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onFocus={() => { setFocused(true); onViewChange('library') }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder='Search footage… try "worship" or describe a scene'
          className="w-full h-10 pl-11 pr-9 rounded-2xl text-[13px] font-medium transition-all duration-200 outline-none"
          style={{
            background: 'var(--bg)',
            color: 'var(--text-primary)',
            border: focused ? '1px solid rgba(107,143,255,0.35)' : '1px solid transparent',
            boxShadow: focused
              ? 'inset 5px 5px 12px #C2C4D2, inset -5px -5px 12px #FFFFFF, 0 0 0 3px rgba(107,143,255,0.1)'
              : 'inset 5px 5px 12px #C2C4D2, inset -5px -5px 12px #FFFFFF',
          }}
        />
        {query && (
          <button
            onMouseDown={(e) => { e.preventDefault(); onQuery('') }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full transition-all"
            style={{ color: 'var(--text-dim)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        )}

        {/* ── Dropdown ── */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-hidden z-50 p-1.5"
            style={{
              background: 'var(--bg)',
              boxShadow: '10px 10px 28px #C0C2D0, -6px -6px 16px rgba(255,255,255,0.9)',
            }}>
            {recent.length > 0 && (
              <div className="mb-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] px-3 pt-2 pb-1.5" style={{ color: 'var(--text-dim)' }}>Recent</p>
                {recent.map((r) => (
                  <button key={r}
                    onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(r) }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-[12.5px] transition-all"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(107,143,255,0.07)'; e.currentTarget.style.color = 'var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-40 flex-shrink-0">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {r}
                  </button>
                ))}
              </div>
            )}
            <div className={`pb-1 ${recent.length > 0 ? 'border-t border-black/5 pt-1' : ''}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] px-3 pt-2 pb-1.5" style={{ color: 'var(--text-dim)' }}>Quick searches</p>
              <div className="flex flex-wrap gap-1.5 px-2.5 pb-1.5">
                {QUICK_SEARCHES.map((term) => (
                  <button key={term}
                    onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(term) }}
                    className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
                    style={{ background: 'var(--bg)', color: 'var(--text-muted)', boxShadow: 'var(--neu-raise-sm)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.boxShadow = 'inset 2px 2px 5px #C5C7D4, inset -2px -2px 5px #FFFFFF' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.boxShadow = 'var(--neu-raise-sm)' }}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* ── Help button ── */}
      <button
        onClick={onHelp}
        title="Beacon Help (⌘⇧H)"
        className="w-9 h-9 flex items-center justify-center rounded-2xl flex-shrink-0 transition-all"
        style={{
          background: 'var(--bg)',
          color: 'var(--text-dim)',
          boxShadow: '4px 4px 9px #C5C7D4, -4px -4px 9px #FFFFFF',
          border: 'none',
          fontSize: 13,
          fontWeight: 700,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.boxShadow = 'var(--shadow-accent)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.boxShadow = '4px 4px 9px #C5C7D4, -4px -4px 9px #FFFFFF' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </button>

      {/* ── Keyboard shortcuts hint ── */}
      <button
        onClick={onShortcuts}
        title="Keyboard shortcuts (?)"
        className="w-9 h-9 flex items-center justify-center rounded-2xl flex-shrink-0 transition-all text-[13px] font-bold"
        style={{
          background: 'var(--bg)',
          color: 'var(--text-dim)',
          boxShadow: '4px 4px 9px #C5C7D4, -4px -4px 9px #FFFFFF',
          border: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        ?
      </button>

      {/* ── Export button ── */}
      <NeuBtn onClick={onExport} title="Export organized folder">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span>Export</span>
      </NeuBtn>

      {/* ── View switcher ── */}
      <div className="flex items-center gap-1.5">
        <NavBtn active={view === 'library' || view === 'people' || view === 'starred'} onClick={() => onViewChange('library')} title="Library">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          <span>Library</span>
        </NavBtn>
        <NavBtn active={view === 'ingest'} onClick={() => onViewChange('ingest')} title="Import media">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Import</span>
        </NavBtn>
        <NavBtn active={view === 'settings'} onClick={() => onViewChange('settings')} title="Settings" iconOnly>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </NavBtn>
      </div>
    </div>
  )
}

/* ── Neumorphic flat button ── */
function NeuBtn({ children, onClick, title }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button onClick={onClick} title={title}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={e => { setPressed(false); e.currentTarget.style.color = 'var(--text-muted)' }}
      className="flex items-center gap-2 px-4 h-9 rounded-2xl text-[12px] font-semibold flex-shrink-0 transition-all duration-150"
      style={{
        background: 'var(--bg)',
        color: 'var(--text-muted)',
        boxShadow: pressed
          ? 'inset 3px 3px 7px #C5C7D4, inset -3px -3px 7px #FFFFFF'
          : '4px 4px 9px #C5C7D4, -4px -4px 9px #FFFFFF',
        border: 'none',
      }}
      onMouseEnter={e => { if (!pressed) e.currentTarget.style.color = 'var(--text-primary)' }}
    >
      {children}
    </button>
  )
}

/* ── Nav tab button ── */
function NavBtn({ children, active, onClick, title, iconOnly }) {
  return (
    <button onClick={onClick} title={title}
      className={`flex items-center gap-1.5 rounded-2xl text-[12px] font-semibold transition-all duration-200 ${
        iconOnly ? 'w-9 h-9 justify-center' : 'px-4 h-9'
      }`}
      style={{
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        background: 'var(--bg)',
        boxShadow: active
          ? 'inset 4px 4px 9px #C2C4D2, inset -4px -4px 9px #FFFFFF'
          : '4px 4px 9px #C5C7D4, -4px -4px 9px #FFFFFF',
        border: active ? '1px solid rgba(107,143,255,0.15)' : '1px solid transparent',
      }}
    >
      {children}
    </button>
  )
}
