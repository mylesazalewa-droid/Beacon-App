import { useState, useEffect, useRef } from 'react'
import logoSrc from '../../assets/logo.png'
import CategoryManager from './CategoryManager'
import PeopleSettings from './PeopleSettings'
import DuplicatesSettings from './DuplicatesSettings'
import MacRecommendations from './MacRecommendations'
import {
  getSettings, updateSetting, getOllamaStatus, getDbStats,
  clearIndex, getWatchFolders, addWatchFolder, removeWatchFolder,
  reembedClips, rethumbClips, reanalyzeClips, redetectFaces, getIncompleteClips, enrichDescriptions,
} from '../../utils/api'

const VISION_MODELS = ['llava:13b', 'llava:7b', 'llava:latest', 'moondream:latest']
const WHISPER_MODELS = ['large-v3', 'medium', 'small']
const FRAME_INTERVALS = [
  { label: '1 frame / 10s (recommended)', value: '10' },
  { label: '1 frame / 30s (faster)', value: '30' },
  { label: '3 frames (very fast)', value: '0' },
]

export default function Settings({ categories, onCategoriesChange }) {
  const [settings, setSettings] = useState({})
  const [ollamaStatus, setOllamaStatus] = useState(null)
  const [dbStats, setDbStats] = useState(null)
  const [watchFolders, setWatchFolders] = useState([])
  const [clearConfirm, setClearConfirm] = useState(false)
  const [reembedding, setReembedding] = useState(false)
  const [reembedProgress, setReembedProgress] = useState(null)
  const [rethumbing, setRethumbing] = useState(false)
  const [rethumbProgress, setRethumbProgress] = useState(null)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeProgress, setReanalyzeProgress] = useState(null)
  const [redetecting, setRedetecting] = useState(false)
  const [redetectProgress, setRedetectProgress] = useState(null)
  const [enriching, setEnriching] = useState(false)
  const [enrichProgress, setEnrichProgress] = useState(null)
  const [incompleteStats, setIncompleteStats] = useState(null)
  const [appVersion, setAppVersion] = useState('0.2.0')
  const [activeTab, setActiveTab] = useState('ai')

  // Ollama install / pull state
  const [installingOllama, setInstallingOllama] = useState(false)
  const [installPct, setInstallPct] = useState(0)
  const [installMsg, setInstallMsg] = useState('')
  const [installError, setInstallError] = useState('')
  const [pullingModel, setPullingModel] = useState(false)
  const [pullPct, setPullPct] = useState(0)
  const [pullMsg, setPullMsg] = useState('')
  const [pullError, setPullError] = useState('')
  const [pullModelName, setPullModelName] = useState('llava:13b')
  const cleanupRef = useRef([])

  useEffect(() => {
    load()
    window.beacon?.getAppVersion().then(setAppVersion).catch(() => {})
    return () => cleanupRef.current.forEach((fn) => fn?.())
  }, [])

  const load = async () => {
    const [s, o, d, w, inc] = await Promise.allSettled([
      getSettings(), getOllamaStatus(), getDbStats(), getWatchFolders(), getIncompleteClips(),
    ])
    if (s.status === 'fulfilled') setSettings(s.value)
    if (o.status === 'fulfilled') setOllamaStatus(o.value)
    if (d.status === 'fulfilled') setDbStats(d.value)
    if (w.status === 'fulfilled') setWatchFolders(w.value.folders || [])
    if (inc.status === 'fulfilled') setIncompleteStats(inc.value)
  }

  const handleInstallOllama = () => {
    setInstallingOllama(true)
    setInstallPct(0)
    setInstallMsg('Starting download…')
    setInstallError('')

    const unProgress = window.beacon?.onOllamaInstallProgress((data) => {
      setInstallPct(data.pct || 0)
      setInstallMsg(data.message || '')
    })
    const unComplete = window.beacon?.onOllamaInstallComplete(async (data) => {
      unProgress?.()
      setInstallingOllama(false)
      if (data.success) {
        setInstallPct(100)
        setInstallMsg('Installed!')
        await window.beacon?.launchOllama()
        const status = await window.beacon?.checkOllama()
        setOllamaStatus(status)
      } else {
        setInstallError(data.error || 'Download failed — check your internet connection')
      }
    })
    cleanupRef.current.push(unProgress, unComplete)
    window.beacon?.installOllama()
  }

  const handleStartOllama = async () => {
    await window.beacon?.launchOllama()
    setTimeout(async () => {
      const status = await window.beacon?.checkOllama()
      setOllamaStatus(status)
    }, 2000)
  }

  const handlePullModel = () => {
    setPullingModel(true)
    setPullPct(0)
    setPullMsg('Connecting to Ollama…')
    setPullError('')

    const unProgress = window.beacon?.onPullProgress((data) => {
      if (data.error) {
        setPullError(data.error)
        setPullingModel(false)
        return
      }
      if (data.line) setPullMsg(data.line)
      if (data.pct != null) {
        setPullPct(data.pct)
      } else if (data.line) {
        const pctMatch = data.line.match(/(\d+)%/)
        if (pctMatch) setPullPct(parseInt(pctMatch[1], 10))
      }
    })
    const unComplete = window.beacon?.onPullComplete(async (data) => {
      unProgress?.()
      setPullingModel(false)
      if (data.success) {
        setPullPct(100)
        setPullMsg('Model ready!')
        const status = await window.beacon?.checkOllama()
        setOllamaStatus(status)
      } else {
        setPullError(data.error || 'Pull failed — check that Ollama is running at localhost:11434')
      }
    })
    cleanupRef.current.push(unProgress, unComplete)
    window.beacon?.pullModel(pullModelName)
  }

  const handleSetting = async (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    await updateSetting(key, value).catch(() => {})
  }

  const handleAddWatchFolder = async () => {
    const path = await window.beacon?.pickFolder()
    if (!path) return
    await addWatchFolder(path)
    setWatchFolders((prev) => [...new Set([...prev, path])])
  }

  const handleRemoveWatchFolder = async (path) => {
    await removeWatchFolder(path)
    setWatchFolders((prev) => prev.filter((f) => f !== path))
  }

  const handleReembed = () => {
    if (reembedding) return
    setReembedding(true)
    setReembedProgress({ index: 0, total: 0, filename: 'Starting…' })
    reembedClips(
      (data) => {
        if (data.type === 'progress') setReembedProgress(data)
      },
      (data) => {
        setReembedding(false)
        setReembedProgress(data ? { done: true, total: data.total, errors: data.errors } : { done: true })
      },
      () => { setReembedding(false); setReembedProgress({ error: true }) }
    )
  }

  const handleRethumb = () => {
    if (rethumbing) return
    setRethumbing(true)
    setRethumbProgress({ index: 0, total: 0, filename: 'Starting…' })
    rethumbClips(
      (data) => { if (data.type === 'progress') setRethumbProgress(data) },
      (data) => {
        setRethumbing(false)
        setRethumbProgress(data ? { done: true, total: data.total, errors: data.errors } : { done: true })
      },
      () => { setRethumbing(false); setRethumbProgress({ error: true }) }
    )
  }

  const handleReanalyze = () => {
    if (reanalyzing) return
    setReanalyzing(true)
    setReanalyzeProgress({ index: 0, total: 0, filename: 'Starting…' })
    reanalyzeClips(
      (data) => { if (data.type === 'progress') setReanalyzeProgress(data) },
      (data) => {
        setReanalyzing(false)
        setReanalyzeProgress(data ? { done: true, total: data.total, errors: data.errors } : { done: true })
        getIncompleteClips().then(setIncompleteStats).catch(() => {})
      },
      () => { setReanalyzing(false); setReanalyzeProgress({ error: true }) }
    )
  }

  const handleRedetectFaces = () => {
    if (redetecting) return
    setRedetecting(true)
    setRedetectProgress({ index: 0, total: 0, filename: 'Starting…' })
    redetectFaces(
      (data) => { if (data.type === 'progress') setRedetectProgress(data) },
      (data) => {
        setRedetecting(false)
        setRedetectProgress(data ? { done: true, total: data.total, errors: data.errors } : { done: true })
        getIncompleteClips().then(setIncompleteStats).catch(() => {})
      },
      () => { setRedetecting(false); setRedetectProgress({ error: true }) }
    )
  }

  const handleEnrichDescriptions = () => {
    if (enriching) return
    setEnriching(true)
    setEnrichProgress({ index: 0, total: 0, filename: 'Starting…' })
    enrichDescriptions(
      (data) => { if (data.type === 'progress') setEnrichProgress(data) },
      (data) => {
        setEnriching(false)
        setEnrichProgress(data ? { done: true, total: data.total, errors: data.errors } : { done: true })
      },
      () => { setEnriching(false); setEnrichProgress({ error: true }) }
    )
  }

  const handleClearIndex = async () => {
    if (!clearConfirm) { setClearConfirm(true); setTimeout(() => setClearConfirm(false), 5000); return }
    await clearIndex()
    setClearConfirm(false)
    load()
  }

  const tabs = [
    { id: 'ai', label: 'AI Models' },
    { id: 'people', label: 'People' },
    { id: 'categories', label: 'Categories' },
    { id: 'folders', label: 'Folders' },
    { id: 'duplicates', label: 'Duplicates' },
    { id: 'database', label: 'Database' },
    { id: 'cloud', label: 'Cloud Storage' },
    { id: 'about', label: 'About' },
  ]

  return (
    <div className="flex-1 overflow-y-auto bg-bg">
      <div className="max-w-[640px] mx-auto py-8 px-6">
        <h1 className="text-[22px] font-bold text-text-primary mb-6 tracking-tight">Settings</h1>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 mb-6 rounded-xl border border-[var(--border-solid)] shadow-[var(--shadow-inset)]" style={{background:'var(--surface)'}}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 h-8 rounded-lg text-[12px] font-semibold transition-all ${
                activeTab === tab.id
                  ? 'text-white shadow-[var(--shadow-btn)]'
                  : 'text-text-muted hover:text-text-primary'
              }`}
              style={activeTab === tab.id ? {
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 110%, white 10%) 0%, var(--accent) 100%)',
                boxShadow: 'var(--shadow-accent)',
              } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── People ── */}
        {activeTab === 'people' && (
          <PeopleSettings />
        )}

        {/* ── AI Models ── */}
        {activeTab === 'ai' && (
          <div className="space-y-5">
            {/* Machine recommendations */}
            <MacRecommendations settings={settings} onApplied={load} />
            {/* Ollama status */}
            <Card title="Ollama AI Engine">
              {/* Status row */}
              <div className="flex items-center gap-3 mb-3">
                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                  ollamaStatus?.running ? 'bg-green-500' :
                  ollamaStatus?.installed ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                <div className="flex-1">
                  <p className="text-[13px] text-text-primary font-medium">
                    {ollamaStatus?.running ? 'Connected' :
                     ollamaStatus?.installed ? 'Installed, not running' : 'Not installed'}
                  </p>
                  <p className="text-[11px] text-text-muted">localhost:11434</p>
                </div>
                <button
                  onClick={() => window.beacon?.checkOllama().then(setOllamaStatus)}
                  className="text-[11px] text-text-muted hover:text-text-primary px-3 h-7 rounded border border-border hover:bg-surface2"
                >
                  Refresh
                </button>
              </div>

              {/* Not installed — show install */}
              {!ollamaStatus?.installed && (
                <div className="border-t border-border pt-3">
                  {installingOllama ? (
                    <div>
                      <div className="flex justify-between text-[11px] text-text-muted mb-1.5">
                        <span>{installMsg}</span>
                        <span>{installPct}%</span>
                      </div>
                      <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${installPct}%` }} />
                      </div>
                    </div>
                  ) : (
                    <div>
                      {installError && <p className="text-[11px] text-red-400 mb-2">{installError}</p>}
                      <button
                        onClick={handleInstallOllama}
                        className="w-full h-9 rounded-lg text-[13px] font-semibold bg-accent hover:bg-accent-hover text-white transition-colors"
                      >
                        {installError ? 'Try Again' : 'Install Ollama'}
                      </button>
                      <p className="text-[10px] text-text-dim mt-1.5 text-center">~70 MB download — no browser or terminal needed</p>
                    </div>
                  )}
                </div>
              )}

              {/* Installed but not running */}
              {ollamaStatus?.installed && !ollamaStatus?.running && (
                <div className="border-t border-border pt-3">
                  <button
                    onClick={handleStartOllama}
                    className="w-full h-9 rounded-lg text-[13px] font-semibold bg-accent hover:bg-accent-hover text-white transition-colors"
                  >
                    Start Ollama
                  </button>
                </div>
              )}

              {/* Running — show models */}
              {ollamaStatus?.running && (
                <div className="border-t border-border pt-3">
                  <p className="text-[11px] text-text-muted mb-2">Loaded models:</p>
                  <div className="flex flex-wrap gap-1">
                    {(ollamaStatus.models || []).map((m) => (
                      <span key={m} className="text-[10px] px-2 py-0.5 bg-surface2 border border-border rounded text-text-muted">{m}</span>
                    ))}
                    {!ollamaStatus.models?.length && <span className="text-[11px] text-text-dim">No models pulled yet</span>}
                  </div>
                </div>
              )}
            </Card>

            {/* Model pull card — show when Ollama is running but model missing, or always as a re-pull option */}
            {ollamaStatus?.installed && (
              <Card title="Vision Model Download">
                <p className="text-[12px] text-text-muted mb-3">
                  {ollamaStatus.model_available
                    ? 'LLaVA is ready. Re-download if the model is corrupted.'
                    : 'LLaVA is not downloaded yet. Pull it to enable AI classification.'}
                </p>
                {pullingModel ? (
                  <div>
                    <div className="flex justify-between text-[11px] text-text-muted mb-1.5">
                      <span className="truncate flex-1 mr-2">{pullMsg}</span>
                      <span>{pullPct}%</span>
                    </div>
                    <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${pullPct}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={pullModelName}
                      onChange={(e) => setPullModelName(e.target.value)}
                      className="flex-1 h-9 px-3 rounded-lg text-[13px] bg-surface2 border border-border text-text-primary"
                    >
                      <option value="llava:13b">llava:13b — best quality (M2 Pro+)</option>
                      <option value="llava:7b">llava:7b — faster (M1 / older Macs)</option>
                    </select>
                    <button
                      onClick={handlePullModel}
                      disabled={!ollamaStatus?.running}
                      className="px-4 h-9 rounded-lg text-[13px] font-semibold bg-accent hover:bg-accent-hover text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {ollamaStatus?.model_available ? 'Re-download' : 'Download'}
                    </button>
                  </div>
                )}
                {pullError && <p className="text-[11px] text-red-400 mt-2">{pullError}</p>}
                {!ollamaStatus?.running && (
                  <p className="text-[11px] text-text-dim mt-2">Start Ollama above before downloading a model.</p>
                )}
              </Card>
            )}

            <Card title="Vision Model">
              <Select
                value={settings.vision_model || 'llava:13b'}
                options={VISION_MODELS}
                onChange={(v) => handleSetting('vision_model', v)}
              />
              <p className="text-[11px] text-text-dim mt-1.5">llava:13b recommended (M2 Pro+). Use llava:7b for M1/lower-spec.</p>
            </Card>

            <Card title="Whisper Model">
              <Select
                value={settings.whisper_model || 'large-v3'}
                options={WHISPER_MODELS}
                onChange={(v) => handleSetting('whisper_model', v)}
              />
              <p className="text-[11px] text-text-dim mt-1.5">large-v3 for best accuracy. Use medium/small for faster transcription.</p>
            </Card>

            <Card title="Frame Sampling">
              <Select
                value={settings.max_frames_per_clip || '3'}
                options={['1', '2', '3', '5']}
                labels={[
                  '1 frame (fastest — good for photos)',
                  '2 frames (fast — short clips)',
                  '3 frames (recommended)',
                  '5 frames (most accurate — slow)',
                ]}
                onChange={(v) => handleSetting('max_frames_per_clip', v)}
              />
              <p className="text-[11px] text-text-dim mt-1.5">Smart sampling at key timestamps — far faster than the old 1-frame-per-10s approach.</p>
            </Card>

            <Card title="Proxy Generation">
              <ToggleRow
                label="Generate H.264 1080p proxies"
                description="Creates a compressed proxy of each video via FFmpeg for faster playback. Increases ingest time."
                checked={settings.generate_proxies === '1'}
                onChange={() => handleSetting('generate_proxies', settings.generate_proxies === '1' ? '0' : '1')}
              />
            </Card>

            <Card title="CLIP Fast Classification">
              <ToggleRow
                label="Use CLIP for instant classification"
                description="~100ms per clip instead of 30s with LLaVA. Recommended. Disable to use LLaVA for richer descriptions."
                checked={settings.use_clip_classify !== '0'}
                onChange={() => handleSetting('use_clip_classify', settings.use_clip_classify === '0' ? '1' : '0')}
              />
            </Card>

            <Card title="Face Recognition">
              <ToggleRow
                label="Auto-detect faces during ingest"
                description="Groups faces by identity. Name them in Settings → People to make them searchable."
                checked={settings.face_recognition !== '0'}
                onChange={() => handleSetting('face_recognition', settings.face_recognition === '1' ? '0' : '1')}
              />
            </Card>
          </div>
        )}

        {/* ── Duplicates ── */}
        {activeTab === 'duplicates' && (
          <DuplicatesSettings />
        )}

        {/* ── Categories ── */}
        {activeTab === 'categories' && (
          <Card title="Category Manager">
            <p className="text-[12px] text-text-muted mb-3">
              Drag to reorder. Double-click or click ✏️ to rename. Categories are used by the AI prompt — changes take effect on the next ingest.
            </p>
            <CategoryManager categories={categories} onRefresh={onCategoriesChange} />
          </Card>
        )}

        {/* ── Watch Folders ── */}
        {activeTab === 'folders' && (
          <div className="space-y-4">
            <Card title="Watch Folders">
              <p className="text-[12px] text-text-muted mb-3">
                Beacon monitors these folders and automatically indexes new media files in the background.
              </p>
              <div className="space-y-1.5 mb-3">
                {watchFolders.length === 0 && (
                  <p className="text-[12px] text-text-dim">No watch folders configured.</p>
                )}
                {watchFolders.map((f) => (
                  <div key={f} className="flex items-center gap-2 px-3 py-2 bg-surface2 rounded-lg border border-border">
                    <span className="text-sm">📁</span>
                    <span className="flex-1 text-[12px] font-mono text-text-muted truncate">{f}</span>
                    <button
                      onClick={() => handleRemoveWatchFolder(f)}
                      className="text-text-dim hover:text-red-400 transition-colors p-1"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={handleAddWatchFolder}
                className="w-full h-9 rounded-lg text-[12px] font-medium bg-surface2 hover:bg-surface3 text-text-muted border border-dashed border-border hover:border-accent hover:text-accent transition-colors"
              >
                + Add Folder
              </button>
            </Card>
          </div>
        )}

        {/* ── Database ── */}
        {activeTab === 'database' && (
          <div className="space-y-4">
            <Card title="Index Statistics">
              {dbStats ? (
                <div className="space-y-2">
                  <StatRow label="Total clips" value={dbStats.total_clips?.toLocaleString()} />
                  <StatRow label="Indexed storage" value={formatSize(dbStats.total_storage_bytes)} />
                  <StatRow label="Database size" value={formatSize(dbStats.db_size_bytes)} />
                </div>
              ) : (
                <p className="text-[12px] text-text-dim">Loading…</p>
              )}
            </Card>

            <Card title="Visual Search Embeddings">
              <p className="text-[12px] text-text-muted mb-3">
                Regenerate SigLIP visual embeddings for all clips. Required after updating the app, or if visual search ("2 people", "blue sky", "smiling woman") isn't finding results.
              </p>
              {reembedProgress && !reembedding && (
                <div className={`mb-3 text-[11px] px-3 py-2 rounded-lg ${reembedProgress.error ? 'text-red-400 bg-red-900/20' : 'text-green-400 bg-green-900/20'}`}>
                  {reembedProgress.error
                    ? 'Regeneration failed — check that SigLIP is installed'
                    : `✓ Done — ${reembedProgress.total} clips processed${reembedProgress.errors ? `, ${reembedProgress.errors} skipped` : ''}`}
                </div>
              )}
              {reembedding && reembedProgress && (
                <div className="mb-3 space-y-2">
                  <div className="flex justify-between text-[10px] text-text-muted">
                    <span className="truncate max-w-[200px]">{reembedProgress.filename}</span>
                    <span className="tabular-nums ml-2">{reembedProgress.index}/{reembedProgress.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface3)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${reembedProgress.total ? (reembedProgress.index / reembedProgress.total) * 100 : 0}%`, background: 'var(--accent)' }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleReembed}
                disabled={reembedding}
                className="w-full h-9 rounded-lg text-[12px] font-semibold border transition-colors bg-surface2 hover:bg-surface3 text-accent border-border disabled:opacity-50"
              >
                {reembedding ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                    Regenerating visual embeddings…
                  </span>
                ) : '⚡ Regenerate Visual Search'}
              </button>
            </Card>

            <Card title="Thumbnail Regeneration">
              <p className="text-[12px] text-text-muted mb-3">
                Rebuild thumbnails for all photos — useful if thumbnails appear rotated or missing due to EXIF issues.
              </p>
              {rethumbProgress && !rethumbing && (
                <div className={`mb-3 text-[11px] px-3 py-2 rounded-lg ${rethumbProgress.error ? 'text-red-400 bg-red-900/20' : 'text-green-400 bg-green-900/20'}`}>
                  {rethumbProgress.error
                    ? 'Regeneration failed — check app logs'
                    : `✓ Done — ${rethumbProgress.total} photos processed${rethumbProgress.errors ? `, ${rethumbProgress.errors} skipped` : ''}`}
                </div>
              )}
              {rethumbing && rethumbProgress && (
                <div className="mb-3 space-y-2">
                  <div className="flex justify-between text-[10px] text-text-muted">
                    <span className="truncate max-w-[200px]">{rethumbProgress.filename}</span>
                    <span className="tabular-nums ml-2">{rethumbProgress.index}/{rethumbProgress.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface3)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${rethumbProgress.total ? (rethumbProgress.index / rethumbProgress.total) * 100 : 0}%`, background: 'var(--accent)' }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleRethumb}
                disabled={rethumbing}
                className="w-full h-9 rounded-lg text-[12px] font-semibold border transition-colors bg-surface2 hover:bg-surface3 text-accent border-border disabled:opacity-50"
              >
                {rethumbing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                    Regenerating thumbnails…
                  </span>
                ) : '🖼 Regenerate Thumbnails'}
              </button>
            </Card>

            <Card title="Crash Recovery">
              <p className="text-[12px] text-text-muted mb-3">
                If an import was interrupted, use these tools to finish processing clips that are missing AI descriptions or face data.
              </p>

              {/* Incomplete clip badge */}
              {incompleteStats && (
                <div className={`mb-4 px-3 py-2.5 rounded-lg flex items-center gap-2.5 ${
                  incompleteStats.has_incomplete
                    ? 'bg-amber-900/20 border border-amber-700/30'
                    : 'bg-green-900/20 border border-green-700/30'
                }`}>
                  <span className="text-base">{incompleteStats.has_incomplete ? '⚠️' : '✅'}</span>
                  <div className="text-[11px] leading-tight">
                    {incompleteStats.has_incomplete ? (
                      <span className="text-amber-300">
                        {[
                          incompleteStats.missing_description > 0 && `${incompleteStats.missing_description} clips missing AI analysis`,
                          incompleteStats.missing_embeddings > 0 && `${incompleteStats.missing_embeddings} clips missing visual search`,
                          incompleteStats.missing_faces > 0 && `${incompleteStats.missing_faces} clips missing face data`,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    ) : (
                      <span className="text-green-400">All clips fully processed</span>
                    )}
                  </div>
                </div>
              )}

              {/* Re-analyze incomplete clips */}
              {reanalyzeProgress && !reanalyzing && (
                <div className={`mb-3 text-[11px] px-3 py-2 rounded-lg ${reanalyzeProgress.error ? 'text-red-400 bg-red-900/20' : 'text-green-400 bg-green-900/20'}`}>
                  {reanalyzeProgress.error
                    ? 'Re-analysis failed — check that Ollama is running'
                    : `✓ Done — ${reanalyzeProgress.total} clip${reanalyzeProgress.total !== 1 ? 's' : ''} re-analyzed${reanalyzeProgress.errors ? `, ${reanalyzeProgress.errors} skipped` : ''}`}
                </div>
              )}
              {reanalyzing && reanalyzeProgress && (
                <div className="mb-3 space-y-2">
                  <div className="flex justify-between text-[10px] text-text-muted">
                    <span className="truncate max-w-[200px]">{reanalyzeProgress.filename || 'Processing…'}</span>
                    <span className="tabular-nums ml-2">{reanalyzeProgress.index}/{reanalyzeProgress.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface3)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${reanalyzeProgress.total ? (reanalyzeProgress.index / reanalyzeProgress.total) * 100 : 5}%`, background: 'var(--accent)' }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing || redetecting}
                className="w-full h-9 rounded-lg text-[12px] font-semibold border transition-colors bg-surface2 hover:bg-surface3 text-accent border-border disabled:opacity-50 mb-2"
              >
                {reanalyzing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                    Re-analyzing clips…
                  </span>
                ) : '🔄 Re-analyze Incomplete Clips'}
              </button>

              {/* Re-detect faces */}
              {redetectProgress && !redetecting && (
                <div className={`mb-3 text-[11px] px-3 py-2 rounded-lg ${redetectProgress.error ? 'text-red-400 bg-red-900/20' : 'text-green-400 bg-green-900/20'}`}>
                  {redetectProgress.error
                    ? 'Face detection failed — check app logs'
                    : `✓ Done — ${redetectProgress.total} clip${redetectProgress.total !== 1 ? 's' : ''} processed`}
                </div>
              )}
              {redetecting && redetectProgress && (
                <div className="mb-3 space-y-2">
                  <div className="flex justify-between text-[10px] text-text-muted">
                    <span className="truncate max-w-[200px]">{redetectProgress.filename || 'Detecting faces…'}</span>
                    <span className="tabular-nums ml-2">{redetectProgress.index}/{redetectProgress.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface3)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${redetectProgress.total ? (redetectProgress.index / redetectProgress.total) * 100 : 5}%`, background: '#9B59B6' }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleRedetectFaces}
                disabled={redetecting || reanalyzing}
                className="w-full h-9 rounded-lg text-[12px] font-semibold border transition-colors bg-surface2 hover:bg-surface3 text-accent border-border disabled:opacity-50"
              >
                {redetecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                    Detecting faces…
                  </span>
                ) : '👤 Re-detect Missing Faces'}
              </button>
            </Card>

            {/* Enrich Descriptions */}
            <Card title="Enrich Descriptions with AI">
              <p className="text-[12px] text-text-muted mb-3">
                Runs LLaVA on clips with generic CLIP-generated descriptions to produce richer, more searchable descriptions.
              </p>
              {enrichProgress && !enriching && (
                <div className={`mb-3 text-[11px] px-3 py-2 rounded-lg ${enrichProgress.error ? 'text-red-400 bg-red-900/20' : 'text-green-400 bg-green-900/20'}`}>
                  {enrichProgress.error
                    ? '✗ Error during enrichment — check that Ollama is running'
                    : `✓ Done — ${enrichProgress.total} clips enriched${enrichProgress.errors ? `, ${enrichProgress.errors} skipped` : ''}`}
                </div>
              )}
              {enriching && enrichProgress && (
                <div className="mb-3 text-[11px] text-text-muted flex items-center justify-between">
                  <span className="truncate max-w-[200px]">{enrichProgress.filename || 'Enriching…'}</span>
                  <span className="tabular-nums ml-2">{enrichProgress.index}/{enrichProgress.total}</span>
                </div>
              )}
              <button
                onClick={handleEnrichDescriptions}
                disabled={enriching}
                className="w-full h-9 rounded-lg text-[12px] font-semibold border transition-colors disabled:opacity-50"
                style={{ background: 'var(--surface2)', borderColor: 'var(--border-solid)', color: 'var(--text-muted)' }}
              >
                {enriching ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full" />
                    Enriching…
                  </span>
                ) : '✨ Enrich Descriptions with LLaVA'}
              </button>
            </Card>

            <Card title="Danger Zone">
              <p className="text-[12px] text-text-muted mb-3">
                Clearing the index removes all indexed clips and embeddings. Your original files are not deleted.
              </p>
              <button
                onClick={handleClearIndex}
                className={`w-full h-9 rounded-lg text-[12px] font-semibold border transition-colors ${
                  clearConfirm
                    ? 'bg-red-900/40 text-red-400 border-red-800'
                    : 'bg-surface2 hover:bg-red-900/20 text-red-500 border-border hover:border-red-800'
                }`}
              >
                {clearConfirm ? '⚠ Click again to confirm — this cannot be undone' : 'Clear Index'}
              </button>
            </Card>

            <Card title="About">
              <div className="space-y-1.5">
                <StatRow label="Version" value={`Beacon v${appVersion}`} />
                <StatRow label="License" value="MIT — Free and Open Source" />
                <div className="pt-1">
                  <a href="#" onClick={(e) => { e.preventDefault(); window.beacon?.openExternal('https://github.com/revitalize/beacon') }}
                    className="text-[12px] text-accent hover:underline">github.com/revitalize/beacon</a>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ── Cloud Storage tab ── */}
        {activeTab === 'cloud' && <CloudStorageSettingsTab />}

        {/* ── About tab ── */}
        {activeTab === 'about' && (
          <AboutTab appVersion={appVersion} dbStats={dbStats} />
        )}
      </div>
    </div>
  )
}

// ─── Cloud Storage Settings Tab ───────────────────────────────────────────────
const CLOUD_PROVIDERS = [
  {
    id: 'onedrive',
    label: 'OneDrive',
    color: '#0078D4',
    keyLabel: 'Application (Client) ID',
    keyPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    keyHint: 'From Azure Portal → App registrations → your app → Overview',
    setupUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade',
    setupSteps: [
      'Go to portal.azure.com → App registrations → New registration',
      'Name it "Beacon", select "Personal Microsoft accounts only"',
      'Authentication → Add platform → Mobile and desktop apps',
      'Check the nativeclient redirect URI box → Save',
      'Copy the Application (client) ID from Overview',
    ],
  },
  {
    id: 'gdrive',
    label: 'Google Drive',
    color: '#1A73E8',
    keyLabel: 'OAuth Client ID',
    keyPlaceholder: 'xxxxxxxxxx-xxxx.apps.googleusercontent.com',
    keyHint: 'From Google Cloud Console → APIs & Services → Credentials',
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
    setupSteps: [
      'Go to console.cloud.google.com → APIs & Services → Library',
      'Search "Google Drive API" → Enable it',
      'Credentials → Create Credentials → OAuth 2.0 Client ID → Desktop app',
      'Add redirect URI: http://localhost:3414/beacon-callback',
      'Copy the Client ID (ends in .apps.googleusercontent.com)',
    ],
  },
  {
    id: 'dropbox',
    label: 'Dropbox',
    color: '#0061FF',
    keyLabel: 'App Key',
    keyPlaceholder: 'xxxxxxxxxxxxxxxxxxxx',
    keyHint: 'From Dropbox Developer Console → your app → Settings',
    setupUrl: 'https://www.dropbox.com/developers/apps/create',
    setupSteps: [
      'Go to dropbox.com/developers → Create app',
      'Choose "Scoped access" → "Full Dropbox" → name it "Beacon"',
      'Permissions tab → enable files.content.read → Submit',
      'Settings tab → Add redirect URI: http://localhost:3415/beacon-callback',
      'Copy the App key from the Settings tab',
    ],
  },
]

function CloudStorageSettingsTab() {
  const [keys, setKeys] = useState(() => ({
    onedrive: localStorage.getItem('beacon_onedrive_client_id') || '',
    gdrive:   localStorage.getItem('beacon_gdrive_client_id') || '',
    dropbox:  localStorage.getItem('beacon_dropbox_client_id') || '',
  }))
  const [saved, setSaved] = useState({})

  function save(providerId) {
    const val = keys[providerId].trim()
    localStorage.setItem(`beacon_${providerId}_client_id`, val)
    setSaved(s => ({ ...s, [providerId]: true }))
    setTimeout(() => setSaved(s => ({ ...s, [providerId]: false })), 2000)
  }

  function clear(providerId) {
    localStorage.removeItem(`beacon_${providerId}_client_id`)
    // Also clear auth tokens
    localStorage.removeItem(`beacon_${providerId}_tokens`)
    setKeys(k => ({ ...k, [providerId]: '' }))
  }

  return (
    <div>
      <p className="text-[12px] text-text-dim mb-6 leading-relaxed">
        Enter your API credentials below — done once by an admin. Volunteers just click "Sign in" without seeing any of this.
        Each service requires a free developer app registration.
      </p>

      {CLOUD_PROVIDERS.map(prov => {
        const isConfigured = keys[prov.id].trim().length > 0
        return (
          <div key={prov.id} className="mb-4 rounded-xl p-4 border border-[var(--border-solid)]" style={{ background: 'var(--surface)' }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: isConfigured ? '#4CAF50' : '#9E9E9E' }} />
              <span className="text-[13px] font-semibold text-text-primary">{prov.label}</span>
              <span className="text-[11px] text-text-dim ml-auto">{isConfigured ? '✓ Configured' : 'Not configured'}</span>
            </div>

            {/* Key input */}
            <div className="mb-1">
              <label className="block text-[11px] font-bold text-text-dim tracking-wider mb-1.5 uppercase">{prov.keyLabel}</label>
              <div className="flex gap-2">
                <input
                  value={keys[prov.id]}
                  onChange={e => setKeys(k => ({ ...k, [prov.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && save(prov.id)}
                  placeholder={prov.keyPlaceholder}
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-solid)] bg-bg text-text-primary text-[12px] font-mono outline-none"
                  style={{ minWidth: 0 }}
                />
                <button
                  onClick={() => save(prov.id)}
                  disabled={!keys[prov.id].trim()}
                  className="px-3 py-2 rounded-lg text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
                  style={{ background: saved[prov.id] ? '#4CAF50' : prov.color, minWidth: 64 }}
                >
                  {saved[prov.id] ? '✓ Saved' : 'Save'}
                </button>
                {isConfigured && (
                  <button onClick={() => clear(prov.id)} className="px-3 py-2 rounded-lg text-[12px] font-semibold text-text-dim border border-[var(--border-solid)] hover:text-red-400 transition-colors">
                    Clear
                  </button>
                )}
              </div>
              <p className="text-[11px] text-text-dim mt-1.5">{prov.keyHint}</p>
            </div>

            {/* Setup instructions (collapsed) */}
            <details className="mt-3">
              <summary className="text-[11px] font-semibold cursor-pointer select-none" style={{ color: prov.color }}>
                How to get a free {prov.label} App key →
              </summary>
              <ol className="mt-2 text-[11px] text-text-dim leading-7 pl-4">
                {prov.setupSteps.map((step, i) => (
                  <li key={i}>{i + 1}. {step}</li>
                ))}
              </ol>
              <button
                onClick={() => window.beacon?.openExternal(prov.setupUrl)}
                className="mt-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white"
                style={{ background: prov.color }}
              >
                Open {prov.label} Dev Console →
              </button>
            </details>
          </div>
        )
      })}
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-start gap-4">
      {/* text — min-w-0 lets it compress so the toggle never gets pushed outside the card */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-text-primary font-medium">{label}</p>
        {description && <p className="text-[11px] text-text-dim mt-0.5 leading-relaxed">{description}</p>}
      </div>
      {/* toggle pill — overflow-hidden clips the knob to the pill bounds */}
      <button
        onClick={onChange}
        className={`relative flex-shrink-0 overflow-hidden rounded-full transition-colors mt-0.5 ${
          checked ? 'bg-accent' : 'bg-surface3'
        }`}
        style={{ width: 44, height: 24 }}
        role="switch"
        aria-checked={checked}
      >
        <span
          className="absolute bg-white rounded-full shadow transition-transform"
          style={{
            top: 4, width: 16, height: 16,
            transform: checked ? 'translateX(24px)' : 'translateX(4px)',
          }}
        />
      </button>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="rounded-2xl p-4 border border-[var(--border-solid)]"
      style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}
    >
      <h3 className="text-[12px] font-bold text-text-dim uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Select({ value, options, labels, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-3 rounded-lg text-[13px] bg-surface2 border border-border text-text-primary focus:border-accent appearance-none cursor-pointer"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6B80' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
    >
      {options.map((opt, i) => (
        <option key={opt} value={opt}>{labels?.[i] || opt}</option>
      ))}
    </select>
  )
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-text-muted">{label}</span>
      <span className="text-[12px] text-text-primary font-medium">{value || '—'}</span>
    </div>
  )
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

// ─── About Tab ────────────────────────────────────────────────────────────────

function AboutTab({ appVersion, dbStats }) {
  const [specs, setSpecs] = useState(null)
  useEffect(() => { window.beacon?.getMachineSpecs().then(setSpecs).catch(() => {}) }, [])

  const links = [
    { label: 'GitHub', url: 'https://github.com/revitalize/beacon', icon: '⌥' },
    { label: 'Report a Bug', url: 'https://github.com/revitalize/beacon/issues', icon: '🐛' },
    { label: 'Release Notes', url: 'https://github.com/revitalize/beacon/releases', icon: '📋' },
  ]

  return (
    <div className="space-y-5">
      {/* Identity card */}
      <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--neu-raise-sm)' }}>
        <div style={{ background: 'linear-gradient(135deg, #0D1535 0%, #1a2456 100%)', padding: '28px 24px', display: 'flex', alignItems: 'center', gap: 18 }}>
          <img src={logoSrc} alt="Beacon" style={{ width: 64, height: 64, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }} />
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>BEACON</div>
            <div style={{ fontSize: 12, color: '#6B8FFF', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>Media Library</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>Free, local, open-source church media library</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#6B8FFF' }}>v{appVersion}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>MIT License</div>
          </div>
        </div>
      </div>

      {/* System info */}
      <Card title="This Machine">
        <div className="space-y-1.5">
          {specs ? (
            <>
              <StatRow label="Model" value={specs.model || 'Mac'} />
              <StatRow label="Memory" value={`${specs.ramGb} GB RAM`} />
              <StatRow label="CPU" value={`${specs.cores} cores${specs.isAppleSilicon ? ' · Apple Silicon' : ''}`} />
              <StatRow label="Architecture" value={specs.arch} />
              <StatRow label="Recommended tier" value={specs.tier === 'full' ? '⚡ Full AI (llava:13b)' : specs.tier === 'balanced' ? '⚖ Balanced (llava:13b)' : '🪶 Light (llava:7b)'} />
            </>
          ) : (
            <div className="text-[12px] text-text-muted">Loading…</div>
          )}
        </div>
      </Card>

      {/* Library stats */}
      {dbStats && (
        <Card title="Your Library">
          <div className="space-y-1.5">
            <StatRow label="Total clips" value={(dbStats.total_clips || 0).toLocaleString()} />
            <StatRow label="Total size" value={formatSize(dbStats.total_size_bytes)} />
            <StatRow label="Database size" value={formatSize(dbStats.db_size_bytes)} />
            <StatRow label="Embeddings" value={(dbStats.clips_with_embeddings || 0).toLocaleString()} />
          </div>
        </Card>
      )}

      {/* Links */}
      <Card title="Resources">
        <div className="space-y-2">
          {links.map(l => (
            <button key={l.url} onClick={() => window.beacon?.openExternal(l.url)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--border-solid)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{l.icon}</span>
              <span className="text-[13px] text-accent font-medium">{l.label}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{ marginLeft: 'auto' }}>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </button>
          ))}
        </div>
      </Card>

      {/* Credits */}
      <div style={{ textAlign: 'center', padding: '8px 0 16px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        Built with ♥ for church media teams everywhere<br/>
        Electron · React · FastAPI · SQLite · Ollama
      </div>
    </div>
  )
}
