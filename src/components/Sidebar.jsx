import { useState, useEffect, useRef } from 'react'
import { getOllamaStatus, getWatchFolders, getColorFamilies, getCollections, createCollection, deleteCollection, getPersons, getSavedSearches, deleteSavedSearch, getDbStats, getProjects, createProject, deleteProject, createCategory } from '../utils/api'
import logoSrc from '../assets/logo.png'
import { isConnected as onedriveConnected } from '../utils/onedrive'
import { isConnected as gdriveConnected } from '../utils/googledrive'
import { isConnected as dropboxConnected } from '../utils/dropbox'

// Clip drag data helpers
function getDragClipId(e) {
  try {
    const raw = e.dataTransfer.getData('application/beacon-clip')
    if (raw) return JSON.parse(raw).id
  } catch (_) {}
  return null
}

const FAMILY_COLORS = {
  red: '#E74C3C', orange: '#FF5722', yellow: '#F39C12', green: '#2ECC71',
  teal: '#1ABC9C', blue: '#3498DB', purple: '#9B59B6', pink: '#E91E63',
  dark: '#555566', bright: '#CCCCE0', neutral: '#888899',
}

const COLLECTION_ICONS = ['📁','⭐','🎵','📖','💧','🎉','🎤','📷','🎬','🕊️','✝️','🌍','💍','🏆','🔖']

const STATUS_ITEMS = [
  { value: 'unreviewed', label: 'Unreviewed', color: '#9090A8' },
  { value: 'approved',   label: 'Approved',   color: '#2ECC71' },
  { value: 'in_use',     label: 'In Use',      color: '#6B8FFF' },
  { value: 'archived',   label: 'Archived',    color: '#AAAABC' },
]

const PROJECT_COLORS = ['#6B8FFF', '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#E91E63', '#FF5722']

