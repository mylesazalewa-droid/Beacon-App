import { useState, useEffect, useCallback, useRef } from 'react'
import WelcomeScreen from './components/WelcomeScreen'
import HelpPanel from './components/HelpPanel'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import ResultBar from './components/ResultBar'
import ClipGrid from './components/ClipGrid'
import DetailPanel from './components/DetailPanel'
import Lightbox from './components/Lightbox'
import IngestScreen from './components/IngestScreen'
import IngestProgressBar from './components/IngestProgressBar'
import Settings from './components/settings/Settings'
import SetupScreen from './components/SetupScreen'
import EventIngestModal from './components/EventIngestModal'
import PeopleView from './components/PeopleView'
import ExportModal from './components/ExportModal'
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal'
import BatchEditPanel from './components/BatchEditPanel'
import ShotListPanel from './components/ShotListPanel'
import CloudStoragePanel from './components/CloudStoragePanel'
import { ToastProvider, useToast } from './components/Toast'
import { useSearch } from './hooks/useSearch'
import { useIngest } from './hooks/useIngest'
import { getCategories, starClip, rateClip, getClips, getPersonClips, addClipToCollection, getCollectionClips,
         getHighlights, createSavedSearch, shareClips, exportFcpXml, updateClip, getProjectClips, getWatchFolders } from './utils/api'

const IN_ELECTRON = !!window.beacon

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}

