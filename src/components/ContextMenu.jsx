import { useEffect, useRef, useState } from 'react'
import { thumbnailUrl, getShotLists, addClipToShotList } from '../utils/api'

const OPEN_IN_APPS = [
  { name: 'Final Cut Pro', icon: '🎬' },
  { name: 'DaVinci Resolve', icon: '🎥' },
  { name: 'QuickTime Player', icon: '▶️' },
  { name: 'Preview', icon: '🖼️' },
]

export default function ContextMenu({ x, y, clip, onClose, onLightbox, onStar, onRate, onSimilar, onFinder, onHide }) {
  const ref = useRef(null)
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showOpenIn, setShowOpenIn] = useState(false)
  const [showShotListMenu, setShowShotListMenu] = useState(false)
  const [shotLists, setShotLists] = useState([])

  useEffect(() => {
    getShotLists().then(d => setShotLists(d.shot_lists || [])).catch(() => {})
  }, [])

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const closeKey = (e) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => {
      window.addEventListener('mousedown', close)
      window.addEventListener('keydown', closeKey)
    }, 0)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', closeKey) }
  }, [onClose])

  const vw = window.innerWidth, vh = window.innerHeight
  const mw = 220, mh = 400
  const mx = x + mw > vw ? vw - mw - 8 : x
  const my = y + mh > vh ? vh - mh - 8 : y

  const isStarred = !!clip.starred
  const rating = clip.rating || 0

  const handleCopyImage = async () => {
    setCopying(true)
    try {
      const res = await fetch(thumbnailUrl(clip.id))
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopied(true)
      setTimeout(() => { setCopied(false); onClose() }, 1000)
    } catch (e) {
      console.error('Copy image failed:', e)
    } finally {
      setCopying(false)
    }
  }

  const handleOpenWith = (appName) => {
    window.beacon?.openWithApp(appName, clip.original_path)
    onClose()
  }

  const item = (icon, label, action, className = '') => (
    <button className={`ctx-item ${className}`} onClick={() => { action(); onClose() }}>
      <span className="w-4 flex-shrink-0 text-center opacity-70">{icon}</span>
      {label}
    </button>
  )

  return (
    <div ref={ref} className="ctx-menu" style={{ left: mx, top: my }}>
      {/* Open in Lightbox */}
      {item(
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>,
        'Open in Lightbox',
        () => onLightbox?.(clip)
      )}

      {/* Copy Image */}
      <button className="ctx-item" onClick={handleCopyImage} disabled={copying}>
        <span className="w-4 flex-shrink-0 text-center opacity-70">
          {copied ? '✓' : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
        </span>
        {copied ? 'Copied!' : copying ? 'Copying…' : 'Copy Image'}
      </button>

      {/* Open In... */}
      <div className="relative">
        <button
          className="ctx-item w-full"
          onClick={() => setShowOpenIn(v => !v)}
        >
          <span className="w-4 flex-shrink-0 text-center opacity-70">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </span>
          <span className="flex-1 text-left">Open In…</span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-40">
            {showOpenIn ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
          </svg>
        </button>
        {showOpenIn && (
          <div className="pl-5 pb-1">
            {OPEN_IN_APPS.map(app => (
              <button key={app.name} className="ctx-item text-[12px]" onClick={() => handleOpenWith(app.name)}>
                <span className="w-4 text-center text-sm">{app.icon}</span>
                {app.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ctx-sep" />

      {/* Star */}
      {item(
        <svg width="13" height="13" viewBox="0 0 24 24" fill={isStarred ? '#F5BA4A' : 'none'} stroke={isStarred ? '#F5BA4A' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>,
        isStarred ? 'Remove Star' : 'Star',
        () => onStar?.(clip, !isStarred)
      )}

      {/* Rating */}
      <div className="px-2.5 py-1.5">
        <p className="text-[9.5px] font-bold uppercase tracking-widest mb-2 px-0.5" style={{ color: 'var(--text-dim)' }}>Rating</p>
        <div className="flex items-center gap-1">
          {[1,2,3,4,5].map(s => (
            <button key={s} onClick={() => { onRate?.(clip, rating === s ? 0 : s); onClose() }} className="p-0.5 transition-transform hover:scale-110 rounded">
              <svg width="16" height="16" viewBox="0 0 24 24"
                fill={s <= rating ? '#F5BA4A' : 'none'}
                stroke={s <= rating ? '#F5BA4A' : 'var(--text-dim)'}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          ))}
          {rating > 0 && (
            <button onClick={() => { onRate?.(clip, 0); onClose() }}
              className="ml-1 text-[10px] px-1.5 py-0.5 rounded-md transition-colors"
              style={{ color: 'var(--text-dim)', background: 'var(--surface3)' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="ctx-sep" />

      {/* Add to Shot List */}
      <div className="relative">
        <button className="ctx-item w-full" onClick={() => setShowShotListMenu(v => !v)}>
          <span className="w-4 flex-shrink-0 text-center opacity-70">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </span>
          <span className="flex-1 text-left">Add to Shot List</span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-40">
            {showShotListMenu ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
          </svg>
        </button>
        {showShotListMenu && (
          <div className="pl-5 pb-1">
            {shotLists.length === 0 ? (
              <p className="px-3 py-2 text-[11px] italic" style={{ color: 'var(--text-dim)' }}>No shot lists yet</p>
            ) : (
              shotLists.map(sl => (
                <button key={sl.id} className="ctx-item" onClick={() => { addClipToShotList(sl.id, clip.id); onClose() }}>
                  <span className="w-4 flex-shrink-0 text-center opacity-60">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                      <line x1="8" y1="18" x2="21" y2="18"/>
                    </svg>
                  </span>
                  {sl.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Find Similar */}
      {item(
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
        'Find Similar',
        () => onSimilar?.(clip)
      )}

      {/* Show in Finder */}
      {item(
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
        'Show in Finder',
        () => window.beacon?.openInFinder(clip.original_path)
      )}

      <div className="ctx-sep" />

      {/* Hide */}
      {item(
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/></svg>,
        'Hide',
        () => onHide?.(clip),
        'danger'
      )}
    </div>
  )
}
