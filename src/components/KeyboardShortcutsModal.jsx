import { useEffect } from 'react'

const SECTIONS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'K'], desc: 'Focus search bar' },
      { keys: ['←', '→'], desc: 'Navigate clips' },
      { keys: ['Space'], desc: 'Open selected in Lightbox' },
      { keys: ['Esc'], desc: 'Close / clear selection' },
    ],
  },
  {
    title: 'Clip Actions',
    shortcuts: [
      { keys: ['S'], desc: 'Star / unstar clip' },
      { keys: ['1', '–', '5'], desc: 'Rate clip (in Lightbox)' },
      { keys: ['0'], desc: 'Clear rating' },
      { keys: ['I'], desc: 'Toggle info panel' },
    ],
  },
  {
    title: 'Lightbox',
    shortcuts: [
      { keys: ['←', '→'], desc: 'Previous / Next clip' },
      { keys: ['P'], desc: 'Play / pause slideshow' },
      { keys: ['['], desc: 'Rotate photo left' },
      { keys: [']'], desc: 'Rotate photo right' },
      { keys: ['Esc'], desc: 'Close Lightbox' },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: ['⌘', 'click'], desc: 'Add / remove from selection' },
      { keys: ['Shift', 'click'], desc: 'Range select' },
      { keys: ['Esc'], desc: 'Clear all selection' },
    ],
  },
]

export default function KeyboardShortcutsModal({ onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: 'var(--bg)',
          boxShadow: '16px 16px 48px #BBBDCC, -8px -8px 32px rgba(255,255,255,0.9)',
          border: '1px solid rgba(255,255,255,0.8)',
          width: 560,
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div>
            <h2 className="text-[16px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Keyboard Shortcuts
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
              Press ? anytime to show this panel
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
            style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border-solid)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--surface3)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--surface2)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Sections */}
        <div className="p-5 grid grid-cols-2 gap-5">
          {SECTIONS.map(section => (
            <div key={section.title}>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] mb-2.5 px-0.5"
                style={{ color: 'var(--text-dim)' }}>
                {section.title}
              </p>
              <div className="space-y-1">
                {section.shortcuts.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)' }}>
                    <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{s.desc}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {s.keys.map((k, ki) => (
                        k === '–' || k === '/' ? (
                          <span key={ki} className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{k}</span>
                        ) : (
                          <kbd key={ki}
                            className="inline-flex items-center justify-center px-2 h-[22px] rounded-lg text-[10.5px] font-semibold font-mono"
                            style={{
                              background: 'var(--bg)',
                              color: 'var(--text-primary)',
                              boxShadow: '2px 2px 5px #C5C7D4, -2px -2px 5px #FFFFFF',
                              border: '1px solid rgba(255,255,255,0.7)',
                              minWidth: 24,
                            }}>
                            {k}
                          </kbd>
                        )
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 pb-5">
          <p className="text-center text-[10.5px]" style={{ color: 'var(--text-dim)' }}>
            Click anywhere outside to dismiss
          </p>
        </div>
      </div>
    </div>
  )
}
