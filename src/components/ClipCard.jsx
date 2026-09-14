import { useState } from 'react'
import { thumbnailUrl } from '../utils/api'

const SHOT_TYPE_SHORT = {
  wide: 'Wide', 'close-up': 'CU', crowd: 'Crowd', speaker: 'Spkr',
  worship: 'Wship', baptism: 'Bptm', outdoor: 'Out', kids: 'Kids',
  prayer: 'Pray', candid: 'Cndid',
}

const STATUS_COLORS = {
  unreviewed: '#9090A8',
  approved: '#2ECC71',
  in_use: '#6B8FFF',
  archived: '#AAAABC',
}
const STATUS_LABELS = {
  unreviewed: 'Unreviewed',
  approved: 'Approved',
  in_use: 'In Use',
  archived: 'Archived',
}

const CATEGORY_EMOJIS = {
  Worship: '🎵', Sermon: '📖', Baptism: '💧', 'Kids Ministry': '⭐',
  Events: '🎉', Unclassified: '📁',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function parseDate(clip) {
  // 1. Prefer EXIF/capture date from metadata
  if (clip.taken_at) {
    const d = new Date(clip.taken_at.replace(' ', 'T'))
    if (!isNaN(d)) return `${MONTHS[d.getMonth()]} ${d.getDate()}`
  }
  // 2. Try filename: YYYY-MM-DD pattern
  const m = clip.filename?.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${MONTHS[parseInt(m[2]) - 1]} ${parseInt(m[3])}`
  // 3. Fallback to date_ingested
  if (clip.date_ingested) {
    const d = new Date(clip.date_ingested)
    if (!isNaN(d)) return `${MONTHS[d.getMonth()]} ${d.getDate()}`
  }
  return null
}

export default function ClipCard({ clip, isSelected, onSelect, onStar, onLightbox, onContextMenu, onShotTypeClick, size = 'md' }) {
  const [thumbError, setThumbError] = useState(false)
  const [thumbLoaded, setThumbLoaded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [starring, setStarring] = useState(false)

  const duration = formatDuration(clip.duration_secs)
  const emoji = CATEGORY_EMOJIS[clip.category_name] || '📁'
  const isSmall = size === 'sm'
  const isStarred = !!clip.starred
  const dateLabel = parseDate(clip)

  const handleStar = async (e) => {
    e.stopPropagation()
    if (starring) return
    setStarring(true)
    try { await onStar?.(clip, !isStarred) }
    finally { setStarring(false) }
  }

  const handleCheckbox = (e) => {
    e.stopPropagation()
    // Simulate a meta-click to trigger multi-select in the parent
    onSelect?.({ ...e, metaKey: true, ctrlKey: false, shiftKey: false, _checkbox: true })
  }

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('application/beacon-clip', JSON.stringify({ id: clip.id, filename: clip.filename }))
  }

  const handleDoubleClick = (e) => {
    e.stopPropagation()
    onLightbox?.(clip)
  }

  const catColor = clip.category_color || null

  return (
    <div
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      draggable
      onDragStart={handleDragStart}
      onContextMenu={(e) => onContextMenu?.(e, clip)}
      className="relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 group select-none"
      style={{
        background: 'var(--bg)',
        border: isSelected
          ? '1px solid rgba(107,143,255,0.3)'
          : '1px solid rgba(255,255,255,0.7)',
        boxShadow: isSelected
          ? 'inset 4px 4px 10px #C2C4D2, inset -4px -4px 10px #FFFFFF, 0 0 0 3px rgba(107,143,255,0.18)'
          : hovered
            ? '8px 8px 20px #C0C2D0, -8px -8px 20px #FFFFFF'
            : '6px 6px 14px #C2C4D2, -6px -6px 14px #FFFFFF',
        transform: hovered && !isSelected ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      {/* Category accent stripe */}
      {catColor && !isSmall && (
        <div className="absolute top-0 left-0 right-0 h-[2px] z-10 rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, ${catColor} 0%, transparent 100%)`, opacity: 0.7 }} />
      )}

      {/* ── Thumbnail ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '16/9', background: 'var(--surface2)' }}>

        {/* Shimmer skeleton while loading */}
        {!thumbLoaded && clip.thumbnail_path && !thumbError && (
          <div className="absolute inset-0 z-10" style={{ background: 'linear-gradient(90deg, #D8DAE8 25%, #E8EAF2 50%, #D8DAE8 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
        )}

        {!thumbError && clip.thumbnail_path ? (
          <img
            src={thumbnailUrl(clip.id)}
            alt={clip.filename}
            className="w-full h-full object-cover transition-transform duration-500"
            style={{ transform: hovered ? 'scale(1.06)' : 'scale(1)', opacity: thumbLoaded ? 1 : 0, transition: 'transform 0.5s, opacity 0.3s' }}
            onLoad={() => setThumbLoaded(true)}
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl opacity-20">
            {emoji}
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 40%, transparent 70%)' }} />

        {/* Hover checkbox (top-left) */}
        {onStar && (
          <button
            onClick={handleCheckbox}
            className={`absolute top-1.5 left-1.5 w-6 h-6 flex items-center justify-center rounded-lg transition-all duration-150 ${
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            style={{
              background: isSelected ? 'rgba(107,143,255,0.9)' : 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(6px)',
              border: isSelected ? '1px solid rgba(107,143,255,0.6)' : '1px solid rgba(255,255,255,0.2)',
              boxShadow: isSelected ? '0 2px 8px rgba(107,143,255,0.4)' : 'none',
            }}
            title="Select clip"
          >
            {isSelected ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
              </svg>
            )}
          </button>
        )}

        {/* Play overlay for video */}
        {clip.media_type === 'video' && hovered && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
              style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style={{ transform: 'translateX(1px)' }}>
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          </div>
        )}

        {/* Duration badge */}
        {clip.media_type === 'video' && duration && (
          <div className="absolute bottom-1.5 right-1.5 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
            {duration}
          </div>
        )}
        {clip.media_type === 'photo' && (
          <div className="absolute bottom-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md tracking-wider"
            style={{ background: 'rgba(0,0,0,0.75)', color: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)' }}>
            IMG
          </div>
        )}

        {/* Date chip — bottom left */}
        {dateLabel && (
          <div className="absolute bottom-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)' }}>
            {dateLabel}
          </div>
        )}

        {/* Match type indicators */}
        {clip.match_type && (
          <div className="absolute top-2 left-8 flex gap-1">
            {(clip.match_type === 'visual' || clip.match_type === 'both') && (
              <span className="w-2 h-2 rounded-full shadow-sm" style={{ background: 'var(--match-visual)', boxShadow: '0 0 6px var(--match-visual)' }} title="Visual match" />
            )}
            {(clip.match_type === 'speech' || clip.match_type === 'both') && (
              <span className="w-2 h-2 rounded-full shadow-sm" style={{ background: 'var(--match-speech)', boxShadow: '0 0 6px var(--match-speech)' }} title="Speech match" />
            )}
          </div>
        )}

        {/* Color dot */}
        {clip.color_data?.dominant && !clip.match_type && (
          <div className="absolute top-2 left-8 w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: clip.color_data.dominant, border: '1.5px solid rgba(255,255,255,0.25)', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
            title={`${clip.color_data.dominant} · ${clip.color_data.family}`} />
        )}

        {/* Score badge */}
        {clip.score != null && (
          <div className="absolute top-2 right-2 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
            style={{ background: 'rgba(91,139,245,0.8)', backdropFilter: 'blur(4px)' }}>
            {Math.round(clip.score * 100)}%
          </div>
        )}

        {/* Shot type badge — clickable to filter */}
        {!isSmall && clip.shot_type && !clip.match_type && !clip.score && (
          <button
            onClick={(e) => { e.stopPropagation(); onShotTypeClick?.(clip.shot_type) }}
            className="absolute top-2 right-2 text-[8.5px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide transition-all hover:scale-105"
            style={{ background: 'rgba(91,139,245,0.85)', color: 'white', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.15)' }}
            title={`Filter by: ${SHOT_TYPE_SHORT[clip.shot_type] || clip.shot_type}`}
          >
            {SHOT_TYPE_SHORT[clip.shot_type] || clip.shot_type}
          </button>
        )}

        {/* Star button */}
        {onStar && (
          <button
            onClick={handleStar}
            className={`absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-xl transition-all duration-200 ${
              isStarred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            style={{
              background: isStarred ? 'rgba(245,185,68,0.9)' : 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(6px)',
              border: isStarred ? '1px solid rgba(245,185,68,0.6)' : '1px solid rgba(255,255,255,0.15)',
              boxShadow: isStarred ? '0 2px 12px rgba(245,185,68,0.4)' : 'none',
              transform: hovered ? 'scale(1)' : 'scale(0.85)',
            }}
            title={isStarred ? 'Remove from starred' : 'Star this clip'}
          >
            <svg width="11" height="11" viewBox="0 0 24 24"
              fill={isStarred ? 'white' : 'none'}
              stroke={isStarred ? 'white' : 'rgba(255,255,255,0.9)'}
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Info strip ────────────────────────────────────────── */}
      {!isSmall && (
        <div className="px-2.5 pt-2 pb-2.5 space-y-1" style={{ background: 'var(--bg)' }}>
          <div className="flex items-center justify-between gap-1.5">
            <p className="text-[12px] font-semibold truncate leading-tight flex-1" style={{ color: 'var(--text-primary)' }}>
              {clip.filename}
            </p>
            {(clip.rating || 0) > 0 && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {[1,2,3,4,5].map(s => (
                  <svg key={s} width="8" height="8" viewBox="0 0 24 24"
                    fill={s <= clip.rating ? '#F5B944' : 'none'}
                    stroke={s <= clip.rating ? '#F5B944' : 'var(--text-dim)'}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 min-w-0">
            {clip.category_name && (
              <>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: catColor || 'var(--text-dim)', boxShadow: catColor ? `0 0 4px ${catColor}80` : 'none' }} />
                <span className="text-[10px] font-semibold truncate"
                  style={{ color: catColor ? `${catColor}CC` : 'var(--text-dim)' }}>
                  {clip.category_name}
                </span>
              </>
            )}
            {/* Status badge — only show non-default statuses */}
            {clip.status && clip.status !== 'unreviewed' && (
              <span
                className="ml-auto flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                style={{
                  background: `${STATUS_COLORS[clip.status]}20`,
                  color: STATUS_COLORS[clip.status],
                  border: `1px solid ${STATUS_COLORS[clip.status]}40`,
                }}
                title={STATUS_LABELS[clip.status]}
              >
                {STATUS_LABELS[clip.status]}
              </span>
            )}
          </div>

          {/* Project tags */}
          {clip.projects?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {clip.projects.slice(0, 2).map((p) => (
                <span key={p.id} className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold"
                  style={{ background: `${p.color}20`, color: p.color, border: `1px solid ${p.color}40` }}>
                  {p.name}
                </span>
              ))}
              {clip.projects.length > 2 && (
                <span className="text-[9px] px-1 py-0.5 rounded-md"
                  style={{ color: 'var(--text-dim)', background: 'var(--surface3)' }}>
                  +{clip.projects.length - 2}
                </span>
              )}
            </div>
          )}

          {size === 'lg' && clip.description && (
            <p className="text-[11px] leading-snug line-clamp-2" style={{ color: 'var(--text-muted)' }}>{clip.description}</p>
          )}
          {size === 'lg' && clip.keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {clip.keywords.slice(0, 4).map((kw) => (
                <span key={kw} className="text-[9px] px-1.5 py-0.5 rounded-md font-medium"
                  style={{ background: 'var(--surface3)', border: '1px solid var(--border-solid)', color: 'var(--text-dim)' }}>
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Small mode: category dot */}
      {isSmall && clip.category_color && (
        <div className="absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full"
          style={{ backgroundColor: clip.category_color, border: '1px solid rgba(0,0,0,0.3)', boxShadow: `0 0 5px ${clip.category_color}80` }}
          title={clip.category_name} />
      )}
    </div>
  )
}

function formatDuration(secs) {
  if (!secs) return null
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
