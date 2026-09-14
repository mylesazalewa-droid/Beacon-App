import { useState } from 'react'

const STEPS = [
  {
    icon: '▲',
    tag: 'Welcome to Beacon',
    title: 'Your church media\nlibrary, organized.',
    body: 'Beacon is a free, local, and private media manager built for church creative teams. Import your photos and videos, and let AI do the heavy lifting — no cloud, no subscription.',
    visual: 'hero',
  },
  {
    icon: '🔍',
    tag: 'Smart Search',
    title: 'Find any clip\nin seconds.',
    body: 'Search by what you see — "baptism crowd wide shot" or "worship hands raised." Beacon uses AI visual understanding, not just file names, to surface exactly what you need.',
    visual: 'search',
  },
  {
    icon: '🗂',
    tag: 'Auto-Organization',
    title: 'AI tags everything\nso you don\'t have to.',
    body: 'Every imported clip is automatically analyzed and tagged — shot type, colors, subjects, and descriptions generated locally on your Mac. Your data never leaves your machine.',
    visual: 'tags',
  },
  {
    icon: '👤',
    tag: 'Face Recognition',
    title: 'Find clips by\nwho\'s in them.',
    body: 'Beacon identifies faces across your entire library. Build a People directory, name your team and congregation, and filter clips by person instantly.',
    visual: 'people',
  },
  {
    icon: '📋',
    tag: 'Shot Lists & Projects',
    title: 'Plan shoots.\nDeliver faster.',
    body: 'Build shot lists before you shoot, then drag clips in after. Organize by project, export to PDF or Final Cut Pro XML, and share a ZIP with your editor.',
    visual: 'shotlist',
  },
  {
    icon: '📁',
    tag: 'Watch Folders',
    title: 'Import happens\nautomatically.',
    body: 'Drop a folder on your SD card or NAS and Beacon watches it. New media is ingested and analyzed in the background — ready by the time you sit down to edit.',
    visual: 'import',
  },
]

