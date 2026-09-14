import { useState, useEffect } from 'react'

// ── Content ────────────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'getting-started',
    icon: '🚀',
    label: 'Getting Started',
    content: [
      {
        heading: 'Welcome to Beacon',
        body: 'Beacon is a free, local, open-source media library for church creative teams. All AI processing happens on your Mac — your photos and videos never leave your machine.',
      },
      {
        heading: '1 — Import your first folder',
        body: 'Click Import in the sidebar (or press ⌘O). You can import a full folder, drag individual files onto the app, or add a Watch Folder so new media is picked up automatically.',
      },
      {
        heading: '2 — Let AI analyze your clips',
        body: 'After import Beacon generates thumbnails, writes descriptions, assigns tags, detects faces, and builds visual embeddings. A progress bar appears at the bottom while this runs.',
      },
      {
        heading: '3 — Search and browse',
        body: 'Use the search bar (⌘K) to find clips by description. Try natural language like "baptism crowd wide" or "worship hands raised" — Beacon searches meaning, not just file names.',
      },
    ],
  },
  {
    id: 'library',
    icon: '🗂',
    label: 'Library & Sidebar',
    content: [
      {
        heading: 'Sidebar sections',
        body: null,
        list: [
          '⭐ Starred — clips you\'ve starred with S or the star icon',
          '✦ Best Picks — top-rated clips by AI quality score',
          '🕐 Recently Imported — clips added in the last 48 hours',
          '🎨 Colors — browse by dominant color family',
          '👤 People — filter by recognized face',
          '📋 Shot Lists — manage shooting plans and exports',
          '📁 Projects — group clips for a specific production',
          '🔖 Smart Collections — saved filter combinations',
          '🏷 Categories — custom topic categories you define',
        ],
      },
      {
        heading: 'Clip cards',
        body: null,
        list: [
          'Click once → opens the Detail Panel on the right',
          'Double-click → opens full Lightbox preview',
          'Space → toggles Lightbox on the focused clip',
          '← → arrows → navigate between clips',
          'S → star / unstar  |  1–5 → set star rating',
          'Right-click → context menu (copy path, open in Finder, etc.)',
        ],
      },
      {
        heading: 'Multi-select',
        body: 'Hold ⌘ and click to select multiple clips. A batch action bar appears at the top — export, star, rate, tag, add to project, or remove all at once.',
      },
    ],
  },
  {
    id: 'search',
    icon: '🔍',
    label: 'Search & Filters',
    content: [
      {
        heading: 'AI Search (⌘K)',
        body: 'Type anything you\'d say out loud: "sun setting over water", "kids singing on stage", "pastor at podium wide shot". Beacon compares your query against visual embeddings of every clip.',
      },
      {
        heading: 'Filters',
        body: null,
        list: [
          'Category — click any category in the sidebar',
          'Color — click a color swatch to show matching clips',
          'Status — filter by Unreviewed / Approved / In Use / Archived',
          'Shot type — filter by Wide, Medium, Close-Up, etc.',
          'Starred only — click ⭐ in the sidebar',
          'Rating — open Advanced filters in the result bar',
        ],
      },
      {
        heading: 'Saving a search',
        body: 'After filtering, click the bookmark icon in the result bar to save your search. Saved searches appear in the sidebar under Smart Collections.',
      },
      {
        heading: 'Find similar clips',
        body: 'Open a clip\'s detail panel and click "Find Similar". Beacon uses visual embedding distance to surface the most visually similar photos and videos.',
      },
    ],
  },
  {
    id: 'import',
    icon: '📥',
    label: 'Importing Media',
    content: [
      {
        heading: 'Folder import (⌘O)',
        body: 'Pick any folder on your Mac. Beacon walks it recursively, imports all supported media (JPG, PNG, HEIC, MP4, MOV, and more), and begins AI analysis immediately.',
      },
      {
        heading: 'Drag & drop',
        body: 'Drag individual files or folders from Finder directly onto the Beacon window. A drop zone appears and import begins automatically.',
      },
      {
        heading: 'Watch Folders',
        body: 'Go to Settings → Folders and add a folder path. Beacon polls it every 20 seconds — any new media is ingested and analyzed without you doing anything. Great for SD card auto-import.',
      },
      {
        heading: 'SD Card auto-detect',
        body: 'When a new drive mounts (e.g. an SD card reader), Beacon detects it and asks which folder to import. You can also tag the event name and camera angle before import begins.',
      },
      {
        heading: 'Event metadata',
        body: 'When importing you can set an Event Name (e.g. "Easter Sunday") and Camera Angle (e.g. "Camera A"). Beacon can also rename files with this prefix for easy identification.',
      },
    ],
  },
  {
    id: 'organization',
    icon: '🏷',
    label: 'Organization',
    content: [
      {
        heading: 'Categories',
        body: 'Create categories in Settings → Categories (or click + at the bottom of the sidebar). Assign a clip to a category from its Detail Panel or via batch edit.',
      },
      {
        heading: 'Tags (blue chips)',
        body: 'Tags appear on clip cards and in the Detail Panel. You can search by tag name in the search bar. Create new tags or edit existing ones from the Detail Panel.',
      },
      {
        heading: 'Shot types',
        body: 'Each clip can be tagged Wide, Medium, Close-Up, Overhead, or other custom types. Filter by shot type from the sidebar or result bar.',
      },
      {
        heading: 'Status workflow',
        body: null,
        list: [
          '⚪ Unreviewed — newly imported, not yet reviewed',
          '✅ Approved — cleared and ready to use',
          '🔵 In Use — actively being used in a production',
          '🗄 Archived — kept for records but not active',
        ],
      },
      {
        heading: 'Smart Collections',
        body: 'Collections can be query-based (automatic — saved filters) or manual (drag clips in from the library). Use them to group clips for recurring needs like "Sunday Graphics" or "Baptism B-Roll".',
      },
    ],
  },
  {
    id: 'shotlists',
    icon: '📋',
    label: 'Shot Lists & Projects',
    content: [
      {
        heading: 'Shot Lists',
        body: 'Open Shot Lists from the sidebar (or top bar). Create a list, add shot items, then drag clips from your library into each item after the shoot.',
      },
      {
        heading: 'Adding notes',
        body: 'Click a clip row in a shot list to expand it and add notes — these notes are included when you export to PDF.',
      },
      {
        heading: 'PDF export',
        body: 'Click Print PDF in the shot list panel. Choose whether to include clip notes. The PDF opens in your default viewer for printing or sharing.',
      },
      {
        heading: 'FCP XML export',
        body: 'Select clips in the library (⌘-click for multi-select) then use File → Export → Final Cut Pro XML. This creates an event with your clips ready to edit.',
      },
      {
        heading: 'Projects',
        body: 'Projects appear in the sidebar under Productions. Add clips to a project from their Detail Panel or via batch edit. Filter the library to only show clips in (or not in) any project.',
      },
    ],
  },
  {
    id: 'people',
    icon: '👤',
    label: 'People & Faces',
    content: [
      {
        heading: 'How face recognition works',
        body: 'During ingest Beacon detects and clusters faces using InsightFace. Each cluster becomes a Person that you can name. Recognition runs locally — no face data is sent anywhere.',
      },
      {
        heading: 'Naming a person',
        body: 'Click People in the sidebar to see all detected faces. Click a face cluster, then click the pencil icon to give them a name. The name appears on all future clips containing that person.',
      },
      {
        heading: 'Merging duplicates',
        body: 'If the same person has two clusters (e.g. different lighting), open one, click Merge, then select the other cluster to combine them.',
      },
      {
        heading: 'Re-clustering',
        body: 'If face assignment looks wrong, go to Settings → People → Re-cluster Faces. This re-runs the grouping algorithm with all stored face embeddings.',
      },
      {
        heading: 'Searching by face',
        body: 'Click any person in the People sidebar section to filter the library to only clips containing that person.',
      },
    ],
  },
  {
    id: 'settings',
    icon: '⚙️',
    label: 'Settings & AI',
    content: [
      {
        heading: 'AI Models tab',
        body: 'Configure the Ollama vision model (llava:13b recommended, llava:7b for lower-RAM Macs), frame analysis interval, and whether to use CLIP classification for tagging.',
      },
      {
        heading: 'Ollama',
        body: 'Ollama is the local AI engine that runs vision models. Beacon can download and start it automatically. If it\'s not running, AI descriptions won\'t generate — thumbnails and basic info still work.',
      },
      {
        heading: 'Visual Embeddings',
        body: 'The "Re-embed All" button in Database settings regenerates SigLIP visual embeddings — the AI vectors that power visual search. Run this if search results seem off after a model change.',
      },
      {
        heading: 'Duplicates',
        body: 'Settings → Duplicates scans your library for exact file duplicates (matched by content hash). Select which copies to remove; optionally move the original files to Trash.',
      },
      {
        heading: 'Clear Index',
        body: 'In Settings → Database, "Clear Index" removes all clip records from Beacon\'s database without touching your actual files. Use this to start fresh if needed.',
      },
    ],
  },
  {
    id: 'shortcuts',
    icon: '⌨️',
    label: 'Keyboard Shortcuts',
    content: [
      {
        heading: 'Navigation',
        body: null,
        shortcuts: [
          ['⌘K', 'Focus search bar'],
          ['⌘O', 'Import folder'],
          ['⌘,', 'Open Settings'],
          ['⌘⇧H', 'Open Help (this panel)'],
          ['⌘/', 'Keyboard shortcuts reference'],
          ['← →', 'Navigate between clips'],
          ['Esc', 'Clear selection / close panel'],
        ],
      },
      {
        heading: 'Clip actions',
        body: null,
        shortcuts: [
          ['Space', 'Open Lightbox preview'],
          ['S', 'Star / unstar clip'],
          ['1 – 5', 'Set star rating'],
          ['⌘ + click', 'Multi-select clips'],
          ['⌘A', 'Select all visible clips'],
          ['⌫', 'Remove from current view (not delete file)'],
        ],
      },
      {
        heading: 'In Lightbox',
        body: null,
        shortcuts: [
          ['← →', 'Previous / next clip'],
          ['Esc', 'Close Lightbox'],
          ['Space', 'Close Lightbox'],
          ['S', 'Star clip'],
          ['1 – 5', 'Rate clip'],
        ],
      },
    ],
  },
]

