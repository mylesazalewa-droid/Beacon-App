import { useState } from 'react'
import { THEMES, getTheme, applyTheme } from '../../utils/theme'

export default function ThemePicker() {
  const [current, setCurrent] = useState(getTheme())

  const handleSelect = (id) => {
    applyTheme(id)
    setCurrent(id)
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary">Appearance</h3>
        <p className="text-[11px] text-text-muted mt-0.5">Choose a color theme for the interface.</p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            onClick={() => handleSelect(theme.id)}
            className={`relative rounded-xl overflow-hidden border-2 transition-all text-left ${
              current === theme.id
                ? 'border-accent shadow-lg shadow-accent/20'
                : 'border-border hover:border-text-dim'
            }`}
          >
            {/* Mini preview */}
            <div className="h-16 flex" style={{ backgroundColor: theme.bg }}>
              {/* Sidebar strip */}
              <div className="w-6 h-full" style={{ backgroundColor: theme.bg, borderRight: `1px solid ${theme.accent}22` }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="mx-1 mt-1.5 rounded-sm h-1" style={{ backgroundColor: i === 0 ? theme.accent : `${theme.accent}44` }} />
                ))}
              </div>
              {/* Content area */}
              <div className="flex-1 p-1.5 space-y-1">
                <div className="h-1.5 rounded w-3/4" style={{ backgroundColor: `${theme.accent}80` }} />
                <div className="grid grid-cols-2 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-4 rounded" style={{ backgroundColor: `${theme.accent}25` }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Label */}
            <div className="px-2 py-1.5" style={{ backgroundColor: theme.bg }}>
              <p className="text-[11px] font-semibold" style={{ color: '#E8E8F0' }}>{theme.label}</p>
              <p className="text-[9px]" style={{ color: '#888' }}>{theme.desc}</p>
            </div>

            {/* Accent dot */}
            <div
              className="absolute top-1.5 right-1.5 w-3 h-3 rounded-full border-2 border-white/20"
              style={{ backgroundColor: theme.accent }}
            />

            {/* Selected checkmark */}
            {current === theme.id && (
              <div
                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ backgroundColor: theme.accent }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
