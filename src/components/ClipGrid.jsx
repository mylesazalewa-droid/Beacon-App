import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import ClipCard from './ClipCard'
import ContextMenu from './ContextMenu'
import { thumbnailUrl } from '../utils/api'

const SHOT_LABELS = {
  wide: 'Wide', 'close-up': 'Close-Up', crowd: 'Crowd', speaker: 'Speaker',
  worship: 'Worship', baptism: 'Baptism', outdoor: 'Outdoor', kids: 'Kids',
  prayer: 'Prayer', candid: 'Candid',
}

const SORT_OPTIONS = [
  { value: 'newest',  label: 'Newest first' },
  { value: 'oldest',  label: 'Oldest first' },
  { value: 'name',    label: 'Name A–Z' },
  { value: 'rating',  label: 'Highest rated' },
  { value: 'size',    label: 'Largest file' },
]

function formatSize(bytes) {
  if (!bytes) return null
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${Math.round(bytes / 1e3)} KB`
}

export default function ClipGrid({
  clips, selectedClip, selectedClips, onSelect, onStar, onRate, onLightbox,
  query, onClearSearch, onIngest, onShowSimilar, onHide, activeColorFilter, onClearColorFilter,
  activeShotType, onSelectShotType, onClearShotType, onOpenSettings,
}) {
  const [mediaFilter, setMediaFilter] = useState('all')
  const [sortBy, setSortBy]           = useState('newest')
  const [gridMin, setGridMin]         = useState(200)
  const [showSort, setShowSort]       = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [balloon, setBalloon]         = useState(null) // { clip, rect }
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)
  const balloonTimer = useRef(null)
  const sortRef = useRef(null)
  const dateRef = useRef(null)

  useEffect(() => {
    if (!showSort) return
    const close = (e) => { if (sortRef.current && !sortRef.current.contains(e.target)) setShowSort(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [showSort])

  useEffect(() => {
    if (!showDateFilter) return
    const close = (e) => { if (dateRef.current && !dateRef.current.contains(e.target)) setShowDateFilter(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [showDateFilter])

  // Filter + sort
  const processed = useMemo(() => {
    let arr = clips
    if (mediaFilter === 'photo') arr = arr.filter(c => c.media_type === 'photo' || c.media_type === 'image' || c.media_type === 'heic')
    if (mediaFilter === 'video') arr = arr.filter(c => c.media_type === 'video')
    if (dateFrom) arr = arr.filter(c => c.date_ingested && c.date_ingested.slice(0, 10) >= dateFrom)
    if (dateTo)   arr = arr.filter(c => c.date_ingested && c.date_ingested.slice(0, 10) <= dateTo)
    return [...arr].sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return (a.date_ingested || '').localeCompare(b.date_ingested || '')
        case 'name':   return (a.filename || '').localeCompare(b.filename || '')
        case 'rating': return (b.rating || 0) - (a.rating || 0)
        case 'size':   return (b.file_size_bytes || 0) - (a.file_size_bytes || 0)
        default:       return (b.date_ingested || '').localeCompare(a.date_ingested || '')
      }
    })
  }, [clips, mediaFilter, sortBy, dateFrom, dateTo])

  // Stats for status bar
  const stats = useMemo(() => {
    const photos = processed.filter(c => c.media_type === 'photo' || c.media_type === 'image' || c.media_type === 'heic').length
    const videos = processed.filter(c => c.media_type === 'video').length
    const totalBytes = processed.reduce((s, c) => s + (c.file_size_bytes || 0), 0)
    return { photos, videos, totalBytes }
  }, [processed])

  const handleContextMenu = useCallback((e, clip) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, clip })
  }, [])

  const handleCardMouseEnter = useCallback((e, clip) => {
    const rect = e.currentTarget.getBoundingClientRect()
    balloonTimer.current = setTimeout(() => {
      setBalloon({ clip, rect })
    }, 650)
  }, [])

  const handleCardMouseLeave = useCallback(() => {
    clearTimeout(balloonTimer.current)
    setBalloon(null)
  }, [])

  const zoomPct = Math.round(((gridMin - 140) / (380 - 140)) * 100)

  // Active filter chips — sort is intentionally excluded (the sort button label already shows it)
  const activeFilters = []
  if (mediaFilter !== 'all') activeFilters.push({ key: 'media', label: mediaFilter === 'photo' ? '📷 Photos' : '🎬 Videos', clear: () => setMediaFilter('all') })
  if (activeColorFilter) activeFilters.push({ key: 'color', label: `🎨 ${activeColorFilter}`, clear: onClearColorFilter })
  if (activeShotType) activeFilters.push({ key: 'shot', label: `🎬 ${SHOT_LABELS[activeShotType] || activeShotType}`, clear: onClearShotType })
  if (dateFrom || dateTo) {
    const label = dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : dateFrom ? `From ${dateFrom}` : `To ${dateTo}`
    activeFilters.push({ key: 'date', label: `📅 ${label}`, clear: () => { setDateFrom(''); setDateTo('') } })
  }
  if (query) activeFilters.push({ key: 'search', label: `"${query}"`, clear: onClearSearch })

  if (!clips.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8" style={{ background: 'var(--bg)' }}>
        {query ? (
          <>
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-solid)' }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl flex items-center justify-center text-lg"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}>🤔</div>
            </div>
            <p className="font-bold text-[18px] mb-2" style={{ color: 'var(--text-primary)' }}>No results for "{query}"</p>
            <p className="text-[13px] mb-5 max-w-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Try different keywords or browse by category. For visual queries like "smile" or "two people", AI embeddings must be generated first.
            </p>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <button onClick={onClearSearch} className="btn-secondary px-6 h-9 rounded-xl text-[12px] font-semibold">
                Clear Search
              </button>
              {onOpenSettings && (
                <button onClick={onOpenSettings}
                  className="flex items-center gap-1.5 px-5 h-9 rounded-xl text-[12px] font-semibold transition-all"
                  style={{ background: 'rgba(107,143,255,0.1)', color: 'var(--accent)', border: '1px solid rgba(107,143,255,0.25)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                  Generate AI Embeddings
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-solid)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="2" y="2" width="20" height="14" rx="2"/>
                  <path d="M9 22h6M12 18v4"/>
                  <path d="m10 9 5-3-5-3z" fill="var(--text-dim)"/>
                </svg>
              </div>
            </div>
            <p className="font-bold text-[18px] mb-2" style={{ color: 'var(--text-primary)' }}>No footage yet</p>
            <p className="text-[13px] mb-6" style={{ color: 'var(--text-muted)' }}>Import a folder of photos or videos to get started</p>
            <button onClick={onIngest} className="btn-primary px-7 h-10 rounded-xl text-[13px]">
              Import Footage
            </button>
          </>
        )}
      </div>
    )
  }

  const sortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Sort'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 h-[48px] flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'var(--bg)' }}>

        {/* Media type pills */}
        <div className="flex items-center gap-1.5">
          {[
            { key: 'all',   label: 'All' },
            { key: 'photo', label: '📷 Photos' },
            { key: 'video', label: '🎬 Videos' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setMediaFilter(key)}
              className="px-4 h-8 rounded-2xl text-[12px] font-semibold transition-all duration-150"
              style={{
                background: 'var(--bg)',
                color: mediaFilter === key ? 'var(--accent)' : 'var(--text-muted)',
                boxShadow: mediaFilter === key
                  ? 'inset 3px 3px 7px #C5C7D4, inset -3px -3px 7px #FFFFFF'
                  : '3px 3px 7px #C5C7D4, -3px -3px 7px #FFFFFF',
                border: mediaFilter === key ? '1px solid rgba(107,143,255,0.15)' : '1px solid rgba(255,255,255,0.7)',
              }}>{label}</button>
          ))}
        </div>

        {/* Date range filter button */}
        <div className="relative flex-shrink-0" ref={dateRef}>
          <button
            onClick={() => setShowDateFilter(v => !v)}
            className="flex items-center gap-1.5 px-3 h-8 rounded-2xl text-[11.5px] font-semibold transition-all duration-150"
            style={{
              background: 'var(--bg)',
              color: (dateFrom || dateTo) ? 'var(--accent)' : 'var(--text-muted)',
              boxShadow: (dateFrom || dateTo)
                ? 'inset 3px 3px 7px #C5C7D4, inset -3px -3px 7px #FFFFFF'
                : '3px 3px 7px #C5C7D4, -3px -3px 7px #FFFFFF',
              border: (dateFrom || dateTo) ? '1px solid rgba(107,143,255,0.15)' : '1px solid rgba(255,255,255,0.7)',
            }}
            title="Filter by date range"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>Date</span>
          </button>

          {showDateFilter && (
            <div className="absolute top-full left-0 mt-1.5 z-50 rounded-2xl p-3 flex flex-col gap-2"
              style={{ background: 'var(--bg)', border: '1px solid var(--border-mid)', boxShadow: 'var(--shadow-menu)', minWidth: 220 }}
              onMouseDown={e => e.stopPropagation()}
            >
              <p className="text-[9.5px] font-bold uppercase tracking-widest px-0.5" style={{ color: 'var(--text-dim)' }}>Date range (imported)</p>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] w-6 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>From</span>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="flex-1 h-7 px-2 rounded-lg text-[11px]"
                    style={{ background: 'var(--bg)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', boxShadow: 'var(--neu-press-sm)', colorScheme: 'light' }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] w-6 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>To</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="flex-1 h-7 px-2 rounded-lg text-[11px]"
                    style={{ background: 'var(--bg)', color: 'var(--text-primary)', border: '1px solid var(--border-mid)', boxShadow: 'var(--neu-press-sm)', colorScheme: 'light' }} />
                </div>
              </div>
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); setShowDateFilter(false) }}
                  className="w-full h-7 rounded-lg text-[11px] font-semibold transition-colors mt-0.5"
                  style={{ color: 'var(--text-dim)', background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)' }}
                >
                  Clear dates
                </button>
              )}
            </div>
          )}
        </div>

        {/* Clip count */}
        <span className="text-[11px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
          {processed.length}{mediaFilter !== 'all' || sortBy !== 'newest' || dateFrom || dateTo ? ` of ${clips.length}` : ''}
        </span>

        {/* Active filter chips — left of spacer so they never crowd right-side controls */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {activeFilters.map(f => (
              <button key={f.key} onClick={f.clear}
                className="flex items-center gap-1 px-2.5 h-6 rounded-full text-[10.5px] font-semibold transition-all"
                style={{ background: 'rgba(107,143,255,0.1)', color: 'var(--accent)', border: '1px solid rgba(107,143,255,0.2)' }}>
                {f.label}
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-60">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Sort dropdown */}
        <div className="relative flex-shrink-0" ref={sortRef}>
          <button onClick={() => setShowSort(v => !v)}
            className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-[11.5px] font-semibold transition-all"
            style={{
              background: showSort ? 'var(--surface3)' : 'var(--surface)',
              color: sortBy !== 'newest' ? 'var(--accent)' : 'var(--text-muted)',
              border: sortBy !== 'newest' ? '1px solid rgba(107,143,255,0.25)' : '1px solid var(--border-solid)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { if (!showSort) { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = sortBy !== 'newest' ? 'var(--accent)' : 'var(--text-muted)' } }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M3 6h18M7 12h10M11 18h2"/>
            </svg>
            {sortLabel}
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-60">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {showSort && (
            <div className="absolute right-0 top-full mt-1.5 rounded-2xl overflow-hidden z-50 py-1"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border-mid)', boxShadow: 'var(--shadow-menu)', minWidth: 170 }}>
              {SORT_OPTIONS.map(o => (
                <button key={o.value}
                  onClick={() => { setSortBy(o.value); setShowSort(false) }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[12px] font-medium transition-all"
                  style={{ color: sortBy === o.value ? 'var(--accent)' : 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = sortBy === o.value ? 'var(--accent)' : 'var(--text-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = sortBy === o.value ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  {sortBy === o.value && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                  <span className={sortBy === o.value ? '' : 'ml-[18px]'}>{o.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          <input type="range" min={140} max={380} step={10} value={gridMin}
            onChange={e => setGridMin(Number(e.target.value))}
            className="zoom-slider" style={{ '--pct': `${zoomPct}%`, width: 80 }}
            title={`Card size: ${gridMin}px`} />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
            <rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/>
            <rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>
          </svg>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
        {processed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="text-4xl mb-3 opacity-30">{mediaFilter === 'photo' ? '📷' : '🎬'}</div>
            <p className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
              No {mediaFilter === 'photo' ? 'photos' : 'videos'} in this view
            </p>
            <button onClick={() => setMediaFilter('all')}
              className="mt-3 text-[12px] font-semibold transition-colors"
              style={{ color: 'var(--accent)' }}>Show all media</button>
          </div>
        ) : (
          <div className="p-3" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${gridMin}px, 1fr))`, gap: 10 }}>
            {processed.map((clip) => (
              <div
                key={clip.id}
                onMouseEnter={(e) => handleCardMouseEnter(e, clip)}
                onMouseLeave={handleCardMouseLeave}
              >
                <ClipCard
                  clip={clip}
                  isSelected={selectedClip?.id === clip.id || selectedClips?.has(clip.id)}
                  onSelect={(e) => onSelect(clip, e)}
                  onStar={onStar}
                  onLightbox={onLightbox}
                  onContextMenu={handleContextMenu}
                  onShotTypeClick={onSelectShotType}
                  size={gridMin < 170 ? 'sm' : gridMin > 280 ? 'lg' : 'md'}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center gap-3 px-4 h-[32px] flex-shrink-0 text-[10.5px]"
        style={{ borderTop: '1px solid rgba(0,0,0,0.05)', background: 'var(--bg)', color: 'var(--text-dim)' }}>
        <span className="font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>{processed.length}</span>
        <span>clips</span>
        {stats.photos > 0 && <><span className="opacity-30">·</span><span>{stats.photos} photos</span></>}
        {stats.videos > 0 && <><span className="opacity-30">·</span><span>{stats.videos} videos</span></>}
        {stats.totalBytes > 0 && <><span className="opacity-30">·</span><span className="ml-auto">{formatSize(stats.totalBytes)}</span></>}
      </div>

      {/* ── Hover balloon preview ── */}
      {balloon && (
        <BalloonPreview balloon={balloon} onClose={() => setBalloon(null)} />
      )}

      {/* ── Context menu ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y} clip={contextMenu.clip}
          onClose={() => setContextMenu(null)}
          onLightbox={onLightbox} onStar={onStar} onRate={onRate}
          onSimilar={onShowSimilar} onHide={onHide}
        />
      )}
    </div>
  )
}

function BalloonPreview({ balloon }) {
  const { clip, rect } = balloon
  const [thumbError, setThumbError] = useState(false)

  // Position: try above the card, fallback below
  const W = 280, H = 180
  const vw = window.innerWidth, vh = window.innerHeight
  let left = rect.left + (rect.width - W) / 2
  let top = rect.top - H - 12
  if (top < 8) top = rect.bottom + 12
  if (left < 8) left = 8
  if (left + W > vw - 8) left = vw - W - 8

  return (
    <div
      className="fixed z-[200] pointer-events-none rounded-2xl overflow-hidden"
      style={{
        left, top, width: W,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)',
        border: '1px solid rgba(255,255,255,0.8)',
        background: 'var(--bg)',
      }}
    >
      <div style={{ aspectRatio: '16/9', background: 'var(--surface2)', position: 'relative' }}>
        {!thumbError && clip.thumbnail_path ? (
          <img src={thumbnailUrl(clip.id)} alt={clip.filename} className="w-full h-full object-cover" onError={() => setThumbError(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">📷</div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)' }} />
        {clip.category_name && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: clip.category_color || 'white' }} />
            <span className="text-white text-[10px] font-semibold">{clip.category_name}</span>
          </div>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{clip.filename}</p>
        {clip.description && <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{clip.description}</p>}
      </div>
    </div>
  )
}