// ── Sub-components ─────────────────────────────────────────────────────────────
function ShortcutRow({ keys, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {keys.split(' ').map((k, i) => (
          <kbd key={i} style={{
            display: 'inline-block',
            padding: '2px 7px', borderRadius: 5,
            background: 'var(--surface3)',
            boxShadow: 'var(--neu-raise-sm)',
            fontSize: 11, fontFamily: 'monospace',
            color: 'var(--text-primary)',
            fontWeight: 600,
          }}>{k}</kbd>
        ))}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function SectionContent({ section }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {section.content.map((block, i) => (
        <div key={i}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            {block.heading}
          </div>
          {block.body && (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--text-muted)' }}>
              {block.body}
            </p>
          )}
          {block.list && (
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {block.list.map((item, j) => (
                <li key={j} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--text-dim)', flexShrink: 0, marginTop: 1 }}>›</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
          {block.shortcuts && (
            <div>
              {block.shortcuts.map(([keys, label], j) => (
                <ShortcutRow key={j} keys={keys} label={label} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main HelpPanel ─────────────────────────────────────────────────────────────
export default function HelpPanel({ onClose, initialSection = 'getting-started' }) {
  const [activeId, setActiveId] = useState(initialSection)
  const [closing, setClosing] = useState(false)

  const active = SECTIONS.find(s => s.id === activeId) || SECTIONS[0]

  function close() {
    setClosing(true)
    setTimeout(onClose, 250)
  }

  // Esc to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(20,22,40,0.45)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: closing ? 'help-fade-out 0.25s ease forwards' : 'help-fade-in 0.2s ease',
      }}
    >
      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 780, height: 560,
          display: 'flex',
          background: 'var(--surface)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '20px 20px 60px #BEBFCE, -12px -12px 40px #FFFFFF, 0 0 0 1px rgba(0,0,0,0.05)',
          animation: closing ? 'help-slide-out 0.25s ease forwards' : 'help-slide-in 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        }}
      >
        {/* ── Left nav ── */}
        <div style={{
          width: 195, flexShrink: 0,
          background: 'var(--surface2)',
          borderRight: '1px solid var(--border-solid)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7,
                background: 'var(--grad-accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: '#fff', fontWeight: 800,
                boxShadow: '2px 2px 6px rgba(107,143,255,0.35)',
              }}>?</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Help</span>
            </div>
          </div>

          {/* Nav items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '7px 10px', borderRadius: 9, marginBottom: 2,
                  border: 'none', cursor: 'pointer',
                  background: activeId === s.id ? 'rgba(107,143,255,0.12)' : 'transparent',
                  boxShadow: activeId === s.id ? 'var(--neu-raise-sm)' : 'none',
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => { if (activeId !== s.id) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
                onMouseLeave={e => { if (activeId !== s.id) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>{s.icon}</span>
                <span style={{
                  fontSize: 12, fontWeight: activeId === s.id ? 700 : 500,
                  color: activeId === s.id ? 'var(--accent)' : 'var(--text-muted)',
                  lineHeight: 1.2,
                }}>{s.label}</span>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)' }}>
            Beacon v{typeof window !== 'undefined' ? (window.__beaconVersion || '0.2.0') : '0.2.0'}
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Content header */}
          <div style={{
            padding: '18px 24px 14px',
            borderBottom: '1px solid var(--border-solid)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{active.icon}</span>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {active.label}
              </h2>
            </div>
            <button
              onClick={close}
              style={{
                width: 26, height: 26, borderRadius: 8,
                border: 'none', cursor: 'pointer',
                background: 'var(--surface)',
                boxShadow: 'var(--neu-raise-sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, color: 'var(--text-muted)',
                transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--neu-raise-md)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--neu-raise-sm)'}
            >✕</button>
          </div>

          {/* Scrollable content body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
            <SectionContent section={active} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes help-fade-in  { from { opacity:0 } to { opacity:1 } }
        @keyframes help-fade-out { from { opacity:1 } to { opacity:0 } }
        @keyframes help-slide-in {
          from { opacity:0; transform: scale(0.93) translateY(12px) }
          to   { opacity:1; transform: scale(1)    translateY(0)    }
        }
        @keyframes help-slide-out {
          from { opacity:1; transform: scale(1)    translateY(0)    }
          to   { opacity:0; transform: scale(0.95) translateY(8px)  }
        }
      `}</style>
    </div>
  )
}