export default function Sidebar({
  categories, selectedCategory, onSelectCategory,
  selectedColorFamily, onSelectColorFamily,
  activeCollection, onSelectCollection,
  currentQuery, currentColorFamily,
  onIngest, onSettings, onPeople, view,
  starredCount, onSelectStarred,
  onDropClipToCollection,
  onSelectHighlights, onSelectSavedSearch,
  activeSavedSearch, activeView,
  onSelectRecent,
  activeStatus, onSelectStatus,
  activeProject, onSelectProject,
  onSelectUnused,
  onShotLists,
  onCategoriesChange,
  onOpenOneDrive,
}) {
  const [ollamaStatus, setOllamaStatus] = useState(null)
  const [watchFolders, setWatchFolders] = useState([])
  const [colorFamilies, setColorFamilies] = useState([])
  const [collections, setCollections] = useState([])
  const [savedSearches, setSavedSearches] = useState([])
  const [personCount, setPersonCount] = useState(0)
  const [dbStats, setDbStats] = useState(null)
  const [colorsOpen, setColorsOpen] = useState(true)
  const [collectionsOpen, setCollectionsOpen] = useState(true)
  const [savedSearchesOpen, setSavedSearchesOpen] = useState(true)
  const [savingCollection, setSavingCollection] = useState(false)
  const [newCollName, setNewCollName] = useState('')
  const [newCollIcon, setNewCollIcon] = useState('⭐')
  const [showNewColl, setShowNewColl] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [installingOllama, setInstallingOllama] = useState(false)
  const [installPct, setInstallPct] = useState(0)
  const [projects, setProjects] = useState([])
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0])
  const [savingProject, setSavingProject] = useState(false)
  const [workflowOpen, setWorkflowOpen] = useState(true)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const cleanupRef = useRef([])
  const nameInputRef = useRef(null)
  const projectNameRef = useRef(null)
  const categoryNameRef = useRef(null)

  useEffect(() => {
    loadAll()
    const interval = setInterval(() => getOllamaStatus().then(setOllamaStatus).catch(() => {}), 15000)
    return () => { clearInterval(interval); cleanupRef.current.forEach(fn => fn?.()) }
  }, [])

  useEffect(() => {
    if (showNewColl) setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [showNewColl])

  useEffect(() => {
    if (showNewProject) setTimeout(() => projectNameRef.current?.focus(), 50)
  }, [showNewProject])

  useEffect(() => {
    if (showNewCategory) setTimeout(() => categoryNameRef.current?.focus(), 50)
  }, [showNewCategory])

  const loadAll = () => {
    getOllamaStatus().then(setOllamaStatus).catch(() => {})
    getWatchFolders().then(d => setWatchFolders(d.folders || [])).catch(() => {})
    getColorFamilies().then(d => setColorFamilies(d.families || [])).catch(() => {})
    getCollections().then(d => setCollections(d.collections || [])).catch(() => {})
    getPersons().then(d => setPersonCount((d.persons || []).length)).catch(() => {})
    getSavedSearches().then(d => setSavedSearches(d.searches || [])).catch(() => {})
    getDbStats().then(d => setDbStats(d)).catch(() => {})
    getProjects().then(d => setProjects(d.projects || [])).catch(() => {})
  }

  const handleSaveProject = async () => {
    if (!newProjectName.trim()) return
    setSavingProject(true)
    try {
      const proj = await createProject({ name: newProjectName.trim(), color: newProjectColor })
      setProjects(prev => [...prev, proj])
      setNewProjectName('')
      setNewProjectColor(PROJECT_COLORS[0])
      setShowNewProject(false)
    } catch (e) { console.error('createProject failed:', e) }
    finally { setSavingProject(false) }
  }

  const handleSaveCategory = async () => {
    if (!newCategoryName.trim()) return
    setSavingCategory(true)
    try {
      await createCategory(newCategoryName.trim())
      setNewCategoryName('')
      setShowNewCategory(false)
      onCategoriesChange?.()
    } catch (e) { console.error('createCategory failed:', e) }
    finally { setSavingCategory(false) }
  }

  const handleDeleteProject = async (id, e) => {
    e.stopPropagation()
    try {
      await deleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      if (activeProject?.id === id) onSelectProject?.(null)
    } catch (e) { console.error(e) }
  }

  const handleInstallOllama = () => {
    setInstallingOllama(true)
    setInstallPct(0)
    const unProgress = window.beacon?.onOllamaInstallProgress(d => setInstallPct(d.pct || 0))
    const unComplete = window.beacon?.onOllamaInstallComplete(async (d) => {
      unProgress?.()
      setInstallingOllama(false)
      if (d.success) { await window.beacon?.launchOllama(); getOllamaStatus().then(setOllamaStatus).catch(() => {}) }
    })
    cleanupRef.current.push(unProgress, unComplete)
    window.beacon?.installOllama()
  }

  const handleSaveCollection = async () => {
    if (!newCollName.trim()) return
    setSavingCollection(true)
    try {
      const coll = await createCollection({
        name: newCollName.trim(),
        icon: newCollIcon,
        query: currentQuery || null,
        color_family: currentColorFamily || null,
        category_id: selectedCategory || null,
      })
      setCollections(prev => [...prev, coll])
      setNewCollName('')
      setNewCollIcon('⭐')
      setShowNewColl(false)
    } catch (e) {
      console.error('Save collection failed:', e)
    } finally {
      setSavingCollection(false)
    }
  }

  const handleDeleteCollection = async (id, e) => {
    e.stopPropagation()
    setDeletingId(id)
    try {
      await deleteCollection(id)
      setCollections(prev => prev.filter(c => c.id !== id))
      if (activeCollection?.id === id) onSelectCollection(null)
    } finally {
      setDeletingId(null)
    }
  }

  const totalClips = categories.reduce((s, c) => s + (c.clip_count || 0), 0)

  return (
    <div className="w-[218px] flex-shrink-0 flex flex-col overflow-hidden"
      style={{
        background: 'var(--bg)',
        borderRight: '1px solid rgba(0,0,0,0.06)',
      }}>

      {/* ── Brand header ────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '13px 14px 11px',
        borderBottom: '1px solid var(--border-solid)',
        flexShrink: 0,
        background: 'var(--bg)',
      }}>
        {/* Logo */}
        <img
          src={logoSrc}
          alt="Beacon"
          style={{
            width: 30, height: 30,
            borderRadius: 8,
            objectFit: 'cover',
            flexShrink: 0,
            boxShadow: 'var(--neu-raise-sm)',
          }}
        />
        {/* Wordmark */}
        <div>
          <div style={{
            fontSize: 13.5, fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '0.05em',
            lineHeight: 1.15,
          }}>BEACON</div>
          <div style={{
            fontSize: 8.5, fontWeight: 600,
            color: 'var(--accent)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginTop: 1,
            opacity: 0.8,
          }}>Media Library</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-2 pb-3 px-2.5 space-y-px">

        {/* ── Library ─────────────────────────────────────────────── */}
        <SectionLabel>Library</SectionLabel>
        <NavItem
          icon={<GridIcon />}
          label="All Footage"
          count={totalClips}
          active={view === 'library' && !selectedCategory && !selectedColorFamily && !activeCollection && !activeView && view !== 'people' && view !== 'starred'}
          onClick={() => { onSelectCategory(null); onSelectColorFamily?.(null); onSelectCollection?.(null) }}
        />
        {dbStats?.total_storage_bytes > 0 && (
          <p className="px-3 -mt-0.5 mb-1 text-[9px]" style={{ color: 'var(--text-dim)' }}>
            {formatSizeBytes(dbStats.total_storage_bytes)} total
          </p>
        )}
        <NavItem
          icon={<PeopleIcon />}
          label="People"
          count={personCount || undefined}
          active={view === 'people'}
          onClick={() => onPeople?.()}
        />
        <NavItem
          icon={<StarIcon />}
          label="Starred"
          count={starredCount || undefined}
          active={view === 'starred'}
          onClick={() => onSelectStarred?.()}
        />
        <NavItem
          icon={<HighlightIcon />}
          label="Best Picks"
          active={activeView === 'highlights'}
          onClick={() => onSelectHighlights?.()}
          accent
        />
        <NavItem
          icon={<ClockIcon />}
          label="Recent Import"
          active={activeView === 'recent'}
          onClick={() => onSelectRecent?.()}
        />
        <NavItem
          icon={<ListIcon />}
          label="Shot Lists"
          active={false}
          onClick={() => onShotLists?.()}
        />

        {/* ── Cloud ───────────────────────────────────────────────── */}
        <SectionLabel>Cloud</SectionLabel>
        <NavItem
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>}
          label="OneDrive"
          active={false}
          dot={onedriveConnected() ? '#0078D4' : '#9E9E9E'}
          onClick={() => onOpenOneDrive?.()}
        />
        <NavItem
          icon={<svg width="14" height="14" viewBox="0 0 87.3 78"><path fill="currentColor" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L29.85 48H0c0 1.55.4 3.1 1.2 4.5L6.6 66.85zM43.65 24 27.55 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 43.5A9 9 0 0 0 0 48h29.85L43.65 24zM73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 52.5c.8-1.4 1.2-2.95 1.2-4.5H57.45l6.2 12.35L73.55 76.8zM43.65 24 57.45 48h29.85c0-1.55-.4-3.1-1.2-4.5L62.95 3.3C62.15 1.9 61 .8 59.65 0L43.65 24zM29.85 48 13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L57.45 48H29.85z" opacity=".7"/></svg>}
          label="Google Drive"
          active={false}
          dot={gdriveConnected() ? '#1A73E8' : '#9E9E9E'}
          onClick={() => onOpenOneDrive?.()}
        />
        <NavItem
          icon={<svg width="14" height="13" viewBox="0 0 52 48"><path fill="currentColor" d="M13 0L0 8l13 8 13-8L13 0zM39 0L26 8l13 8 13-8L39 0zM0 24l13 8 13-8-13-8L0 24zM26 24l13 8 13-8-13-8-13 8zM13 34l13 8 13-8-13-8-13 8z" opacity=".7"/></svg>}
          label="Dropbox"
          active={false}
          dot={dropboxConnected() ? '#0061FF' : '#9E9E9E'}
          onClick={() => onOpenOneDrive?.()}
        />

        {/* ── Workflow (Status) ───────────────────────────────────── */}
        <SectionLabel
          action={<ChevronBtn open={workflowOpen} onClick={() => setWorkflowOpen(v => !v)} />}
        >Workflow</SectionLabel>
        {workflowOpen && STATUS_ITEMS.map(s => (
          <NavItem
            key={s.value}
            dot={s.color}
            label={s.label}
            active={activeStatus === s.value}
            onClick={() => onSelectStatus?.(s.value)}
          />
        ))}

        {/* ── Projects ───────────────────────────────────────────── */}
        <SectionLabel
          action={
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowNewProject(v => !v)}
                title="New project"
                className="w-5 h-5 rounded-md flex items-center justify-center transition-all"
                style={{ color: 'var(--text-dim)', background: showNewProject ? 'var(--accent-dim)' : 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = showNewProject ? 'var(--accent-dim)' : 'transparent' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <ChevronBtn open={projectsOpen} onClick={() => setProjectsOpen(v => !v)} />
            </div>
          }
        >Projects</SectionLabel>

        {showNewProject && (
          <div className="mx-0.5 mb-2 p-3 rounded-2xl space-y-2.5"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)', boxShadow: 'var(--shadow-inset)' }}>
            <div className="flex gap-1.5 flex-wrap">
              {PROJECT_COLORS.map(c => (
                <button key={c} onClick={() => setNewProjectColor(c)}
                  className="w-5 h-5 rounded-full transition-all"
                  style={{
                    backgroundColor: c,
                    border: newProjectColor === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                    boxShadow: newProjectColor === c ? `0 0 0 1px var(--bg)` : 'none',
                    transform: newProjectColor === c ? 'scale(1.15)' : 'scale(1)',
                  }} />
              ))}
            </div>
            <input
              ref={projectNameRef}
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveProject(); if (e.key === 'Escape') setShowNewProject(false) }}
              placeholder="Project name…"
              className="w-full h-7 px-2 rounded-lg text-[11px]"
              style={{ background: 'var(--surface3)', border: '1px solid var(--border-solid)', color: 'var(--text-primary)' }}
            />
            <div className="flex gap-1.5">
              <button onClick={() => setShowNewProject(false)}
                className="flex-1 h-7 rounded-xl text-[10px] font-semibold"
                style={{ background: 'var(--surface3)', border: '1px solid var(--border-solid)', color: 'var(--text-muted)' }}>
                Cancel
              </button>
              <button onClick={handleSaveProject} disabled={!newProjectName.trim() || savingProject}
                className="flex-1 h-7 rounded-xl text-[10px] font-bold text-white disabled:opacity-40 btn-primary">
                Create
              </button>
            </div>
          </div>
        )}

        {projectsOpen && (
          <>
            <NavItem
              icon={<UnusedIcon />}
              label="Unused Footage"
              active={activeProject === 'unused'}
              onClick={() => onSelectUnused?.()}
            />
            {projects.length === 0 && !showNewProject && (
              <p className="px-3 py-1 text-[10px] italic" style={{ color: 'var(--text-dim)' }}>No projects yet</p>
            )}
            {projects.map(proj => (
              <div key={proj.id} className="group/proj relative">
                <NavItem
                  dot={proj.color}
                  label={proj.name}
                  active={activeProject?.id === proj.id}
                  onClick={() => onSelectProject?.(proj)}
                />
                <button
                  onClick={(e) => handleDeleteProject(proj.id, e)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/proj:opacity-100 transition-opacity rounded-full w-4 h-4 flex items-center justify-center"
                  style={{ color: 'var(--text-dim)' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ))}
          </>
        )}

        {/* ── Categories ─────────────────────────────────────────── */}
        <>
          <SectionLabel
            action={
              <button
                onClick={() => setShowNewCategory(v => !v)}
                title="New category"
                className="w-5 h-5 rounded-md flex items-center justify-center transition-all"
                style={{ color: 'var(--text-dim)', background: showNewCategory ? 'var(--accent-dim)' : 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = showNewCategory ? 'var(--accent-dim)' : 'transparent' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            }
          >Categories</SectionLabel>

          {showNewCategory && (
            <div className="mx-0.5 mb-2 p-3 rounded-2xl space-y-2"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)', boxShadow: 'var(--shadow-inset)' }}>
              <input
                ref={categoryNameRef}
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveCategory(); if (e.key === 'Escape') setShowNewCategory(false) }}
                placeholder="Category name…"
                className="w-full h-7 px-2 rounded-lg text-[11px]"
                style={{ background: 'var(--surface3)', border: '1px solid var(--border-solid)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-1.5">
                <button onClick={() => setShowNewCategory(false)}
                  className="flex-1 h-7 rounded-xl text-[10px] font-semibold"
                  style={{ background: 'var(--surface3)', border: '1px solid var(--border-solid)', color: 'var(--text-muted)' }}>
                  Cancel
                </button>
                <button onClick={handleSaveCategory} disabled={!newCategoryName.trim() || savingCategory}
                  className="flex-1 h-7 rounded-xl text-[10px] font-bold text-white disabled:opacity-40 btn-primary">
                  Add
                </button>
              </div>
            </div>
          )}

          {categories.map(cat => (
            <NavItem
              key={cat.id}
              dot={cat.color}
              label={cat.name}
              count={cat.clip_count}
              active={selectedCategory === cat.id && !selectedColorFamily && !activeCollection}
              onClick={() => { onSelectCategory(cat.id); onSelectColorFamily?.(null); onSelectCollection?.(null) }}
            />
          ))}
        </>

        {/* ── Colors ─────────────────────────────────────────────── */}
        {colorFamilies.length > 0 && (
          <>
            <SectionLabel
              action={<ChevronBtn open={colorsOpen} onClick={() => setColorsOpen(v => !v)} />}
            >Colors</SectionLabel>
            {colorsOpen && colorFamilies.map(cf => (
              <NavItem
                key={cf.family}
                dot={FAMILY_COLORS[cf.family] || '#888'}
                label={cf.label}
                count={cf.count}
                active={selectedColorFamily === cf.family && !activeCollection}
                onClick={() => { onSelectCategory(null); onSelectColorFamily?.(cf.family); onSelectCollection?.(null) }}
              />
            ))}
          </>
        )}

        {/* ── Smart Collections ───────────────────────────────────── */}
        <>
          <SectionLabel
            action={
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowNewColl(v => !v)}
                  title="Save current view as collection"
                  className="w-5 h-5 rounded-md flex items-center justify-center transition-all"
                  style={{ color: 'var(--text-dim)', background: showNewColl ? 'var(--accent-dim)' : 'transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = showNewColl ? 'var(--accent-dim)' : 'transparent' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
                <ChevronBtn open={collectionsOpen} onClick={() => setCollectionsOpen(v => !v)} />
              </div>
            }
          >Collections</SectionLabel>

          {showNewColl && (
            <div className="mx-0.5 mb-2 p-3 rounded-2xl space-y-2.5"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border-solid)', boxShadow: 'var(--shadow-inset)' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Save current view</p>
              <div className="flex gap-1.5">
                <select
                  value={newCollIcon}
                  onChange={e => setNewCollIcon(e.target.value)}
                  className="w-9 h-7 rounded-lg text-center text-sm cursor-pointer"
                  style={{ background: 'var(--surface3)', border: '1px solid var(--border-solid)', color: 'var(--text-primary)' }}
                >
                  {COLLECTION_ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                </select>
                <input
                  ref={nameInputRef}
                  value={newCollName}
                  onChange={e => setNewCollName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveCollection(); if (e.key === 'Escape') setShowNewColl(false) }}
                  placeholder="Collection name…"
                  className="flex-1 h-7 px-2 rounded-lg text-[11px]"
                  style={{ background: 'var(--surface3)', border: '1px solid var(--border-solid)', color: 'var(--text-primary)' }}
                />
              </div>
              {(currentQuery || selectedCategory || currentColorFamily) && (
                <p className="text-[9px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                  Saving: {[
                    currentQuery && `"${currentQuery}"`,
                    selectedCategory && categories.find(c => c.id === selectedCategory)?.name,
                    currentColorFamily && currentColorFamily,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="flex gap-1.5">
                <button onClick={() => setShowNewColl(false)}
                  className="flex-1 h-7 rounded-xl text-[10px] font-semibold transition-all"
                  style={{ background: 'var(--surface3)', border: '1px solid var(--border-solid)', color: 'var(--text-muted)' }}>
                  Cancel
                </button>
                <button onClick={handleSaveCollection} disabled={!newCollName.trim() || savingCollection}
                  className="flex-1 h-7 rounded-xl text-[10px] font-bold text-white disabled:opacity-40 transition-all btn-primary">
                  Save
                </button>
              </div>
            </div>
          )}

          {collectionsOpen && collections.length === 0 && !showNewColl && (
            <p className="px-3 py-1.5 text-[10px] italic" style={{ color: 'var(--text-dim)' }}>
              No collections yet
            </p>
          )}

          {collectionsOpen && collections.map(coll => (
            <CollectionDropTarget
              key={coll.id}
              coll={coll}
              active={activeCollection?.id === coll.id}
              onSelect={() => { onSelectCollection?.(coll); onSelectCategory(null); onSelectColorFamily?.(null) }}
              onDelete={e => handleDeleteCollection(coll.id, e)}
              onDrop={(clipId) => onDropClipToCollection?.(clipId, coll)}
              deletingId={deletingId}
            />
          ))}
        </>

        {/* ── Saved Searches ──────────────────────────────────────── */}
        {savedSearches.length > 0 && (
          <>
            <SectionLabel
              action={<ChevronBtn open={savedSearchesOpen} onClick={() => setSavedSearchesOpen(v => !v)} />}
            >Saved Searches</SectionLabel>
            {savedSearchesOpen && savedSearches.map(s => (
              <div key={s.id} className="group/ss relative">
                <NavItem
                  icon={<span className="text-[13px] leading-none">{s.icon}</span>}
                  label={s.name}
                  active={activeSavedSearch?.id === s.id}
                  onClick={() => onSelectSavedSearch?.(s)}
                />
                <button
                  onClick={async (e) => { e.stopPropagation(); await deleteSavedSearch(s.id); setSavedSearches(prev => prev.filter(x => x.id !== s.id)) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/ss:opacity-100 transition-opacity rounded-full w-4 h-4 flex items-center justify-center"
                  style={{ color: 'var(--text-dim)' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ))}
          </>
        )}

        {/* ── Watch Folders ───────────────────────────────────────── */}
        {watchFolders.length > 0 && (
          <>
            <SectionLabel>Watching</SectionLabel>
            {watchFolders.map(f => (
              <div key={f} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--text-dim)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 opacity-60">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span className="text-[10px] truncate font-medium" title={f}>{f.split('/').pop()}</span>
                <span className="ml-auto">
                  <svg width="6" height="6" viewBox="0 0 8 8" fill="#22c55e"><circle cx="4" cy="4" r="4"/></svg>
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-2.5 pb-3 space-y-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 10 }}>

        {installingOllama ? (
          <div className="p-3 rounded-2xl space-y-2" style={{ background: 'var(--bg)', boxShadow: 'inset 3px 3px 7px #C5C7D4, inset -3px -3px 7px #FFFFFF' }}>
            <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <span>Installing Ollama…</span>
              <span className="tabular-nums font-bold">{installPct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${installPct}%`, background: 'var(--grad-accent)' }} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl" style={{ background: 'var(--bg)', boxShadow: '4px 4px 9px #C5C7D4, -4px -4px 9px #FFFFFF' }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{
              background: ollamaStatus?.running ? '#5CC8A0' : ollamaStatus?.installed ? '#F0A832' : '#C0C3D0',
              boxShadow: ollamaStatus?.running ? '0 0 6px rgba(92,200,160,0.5)' : 'none',
            }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold truncate leading-none" style={{ color: 'var(--text-muted)' }}>
                {ollamaStatus?.running ? 'AI Ready' : ollamaStatus?.installed ? 'AI Stopped' : 'AI Not Installed'}
              </p>
            </div>
            {ollamaStatus?.installed && !ollamaStatus?.running && (
              <button onClick={async () => { await window.beacon?.launchOllama(); setTimeout(() => getOllamaStatus().then(setOllamaStatus), 2000) }}
                className="text-[9px] px-2 h-5 rounded-lg font-bold flex-shrink-0"
                style={{ background: 'rgba(107,143,255,0.1)', color: 'var(--accent)' }}>
                Start
              </button>
            )}
            {!ollamaStatus?.installed && (
              <button onClick={handleInstallOllama}
                className="text-[9px] px-2 h-5 rounded-lg font-bold flex-shrink-0"
                style={{ background: 'rgba(107,143,255,0.1)', color: 'var(--accent)' }}>
                Install
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function SectionLabel({ children, action }) {
  return (
    <div className="flex items-center justify-between px-1 pt-5 pb-1.5">
      <p className="text-[9.5px] font-bold tracking-[0.12em] uppercase" style={{ color: 'var(--text-dim)' }}>{children}</p>
      {action}
    </div>
  )
}

function ChevronBtn({ open, onClick }) {
  return (
    <button onClick={onClick} className="transition-colors w-5 h-5 flex items-center justify-center rounded-lg"
      style={{ color: 'var(--text-dim)' }}
      onMouseEnter={e => e.currentTarget.style.color = 'var(--text-muted)'}
      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        {open ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
      </svg>
    </button>
  )
}

function NavItem({ label, count, active, onClick, dot, icon, accent }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-[8px] rounded-2xl text-left text-[12.5px] transition-all duration-150"
      style={{
        color: active ? (accent ? 'var(--accent)' : 'var(--text-primary)') : 'var(--text-muted)',
        fontWeight: active ? 600 : 500,
        boxShadow: active
          ? 'inset 4px 4px 9px #C2C4D2, inset -4px -4px 9px #FFFFFF'
          : 'none',
        background: active ? 'var(--bg)' : 'transparent',
        border: active ? '1px solid rgba(0,0,0,0.04)' : '1px solid transparent',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(0,0,0,0.03)' } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' } }}
    >
      {icon ? (
        <span className="flex-shrink-0 w-[18px] flex items-center justify-center" style={{ opacity: active ? 0.9 : 0.55 }}>
          {icon}
        </span>
      ) : dot ? (
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{
          backgroundColor: dot,
          boxShadow: `0 0 0 2px rgba(255,255,255,0.8), 0 1px 3px rgba(0,0,0,0.2)`,
        }} />
      ) : null}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] tabular-nums font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            color: active ? 'var(--accent)' : 'var(--text-dim)',
            background: active ? 'rgba(107,143,255,0.1)' : 'rgba(0,0,0,0.05)',
          }}>
          {count}
        </span>
      )}
    </button>
  )
}

function CollectionDropTarget({ coll, active, onSelect, onDelete, onDrop, deletingId }) {
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = (e) => {
    if (e.dataTransfer.types.includes('application/beacon-clip')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    }
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const clipId = getDragClipId(e)
    if (clipId) onDrop?.(clipId)
  }

  return (
    <div
      className="group/coll relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        onClick={onSelect}
        className="w-full flex items-center gap-2.5 px-2.5 py-[8px] rounded-2xl text-left text-[12.5px] transition-all duration-150"
        style={{
          color: active || dragOver ? 'var(--text-primary)' : 'var(--text-muted)',
          background: active ? 'var(--bg)' : dragOver ? 'rgba(107,143,255,0.06)' : 'transparent',
          boxShadow: active ? 'inset 4px 4px 9px #C2C4D2, inset -4px -4px 9px #FFFFFF' : dragOver ? 'inset 2px 2px 5px #C5C7D4, inset -2px -2px 5px #FFFFFF' : 'none',
          border: active ? '1px solid rgba(0,0,0,0.04)' : '1px solid transparent',
          fontWeight: active ? 600 : 500,
        }}
        onMouseEnter={e => { if (!active && !dragOver) { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
        onMouseLeave={e => { if (!active && !dragOver) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' } }}
      >
        <span className="flex-shrink-0 w-[18px] flex items-center justify-center text-sm leading-none opacity-80">
          {coll.icon}
        </span>
        <span className="flex-1 truncate">{coll.name}</span>
        {dragOver && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        )}
      </button>
      <button
        onClick={onDelete}
        disabled={deletingId === coll.id}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/coll:opacity-100 transition-all w-4 h-4 flex items-center justify-center rounded"
        style={{ color: 'var(--text-dim)' }}
        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}

function GridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/>
    </svg>
  )
}

function HighlightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  )
}

function UnusedIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>
  )
}

function formatSizeBytes(b) {
  if (!b) return ''
  if (b > 1e9) return `${(b/1e9).toFixed(1)} GB`
  if (b > 1e6) return `${(b/1e6).toFixed(0)} MB`
  return `${Math.round(b/1e3)} KB`
}