function AppInner() {
  const [appState, setAppState] = useState('loading')
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('beacon_welcomed'))
  const [showHelp, setShowHelp] = useState(false)
  const [helpSection, setHelpSection] = useState('getting-started')
  const [view, setView] = useState('library')
  const [categories, setCategories] = useState([])
  const [selectedClip, setSelectedClip] = useState(null)
  const [selectedClips, setSelectedClips] = useState(new Set()) // multi-select
  const [backendError, setBackendError] = useState(null)
  const [similarMode, setSimilarMode] = useState(false)
  const suppressViewRefreshRef = useRef(false) // set to true when a handler loads its own clips so the view-change effect doesn't overwrite them
  const [activeCollection, setActiveCollection] = useState(null)
  const [eventModal, setEventModal] = useState(null)
  const [pendingIngestPath, setPendingIngestPath] = useState(null)
  const [volumeImportModal, setVolumeImportModal] = useState(null)
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [showExport, setShowExport] = useState(false)
  const [starredCount, setStarredCount] = useState(0)
  const [lightbox, setLightbox] = useState(null)   // { index: number } when open
  const [activeView, setActiveView] = useState(null)  // 'highlights' | 'saved-search' | 'recent' etc.
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showBatchEdit, setShowBatchEdit] = useState(false)
  const [showShotLists, setShowShotLists] = useState(false)
  const [showOneDrive, setShowOneDrive] = useState(false)
  const [activeStatus, setActiveStatus] = useState(null)
  const [activeProject, setActiveProject] = useState(null)
  const toast = useToast()
  const [recentlyImportedView, setRecentlyImportedView] = useState(false)
  const [activeSavedSearch, setActiveSavedSearch] = useState(null)
  const searchInputRef = useRef(null)

  const { query, setQuery, categoryId, setCategoryId, colorFamily, setColorFamily,
          status: searchStatus, setStatus: setSearchStatus,
          noProject, setNoProject,
          shotType, setShotType,
          clips, setClips, loading, matchType, total, refresh, abort } = useSearch()

  // ── Global ingest state (persists across view changes) ──────────────────────
  const ingest = useIngest(useCallback(() => {
    refresh()
    loadCategories()
    // Update dock badge with count of clips from last import
    if (window.beacon?.setBadgeCount) {
      getClips(null, null, 1000).then(d => {
        const cutoff = new Date(Date.now() - 10 * 60 * 1000) // last 10 min
        const newCount = (d.clips || []).filter(c => new Date(c.date_ingested) > cutoff).length
        if (newCount > 0) window.beacon.setBadgeCount(newCount)
      }).catch(() => {})
    }
  }, []))

  // ── App initialization ──────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      if (!IN_ELECTRON) { setAppState('ready'); return }
      const setup = await window.beacon.checkSetup().catch(() => ({ needsSetup: false }))
      setAppState(setup.needsSetup ? 'setup' : 'ready')
    }
    init()
  }, [])

  useEffect(() => {
    if (!IN_ELECTRON) return
    const unsub = window.beacon.onBackendReady(() => { loadCategories(); refresh() })
    return unsub
  }, [])

  useEffect(() => {
    if (!IN_ELECTRON) return
    const unsub = window.beacon.onBackendError((msg) => setBackendError(msg))
    return unsub
  }, [])

  useEffect(() => {
    if (!IN_ELECTRON) return
    const unsub = window.beacon.onNeedsSetup?.(() => setAppState('setup'))
    return unsub
  }, [])

  useEffect(() => {
    if (!IN_ELECTRON) return
    const unNav    = window.beacon.onNavigate((v) => setView(v))
    const unFocus  = window.beacon.onFocusSearch(() => {
      setView('library')
      setTimeout(() => searchInputRef.current?.focus(), 50)
    })
    const unHelp   = window.beacon.onOpenHelp?.(() => { setHelpSection('getting-started'); setShowHelp(true) })
    const unShorts = window.beacon.onOpenShortcuts?.(() => { setHelpSection('shortcuts'); setShowHelp(true) })
    return () => { unNav?.(); unFocus?.(); unHelp?.(); unShorts?.() }
  }, [])

  // SD card / volume auto-detect
  useEffect(() => {
    if (!IN_ELECTRON) return
    const unsub = window.beacon.onVolumeMounted?.((data) => {
      setVolumeImportModal(data)
    })
    return unsub
  }, [])

  // Watch folder auto-refresh — poll every 20s; refresh when watcher ingests new files
  useEffect(() => {
    let lastCount = null
    const check = async () => {
      try {
        const data = await getWatchFolders()
        if ((data.folders || []).length === 0) return
        const stats = await fetch('http://localhost:7842/watch-folders/stats').then(r => r.json()).catch(() => null)
        if (!stats) return
        if (lastCount !== null && stats.ingest_count !== lastCount) {
          refresh()
          loadCategories()
        }
        lastCount = stats.ingest_count
      } catch (_) {}
    }
    check()
    const id = setInterval(check, 20000)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setView('library')
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      // ? key opens shortcuts panel (not when typing in input)
      if (e.key === '?' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setShowShortcuts(v => !v)
      }
      // ⌘⇧H opens Help panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault()
        setHelpSection('getting-started')
        setShowHelp(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Arrow key navigation through clips + Space=lightbox
  useEffect(() => {
    if (view !== 'library' && view !== 'starred') return
    if (lightbox !== null) return  // lightbox has its own handlers
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Escape') {
        setSelectedClip(null)
        setSelectedClips(new Set())
        if (similarMode) { setSimilarMode(false); refresh() }
        return
      }
      if (!clips.length) return
      const idx = selectedClip ? clips.findIndex((c) => c.id === selectedClip.id) : -1
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedClip(clips[Math.min(idx + 1, clips.length - 1)])
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedClip(clips[Math.max(idx - 1, 0)])
      }
      // Space = open lightbox on selected clip
      if (e.key === ' ' && selectedClip) {
        e.preventDefault()
        setLightbox({ index: Math.max(0, idx) })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [view, clips, selectedClip, similarMode, lightbox])

  const loadCategories = useCallback(async () => {
    try {
      const data = await getCategories()
      setCategories(data.categories || [])
    } catch (_) {}
  }, [])

  const loadStarredCount = useCallback(async () => {
    try {
      const data = await getClips(null, null, 500, 0, true)
      setStarredCount(data.clips?.length ?? 0)
    } catch (_) {}
  }, [])

  // Star / unstar a clip — optimistic update
  const handleStar = useCallback(async (clip, starred) => {
    setClips(prev => prev.map(c => c.id === clip.id ? { ...c, starred } : c))
    toast(starred ? 'Starred' : 'Star removed', { icon: starred ? '⭐' : '☆' })
    try {
      await starClip(clip.id, starred)
      loadStarredCount()
      if (view === 'starred' && !starred) {
        setClips(prev => prev.filter(c => c.id !== clip.id))
      }
    } catch (err) {
      setClips(prev => prev.map(c => c.id === clip.id ? { ...c, starred: !starred } : c))
      console.error('Star failed:', err)
    }
  }, [view, setClips, loadStarredCount, toast])

  // Rate a clip (1-5, 0=clear) — optimistic update
  const handleRate = useCallback(async (clip, rating) => {
    setClips(prev => prev.map(c => c.id === clip.id ? { ...c, rating } : c))
    if (rating > 0) toast(`Rated ${rating} star${rating > 1 ? 's' : ''}`, { icon: '★' })
    try {
      await rateClip(clip.id, rating)
    } catch {
      setClips(prev => prev.map(c => c.id === clip.id ? { ...c, rating: clip.rating } : c))
    }
  }, [setClips, toast])

  // Open lightbox at specific clip
  const handleLightbox = useCallback((clip) => {
    const idx = clips.findIndex(c => c.id === clip.id)
    setLightbox({ index: Math.max(0, idx) })
  }, [clips])

  // Load highlights
  const handleSelectHighlights = useCallback(async () => {
    abort()
    suppressViewRefreshRef.current = true
    setActiveView('highlights')
    setView('library')
    setSelectedClip(null)
    setSelectedClips(new Set())
    setSimilarMode(false)
    setActiveCollection(null)
    setSelectedPerson(null)
    setActiveSavedSearch(null)
    try {
      const data = await getHighlights(200)
      setClips(data.clips || [])
    } catch (e) { suppressViewRefreshRef.current = false; console.error('getHighlights failed:', e) }
  }, [setClips, abort])

  // Load recently imported (last 48h)
  const handleSelectRecent = useCallback(async () => {
    abort()
    suppressViewRefreshRef.current = true
    setActiveView('recent')
    setView('library')
    setSelectedClip(null)
    setSimilarMode(false)
    setActiveCollection(null)
    setSelectedPerson(null)
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000)
    try {
      const data = await getClips(null, null, 500)
      const recent = (data.clips || []).filter(c => c.date_ingested && new Date(c.date_ingested) > cutoff)
      setClips(recent)
    } catch(e) { suppressViewRefreshRef.current = false; console.error(e) }
  }, [setClips, abort])

  // Filter by workflow status
  const handleSelectStatus = useCallback((status) => {
    setActiveStatus(status)
    setActiveProject(null)
    setNoProject(false)
    setSearchStatus(status)
    setActiveView('status')
    setView('library')
    setSelectedClip(null)
    setSelectedClips(new Set())
    setSimilarMode(false)
    setActiveCollection(null)
    setSelectedPerson(null)
    setActiveSavedSearch(null)
    setCategoryId(null)
    setColorFamily(null)
  }, [setSearchStatus, setNoProject, setCategoryId, setColorFamily])

  // Filter by project
  const handleSelectProject = useCallback(async (project) => {
    setActiveProject(project)
    setActiveStatus(null)
    setNoProject(false)
    setSearchStatus(null)
    if (!project) { refresh(); return }
    abort()
    suppressViewRefreshRef.current = true
    setActiveView('project')
    setView('library')
    setSelectedClip(null)
    setSelectedClips(new Set())
    setSimilarMode(false)
    setActiveCollection(null)
    setSelectedPerson(null)
    setActiveSavedSearch(null)
    try {
      const data = await getProjectClips(project.id)
      setClips(data.clips || [])
    } catch (e) { suppressViewRefreshRef.current = false; console.error(e) }
  }, [setSearchStatus, setNoProject, refresh, setClips, abort])

  // Filter to unused footage (not in any project)
  const handleSelectUnused = useCallback(() => {
    setActiveProject('unused')
    setActiveStatus(null)
    setSearchStatus(null)
    setNoProject(true)
    setActiveView('unused')
    setView('library')
    setSelectedClip(null)
    setSelectedClips(new Set())
    setSimilarMode(false)
    setActiveCollection(null)
    setSelectedPerson(null)
    setActiveSavedSearch(null)
    setCategoryId(null)
    setColorFamily(null)
  }, [setSearchStatus, setNoProject, setCategoryId, setColorFamily])

  // Load saved search
  const handleSelectSavedSearch = useCallback(async (search) => {
    setActiveSavedSearch(search)
    setActiveView('saved-search')
    setView('library')
    setSelectedClip(null)
    setSimilarMode(false)
    setActiveCollection(null)
    setSelectedPerson(null)
    setQuery(search.query || '')
    setCategoryId(search.category_id || null)
    setColorFamily(search.color_family || null)
  }, [setQuery, setCategoryId, setColorFamily])

  // Save current search as saved search
  const handleSaveSearch = useCallback(async (name, icon = '🔍') => {
    try {
      await createSavedSearch({ name, icon, query, category_id: categoryId, color_family: colorFamily })
    } catch (e) { console.error('saveSearch failed:', e) }
  }, [query, categoryId, colorFamily])

  // Load starred clips view
  const handleSelectStarred = useCallback(async () => {
    setView('starred')
    setSelectedClip(null)
    setSelectedClips(new Set())
    setSimilarMode(false)
    setActiveCollection(null)
    setSelectedPerson(null)
    try {
      const data = await getClips(null, null, 500, 0, true)
      setClips(data.clips || [])
    } catch (e) {
      console.error('getStarred failed:', e)
    }
  }, [setClips])

  // Drag a clip into a collection — adds to collection_clips table then opens the collection
  const handleDropClipToCollection = useCallback(async (clipId, coll) => {
    try {
      await addClipToCollection(coll.id, clipId)
      // Switch to the collection to show the clip was added
      await handleLoadCollection(coll)
    } catch (e) {
      console.error('addClipToCollection failed:', e)
    }
  }, [])  // eslint-disable-line

  // Load a collection — if it has manual clips use those, otherwise use query
  const handleLoadCollection = useCallback(async (coll) => {
    setActiveCollection(coll)
    setSelectedPerson(null)
    setSimilarMode(false)
    // First check if it has manually-added clips
    let manualClips = []
    try {
      const data = await getCollectionClips(coll.id)
      manualClips = data.clips || []
    } catch (_) {}

    if (manualClips.length > 0) {
      // Manual clip collection — suppress the view-change refresh, load our own clips
      abort()
      suppressViewRefreshRef.current = true
      setView('library')
      setClips(manualClips)
      setQuery('')
      setCategoryId(null)
      setColorFamily(null)
    } else {
      // Query-based smart collection — let useSearch handle it naturally
      setView('library')
      setQuery(coll.query || '')
      setCategoryId(coll.category_id || null)
      setColorFamily(coll.color_family || null)
    }
  }, [setClips, setQuery, setCategoryId, setColorFamily, abort])

  useEffect(() => {
    if (appState === 'ready') { loadCategories(); loadStarredCount() }
  }, [appState, loadCategories, loadStarredCount])

  useEffect(() => {
    if (view === 'library') {
      loadCategories()
      if (!similarMode) {
        if (suppressViewRefreshRef.current) {
          suppressViewRefreshRef.current = false   // consume the flag — don't call refresh()
        } else {
          refresh()
        }
      }
    }
    if (view === 'starred') loadStarredCount()
  }, [view])

  // Multi-select toggle
  const toggleClipSelection = useCallback((clip, e) => {
    const isMulti = e?.metaKey || e?.ctrlKey || e?.shiftKey
    if (isMulti) {
      setSelectedClips((prev) => {
        const next = new Set(prev)
        if (next.has(clip.id)) next.delete(clip.id)
        else next.add(clip.id)
        return next
      })
      setSelectedClip(null)
    } else {
      setSelectedClips(new Set())
      setSelectedClip((prev) => prev?.id === clip.id ? null : clip)
    }
  }, [])

  // Show clips for a person
  const handleSelectPerson = useCallback(async (person) => {
    abort()  // cancel any pending debounce / in-flight useSearch fetch so it can't overwrite our clips
    suppressViewRefreshRef.current = true   // also block the view-change effect
    // Clear all filter state so nothing re-triggers a search
    setSearchStatus(null)
    setNoProject(false)
    setActiveStatus(null)
    setActiveProject(null)
    setActiveView(null)
    setActiveSavedSearch(null)
    setSelectedPerson(person)
    setView('library')
    setSelectedClip(null)
    setSelectedClips(new Set())
    setSimilarMode(false)
    setActiveCollection(null)
    try {
      const data = await getPersonClips(person.id)
      setClips(data.clips || [])
    } catch (e) {
      suppressViewRefreshRef.current = false
      console.error('getPersonClips failed:', e)
    }
  }, [setClips, abort, setSearchStatus, setNoProject])

  // Download selected clips
  const handleDownload = useCallback(async (clipList) => {
    const paths = clipList.map((c) => c.original_path)
    const result = await window.beacon?.downloadClips(paths)
    if (result?.success) {
      setSelectedClips(new Set())
    }
  }, [])

  // Show similar clips
  const handleShowSimilar = useCallback((similarClips) => {
    setClips(similarClips)
    setSimilarMode(true)
    setSelectedClip(null)
  }, [setClips])

  const handleExitSimilar = useCallback(() => {
    setSimilarMode(false)
    refresh()
  }, [refresh])

  // Handle event modal confirm — store event metadata then start ingest
  const handleEventConfirm = useCallback(({ eventName, cameraAngle, renameFiles }) => {
    const folderPath = pendingIngestPath
    setEventModal(null)
    setPendingIngestPath(null)
    if (folderPath) {
      setView('ingest')
      // Small delay to let IngestScreen mount before starting
      setTimeout(() => {
        ingest.start(folderPath, false, { eventName, cameraAngle, renameFiles })
      }, 100)
    }
  }, [pendingIngestPath, ingest])

  const handleEventSkip = useCallback(() => {
    const folderPath = pendingIngestPath
    setEventModal(null)
    setPendingIngestPath(null)
    if (folderPath) {
      setView('ingest')
      setTimeout(() => ingest.start(folderPath, false), 100)
    }
  }, [pendingIngestPath, ingest])

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (appState === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-screen bg-bg">
        <div className="text-3xl mb-3 text-text-muted">▲</div>
        <div className="text-[13px] text-text-dim">Starting Beacon…</div>
      </div>
    )
  }

  if (appState === 'setup') {
    return (
      <div className="flex flex-col h-screen bg-bg overflow-hidden">
        <TitleBar />
        <SetupScreen onComplete={() => { setAppState('ready'); loadCategories() }} />
      </div>
    )
  }

  // Multi-select action bar data
  const selectedClipObjects = clips.filter((c) => selectedClips.has(c.id))

  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden">
      <TitleBar />

      <div className="titlebar-no-drag mt-[36px]">
        <TopBar
          query={query}
          onQuery={(q) => { setQuery(q); if (similarMode) setSimilarMode(false); if (activeCollection) setActiveCollection(null); if (selectedPerson) setSelectedPerson(null); if (activeView) setActiveView(null); if (activeSavedSearch) setActiveSavedSearch(null); if (activeStatus) { setActiveStatus(null); setSearchStatus(null) }; if (activeProject) { setActiveProject(null); setNoProject(false) }; if (view !== 'library') setView('library') }}
          onExport={() => setShowExport(true)}
          view={view}
          onViewChange={setView}
          searchInputRef={searchInputRef}
          onShortcuts={() => setShowShortcuts(true)}
          onHelp={() => { setHelpSection('getting-started'); setShowHelp(true) }}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          categories={categories}
          selectedCategory={categoryId}
          onSelectCategory={(id) => { setCategoryId(id); setColorFamily(null); setView('library'); setSimilarMode(false); setSelectedPerson(null); setActiveStatus(null); setActiveProject(null); setSearchStatus(null); setNoProject(false); setActiveView(null) }}
          selectedColorFamily={colorFamily}
          onSelectColorFamily={(fam) => { setColorFamily(fam); setView('library'); setSimilarMode(false); setSelectedPerson(null); setActiveStatus(null); setActiveProject(null); setSearchStatus(null); setNoProject(false); setActiveView(null) }}
          activeCollection={activeCollection}
          onSelectCollection={(coll) => {
            if (coll) {
              handleLoadCollection(coll)
            } else {
              setActiveCollection(null)
            }
          }}
          currentQuery={query}
          currentColorFamily={colorFamily}
          onIngest={() => setView('ingest')}
          onSettings={() => setView('settings')}
          onPeople={() => { setView('people'); setSelectedPerson(null) }}
          view={view}
          starredCount={starredCount}
          onSelectStarred={handleSelectStarred}
          onDropClipToCollection={handleDropClipToCollection}
          onSelectHighlights={handleSelectHighlights}
          onSelectSavedSearch={handleSelectSavedSearch}
          activeSavedSearch={activeSavedSearch}
          activeView={activeView}
          onSelectRecent={handleSelectRecent}
          activeStatus={activeStatus}
          onSelectStatus={handleSelectStatus}
          activeProject={activeProject}
          onSelectProject={handleSelectProject}
          onSelectUnused={handleSelectUnused}
          onShotLists={() => setShowShotLists(true)}
          onOpenOneDrive={() => setShowOneDrive(true)}
          onCategoriesChange={loadCategories}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {view === 'library' && (
            <>
              {/* Highlights / Saved Search header */}
              {activeView === 'highlights' && (
                <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-solid)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Best Picks</span>
                  <span className="text-[11px] ml-auto tabular-nums" style={{ color: 'var(--text-dim)' }}>
                    Top {clips.length} clips by quality score
                  </span>
                  <button onClick={() => { setActiveView(null); refresh() }} className="text-[11px] text-text-dim hover:text-text-primary ml-2">✕</button>
                </div>
              )}
              {activeView === 'saved-search' && activeSavedSearch && (
                <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-solid)' }}>
                  <span className="text-base">{activeSavedSearch.icon}</span>
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{activeSavedSearch.name}</span>
                  <span className="text-[11px] ml-auto tabular-nums" style={{ color: 'var(--text-dim)' }}>{clips.length} clips</span>
                  <button onClick={() => { setActiveSavedSearch(null); setActiveView(null); refresh() }} className="text-[11px] text-text-dim hover:text-text-primary ml-2">✕</button>
                </div>
              )}
              {activeView === 'status' && activeStatus && (
                <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-solid)' }}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: { unreviewed:'#9090A8', approved:'#2ECC71', in_use:'#6B8FFF', archived:'#AAAABC' }[activeStatus] }} />
                  <span className="text-[13px] font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
                    {{ unreviewed: 'Unreviewed', approved: 'Approved', in_use: 'In Use', archived: 'Archived' }[activeStatus]} Clips
                  </span>
                  <span className="text-[11px] ml-auto tabular-nums" style={{ color: 'var(--text-dim)' }}>{clips.length} clips</span>
                  <button onClick={() => { setActiveStatus(null); setSearchStatus(null); setActiveView(null); refresh() }} className="text-[11px] text-text-dim hover:text-text-primary ml-2">✕</button>
                </div>
              )}
              {activeView === 'project' && activeProject && activeProject !== 'unused' && (
                <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-solid)' }}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activeProject.color }} />
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{activeProject.name}</span>
                  <span className="text-[11px] ml-auto tabular-nums" style={{ color: 'var(--text-dim)' }}>{clips.length} clips</span>
                  <button onClick={() => { setActiveProject(null); setActiveView(null); refresh() }} className="text-[11px] text-text-dim hover:text-text-primary ml-2">✕</button>
                </div>
              )}
              {activeView === 'unused' && (
                <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-solid)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Unused Footage</span>
                  <span className="text-[11px] ml-auto tabular-nums" style={{ color: 'var(--text-dim)' }}>{clips.length} clips not yet in any project</span>
                  <button onClick={() => { setActiveProject(null); setNoProject(false); setActiveView(null); refresh() }} className="text-[11px] text-text-dim hover:text-text-primary ml-2">✕</button>
                </div>
              )}
              {activeView == null && (
                <ResultBar
                  total={selectedPerson ? clips.length : (similarMode ? clips.length : total)}
                  query={query}
                  matchType={matchType}
                  loading={loading}
                  similarMode={similarMode}
                  onExitSimilar={handleExitSimilar}
                  activeCollection={activeCollection}
                  selectedPerson={selectedPerson}
                  onExitPerson={() => { setSelectedPerson(null); refresh() }}
                />
              )}
              <ClipGrid
                clips={clips}
                selectedClip={selectedClip}
                selectedClips={selectedClips}
                onSelect={toggleClipSelection}
                onStar={handleStar}
                onRate={handleRate}
                onLightbox={handleLightbox}
                onShowSimilar={handleShowSimilar}
                onHide={async (clip) => {
                  await fetch(`http://localhost:7842/clips/${clip.id}/hide`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({clip_id: clip.id, hidden: true}) })
                  refresh()
                }}
                query={activeView ? '' : query}
                onClearSearch={() => { setQuery(''); setSimilarMode(false) }}
                onIngest={() => setView('ingest')}
                activeColorFilter={colorFamily}
                onClearColorFilter={() => setColorFamily(null)}
                activeShotType={shotType}
                onSelectShotType={(st) => { setShotType(st); setSelectedPerson(null); setActiveView(null); setActiveStatus(null); setActiveProject(null); setNoProject(false); setView('library') }}
                onClearShotType={() => setShotType(null)}
                onOpenSettings={() => setView('settings')}
              />
            </>
          )}
          {view === 'starred' && (
            <>
              <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-solid)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--gold)" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Starred Clips
                </span>
                <span className="text-[11px] ml-auto tabular-nums" style={{ color: 'var(--text-dim)' }}>
                  {clips.length} clip{clips.length !== 1 ? 's' : ''}
                </span>
              </div>
              <ClipGrid
                clips={clips}
                selectedClip={selectedClip}
                selectedClips={selectedClips}
                onSelect={toggleClipSelection}
                onStar={handleStar}
                onRate={handleRate}
                onLightbox={handleLightbox}
                onShowSimilar={handleShowSimilar}
                onHide={async (clip) => {
                  await fetch(`http://localhost:7842/clips/${clip.id}/hide`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({clip_id: clip.id, hidden: true}) })
                  handleSelectStarred()
                }}
                query=""
                onClearSearch={() => {}}
                onIngest={() => setView('ingest')}
              />
            </>
          )}
          {view === 'people' && (
            <PeopleView
              onSelectPerson={handleSelectPerson}
              onRecluster={refresh}
            />
          )}
          {view === 'ingest' && (
            <IngestScreen
              ingest={ingest}
              onDone={() => { refresh(); loadCategories(); setView('library') }}
              onOpenEventModal={(folderPath) => {
                setPendingIngestPath(folderPath)
                setEventModal({})
              }}
            />
          )}
          {view === 'settings' && (
            <Settings categories={categories} onCategoriesChange={loadCategories} />
          )}
        </div>

        {/* Shot list panel — rendered inside the flex row so drags from the grid reach it */}
        {showShotLists && (
          <ShotListPanel onClose={() => setShowShotLists(false)} />
        )}

        {(view === 'library' || view === 'starred') && selectedClip && !selectedClips.size && !showShotLists && (
          <DetailPanel
            clip={selectedClip}
            onClose={() => setSelectedClip(null)}
            onSearch={(kw) => { setQuery(kw); setSimilarMode(false); setView('library') }}
            onRefresh={view === 'starred' ? handleSelectStarred : refresh}
            onDownload={(clip) => handleDownload([clip])}
            onShowSimilar={handleShowSimilar}
            onColorFilter={(family) => { setColorFamily(family); setSelectedClip(null) }}
            onShotTypeFilter={(st) => { setShotType(st); setSelectedClip(null); setView('library') }}
          />
        )}
      </div>

      {/* Multi-select floating action bar */}
      {selectedClips.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 rounded-2xl px-3 py-2"
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border-mid)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)',
            backdropFilter: 'blur(20px)',
          }}>
          <div className="flex items-center gap-1.5 px-2 mr-0.5">
            <div className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
              style={{ background: 'var(--grad-accent)' }}>
              {selectedClips.size}
            </div>
            <span className="text-[11.5px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              selected
            </span>
          </div>
          <div className="w-px h-5 mx-1" style={{ background: 'var(--border-solid)' }} />
          <BatchBtn
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
            label="Download"
            onClick={() => handleDownload(selectedClipObjects)}
          />
          <BatchBtn
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/><path d="M3 15h18"/></svg>}
            label="Share ZIP"
            onClick={() => shareClips(Array.from(selectedClips))}
          />
          <BatchBtn
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>}
            label="FCP XML"
            onClick={() => exportFcpXml(Array.from(selectedClips))}
          />
          <div className="w-px h-5 bg-border mx-1" />
          <div className="w-px h-5 bg-border mx-1" />
          <BatchBtn
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
            label="Edit All"
            onClick={() => setShowBatchEdit(true)}
            accent
          />
          <BatchBtn
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
            label="Star All"
            onClick={() => { selectedClipObjects.forEach(c => handleStar(c, true)) }}
          />
          {/* Bulk Rate Stars */}
          <BulkRater onRate={(stars) => {
            selectedClipObjects.forEach(c => handleRate(c, stars))
            toast(`Rated ${stars}★ × ${selectedClipObjects.length}`, { icon: '★' })
          }} />
          <BatchBtn
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/></svg>}
            label="Hide All"
            onClick={async () => {
              for (const c of selectedClipObjects) {
                await fetch(`http://localhost:7842/clips/${c.id}/hide`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({clip_id: c.id, hidden: true}) })
              }
              toast(`Hidden ${selectedClipObjects.length} clip${selectedClipObjects.length > 1 ? 's' : ''}`, { icon: '🫥' })
              setSelectedClips(new Set())
              refresh()
            }}
          />
          <button
            onClick={() => setSelectedClips(new Set())}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-text-primary hover:bg-surface2 ml-1"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {/* Batch Edit Panel */}
      {showBatchEdit && selectedClips.size > 0 && (
        <BatchEditPanel
          selectedClipIds={selectedClips}
          onClose={() => setShowBatchEdit(false)}
          onApply={() => { setSelectedClips(new Set()); refresh(); loadCategories(); toast(`Updated ${selectedClips.size} clips`, { icon: '✅' }) }}
        />
      )}

      {/* Lightbox */}
      {lightbox !== null && clips.length > 0 && (
        <Lightbox
          clips={clips}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onStar={handleStar}
          onRate={handleRate}
        />
      )}

      {/* Persistent ingest progress bar — always visible when ingesting */}
      {ingest.running && view !== 'ingest' && (
        <IngestProgressBar
          currentFile={ingest.currentFile}
          progress={ingest.progress}
          onClick={() => setView('ingest')}
        />
      )}

      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          selectedClipIds={selectedClips}
          totalClips={total}
        />
      )}

      {showShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}

      {backendError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/80 border border-red-700 text-red-200 text-[12px] px-4 py-2 rounded-lg max-w-md text-center">
          ⚠ {backendError}
        </div>
      )}

      {/* Volume import folder picker — shown when SD card/drive mounts */}
      {volumeImportModal && (
        <VolumeImportModal
          volumeInfo={volumeImportModal}
          onConfirm={(folderPath) => {
            setVolumeImportModal(null)
            setPendingIngestPath(folderPath)
            setEventModal({ volumeInfo: volumeImportModal })
          }}
          onClose={() => setVolumeImportModal(null)}
        />
      )}

      {/* Event Ingest Modal — triggered by SD card mount or from IngestScreen */}
      {eventModal && (
        <EventIngestModal
          volumeInfo={eventModal.volumeInfo}
          onConfirm={handleEventConfirm}
          onSkip={pendingIngestPath ? handleEventSkip : null}
          onClose={() => { setEventModal(null); setPendingIngestPath(null) }}
        />
      )}

      {showHelp && (
        <HelpPanel
          initialSection={helpSection}
          onClose={() => setShowHelp(false)}
        />
      )}

      {showOneDrive && (
        <CloudStoragePanel onClose={() => setShowOneDrive(false)} />
      )}

      {showWelcome && appState === 'ready' && (
        <WelcomeScreen onDismiss={() => setShowWelcome(false)} />
      )}
    </div>
  )
}

