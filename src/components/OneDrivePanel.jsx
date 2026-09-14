import { useState, useEffect, useCallback, useRef } from 'react'
import {
  isConnected, getStoredTokens, storeTokens, clearTokens,
  getMe, listFolder, getThumbnailUrl, getDownloadUrl,
  moveItem, ensureFolder, searchDrive,
} from '../utils/onedrive'
import { getCategories, startFilesIngest } from '../utils/api'

const ACCENT = '#6B8FFF'
const MS_BLUE = '#0078D4'

// ─── Shared-link (no account required) helpers ────────────────────────────────
// Uses the Microsoft Graph sharing API: anonymous/app-less access for public links
function encodeShareUrl(url) {
  // base64url("u!" + url), no padding
  return 'u!' + btoa(url).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function listSharedFolder(shareUrl, token = null) {
  const token_ = token || (getStoredTokens()?.access_token)
  const shareToken = encodeShareUrl(shareUrl)
  const headers = token_ ? { Authorization: `Bearer ${token_}` } : {}
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem/children?$select=id,name,folder,file,lastModifiedDateTime,size&$expand=thumbnails&$top=200`,
    { headers }
  )
  if (!res.ok) throw new Error(`Cannot access this link (${res.status}). Make sure the OneDrive folder is shared as "Anyone with the link".`)
  return res.json()
}

async function getSharedRoot(shareUrl, token = null) {
  const token_ = token || (getStoredTokens()?.access_token)
  const shareToken = encodeShareUrl(shareUrl)
  const headers = token_ ? { Authorization: `Bearer ${token_}` } : {}
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem?$select=id,name,folder,file,parentReference`,
    { headers }
  )
  if (!res.ok) throw new Error(`Cannot access this link (${res.status}).`)
  return res.json()
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const FolderIcon = ({ color = '#F5A623', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
  </svg>
)
const CloudIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
  </svg>
)
const LinkIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)
const ImportIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="8 17 12 21 16 17"/>
    <line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
  </svg>
)
const Spinner = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    style={{ animation: 'od-spin 0.9s linear infinite', flexShrink: 0 }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
)
const CheckIcon = ({ color = '#4CAF50' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

// ─── Helpers ──────────────────────────────────────────────────────────────────
const isMedia = n => /\.(jpg|jpeg|png|heic|heif|webp|tiff|mp4|mov|avi|mkv|m4v)$/i.test(n)
const fmt     = b => b > 1e9 ? `${(b/1e9).toFixed(1)} GB` : b > 1e6 ? `${(b/1e6).toFixed(0)} MB` : `${Math.round(b/1024)} KB`

// ─── Thumbnail cell ───────────────────────────────────────────────────────────
function ThumbCell({ item, selected, onSelect, onDoubleClick }) {
  const [thumbUrl, setThumbUrl] = useState(
    item.thumbnails?.[0]?.medium?.url || item.thumbnails?.[0]?.small?.url || null
  )
  const [imgLoaded, setImgLoaded] = useState(false)
  const isFolder = !!item.folder

  useEffect(() => {
    if (thumbUrl || !item.file || !isConnected()) return
    let cancelled = false
    getThumbnailUrl(item.id, 'medium').then(u => { if (!cancelled && u) setThumbUrl(u) }).catch(() => {})
    return () => { cancelled = true }
  }, [item.id])

  return (
    <div
      onClick={() => onSelect(item)}
      onDoubleClick={() => onDoubleClick(item)}
      style={{
        borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
        boxShadow: selected ? `0 0 0 2.5px ${ACCENT}` : 'var(--neu-raise-sm)',
        background: 'var(--bg)', position: 'relative',
        transition: 'box-shadow 0.12s', userSelect: 'none',
      }}
    >
      <div style={{ width: '100%', aspectRatio: '4/3', background: isFolder ? '#F5A62315' : 'var(--border-solid)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        {isFolder ? (
          <FolderIcon color="#F5A623" size={38} />
        ) : thumbUrl ? (
          <>
            {!imgLoaded && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size={18} /></div>}
            <img src={thumbUrl} alt={item.name} onLoad={() => setImgLoaded(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.2s' }} />
          </>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="var(--text-secondary)" opacity="0.3">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          </svg>
        )}
        {selected && (
          <div style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckIcon color="#fff" />
          </div>
        )}
      </div>
      <div style={{ padding: '5px 8px 7px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
          {isFolder ? `${item.folder.childCount ?? ''} items`.trim() : fmt(item.size || 0)}
        </div>
      </div>
    </div>
  )
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────
function Breadcrumb({ path, onNavigate }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 12, minWidth: 0 }}>
      {path.map((seg, i) => (
        <span key={`${seg.id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>›</span>}
          <span onClick={() => onNavigate(i)} style={{
            color: i === path.length - 1 ? 'var(--text-primary)' : ACCENT,
            fontWeight: i === path.length - 1 ? 600 : 400,
            cursor: i === path.length - 1 ? 'default' : 'pointer',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140,
          }}>{seg.name}</span>
        </span>
      ))}
    </div>
  )
}

// ─── Connect screen ───────────────────────────────────────────────────────────
function ConnectScreen({ onConnectedViaSignIn, onConnectedViaLink }) {
  const [tab, setTab]           = useState('link') // 'link' | 'signin'
  const [linkUrl, setLinkUrl]   = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError]     = useState(null)
  const [clientId, setClientId] = useState(localStorage.getItem('beacon_onedrive_client_id') || '')
  const [signInLoading, setSignInLoading] = useState(false)
  const [signInError, setSignInError]     = useState(null)

  // Try to browse a shared link (no account required)
  async function handleLinkConnect() {
    const url = linkUrl.trim()
    if (!url) return
    // Detect SharePoint/work links early — these always require auth
    if (/sharepoint\.com|my\.sharepoint\.com/i.test(url)) {
      setLinkError('This is a work or school OneDrive link. Shared links from SharePoint always require signing in — please use the Sign In tab instead.')
      return
    }
    setLinkLoading(true)
    setLinkError(null)
    try {
      const root = await getSharedRoot(url)
      onConnectedViaLink({ shareUrl: url, rootItem: root })
    } catch (e) {
      setLinkError(
        e.message.includes('401') || e.message.includes('403')
          ? 'Access denied. This link may require signing in — try the Sign In tab, or make sure the folder is shared as "Anyone with the link".'
          : e.message.includes('fetch')
          ? 'Could not connect. Check your internet connection and try again.'
          : e.message
      )
    } finally {
      setLinkLoading(false)
    }
  }

  async function handleSignIn() {
    const id = clientId.trim()
    if (!id) return setSignInError('Paste your Azure App ID first.')
    setSignInLoading(true)
    setSignInError(null)
    try {
      const tokens = await window.beacon.onedriveAuth(id)
      localStorage.setItem('beacon_onedrive_client_id', id)
      storeTokens(tokens)
      onConnectedViaSignIn()
    } catch (e) {
      if (e.message === 'cancelled') { setSignInLoading(false); return }
      setSignInError(e.message)
    } finally {
      setSignInLoading(false)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 520, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: MS_BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <CloudIcon size={22} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)' }}>Connect OneDrive</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Browse and import files from your church's cloud storage</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 22, background: 'var(--border-solid)', borderRadius: 10, padding: 4 }}>
        {[
          { id: 'link', label: '🔗 Shared Link', sub: 'No account needed' },
          { id: 'signin', label: '👤 Sign In', sub: 'Own account' },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setLinkError(null); setSignInError(null) }}
            style={{
              flex: 1, padding: '8px 10px', border: 'none', borderRadius: 7, cursor: 'pointer',
              background: tab === t.id ? 'var(--bg)' : 'transparent',
              boxShadow: tab === t.id ? 'var(--neu-raise-sm)' : 'none',
              transition: 'all 0.15s',
            }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{t.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{t.sub}</div>
          </button>
        ))}
      </div>

      {/* Shared link tab */}
      {tab === 'link' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
            Someone shared a OneDrive folder with you? Paste the link below — no Microsoft account required.
          </div>
          <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>ONEDRIVE SHARING LINK</div>
          <input
            value={linkUrl}
            onChange={e => { setLinkUrl(e.target.value); setLinkError(null) }}
            onKeyDown={e => e.key === 'Enter' && handleLinkConnect()}
            placeholder="https://1drv.ms/f/... or https://onedrive.live.com/..."
            style={inputStyle}
          />
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>
            In OneDrive, right-click a folder → Share → "Anyone with the link" → Copy link
          </div>
          {linkError && <div style={errorStyle}>{linkError}</div>}
          <button onClick={handleLinkConnect} disabled={!linkUrl.trim() || linkLoading}
            style={btnStyle(MS_BLUE, !linkUrl.trim() || linkLoading)}>
            {linkLoading ? <><Spinner size={14} /> Connecting…</> : <><LinkIcon size={14} /> Browse folder</>}
          </button>
        </div>
      )}

      {/* Sign in tab */}
      {tab === 'signin' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            Sign in with your own Microsoft account to browse your full OneDrive. Requires a one-time Azure App setup.
          </div>

          {/* Collapsible setup instructions */}
          <details style={{ marginBottom: 16 }}>
            <summary style={{ fontSize: 12, fontWeight: 600, color: ACCENT, cursor: 'pointer', marginBottom: 8 }}>
              One-time setup: Get your Azure App ID ›
            </summary>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '8px 0 0 4px' }}>
              1. Open <span onClick={() => window.beacon.openExternal('https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade')} style={{ color: ACCENT, cursor: 'pointer' }}>portal.azure.com → App registrations → New</span><br/>
              2. Name it "Beacon", choose <strong>Personal Microsoft accounts only</strong><br/>
              3. After creating, go to <strong>Authentication → Add a platform → Mobile and desktop applications</strong><br/>
              4. Check the box: <code style={{ background: 'var(--border-solid)', padding: '1px 4px', borderRadius: 4 }}>https://login.microsoftonline.com/common/oauth2/nativeclient</code><br/>
              5. Copy the <strong>Application (client) ID</strong> from the Overview page
            </div>
          </details>

          <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>APPLICATION (CLIENT) ID</div>
          <input
            value={clientId}
            onChange={e => { setClientId(e.target.value); setSignInError(null) }}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ ...inputStyle, marginBottom: 16 }}
          />
          {signInError && <div style={errorStyle}>{signInError}</div>}
          <button onClick={handleSignIn} disabled={!clientId.trim() || signInLoading}
            style={btnStyle(MS_BLUE, !clientId.trim() || signInLoading)}>
            {signInLoading ? <><Spinner size={14} /> Opening sign-in…</> : 'Sign in with Microsoft →'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Import progress ──────────────────────────────────────────────────────────
function ImportProgress({ items, progress, onClose }) {
  const done = progress.filter(p => p.done).length
  const allDone = done === items.length
  return (
    <div style={{ padding: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Importing from OneDrive</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>{done} of {items.length} files downloaded</div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border-solid)', marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, background: ACCENT, width: `${items.length ? (done / items.length) * 100 : 0}%`, transition: 'width 0.3s' }}/>
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {progress.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <div style={{ width: 16, flexShrink: 0 }}>
              {p.done ? (p.error ? <span style={{ color: '#EF5350' }}>✕</span> : <CheckIcon />) : <Spinner size={14} />}
            </div>
            <span style={{ color: p.error ? '#EF5350' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            {p.error && <span style={{ color: '#EF5350', fontSize: 10, flexShrink: 0 }}>{p.error}</span>}
          </div>
        ))}
      </div>
      {allDone && (
        <div style={{ marginTop: 18 }}>
          <div style={{ color: '#4CAF50', fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
            ✓ Downloaded — AI analysis running in the background
          </div>
          <button onClick={onClose} style={btnStyle(ACCENT)}>Done</button>
        </div>
      )}
    </div>
  )
}

// ─── Reorganize modal ─────────────────────────────────────────────────────────
function ReorganizeModal({ categories, onClose, onStart }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg)', borderRadius: 16, padding: 28, maxWidth: 460, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Create Category Folders on OneDrive</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.5 }}>
          Beacon will create a folder for each of your categories on OneDrive. You can then move your existing files into them to match your Beacon library structure.
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: 8 }}>FOLDERS TO CREATE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {categories.map(c => (
              <span key={c.id} style={{ padding: '4px 12px', borderRadius: 20, background: `${ACCENT}15`, color: ACCENT, fontSize: 12, fontWeight: 500 }}>{c.name}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnStyle(null)}>Cancel</button>
          <button onClick={onStart} style={btnStyle(ACCENT)}>Create Folders</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main browser view ────────────────────────────────────────────────────────
function BrowserView({ mode, shareUrl, onBack }) {
  // mode: 'signed-in' | 'shared-link'
  const [items, setItems]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [selected, setSelected]     = useState(new Set())
  const [path, setPath]             = useState([{ id: 'root', name: 'OneDrive' }])
  const [user, setUser]             = useState(null)
  const [categories, setCategories] = useState([])
  const [showReorg, setShowReorg]   = useState(false)
  const [reorgMsg, setReorgMsg]     = useState(null)
  const [importing, setImporting]   = useState(false)
  const [importItems, setImportItems]   = useState([])
  const [importProgress, setImportProgress] = useState([])
  const [search, setSearch]         = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [sortBy, setSortBy]         = useState('name')
  const searchRef = useRef(null)

  // Shared-link navigation: stack of { shareUrl, label, items }
  const [linkStack, setLinkStack]   = useState([])

  const currentFolder = path[path.length - 1]

  useEffect(() => {
    if (mode === 'signed-in') {
      getMe().then(setUser).catch(() => {})
      getCategories().then(setCategories).catch(() => {})
    }
    loadItems()
  }, [])

  async function loadItems(folderId = 'root', linkUrl = null) {
    setLoading(true)
    setError(null)
    setSelected(new Set())
    setSearchResults(null)
    setSearch('')
    try {
      let data
      if (mode === 'shared-link' && !linkUrl) {
        data = await listSharedFolder(shareUrl)
      } else if (linkUrl) {
        data = await listSharedFolder(linkUrl)
      } else {
        data = await listFolder(folderId)
      }
      setItems(data.value || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function navigateInto(item) {
    if (!item.folder) return
    if (mode === 'shared-link') {
      // For shared link mode, we need to get the share URL for this sub-folder
      // Sub-folders use the driveItem ID with the parent share token
      // We'll use the signed-in API if available, otherwise show error
      const newPath = [...path, { id: item.id, name: item.name }]
      setPath(newPath)
      // Access sub-folder using Graph with the item ID (requires auth or the item must be directly shared)
      loadSubFolder(item)
    } else {
      const newPath = [...path, { id: item.id, name: item.name }]
      setPath(newPath)
      loadItems(item.id)
    }
  }

  async function loadSubFolder(item) {
    setLoading(true)
    setError(null)
    setSelected(new Set())
    try {
      const token = getStoredTokens()?.access_token
      if (!token) {
        // Try using driveItem/children with the parent share's drive context
        const shareToken = encodeShareUrl(shareUrl)
        const headers = {}
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/shares/${shareToken}/root:/${encodeURIComponent(item.name)}/children?$select=id,name,folder,file,lastModifiedDateTime,size&$expand=thumbnails`,
          { headers }
        )
        if (!res.ok) throw new Error('Cannot browse sub-folders without signing in. Please sign in with Microsoft.')
        const data = await res.json()
        setItems(data.value || [])
      } else {
        const data = await listFolder(item.id)
        setItems(data.value || [])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function navigateTo(index) {
    const newPath = path.slice(0, index + 1)
    setPath(newPath)
    if (index === 0 && mode === 'shared-link') {
      loadItems()
    } else {
      loadItems(newPath[newPath.length - 1].id)
    }
  }

  function toggleSelect(item) {
    if (item.folder) { navigateInto(item); return }
    if (!isMedia(item.name)) return
    setSelected(s => {
      const n = new Set(s)
      n.has(item.id) ? n.delete(item.id) : n.add(item.id)
      return n
    })
  }

  const displayItems = [...(searchResults ?? items)].sort((a, b) => {
    if (a.folder && !b.folder) return -1
    if (!a.folder && b.folder) return 1
    if (sortBy === 'date') return new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime)
    if (sortBy === 'size') return (b.size || 0) - (a.size || 0)
    return a.name.localeCompare(b.name)
  })

  function selectAllMedia() {
    setSelected(new Set(displayItems.filter(i => i.file && isMedia(i.name)).map(i => i.id)))
  }

  // Search (signed-in only)
  useEffect(() => {
    clearTimeout(searchRef.current)
    if (!search.trim() || mode === 'shared-link') { setSearchResults(null); return }
    searchRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchDrive(search)
        setSearchResults(data.value || [])
      } catch (e) { setError(e.message) }
      finally { setLoading(false) }
    }, 400)
  }, [search])

  // Import selected files
  async function handleImport() {
    const toImport = [...selected].map(id => displayItems.find(i => i.id === id)).filter(Boolean)
    if (!toImport.length) return
    setImporting(true)
    setImportItems(toImport)
    const prog = toImport.map(i => ({ name: i.name, done: false, error: null }))
    setImportProgress([...prog])

    const dataDir = await window.beacon.getDataDir()
    const localPaths = []

    for (let i = 0; i < toImport.length; i++) {
      const item = toImport[i]
      try {
        let dlUrl
        if (mode === 'shared-link') {
          // For shared link mode, download via the shares API
          const shareToken = encodeShareUrl(shareUrl)
          const token = getStoredTokens()?.access_token
          const headers = token ? { Authorization: `Bearer ${token}` } : {}
          const res = await fetch(
            `https://graph.microsoft.com/v1.0/shares/${shareToken}/root:/${encodeURIComponent(item.name)}?$select=@microsoft.graph.downloadUrl`,
            { headers }
          )
          const data = await res.json()
          dlUrl = data['@microsoft.graph.downloadUrl']
          if (!dlUrl) {
            // Try direct download from item
            const res2 = await fetch(`https://graph.microsoft.com/v1.0/shares/${shareToken}/items/${item.id}?$select=@microsoft.graph.downloadUrl`, { headers })
            const data2 = await res2.json()
            dlUrl = data2['@microsoft.graph.downloadUrl']
          }
        } else {
          dlUrl = await getDownloadUrl(item.id)
        }
        if (!dlUrl) throw new Error('No download URL')
        const destPath = `${dataDir}/onedrive_imports/${item.name}`
        await window.beacon.onedriveDownload(dlUrl, destPath)
        localPaths.push(destPath)
        prog[i].done = true
      } catch (e) {
        prog[i].error = e.message.slice(0, 40)
        prog[i].done = true
      }
      setImportProgress([...prog])
    }

    if (localPaths.length) {
      startFilesIngest(localPaths, () => {}, () => {}, () => {})
    }
  }

  // Reorganize OneDrive
  async function handleReorganize() {
    setShowReorg(false)
    setReorgMsg({ type: 'progress', text: 'Creating folders…' })
    try {
      const targetId = currentFolder.id
      for (const cat of categories) {
        await ensureFolder(targetId, cat.name)
      }
      setReorgMsg({ type: 'success', text: `✓ Created ${categories.length} category folders` })
      loadItems(targetId)
    } catch (e) {
      setReorgMsg({ type: 'error', text: e.message })
    }
  }

  const selectedItems = [...selected].map(id => displayItems.find(i => i.id === id)).filter(Boolean)
  const totalSize = selectedItems.reduce((s, i) => s + (i.size || 0), 0)

  if (importing) {
    return <ImportProgress items={importItems} progress={importProgress} onClose={() => { setImporting(false); setSelected(new Set()) }} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-header: breadcrumb + tools */}
      <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border-solid)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12 }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--border-solid)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <BackIcon /> Disconnect
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border-solid)' }}/>
        <Breadcrumb path={path} onNavigate={navigateTo} />
        <div style={{ flex: 1 }}/>
        {mode === 'signed-in' && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ padding: '5px 10px 5px 28px', borderRadius: 16, border: '1.5px solid var(--border-solid)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 12, width: 150, outline: 'none', position: 'relative' }} />
        )}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid var(--border-solid)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
          <option value="name">Name</option>
          <option value="date">Date</option>
          <option value="size">Size</option>
        </select>
        <button onClick={selectAllMedia} style={btnStyle(null, false, true)}>Select all media</button>
        {mode === 'signed-in' && categories.length > 0 && (
          <button onClick={() => setShowReorg(true)} style={btnStyle(null, false, true)}>⟳ Reorganize</button>
        )}
      </div>

      {/* Status / error / reorg messages */}
      {reorgMsg && (
        <div style={{ margin: '8px 18px 0', padding: '9px 14px', borderRadius: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: reorgMsg.type === 'success' ? '#4CAF5015' : reorgMsg.type === 'error' ? '#EF535015' : `${ACCENT}15`,
          color: reorgMsg.type === 'success' ? '#4CAF50' : reorgMsg.type === 'error' ? '#EF5350' : ACCENT }}>
          {reorgMsg.text}
          <button onClick={() => setReorgMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
      {error && (
        <div style={{ margin: '8px 18px 0', padding: '9px 14px', borderRadius: 8, background: '#EF535015', color: '#EF5350', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span>{error}</span>
          <button onClick={() => loadItems(currentFolder.id)} style={{ color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, marginLeft: 10 }}>Retry</button>
        </div>
      )}

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-secondary)', gap: 10, fontSize: 13 }}>
            <Spinner size={18} /> Loading…
          </div>
        ) : displayItems.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', paddingTop: 60, fontSize: 13 }}>
            {searchResults ? 'No results found.' : 'This folder is empty.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {displayItems.map(item => (
              <ThumbCell key={item.id} item={item} selected={selected.has(item.id)}
                onSelect={toggleSelect} onDoubleClick={navigateInto} />
            ))}
          </div>
        )}
      </div>

      {/* Import bar */}
      {selected.size > 0 && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-solid)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{selected.size} file{selected.size !== 1 ? 's' : ''} selected</div>
            {totalSize > 0 && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmt(totalSize)} total</div>}
          </div>
          <button onClick={() => setSelected(new Set())} style={btnStyle(null, false, true)}>Clear</button>
          <button onClick={handleImport} style={btnStyle(ACCENT)}>
            <ImportIcon /> Import to Beacon
          </button>
        </div>
      )}

      {showReorg && <ReorganizeModal categories={categories} onClose={() => setShowReorg(false)} onStart={handleReorganize} />}
    </div>
  )
}

