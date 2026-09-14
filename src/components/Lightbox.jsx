import { useEffect, useCallback, useState, useRef } from 'react'
import { rateClip, rotateClip } from '../utils/api'

const BASE_URL = 'http://localhost:7842'
const thumbUrl = (id, bust = 0) => `${BASE_URL}/thumbnail/${id}${bust ? `?v=${bust}` : ''}`

const SHOT_LABELS = {
  wide: 'Wide', 'close-up': 'Close-Up', crowd: 'Crowd', speaker: 'Speaker',
  worship: 'Worship', baptism: 'Baptism', outdoor: 'Outdoor', kids: 'Kids',
  prayer: 'Prayer', candid: 'Candid',
}

export default function Lightbox({ clips, initialIndex = 0, onClose, onStar, onRate }) {
  const [index, setIndex] = useState(initialIndex)
  const [bust, setBust] = useState(0)
  const [showInfo, setShowInfo] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [rotating, setRotating] = useState(false)
  const [ratingHover, setRatingHover] = useState(0)
  const [playing, setPlaying] = useState(false)
  const hideTimer = useRef(null)
  const slideshowRef = useRef(null)

  const clip = clips[index]

  useEffect(() => { setIndex(initialIndex) }, [initialIndex])
  useEffect(() => { setBust(0) }, [index])

  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  useEffect(() => {
    resetHideTimer()
    return () => clearTimeout(hideTimer.current)
  }, [index])

  const goNext = useCallback(() => setIndex(i => Math.min(i + 1, clips.length - 1)), [clips.length])
  const goPrev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), [])

  // Slideshow auto-advance
  useEffect(() => {
    clearInterval(slideshowRef.current)
    if (!playing) return
    slideshowRef.current = setInterval(() => {
      setIndex(i => {
        if (i >= clips.length - 1) { setPlaying(false); return i }
        return i + 1
      })
    }, 3000)
    return () => clearInterval(slideshowRef.current)
  }, [playing, clips.length])

  useEffect(() => {
    const onKey = (e) => {
      resetHideTimer()
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); goNext(); return }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setPlaying(false); goPrev(); return }
      if (e.key >= '1' && e.key <= '5') { onRate?.(clip, parseInt(e.key)); return }
      if (e.key === '0') { onRate?.(clip, 0); return }
      if (e.key === 's' || e.key === 'S') { onStar?.(clip, !clip.starred); return }
      if (e.key === 'i' || e.key === 'I') { setShowInfo(v => !v); return }
      if (e.key === 'p' || e.key === 'P') { setPlaying(v => !v); return }
      if (clip?.media_type === 'photo') {
        if (e.key === '[') handleRotate('ccw')
        if (e.key === ']') handleRotate('cw')
      }
    }
    window.addEventListener('keydown', onKey)
    const onMove = () => resetHideTimer()
    window.addEventListener('mousemove', onMove)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousemove', onMove) }
  }, [clip, goNext, goPrev, onClose, onStar, onRate, resetHideTimer])

  const handleRotate = async (dir) => {
    if (rotating || clip?.media_type !== 'photo') return
    setRotating(true)
    try { await rotateClip(clip.id, dir); setBust(b => b + 1) }
    finally { setRotating(false) }
  }

  if (!clip) return null

  const rating = clip.rating || 0
  const isPhoto = clip.media_type === 'photo'

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col select-none"
      style={{ background: '#0a0a0a', cursor: showControls ? 'default' : 'none' }}
      onMouseMove={resetHideTimer}
    >

      {/* ── Top control bar ─────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 h-14 transition-all duration-300"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)',
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
        }}
      >
        {/* Left — counter + shot type */}
        <div className="flex items-center gap-3">
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          <span className="text-white/50 text-[13px] font-medium tabular-nums">
            {index + 1} <span className="text-white/25">/</span> {clips.length}
          </span>
          {clip.shot_type && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest"
              style={{ background: 'rgba(75,126,232,0.25)', color: '#7BAAF7', border: '1px solid rgba(75,126,232,0.3)' }}>
              {SHOT_LABELS[clip.shot_type] || clip.shot_type}
            </span>
          )}
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-1.5">
          {isPhoto && (
            <>
              <TopBtn onClick={() => handleRotate('ccw')} title="Rotate left [" disabled={rotating}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
              </TopBtn>
              <TopBtn onClick={() => handleRotate('cw')} title="Rotate right ]" disabled={rotating}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
                </svg>
              </TopBtn>
              <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.12)' }} />
            </>
          )}
          <TopBtn onClick={() => setPlaying(v => !v)} title={playing ? 'Pause slideshow (P)' : 'Play slideshow (P)'} active={playing}>
            {playing ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
          </TopBtn>
          <TopBtn onClick={() => onStar?.(clip, !clip.starred)} title="Star (S)" active={clip.starred}>
            <svg width="14" height="14" viewBox="0 0 24 24"
              fill={clip.starred ? '#FBBF24' : 'none'}
              stroke={clip.starred ? '#FBBF24' : 'currentColor'}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </TopBtn>
          <TopBtn onClick={() => window.beacon?.openInFinder(clip.original_path)} title="Show in Finder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </TopBtn>
          <TopBtn onClick={() => window.beacon?.downloadClips([clip.original_path])} title="Download">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </TopBtn>
          <TopBtn onClick={() => setShowInfo(v => !v)} title="Info (I)" active={showInfo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </TopBtn>
        </div>
      </div>

      {/* ── Main image ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center relative min-h-0"
        onClick={() => { resetHideTimer(); setShowInfo(false) }}>

        {/* Prev zone */}
        <div
          className="absolute left-0 top-0 bottom-0 w-24 flex items-center justify-start pl-3 z-10 transition-opacity duration-200"
          style={{ opacity: index > 0 && showControls ? 1 : 0, cursor: index > 0 ? 'pointer' : 'default' }}
          onClick={(e) => { e.stopPropagation(); goPrev() }}
        >
          {index > 0 && (
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(8px)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </div>
          )}
        </div>

        {/* Image */}
        <img
          key={`${clip.id}-${bust}`}
          src={thumbUrl(clip.id, bust)}
          alt={clip.filename}
          className="max-w-full max-h-full object-contain"
          style={{ maxHeight: 'calc(100vh - 130px)', maxWidth: '100%', borderRadius: '2px' }}
          draggable={false}
          onClick={e => e.stopPropagation()}
        />

        {/* Next zone */}
        <div
          className="absolute right-0 top-0 bottom-0 w-24 flex items-center justify-end pr-3 z-10 transition-opacity duration-200"
          style={{ opacity: index < clips.length - 1 && showControls ? 1 : 0, cursor: index < clips.length - 1 ? 'pointer' : 'default' }}
          onClick={(e) => { e.stopPropagation(); goNext() }}
        >
          {index < clips.length - 1 && (
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(8px)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          )}
        </div>

        {/* Info slide-in panel */}
        {showInfo && (
          <div
            className="absolute right-0 top-0 bottom-0 w-72 flex flex-col overflow-y-auto z-20"
            style={{ background: 'rgba(12,12,16,0.92)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(255,255,255,0.07)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 space-y-4">
              <p className="text-white font-semibold text-[14px] break-words leading-snug">{clip.filename}</p>
              {clip.category_name && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ color: clip.category_color, background: `${clip.category_color}22`, border: `1px solid ${clip.category_color}44` }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: clip.category_color }} />
                  {clip.category_name}
                </span>
              )}
              {clip.date_ingested && (
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{clip.date_ingested.slice(0, 10)}</p>
              )}
              {clip.description && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Description</p>
                  <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{clip.description}</p>
                </div>
              )}
              {clip.keywords?.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>Keywords</p>
                  <div className="flex flex-wrap gap-1.5">
                    {clip.keywords.map(kw => (
                      <span key={kw} className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {clip.original_path && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Path</p>
                  <p className="text-[10px] font-mono break-all leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>{clip.original_path}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom bar — filename + rating ─────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 flex flex-col transition-all duration-300"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)',
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
        }}
      >
        {/* Filmstrip */}
        <FilmStrip clips={clips} index={index} onSelect={setIndex} bust={bust} />

        {/* Info row */}
        <div className="flex items-center justify-between px-6 pb-4 pt-2">
          <div className="min-w-0">
            <p className="text-white font-semibold text-[13px] truncate">{clip.filename}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {clip.category_name && (
                <span className="text-[11px] font-semibold" style={{ color: clip.category_color || 'rgba(255,255,255,0.4)' }}>
                  {clip.category_name}
                </span>
              )}
              {clip.date_ingested && (
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{clip.date_ingested.slice(0, 10)}</span>
              )}
            </div>
          </div>

          {/* Star rating */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-4">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map(s => (
                <button
                  key={s}
                  onMouseEnter={() => setRatingHover(s)}
                  onMouseLeave={() => setRatingHover(0)}
                  onClick={() => onRate?.(clip, rating === s ? 0 : s)}
                  className="p-0.5 transition-transform hover:scale-110"
                  title={`${s} star${s > 1 ? 's' : ''}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24"
                    fill={s <= (ratingHover || rating) ? '#FBBF24' : 'none'}
                    stroke={s <= (ratingHover || rating) ? '#FBBF24' : 'rgba(255,255,255,0.25)'}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </button>
              ))}
            </div>
            <p className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {rating > 0 ? `${rating} star${rating > 1 ? 's' : ''}  ·  ` : ''}Press 1–5 to rate
            </p>
          </div>
        </div>
      </div>

      {/* Keyboard hint (fades in briefly on open) */}
      <KeyboardHint />
    </div>
  )
}

/* ── Filmstrip ────────────────────────────────────────────────── */
function FilmStrip({ clips, index, onSelect, bust }) {
  const ref = useRef(null)
  const STRIP = 7  // show 7 thumbnails

  useEffect(() => {
    if (ref.current) {
      const btn = ref.current.querySelector(`[data-idx="${index}"]`)
      btn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [index])

  const start = Math.max(0, index - Math.floor(STRIP / 2))
  const visible = clips.slice(start, start + STRIP)

  return (
    <div ref={ref} className="flex items-center justify-center gap-1.5 px-6 pb-2 overflow-hidden">
      {visible.map((c, i) => {
        const globalIdx = start + i
        const isActive = globalIdx === index
        return (
          <button
            key={c.id}
            data-idx={globalIdx}
            onClick={() => onSelect(globalIdx)}
            className="flex-shrink-0 transition-all duration-150"
            style={{
              width: isActive ? 64 : 48,
              height: isActive ? 44 : 34,
              borderRadius: 4,
              overflow: 'hidden',
              border: isActive ? '2px solid rgba(255,255,255,0.9)' : '2px solid rgba(255,255,255,0.15)',
              opacity: isActive ? 1 : 0.55,
              transform: isActive ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            <img
              src={`${BASE_URL}/thumbnail/${c.id}${isActive && bust ? `?v=${bust}` : ''}`}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
            />
          </button>
        )
      })}
    </div>
  )
}

/* ── Top action button ────────────────────────────────────────── */
function TopBtn({ children, onClick, title, active, disabled }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
      style={{
        background: active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? 'white' : 'rgba(255,255,255,0.65)',
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = 'white' } }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = active ? 'white' : 'rgba(255,255,255,0.65)' }}
    >
      {children}
    </button>
  )
}

/* ── Keyboard hint (brief appearance on open) ─────────────────── */
function KeyboardHint() {
  const [show, setShow] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 2500)
    return () => clearTimeout(t)
  }, [])
  if (!show) return null
  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 transition-opacity duration-500"
      style={{ opacity: show ? 0.7 : 0 }}>
      <div className="flex items-center gap-3 px-4 py-2 rounded-full text-[11px]"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)' }}>
        <span>← → Navigate</span>
        <span className="opacity-40">·</span>
        <span>P Slideshow</span>
        <span className="opacity-40">·</span>
        <span>1–5 Rate</span>
        <span className="opacity-40">·</span>
        <span>S Star</span>
        <span className="opacity-40">·</span>
        <span>I Info</span>
        <span className="opacity-40">·</span>
        <span>Esc Close</span>
      </div>
    </div>
  )
}