// ── Volume Import Modal ────────────────────────────────────────────────────────
function VolumeImportModal({ volumeInfo, onConfirm, onClose }) {
  const [subfolders, setSubfolders] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch subfolders of the mounted volume
    const base = window._BEACON_BASE_URL || 'http://localhost:7842'
    fetch(`${base}/fs/subfolders?path=${encodeURIComponent(volumeInfo.path)}`)
      .then(r => r.json())
      .then(d => {
        const folders = d.subfolders || []
        setSubfolders(folders)
        // Auto-select DCIM if present (common SD card structure)
        const dcim = folders.find(f => f.name.toUpperCase() === 'DCIM')
        setSelected(dcim ? dcim.path : volumeInfo.path)
      })
      .catch(() => { setSelected(volumeInfo.path) })
      .finally(() => setLoading(false))
  }, [volumeInfo.path])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[460px] rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-solid)' }}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4" style={{ borderBottom: '1px solid var(--border-solid)' }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                  💾 Drive Detected
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border-solid)' }}>
                  {volumeInfo.name}
                </span>
              </div>
              <h2 className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Which folder do you want to import?
              </h2>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{volumeInfo.path}</p>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-dim)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {loading ? (
            <p className="text-center py-4 text-[12px]" style={{ color: 'var(--text-dim)' }}>Reading drive…</p>
          ) : (
            <div className="space-y-1">
              {/* Entire volume option */}
              <FolderOption
                label={`Entire drive — ${volumeInfo.name}`}
                path={volumeInfo.path}
                selected={selected === volumeInfo.path}
                onSelect={() => setSelected(volumeInfo.path)}
                isRoot
              />
              {subfolders.map(f => (
                <FolderOption
                  key={f.path}
                  label={f.name}
                  path={f.path}
                  selected={selected === f.path}
                  onSelect={() => setSelected(f.path)}
                />
              ))}
              {subfolders.length === 0 && (
                <p className="text-[11px] py-1 px-2 italic" style={{ color: 'var(--text-dim)' }}>No subfolders found — will import the entire drive.</p>
              )}
            </div>
          )}

          {/* Custom path option */}
          <button
            onClick={async () => {
              const picked = await window.beacon?.pickFolder()
              if (picked) setSelected(picked)
            }}
            className="text-[11px] transition-colors"
            style={{ color: 'var(--accent)' }}>
            + Choose a different folder…
          </button>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-xl text-[12px] font-medium transition-colors"
            style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border-solid)' }}>
            Dismiss
          </button>
          <button
            onClick={() => onConfirm(selected || volumeInfo.path)}
            disabled={!selected}
            className="flex-1 h-10 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40 btn-primary">
            Import from this folder →
          </button>
        </div>
      </div>
    </div>
  )
}