// ── Tiny inline visual illustrations ──────────────────────────────────────────
function Visual({ type }) {
  const base = {
    width: '100%', height: 160,
    borderRadius: 14,
    background: 'var(--surface3)',
    boxShadow: 'var(--neu-press-md)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
  }

  if (type === 'hero') return (
    <div style={base}>
      {/* grid of faux cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, padding: 12, width: '100%' }}>
        {[
          '#B5C8FF','#FFD6A5','#C3F0D6','#E0C4FF',
          '#FFB3B3','#C4E0FF','#FFF4B3','#C4D8FF',
        ].map((c, i) => (
          <div key={i} style={{
            height: 50, borderRadius: 8,
            background: c,
            boxShadow: 'var(--neu-raise-sm)',
            opacity: 0.85,
          }}/>
        ))}
      </div>
      {/* accent pill overlay */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        background: 'var(--grad-accent)',
        color: '#fff', fontSize: 10, fontWeight: 700,
        padding: '4px 10px', borderRadius: 20,
        boxShadow: '0 2px 8px rgba(107,143,255,0.4)',
        letterSpacing: '0.05em',
      }}>AI ANALYZED</div>
    </div>
  )

  if (type === 'search') return (
    <div style={base}>
      <div style={{ width: '85%' }}>
        {/* faux search bar */}
        <div style={{
          background: 'var(--surface4)',
          borderRadius: 10, padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: 'var(--neu-press-sm)',
          marginBottom: 12,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>baptism crowd wide shot…</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>AI MATCH</span>
        </div>
        {/* faux result rows */}
        {['Wide — Crowd — Baptism Pool', 'Overhead — Water — Congregation'].map((label, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 8, marginBottom: 6,
            background: i === 0 ? 'rgba(107,143,255,0.08)' : 'var(--surface4)',
            boxShadow: 'var(--neu-raise-sm)',
          }}>
            <div style={{ width: 28, height: 20, borderRadius: 4, background: i === 0 ? '#B5C8FF' : '#C4D8FF', flexShrink: 0 }}/>
            <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )

  if (type === 'tags') return (
    <div style={base}>
      <div style={{ padding: 16, width: '100%' }}>
        {/* description row */}
        <div style={{
          fontSize: 10, color: 'var(--text-muted)', marginBottom: 10,
          background: 'var(--surface4)', borderRadius: 8,
          padding: '7px 10px', boxShadow: 'var(--neu-raise-sm)',
        }}>
          "Worship team on stage, arms raised, warm stage lighting…"
        </div>
        {/* tag chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {['Worship','Stage','Wide','Warm Light','Arms Raised','People','Indoor','Evening'].map((t, i) => (
            <span key={i} style={{
              fontSize: 9.5, fontWeight: 600,
              padding: '3px 8px', borderRadius: 20,
              background: i % 3 === 0 ? 'rgba(107,143,255,0.12)' : i % 3 === 1 ? 'rgba(160,127,255,0.1)' : 'var(--surface4)',
              color: i % 3 === 0 ? 'var(--accent)' : i % 3 === 1 ? 'var(--accent2)' : 'var(--text-muted)',
              boxShadow: 'var(--neu-raise-sm)',
            }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )

  if (type === 'people') return (
    <div style={base}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 20, justifyContent: 'center' }}>
        {[
          { initials: 'JP', color: '#B5C8FF', name: 'James P.' },
          { initials: 'SR', color: '#FFD6A5', name: 'Sarah R.' },
          { initials: 'MT', color: '#C3F0D6', name: 'Mike T.' },
          { initials: 'AL', color: '#E0C4FF', name: 'Amy L.' },
          { initials: 'DK', color: '#FFB3B3', name: 'David K.' },
          { initials: '?',  color: '#ECEDF4', name: 'Unknown' },
        ].map(({ initials, color, name }, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: color, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 12, fontWeight: 700,
              color: 'var(--text-primary)', boxShadow: 'var(--neu-raise-sm)',
            }}>{initials}</div>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  )

  if (type === 'shotlist') return (
    <div style={base}>
      <div style={{ width: '85%' }}>
        {/* list header */}
        <div style={{
          fontSize: 10, fontWeight: 700, color: 'var(--accent)',
          marginBottom: 8, paddingLeft: 4,
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>Easter Sunday — Shot List</div>
        {[
          { label: 'Wide — Stage Full Band', status: '✓', done: true },
          { label: 'Overhead — Baptism Pool', status: '✓', done: true },
          { label: 'Close-Up — Pastor Speaking', status: '…', done: false },
          { label: 'B-Roll — Congregation Rows', status: '–', done: false },
        ].map(({ label, status, done }, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 10px', borderRadius: 8, marginBottom: 5,
            background: 'var(--surface4)', boxShadow: 'var(--neu-raise-sm)',
            opacity: done ? 0.6 : 1,
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
              background: done ? 'rgba(107,143,255,0.25)' : 'var(--surface3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: 'var(--accent)',
            }}>{status}</div>
            <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )

  if (type === 'import') return (
    <div style={{ ...base, flexDirection: 'column', gap: 10 }}>
      {/* Watch folder row */}
      <div style={{
        width: '80%', padding: '8px 14px', borderRadius: 10,
        background: 'var(--surface4)', boxShadow: 'var(--neu-raise-sm)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>📁</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Easter 2025 / SD</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Watching • 3 new files detected</div>
        </div>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--green)',
          boxShadow: '0 0 6px rgba(92,200,160,0.6)',
        }}/>
      </div>
      {/* Progress bar */}
      <div style={{ width: '80%' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 9, color: 'var(--text-muted)', marginBottom: 5,
        }}>
          <span>Analyzing with AI…</span><span>48 / 63</span>
        </div>
        <div style={{
          height: 6, borderRadius: 6,
          background: 'var(--surface3)', boxShadow: 'var(--neu-press-sm)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: '76%', height: '100%',
            background: 'var(--grad-accent)',
            borderRadius: 6,
          }}/>
        </div>
      </div>
    </div>
  )

  return <div style={base}/>
}

// ── Step dots ──────────────────────────────────────────────────────────────────
function Dots({ total, current }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 18 : 6,
          height: 6, borderRadius: 6,
          transition: 'width 0.3s ease, background 0.3s ease',
          background: i === current ? 'var(--accent)' : 'var(--text-dim)',
        }}/>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function WelcomeScreen({ onDismiss }) {
  const [step, setStep] = useState(0)
  const [exiting, setExiting] = useState(false)

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  function next() {
    if (isLast) {
      handleDone()
    } else {
      setStep(s => s + 1)
    }
  }

  function prev() {
    if (step > 0) setStep(s => s - 1)
  }

  function handleDone() {
    setExiting(true)
    setTimeout(() => {
      localStorage.setItem('beacon_welcomed', '1')
      onDismiss()
    }, 320)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(30,31,46,0.55)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      animation: exiting ? 'beacon-fade-out 0.32s ease forwards' : 'beacon-fade-in 0.35s ease',
    }}>
      {/* Card */}
      <div style={{
        width: 440,
        background: 'var(--surface)',
        borderRadius: 22,
        boxShadow: '20px 20px 50px #BEBFCE, -20px -20px 50px #FFFFFF, 0 0 0 1px rgba(0,0,0,0.04)',
        padding: '32px 32px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        animation: exiting ? 'beacon-card-out 0.32s ease forwards' : 'beacon-card-in 0.38s cubic-bezier(0.34,1.56,0.64,1)',
        userSelect: 'none',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo mark */}
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--grad-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '4px 4px 10px rgba(107,143,255,0.35), -2px -2px 6px rgba(255,255,255,0.8)',
            fontSize: 17, color: '#fff', fontWeight: 700,
          }}>▲</div>

          {/* Skip — only on non-last steps */}
          {!isLast && (
            <button onClick={handleDone} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--text-dim)',
              padding: '4px 8px', borderRadius: 6,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.target.style.color = 'var(--text-muted)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
            >Skip intro</button>
          )}
        </div>

        {/* Illustration */}
        <Visual type={current.visual} />

        {/* Tag pill */}
        <div style={{
          display: 'inline-flex', alignSelf: 'flex-start',
          alignItems: 'center', gap: 6,
          background: 'rgba(107,143,255,0.1)',
          borderRadius: 20, padding: '3px 10px',
        }}>
          <span style={{ fontSize: 12 }}>{current.icon}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {current.tag}
          </span>
        </div>

        {/* Title */}
        <div>
          <h2 style={{
            margin: 0,
            fontSize: 22, fontWeight: 800,
            lineHeight: 1.2,
            color: 'var(--text-primary)',
            whiteSpace: 'pre-line',
            letterSpacing: '-0.02em',
          }}>{current.title}</h2>
        </div>

        {/* Body */}
        <p style={{
          margin: 0,
          fontSize: 13, lineHeight: 1.65,
          color: 'var(--text-muted)',
        }}>{current.body}</p>

        {/* Footer row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          {/* Dots */}
          <Dots total={STEPS.length} current={step} />

          {/* Nav buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button onClick={prev} style={{
                height: 38, padding: '0 18px',
                borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'var(--surface)',
                boxShadow: 'var(--neu-raise-sm)',
                fontSize: 13, fontWeight: 600,
                color: 'var(--text-muted)',
                transition: 'box-shadow 0.15s, transform 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--neu-raise-md)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--neu-raise-sm)' }}
              onMouseDown={e => { e.currentTarget.style.boxShadow = 'var(--neu-press-sm)'; e.currentTarget.style.transform = 'scale(0.97)' }}
              onMouseUp={e => { e.currentTarget.style.boxShadow = 'var(--neu-raise-sm)'; e.currentTarget.style.transform = 'scale(1)' }}
              >← Back</button>
            )}
            <button onClick={next} style={{
              height: 38, padding: '0 22px',
              borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'var(--grad-accent)',
              boxShadow: '4px 4px 12px rgba(107,143,255,0.35), -2px -2px 8px rgba(255,255,255,0.7)',
              fontSize: 13, fontWeight: 700,
              color: '#fff',
              transition: 'opacity 0.15s, transform 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >{isLast ? '🚀 Get Started' : 'Next →'}</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes beacon-fade-in {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes beacon-fade-out {
          from { opacity: 1 }
          to   { opacity: 0 }
        }
        @keyframes beacon-card-in {
          from { opacity: 0; transform: scale(0.88) translateY(16px) }
          to   { opacity: 1; transform: scale(1) translateY(0) }
        }
        @keyframes beacon-card-out {
          from { opacity: 1; transform: scale(1) translateY(0) }
          to   { opacity: 0; transform: scale(0.92) translateY(12px) }
        }
      `}</style>
    </div>
  )
}