// ─── Root panel ───────────────────────────────────────────────────────────────
export default function OneDrivePanel({ onClose }) {
  // connection state: null | 'signed-in' | 'shared-link'
  const [mode, setMode]           = useState(() => isConnected() ? 'signed-in' : null)
  const [shareLink, setShareLink] = useState(null)

  function handleConnectedViaSignIn() {
    setMode('signed-in')
  }

  function handleConnectedViaLink({ shareUrl }) {
    setShareLink(shareUrl)
    setMode('shared-link')
  }

  function handleBack() {
    if (mode === 'signed-in') { clearTokens() }
    setMode(null)
    setShareLink(null)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <style>{`@keyframes od-spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{
        width: '88vw', maxWidth: 960, height: '85vh',
        background: 'var(--bg)', borderRadius: 18,
        boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border-solid)', flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: MS_BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CloudIcon size={17} color="#fff" />
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
            OneDrive
            {mode === 'shared-link' && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>Shared folder</span>}
          </div>
          <div style={{ flex: 1 }}/>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--border-solid)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {!mode ? (
            <div style={{ height: '100%', overflowY: 'auto' }}>
              <ConnectScreen onConnectedViaSignIn={handleConnectedViaSignIn} onConnectedViaLink={handleConnectedViaLink} />
            </div>
          ) : (
            <BrowserView mode={mode} shareUrl={shareLink} onBack={handleBack} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Style helpers ────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
  border: '1.5px solid var(--border-solid)', background: 'var(--bg)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none', marginBottom: 6,
  fontFamily: 'inherit',
}
const errorStyle = {
  color: '#EF5350', fontSize: 12, padding: '8px 12px', borderRadius: 8,
  background: '#EF535012', marginBottom: 12, lineHeight: 1.4,
}
function btnStyle(color, disabled = false, small = false) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: small ? '6px 12px' : '9px 18px',
    borderRadius: small ? 8 : 10, border: 'none',
    background: color ? (disabled ? `${color}66` : color) : 'var(--border-solid)',
    color: color ? '#fff' : 'var(--text-primary)',
    fontWeight: 600, fontSize: small ? 12 : 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    transition: 'opacity 0.15s', flexShrink: 0,
  }
}