function FolderOption({ label, path, selected, onSelect, isRoot }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
      style={{
        background: selected ? 'rgba(107,143,255,0.08)' : 'var(--surface2)',
        border: selected ? '1.5px solid rgba(107,143,255,0.4)' : '1px solid var(--border-solid)',
      }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={selected ? 'var(--accent)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" opacity={selected ? 1 : 0.5}>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium truncate" style={{ color: selected ? 'var(--accent)' : 'var(--text-primary)' }}>{label}</p>
        {!isRoot && <p className="text-[10px] truncate" style={{ color: 'var(--text-dim)' }}>{path}</p>}
      </div>
      {selected && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      )}
    </button>
  )
}

function TitleBar() {
  return (
    <div className="titlebar-drag h-[36px] w-full flex items-center justify-center absolute top-0 left-0 right-0 z-50 pointer-events-none"
      style={{ borderBottom: '1px solid var(--border-solid)' }}>
      <span className="text-[10px] font-bold tracking-[0.25em] pointer-events-none select-none"
        style={{ color: 'var(--text-dim)' }}>
        BEACON
      </span>
    </div>
  )
}

function BatchBtn({ icon, label, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-[11.5px] font-semibold transition-all"
      style={{
        background: accent ? 'rgba(107,143,255,0.12)' : 'var(--surface3)',
        color: accent ? 'var(--accent)' : 'var(--text-muted)',
        border: accent ? '1px solid rgba(107,143,255,0.25)' : '1px solid var(--border-solid)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = accent ? 'white' : 'var(--text-primary)'
        e.currentTarget.style.background = accent ? 'var(--accent)' : 'var(--surface4)'
        e.currentTarget.style.borderColor = accent ? 'var(--accent)' : 'var(--border-mid)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = accent ? 'var(--accent)' : 'var(--text-muted)'
        e.currentTarget.style.background = accent ? 'rgba(107,143,255,0.12)' : 'var(--surface3)'
        e.currentTarget.style.borderColor = accent ? 'rgba(107,143,255,0.25)' : 'var(--border-solid)'
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function BulkRater({ onRate }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div
      className="flex items-center gap-0.5 px-2 h-8 rounded-xl"
      style={{ background: 'var(--surface3)', border: '1px solid var(--border-solid)' }}
      title="Rate all selected"
      onMouseLeave={() => setHovered(0)}
    >
      <span className="text-[9.5px] font-bold uppercase tracking-wide mr-1" style={{ color: 'var(--text-dim)' }}>Rate</span>
      {[1, 2, 3, 4, 5].map(s => (
        <button
          key={s}
          onMouseEnter={() => setHovered(s)}
          onClick={() => onRate(s)}
          className="p-0.5 transition-transform hover:scale-125"
          title={`Rate all ${s}★`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24"
            fill={s <= hovered ? '#F5B944' : 'none'}
            stroke={s <= hovered ? '#F5B944' : 'var(--text-dim)'}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      ))}
    </div>
  )
}
