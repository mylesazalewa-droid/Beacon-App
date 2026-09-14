import { useState, useEffect, useRef } from 'react'

const PRESET_EVENTS = [
  { label: 'Sunday Morning', icon: '☀️' },
  { label: 'Sunday Evening', icon: '🌙' },
  { label: 'Wednesday Night', icon: '📖' },
  { label: 'Youth Group', icon: '🎉' },
  { label: 'Kids Ministry', icon: '⭐' },
  { label: 'Baptism Service', icon: '💧' },
  { label: 'Wedding', icon: '💍' },
  { label: 'Funeral', icon: '🕊️' },
  { label: 'Conference', icon: '🎤' },
  { label: 'Outreach', icon: '🌍' },
  { label: 'Christmas', icon: '🎄' },
  { label: 'Easter', icon: '✝️' },
]

const CAMERA_ANGLES = [
  { label: 'Main', value: 'Main' },
  { label: 'Wide', value: 'Wide' },
  { label: 'Closeup', value: 'Closeup' },
  { label: 'Angle A', value: 'AngleA' },
  { label: 'Angle B', value: 'AngleB' },
  { label: 'Handheld', value: 'Handheld' },
  { label: 'Drone', value: 'Drone' },
  { label: 'Screen Record', value: 'Screen' },
]

export default function EventIngestModal({ volumeInfo, onConfirm, onSkip, onClose }) {
  const [eventName, setEventName] = useState('')
  const [cameraAngle, setCameraAngle] = useState('Main')
  const [renameFiles, setRenameFiles] = useState(false)
  const [customEvent, setCustomEvent] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (customEvent) inputRef.current?.focus()
  }, [customEvent])

  const handlePreset = (label) => {
    setEventName(label)
    setCustomEvent(false)
  }

  const handleConfirm = () => {
    if (!eventName.trim()) return
    onConfirm({ eventName: eventName.trim(), cameraAngle, renameFiles })
  }

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[520px] bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              {volumeInfo ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold text-accent uppercase tracking-widest">SD Card Detected</span>
                    <span className="text-[10px] text-text-dim bg-surface2 px-2 py-0.5 rounded-full border border-border">
                      {volumeInfo.name}
                    </span>
                  </div>
                  <h2 className="text-[18px] font-bold text-text-primary">What event is this footage from?</h2>
                  <p className="text-[12px] text-text-muted mt-0.5">{volumeInfo.path}</p>
                </>
              ) : (
                <>
                  <h2 className="text-[18px] font-bold text-text-primary">Tag this ingest</h2>
                  <p className="text-[12px] text-text-muted mt-0.5">Optional: label this media with an event for better organization.</p>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-text-dim hover:text-text-primary w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface2 transition-colors flex-shrink-0 ml-4"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Event presets */}
          <div>
            <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-2">Event</p>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {PRESET_EVENTS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePreset(preset.label)}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-center transition-all border ${
                    eventName === preset.label && !customEvent
                      ? 'bg-accent/15 border-accent/60 text-accent'
                      : 'bg-surface2 border-border text-text-muted hover:border-accent/30 hover:text-text-primary'
                  }`}
                >
                  <span className="text-base leading-none">{preset.icon}</span>
                  <span className="text-[9px] font-semibold leading-tight">{preset.label}</span>
                </button>
              ))}
            </div>

            {/* Custom event name */}
            {!customEvent ? (
              <button
                onClick={() => { setCustomEvent(true); setEventName('') }}
                className="text-[11px] text-accent hover:text-accent/80 transition-colors"
              >
                + Custom event name…
              </button>
            ) : (
              <input
                ref={inputRef}
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') { setCustomEvent(false); setEventName('') } }}
                placeholder="e.g. Missions Night, VBS Day 2…"
                className="w-full h-9 bg-surface2 border border-accent/50 rounded-lg px-3 text-[12px] text-text-primary outline-none placeholder:text-text-dim"
              />
            )}
          </div>

          {/* Camera angle */}
          <div>
            <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-2">Camera Angle</p>
            <div className="flex flex-wrap gap-1.5">
              {CAMERA_ANGLES.map((cam) => (
                <button
                  key={cam.value}
                  onClick={() => setCameraAngle(cam.value)}
                  className={`px-3 h-7 rounded-full text-[11px] font-medium transition-all border ${
                    cameraAngle === cam.value
                      ? 'bg-accent/15 border-accent/60 text-accent'
                      : 'bg-surface2 border-border text-text-muted hover:border-accent/30'
                  }`}
                >
                  {cam.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rename files toggle */}
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="text-[12px] font-medium text-text-primary">Auto-rename files</p>
              <p className="text-[10px] text-text-dim mt-0.5">
                Renames to: <span className="font-mono text-text-muted">{today.replace(/[, ]/g, '-')}_{eventName || 'EventName'}_{cameraAngle}_001.mp4</span>
              </p>
            </div>
            <button
              onClick={() => setRenameFiles(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${renameFiles ? 'bg-accent' : 'bg-surface3'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${renameFiles ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-2">
          {onSkip && (
            <button
              onClick={onSkip}
              className="flex-1 h-10 rounded-xl text-[12px] font-medium bg-surface2 hover:bg-surface3 text-text-muted border border-border transition-colors"
            >
              Skip — Ingest without tag
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={!eventName.trim()}
            className="flex-1 h-10 rounded-xl text-[13px] font-semibold bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {volumeInfo ? 'Start Ingest →' : 'Apply & Ingest →'}
          </button>
        </div>
      </div>
    </div>
  )
}
