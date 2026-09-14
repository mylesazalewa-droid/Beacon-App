import { useState, useEffect } from 'react'
import { updateSetting } from '../../utils/api'

// What settings each tier recommends
const TIER_CONFIG = {
  low: {
    label: 'Performance',
    color: '#F0A832',
    icon: '⚡',
    description: 'Your Mac has limited RAM. These settings keep Beacon fast and avoid memory pressure.',
    settings: {
      vision_model: 'llava:7b',
      face_recognition: '0',
      frame_interval_secs: '30',
      max_frames_per_clip: '2',
      use_clip_classify: '1',
    },
    bullets: [
      'Lighter vision model (llava:7b) — uses ~4 GB RAM',
      'Face recognition disabled — saves ~1.5 GB',
      '1 frame per 30 s of video — faster processing',
      'CLIP classification still enabled for tagging',
    ],
  },
  balanced: {
    label: 'Balanced',
    color: '#5CC8A0',
    icon: '⚖️',
    description: 'Great defaults for most Macs. Full AI tagging with manageable memory usage.',
    settings: {
      vision_model: 'llava:13b',
      face_recognition: '1',
      frame_interval_secs: '10',
      max_frames_per_clip: '3',
      use_clip_classify: '1',
    },
    bullets: [
      'Standard vision model (llava:13b) — best quality',
      'Face recognition enabled',
      '1 frame per 10 s of video',
      'Up to 3 analyzed frames per clip',
    ],
  },
  full: {
    label: 'Full AI',
    color: '#6B8FFF',
    icon: '🚀',
    description: 'Your Mac has plenty of RAM and a fast chip. Enable everything for the richest experience.',
    settings: {
      vision_model: 'llava:13b',
      face_recognition: '1',
      frame_interval_secs: '10',
      max_frames_per_clip: '5',
      use_clip_classify: '1',
    },
    bullets: [
      'Standard vision model (llava:13b)',
      'Face recognition enabled',
      '1 frame per 10 s — detailed video analysis',
      'Up to 5 analyzed frames per clip',
    ],
  },
}

export default function MacRecommendations({ settings, onApplied }) {
  const [specs, setSpecs]         = useState(null)
  const [applying, setApplying]   = useState(false)
  const [applied, setApplied]     = useState(false)
  const [dismissed, setDismissed] = useState(
    () => !!localStorage.getItem('beacon_rec_dismissed')
  )

  useEffect(() => {
    window.beacon?.getMachineSpecs?.()
      .then(setSpecs)
      .catch(() => {})
  }, [])

  if (!specs || dismissed) return null

  const tier   = specs.tier
  const config = TIER_CONFIG[tier]

  async function applySettings() {
    setApplying(true)
    try {
      for (const [key, value] of Object.entries(config.settings)) {
        await updateSetting(key, value).catch(() => {})
      }
      setApplied(true)
      onApplied?.()
    } finally {
      setApplying(false)
    }
  }

  function dismiss() {
    localStorage.setItem('beacon_rec_dismissed', '1')
    setDismissed(true)
  }

  const chip = (label, col) => (
    <span style={{
      display: 'inline-block',
      fontSize: 9.5, fontWeight: 700,
      padding: '2px 8px', borderRadius: 20,
      background: col + '18',
      color: col,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>{label}</span>
  )

  return (
    <div style={{
      borderRadius: 14,
      background: 'var(--surface)',
      boxShadow: 'var(--neu-raise-md)',
      padding: '18px 20px',
      marginBottom: 24,
      position: 'relative',
    }}>
      {/* Dismiss */}
      <button
        onClick={dismiss}
        style={{
          position: 'absolute', top: 12, right: 14,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, color: 'var(--text-dim)',
          padding: 2,
        }}
        title="Dismiss"
      >✕</button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17,
          background: config.color + '18',
          boxShadow: 'var(--neu-raise-sm)',
        }}>{config.icon}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            Recommended for your Mac
            {chip(config.label + ' mode', config.color)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
            {specs.ramGb} GB RAM · {specs.cores} cores · {specs.isAppleSilicon ? 'Apple Silicon' : 'Intel'}
          </div>
        </div>
      </div>

      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
        {config.description}
      </p>

      {/* Bullet list */}
      <ul style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {config.bullets.map((b, i) => (
          <li key={i} style={{ display: 'flex', gap: 7, fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ color: config.color, flexShrink: 0 }}>✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {applied ? (
          <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
            ✓ Settings applied!
          </div>
        ) : (
          <button
            onClick={applySettings}
            disabled={applying}
            style={{
              height: 32, padding: '0 18px',
              borderRadius: 9, border: 'none', cursor: applying ? 'default' : 'pointer',
              background: 'var(--grad-accent)',
              boxShadow: '3px 3px 8px rgba(107,143,255,0.3), -1px -1px 5px rgba(255,255,255,0.7)',
              fontSize: 12, fontWeight: 700, color: '#fff',
              opacity: applying ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {applying ? 'Applying…' : 'Apply Recommended Settings'}
          </button>
        )}
        <button
          onClick={dismiss}
          style={{
            height: 32, padding: '0 14px',
            borderRadius: 9, border: 'none', cursor: 'pointer',
            background: 'var(--surface)',
            boxShadow: 'var(--neu-raise-sm)',
            fontSize: 12, color: 'var(--text-muted)',
            transition: 'box-shadow 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--neu-raise-md)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--neu-raise-sm)'}
        >
          Keep current settings
        </button>
      </div>
    </div>
  )
}
