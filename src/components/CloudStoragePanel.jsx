import { useState, useEffect, useRef } from 'react'
import * as OD from '../utils/onedrive'
import * as GD from '../utils/googledrive'
import * as DB from '../utils/dropbox'
import { getCategories, startFilesIngest } from '../utils/api'

// ─── Provider config ──────────────────────────────────────────────────────────
const PROVIDERS = {
  onedrive: { id: 'onedrive', label: 'OneDrive',     color: '#0078D4', textColor: '#fff',
    logo: <svg viewBox="0 0 48 48" width="20" height="20"><path fill="currentColor" d="M28.1 15.3A13 13 0 0 0 4 22a8 8 0 0 0 1 16h31a6 6 0 0 0 1.5-11.8 10 10 0 0 0-9.4-10.9z" opacity=".9"/></svg>,
    linkPlaceholder: 'https://1drv.ms/f/... or https://onedrive.live.com/...',
    linkHint: 'Right-click a folder in OneDrive → Share → "Anyone with the link" → Copy',
  },
  gdrive: { id: 'gdrive', label: 'Google Drive', color: '#1A73E8', textColor: '#fff',
    logo: <svg viewBox="0 0 87.3 78" width="20" height="18"><path fill="currentColor" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L29.85 48H0c0 1.55.4 3.1 1.2 4.5L6.6 66.85zM43.65 24 27.55 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 43.5A9 9 0 0 0 0 48h29.85L43.65 24zM73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 52.5c.8-1.4 1.2-2.95 1.2-4.5H57.45l6.2 12.35L73.55 76.8zM43.65 24 57.45 48h29.85c0-1.55-.4-3.1-1.2-4.5L62.95 3.3C62.15 1.9 61 .8 59.65 0L43.65 24zM29.85 48 13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L57.45 48H29.85z" opacity=".85"/></svg>,
    linkPlaceholder: 'https://drive.google.com/drive/folders/...',
    linkHint: 'Right-click a folder in Google Drive → Share → Change to "Anyone with the link" → Copy link',
  },
  dropbox: { id: 'dropbox', label: 'Dropbox',      color: '#0061FF', textColor: '#fff',
    logo: <svg viewBox="0 0 52 48" width="20" height="18"><path fill="currentColor" d="M13 0L0 8l13 8 13-8L13 0zM39 0L26 8l13 8 13-8L39 0zM0 24l13 8 13-8-13-8L0 24zM26 24l13 8 13-8-13-8-13 8zM13 34l13 8 13-8-13-8-13 8z" opacity=".9"/></svg>,
    linkPlaceholder: 'https://www.dropbox.com/sh/...',
    linkHint: 'Right-click a folder in Dropbox → Share → Create link → Copy',
  },
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Spinner = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    style={{ animation: 'cs-spin 0.85s linear infinite', flexShrink: 0 }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
)
const CheckIcon = ({ color = '#4CAF50', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const LinkIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)
const UserIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)
const DownloadIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
  </svg>
)
const FolderIcon = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#F5A623">
    <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
  </svg>
)
const BackBtn = ({ label = 'Back', onClick }) => (
  <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12 }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--border-solid)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
    {label}
  </button>
)

const fmt  = b => b > 1e9 ? `${(b/1e9).toFixed(1)} GB` : b > 1e6 ? `${(b/1e6).toFixed(0)} MB` : `${Math.round((b||0)/1024)} KB`
const isMedia = n => /\.(jpg|jpeg|png|heic|heif|webp|tiff|mp4|mov|avi|mkv|m4v)$/i.test(n)
const isZip   = n => /\.zip$/i.test(n)
const isImportable = n => isMedia(n) || isZip(n)

// ─── Shared-link browser download tracker ────────────────────────────────────
function SharedLinkBrowser({ provider, url, onClose }) {
  const p = PROVIDERS[provider]
  const [downloads, setDownloads]   = useState([])
  const [browserOpen, setBrowserOpen] = useState(false)
  const [ingesting, setIngesting]   = useState(false)
  const [done, setDone]             = useState(false)

  // Listen for downloads from the embedded browser window
  useEffect(() => {
    const unProgress = window.beacon.onCloudDownloadProgress?.(d => {
      setDownloads(prev => {
        const existing = prev.find(x => x.name === d.name)
        if (existing) return prev.map(x => x.name === d.name ? { ...x, received: d.received, total: d.total } : x)
        return [...prev, { name: d.name, received: d.received, total: d.total, done: false }]
      })
    })
    const unDone = window.beacon.onCloudDownloadDone?.(d => {
      setDownloads(prev => prev.map(x => x.name === d.name ? { ...x, done: true, success: d.success, path: d.path } : x))
    })
    return () => { unProgress?.(); unDone?.() }
  }, [])

  async function openBrowser() {
    setBrowserOpen(true)
    const dataDir = await window.beacon.getDataDir()
    const destDir = `${dataDir}/cloud_imports`
    await window.beacon.openCloudBrowser(url, destDir)
    setBrowserOpen(false)
  }

  async function ingestAll() {
    const toImport = downloads.filter(d => d.done && d.success && d.path && isImportable(d.name))
    if (!toImport.length) return
    setIngesting(true)
    try {
      const dataDir = await window.beacon.getDataDir()
      const mediaPaths = []
      for (const d of toImport) {
        if (isZip(d.name)) {
          // Extract zip, collect media files inside
          const extractDir = `${dataDir}/cloud_imports/extracted_${d.name.replace(/\.zip$/i, '')}_${Date.now()}`
          try {
            const extracted = await window.beacon.extractZip(d.path, extractDir)
            mediaPaths.push(...extracted)
          } catch (e) {
            console.error('Zip extraction failed:', e)
          }
        } else {
          mediaPaths.push(d.path)
        }
      }
      if (!mediaPaths.length) { setIngesting(false); return }
      startFilesIngest(mediaPaths, () => {}, () => { setIngesting(false); setDone(true) }, () => { setIngesting(false) })
    } catch (e) {
      setIngesting(false)
    }
  }

  const readyToIngest = downloads.filter(d => d.done && d.success && isImportable(d.name))

  return (
    <div style={{ padding: 28, maxWidth: 540, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
          {p.logo}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Browse {p.label} shared folder</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {url.length > 60 ? url.slice(0, 57) + '…' : url}
          </div>
        </div>
      </div>

      {/* Step 1 — Open browser */}
      <div style={{ padding: '16px 18px', borderRadius: 12, boxShadow: 'var(--neu-raise-sm)', background: 'var(--bg)', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: p.color, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Open the shared folder</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
          Click the button below to open the {p.label} folder in Beacon's browser. Navigate to the files you want, then click the download button on each file — Beacon will capture them automatically.
        </div>
        <button onClick={openBrowser} disabled={browserOpen}
          style={btn(p.color, browserOpen)}>
          {browserOpen ? <><Spinner size={14}/> Browser open…</> : <><LinkIcon size={14}/> Open {p.label} folder</>}
        </button>
        {browserOpen && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Spinner size={12}/> Waiting for downloads… close the window when done.
          </div>
        )}
      </div>

      {/* Step 2 — Downloaded files */}
      <div style={{ padding: '16px 18px', borderRadius: 12, boxShadow: 'var(--neu-raise-sm)', background: 'var(--bg)', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: downloads.length ? 12 : 0 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: downloads.length ? p.color : 'var(--border-solid)', color: downloads.length ? '#fff' : 'var(--text-secondary)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</div>
          <div style={{ fontWeight: 600, fontSize: 13, color: downloads.length ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            Downloaded files {downloads.length > 0 && <span style={{ color: p.color }}>({downloads.length})</span>}
          </div>
        </div>
        {downloads.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, paddingLeft: 34 }}>Files you download will appear here.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {downloads.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <div style={{ width: 16, flexShrink: 0 }}>
                  {d.done ? (d.success ? <CheckIcon/> : <span style={{ color: '#EF5350' }}>✕</span>) : <Spinner size={13}/>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                  {!d.done && d.total > 0 && (
                    <div style={{ height: 3, borderRadius: 2, background: 'var(--border-solid)', marginTop: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: p.color, width: `${Math.round((d.received/d.total)*100)}%`, transition: 'width 0.2s' }}/>
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>
                  {d.done ? (d.success ? fmt(d.total || 0) : 'Failed') : `${fmt(d.received)} / ${fmt(d.total)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 3 — Import to Beacon */}
      <div style={{ padding: '16px 18px', borderRadius: 12, boxShadow: 'var(--neu-raise-sm)', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: readyToIngest.length ? 12 : 0 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: readyToIngest.length ? '#4CAF50' : 'var(--border-solid)', color: readyToIngest.length ? '#fff' : 'var(--text-secondary)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</div>
          <div style={{ fontWeight: 600, fontSize: 13, color: readyToIngest.length ? 'var(--text-primary)' : 'var(--text-secondary)' }}>Import to Beacon</div>
        </div>
        {done ? (
          <div style={{ fontSize: 13, color: '#4CAF50', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 34 }}>
            <CheckIcon/> AI analysis running — check your library!
          </div>
        ) : readyToIngest.length > 0 ? (
          <div style={{ paddingLeft: 34 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              {readyToIngest.map(d => isZip(d.name)
                ? <span key={d.name}>📦 <strong>{d.name}</strong> — will be unzipped automatically</span>
                : <span key={d.name}>🎞 {d.name}</span>
              ).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <br key={i}/>, el], [])}
            </div>
            <button onClick={ingestAll} disabled={ingesting} style={btn('#4CAF50', ingesting)}>
              {ingesting
                ? <><Spinner size={14}/> {readyToIngest.some(d => isZip(d.name)) ? 'Extracting & importing…' : 'Importing…'}</>
                : <><DownloadIcon size={14}/> Import to Beacon</>}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 34 }}>Import will start after you download files.</div>
        )}
      </div>
    </div>
  )
}

// ─── Shared link entry screen ─────────────────────────────────────────────────
function SharedLinkEntry({ provider, onOpen }) {
  const p = PROVIDERS[provider]
  const [url, setUrl]     = useState('')
  const [error, setError] = useState(null)

  function handleOpen() {
    const u = url.trim()
    if (!u) return
    // For OneDrive — detect SharePoint links and warn
    if (provider === 'onedrive' && /sharepoint\.com/i.test(u)) {
      setError('This is a work/school SharePoint link — shared links from these require signing in. Use the "Sign In" tab instead, or ask your admin for a personal OneDrive sharing link (1drv.ms).')
      return
    }
    onOpen(u)
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>SHARED FOLDER LINK</div>
      <input
        value={url}
        onChange={e => { setUrl(e.target.value); setError(null) }}
        onKeyDown={e => e.key === 'Enter' && handleOpen()}
        placeholder={p.linkPlaceholder}
        style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid var(--border-solid)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 6, fontFamily: 'inherit' }}
      />
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
        💡 {p.linkHint}
      </div>
      {error && (
        <div style={{ fontSize: 12, color: '#EF5350', padding: '9px 12px', background: '#EF535010', borderRadius: 8, marginBottom: 14, lineHeight: 1.5 }}>{error}</div>
      )}
      <button onClick={handleOpen} disabled={!url.trim()} style={btn(p.color, !url.trim())}>
        <LinkIcon size={14}/> Browse folder
      </button>
    </div>
  )
}

// ─── Sign-in tab (OAuth) ──────────────────────────────────────────────────────
function SignInTab({ provider, onConnected }) {
  const p = PROVIDERS[provider]
  const [clientId, setClientId]   = useState(() => localStorage.getItem(`beacon_${provider}_client_id`) || '')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  // Device code (OneDrive)
  const [deviceCode, setDeviceCode]     = useState(null)
  const [devicePolling, setDevicePolling] = useState(false)
  const abortRef = useRef(null)

  // Re-read client ID from localStorage whenever this mounts (in case admin just saved it in Settings)
  useEffect(() => {
    const id = localStorage.getItem(`beacon_${provider}_client_id`) || ''
    setClientId(id)
  }, [provider])

  async function connect() {
    const id = clientId.trim()
    if (!id) return setError('No API key configured. Ask your admin to set this up in Settings → Cloud Storage.')
    setLoading(true); setError(null)
    try {
      let tokens
      if (provider === 'onedrive')    tokens = await window.beacon.onedriveAuth(id)
      else if (provider === 'gdrive') tokens = await window.beacon.googleDriveAuth(id)
      else                            tokens = await window.beacon.dropboxAuth(id)
      if (provider === 'onedrive')    OD.storeTokens(tokens)
      else if (provider === 'gdrive') GD.storeTokens(tokens)
      else                            DB.storeTokens(tokens)
      onConnected()
    } catch (e) {
      if (e.message === 'cancelled') { setLoading(false); return }
      setError(e.message)
    } finally { setLoading(false) }
  }

  // OneDrive device code flow
  async function startDeviceCode() {
    const id = clientId.trim()
    if (!id) return setError('No API key configured. Ask your admin to set this up in Settings → Cloud Storage.')
    setLoading(true); setError(null)
    try {
      const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/devicecode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: id, scope: 'Files.ReadWrite offline_access User.Read' }),
      })
      if (!res.ok) throw new Error('Could not start device sign-in. Check your App ID.')
      const dc = await res.json()
      setDeviceCode(dc); setLoading(false)
      setDevicePolling(true)
      abortRef.current = new AbortController()
      // Poll for token
      const deadline = Date.now() + 900_000
      while (Date.now() < deadline) {
        if (abortRef.current.signal.aborted) throw new Error('cancelled')
        await new Promise(r => setTimeout(r, (dc.interval || 5) * 1000))
        const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: id, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: dc.device_code }),
        })
        const data = await tokenRes.json()
        if (data.access_token) {
          localStorage.setItem('beacon_onedrive_client_id', id)
          OD.storeTokens({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 })
          setDevicePolling(false); setDeviceCode(null)
          onConnected(); return
        }
        if (data.error === 'authorization_declined' || data.error === 'expired_token') throw new Error(data.error_description || data.error)
      }
      throw new Error('Sign-in timed out')
    } catch (e) {
      setDevicePolling(false); setDeviceCode(null)
      if (e.message !== 'cancelled') setError(e.message)
      setLoading(false)
    }
  }

  // Device code waiting UI
  if (deviceCode) {
    return (
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>ENTER THIS CODE AT</div>
        <button onClick={() => window.beacon.openExternal(deviceCode.verification_uri)}
          style={{ ...btn(p.color, false, true), marginBottom: 16 }}>
          {deviceCode.verification_uri} →
        </button>
        <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: 6, color: p.color, fontFamily: 'monospace', padding: '16px 24px', borderRadius: 12, boxShadow: 'var(--neu-raise-sm)', display: 'inline-block', marginBottom: 20 }}>
          {deviceCode.user_code}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
          1. Click the link above (opens in your browser)<br/>
          2. Type the code → sign in with your Microsoft email &amp; password<br/>
          3. Beacon connects automatically
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          <Spinner size={14}/> Waiting for sign-in…
        </div>
        <button onClick={() => { abortRef.current?.abort(); setDeviceCode(null); setDevicePolling(false) }} style={btn(null, false, true)}>Cancel</button>
      </div>
    )
  }

  const isConfigured = clientId.trim().length > 0

  return (
    <div style={{ padding: '12px 0' }}>

      {/* Not configured — show setup nudge */}
      {!isConfigured && (
        <div style={{ padding: '18px 20px', borderRadius: 12, background: 'var(--bg)', boxShadow: 'var(--neu-raise-sm)', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔑</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>API key not configured</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
            A one-time setup is needed to enable {p.label} sign-in.<br/>
            Ask your admin to go to <strong>Settings → Cloud Storage</strong>.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '8px 12px', borderRadius: 8, background: 'var(--surface)', display: 'inline-block' }}>
            It takes about 2 minutes and it's free.
          </div>
        </div>
      )}

      {/* Configured — show sign-in button */}
      {isConfigured && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.5 }}>
            A sign-in window will open — enter your {p.label} email and password there.
          </div>

          {error && <div style={{ color: '#EF5350', fontSize: 12, padding: '9px 12px', background: '#EF535010', borderRadius: 8, marginBottom: 14, lineHeight: 1.4 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={connect} disabled={loading} style={btn(p.color, loading)}>
              {loading ? <><Spinner size={14}/> Opening sign-in…</> : <><UserIcon size={14}/> Sign in with {p.label}</>}
            </button>
            {provider === 'onedrive' && (
              <button onClick={startDeviceCode} disabled={loading} style={btn(null, loading, false)}>
                🔢 Use device code instead
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── File browser (signed-in account) ────────────────────────────────────────
function FileBrowser({ provider, onBack, onImportStart }) {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [path, setPath]         = useState([{ id: 'root', name: PROVIDERS[provider].label, rawPath: '' }])
  const [thumbs, setThumbs]     = useState({})
  const [user, setUser]         = useState(null)
  const [sortBy, setSortBy]     = useState('name')
  const [categories, setCategories] = useState([])
  const [reorgMsg, setReorgMsg] = useState(null)
  const p = PROVIDERS[provider]
  const currentFolder = path[path.length - 1]

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
    loadUser(); loadItems(currentFolder.id, currentFolder.rawPath)
  }, [])

  async function loadUser() {
    try {
      if (provider === 'onedrive')    { const u = await OD.getMe(); setUser(u?.displayName || u?.mail) }
      else if (provider === 'gdrive') { const u = await GD.getMe(); setUser(u?.user?.displayName || u?.user?.emailAddress) }
      else                            { const u = await DB.getAccountInfo(); setUser(u?.name?.display_name || u?.email) }
    } catch {}
  }

  async function loadItems(folderId, rawPath = '') {
    setLoading(true); setError(null); setSelected(new Set())
    try {
      let raw = []
      if (provider === 'onedrive') {
        const data = await OD.listFolder(folderId)
        raw = (data.value || []).map(i => ({ id: i.id, name: i.name, isDir: !!i.folder, size: i.size, date: i.lastModifiedDateTime, childCount: i.folder?.childCount, thumbUrl: i.thumbnails?.[0]?.medium?.url || null, rawPath: i.id }))
      } else if (provider === 'gdrive') {
        const data = await GD.listFolder(folderId === 'root' ? 'root' : folderId)
        raw = (data.files || []).map(f => ({ id: f.id, name: f.name, isDir: GD.isFolder(f), size: f.size ? parseInt(f.size) : 0, date: f.modifiedTime, thumbUrl: f.thumbnailLink?.replace(/=s\d+$/, '=s400') || null, rawPath: f.id }))
      } else {
        const data = await DB.listFolder(rawPath)
        raw = (data.entries || []).map(e => ({ id: e.id || e.path_lower, name: e.name, isDir: DB.isFolder(e), size: e.size || 0, date: e.server_modified, rawPath: e.path_lower, thumbUrl: null }))
        const mediaFiles = raw.filter(r => !r.isDir && isMedia(r.name))
        if (mediaFiles.length) DB.getThumbnailBatch(mediaFiles.map(f => ({ path_lower: f.rawPath }))).then(map => setThumbs(prev => ({ ...prev, ...map }))).catch(() => {})
      }
      setItems(raw)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  function navigate(item) {
    if (!item.isDir) return
    const newPath = [...path, { id: item.id, name: item.name, rawPath: item.rawPath }]
    setPath(newPath); loadItems(item.id, item.rawPath)
  }

  function navigateTo(idx) {
    const newPath = path.slice(0, idx + 1); setPath(newPath)
    loadItems(newPath[newPath.length - 1].id, newPath[newPath.length - 1].rawPath)
  }

  function toggle(item) {
    if (item.isDir) { navigate(item); return }
    if (!isMedia(item.name)) return
    setSelected(s => { const n = new Set(s); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n })
  }

  const displayItems = [...items].sort((a, b) => {
    if (a.isDir && !b.isDir) return -1; if (!a.isDir && b.isDir) return 1
    if (sortBy === 'date') return new Date(b.date || 0) - new Date(a.date || 0)
    if (sortBy === 'size') return (b.size || 0) - (a.size || 0)
    return a.name.localeCompare(b.name)
  })

  const selectedItems = [...selected].map(id => displayItems.find(i => i.id === id)).filter(Boolean)

  async function handleImport() {
    onImportStart(selectedItems, async (prog, setProg) => {
      const dataDir = await window.beacon.getDataDir()
      const localPaths = []
      for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i]
        try {
          const destPath = `${dataDir}/cloud_imports/${item.name}`
          if (provider === 'onedrive') {
            const dlUrl = await OD.getDownloadUrl(item.id)
            await window.beacon.onedriveDownload(dlUrl, destPath)
          } else if (provider === 'gdrive') {
            const token = GD.getStoredTokens()?.access_token
            await window.beacon.onedriveDownload(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&access_token=${token}`, destPath)
          } else {
            const dlUrl = await DB.getDownloadUrl(item.rawPath)
            await window.beacon.onedriveDownload(dlUrl, destPath)
          }
          localPaths.push(destPath); prog[i].done = true
        } catch (e) { prog[i].error = e.message.slice(0, 40); prog[i].done = true }
        setProg([...prog])
      }
      if (localPaths.length) startFilesIngest(localPaths, () => {}, () => {}, () => {})
    })
  }

  async function handleReorganize() {
    if (!categories.length) return
    setReorgMsg({ type: 'progress', text: 'Creating category folders…' })
    try {
      for (const cat of categories) {
        if (provider === 'onedrive')       await OD.ensureFolder(currentFolder.id, cat.name)
        else if (provider === 'gdrive')    await GD.ensureFolder(currentFolder.id, cat.name, items.filter(i => i.isDir))
        else                               await DB.ensureFolder(currentFolder.rawPath, cat.name)
      }
      setReorgMsg({ type: 'success', text: `✓ Created ${categories.length} category folders` })
      loadItems(currentFolder.id, currentFolder.rawPath)
    } catch (e) { setReorgMsg({ type: 'error', text: e.message }) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '9px 16px', borderBottom: '1px solid var(--border-solid)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <BackBtn label="Disconnect" onClick={onBack}/>
        <div style={{ width: 1, height: 14, background: 'var(--border-solid)' }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, fontSize: 12, minWidth: 0 }}>
          {path.map((seg, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: 'var(--text-secondary)' }}>›</span>}
              <span onClick={() => navigateTo(i)} style={{ color: i === path.length - 1 ? 'var(--text-primary)' : '#6B8FFF', fontWeight: i === path.length - 1 ? 600 : 400, cursor: i === path.length - 1 ? 'default' : 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{seg.name}</span>
            </span>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '5px 7px', borderRadius: 7, border: '1.5px solid var(--border-solid)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 11, outline: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <option value="name">Name</option><option value="date">Date</option><option value="size">Size</option>
        </select>
        <button onClick={() => setSelected(new Set(displayItems.filter(i => !i.isDir && isMedia(i.name)).map(i => i.id)))} style={btn(null, false, true)}>Select all media</button>
        {categories.length > 0 && <button onClick={handleReorganize} style={btn(null, false, true)}>⟳ Reorganize</button>}
        {user && <div style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user}</div>}
      </div>

      {reorgMsg && (
        <div style={{ margin: '8px 16px 0', padding: '8px 12px', borderRadius: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between', background: reorgMsg.type === 'success' ? '#4CAF5015' : reorgMsg.type === 'error' ? '#EF535015' : '#6B8FFF15', color: reorgMsg.type === 'success' ? '#4CAF50' : reorgMsg.type === 'error' ? '#EF5350' : '#6B8FFF' }}>
          {reorgMsg.text}<button onClick={() => setReorgMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }}>×</button>
        </div>
      )}
      {error && (
        <div style={{ margin: '8px 16px 0', padding: '8px 12px', borderRadius: 8, background: '#EF535015', color: '#EF5350', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
          {error}<button onClick={() => loadItems(currentFolder.id, currentFolder.rawPath)} style={{ color: '#6B8FFF', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>Retry</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-secondary)', gap: 10, fontSize: 13 }}><Spinner size={18}/> Loading…</div>
        ) : displayItems.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', paddingTop: 60, fontSize: 13 }}>This folder is empty.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {displayItems.map(item => {
              const thumbUrl = item.thumbUrl || (provider === 'dropbox' ? thumbs[item.rawPath] : null)
              const sel = selected.has(item.id)
              return (
                <div key={item.id} onClick={() => toggle(item)} onDoubleClick={() => item.isDir && navigate(item)}
                  style={{ borderRadius: 10, overflow: 'hidden', cursor: 'pointer', userSelect: 'none', boxShadow: sel ? `0 0 0 2.5px ${p.color}` : 'var(--neu-raise-sm)', background: 'var(--bg)', transition: 'box-shadow 0.12s', position: 'relative' }}>
                  <div style={{ width: '100%', aspectRatio: '4/3', background: item.isDir ? '#F5A62312' : 'var(--border-solid)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                    {item.isDir ? <FolderIcon/> : thumbUrl ? <img src={thumbUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <svg width="26" height="26" viewBox="0 0 24 24" fill="var(--text-secondary)" opacity="0.25"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>}
                    {sel && <div style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckIcon color="#fff" size={12}/></div>}
                  </div>
                  <div style={{ padding: '5px 7px 7px' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{item.isDir ? (item.childCount != null ? `${item.childCount} items` : 'Folder') : fmt(item.size)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-solid)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{selected.size} file{selected.size !== 1 ? 's' : ''} selected</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmt(selectedItems.reduce((s, i) => s + (i.size || 0), 0))}</div>
          </div>
          <button onClick={() => setSelected(new Set())} style={btn(null, false, true)}>Clear</button>
          <button onClick={handleImport} style={btn(p.color)}><DownloadIcon size={14}/> Import to Beacon</button>
        </div>
      )}
    </div>
  )
}

// ─── Import progress ──────────────────────────────────────────────────────────
function ImportProgress({ items, progress, onClose }) {
  const done = progress.filter(p => p.done).length
  return (
    <div style={{ padding: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Importing files</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>{done} of {items.length} downloaded</div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border-solid)', marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, background: '#6B8FFF', width: `${items.length ? (done / items.length) * 100 : 0}%`, transition: 'width 0.3s' }}/>
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {progress.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <div style={{ width: 16, flexShrink: 0 }}>{p.done ? (p.error ? <span style={{ color: '#EF5350' }}>✕</span> : <CheckIcon/>) : <Spinner size={13}/>}</div>
            <span style={{ color: p.error ? '#EF5350' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          </div>
        ))}
      </div>
      {done === items.length && (
        <><div style={{ color: '#4CAF50', fontWeight: 600, fontSize: 13, marginBottom: 12 }}>✓ Done — AI analysis running in the background</div>
        <button onClick={onClose} style={btn('#6B8FFF')}>Close</button></>
      )}
    </div>
  )
}

// ─── Root panel ───────────────────────────────────────────────────────────────
export default function CloudStoragePanel({ onClose }) {
  const [activeProvider, setActiveProvider] = useState('onedrive')
  const [signedIn, setSignedIn]  = useState({
    onedrive: OD.isConnected(),
    gdrive:   GD.isConnected(),
    dropbox:  DB.isConnected(),
  })
  // subView: null | 'link-browser' | 'file-browser'
  const [subView, setSubView]         = useState(null)
  const [sharedUrl, setSharedUrl]     = useState(null)
  const [activeConnTab, setActiveConnTab] = useState('link') // 'link' | 'signin'
  const [importing, setImporting]     = useState(false)
  const [importItems, setImportItems] = useState([])
  const [importProgress, setImportProgress] = useState([])

  const p = PROVIDERS[activeProvider]
  const isSignedIn = signedIn[activeProvider]

  function switchProvider(id) {
    setActiveProvider(id)
    setSubView(null)
    setSharedUrl(null)
  }

  function handleSignedIn() {
    setSignedIn(prev => ({ ...prev, [activeProvider]: true }))
    setSubView('file-browser')
  }

  function handleDisconnect() {
    if (activeProvider === 'onedrive') OD.clearTokens()
    else if (activeProvider === 'gdrive') GD.clearTokens()
    else DB.clearTokens()
    setSignedIn(prev => ({ ...prev, [activeProvider]: false }))
    setSubView(null)
  }

  function handleOpenLink(url) {
    setSharedUrl(url)
    setSubView('link-browser')
  }

  function handleImportStart(items, doImport) {
    const prog = items.map(i => ({ name: i.name, done: false, error: null }))
    setImportItems(items); setImportProgress(prog); setImporting(true)
    doImport(prog, updated => setImportProgress([...updated]))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <style>{`@keyframes cs-spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ width: '90vw', maxWidth: 960, height: '86vh', background: 'var(--bg)', borderRadius: 18, boxShadow: '0 24px 80px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderBottom: '1px solid var(--border-solid)', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginRight: 6 }}>Cloud Storage</div>
          {Object.values(PROVIDERS).map(prov => {
            const conn = signedIn[prov.id]
            return (
              <button key={prov.id} onClick={() => switchProvider(prov.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative', background: activeProvider === prov.id ? prov.color : 'var(--border-solid)', transition: 'background 0.15s' }}>
                <span style={{ color: activeProvider === prov.id ? '#fff' : 'var(--text-secondary)' }}>{prov.logo}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: activeProvider === prov.id ? '#fff' : 'var(--text-secondary)' }}>{prov.label}</span>
                {conn && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4CAF50', position: 'absolute', top: 5, right: 5, border: '1.5px solid var(--bg)' }}/>}
              </button>
            )
          })}
          <div style={{ flex: 1 }}/>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--border-solid)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {importing ? (
            <div style={{ height: '100%', overflowY: 'auto' }}>
              <ImportProgress items={importItems} progress={importProgress} onClose={() => { setImporting(false); setImportItems([]); setImportProgress([]) }}/>
            </div>
          ) : subView === 'link-browser' ? (
            <div style={{ height: '100%', overflowY: 'auto' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-solid)' }}>
                <BackBtn label="← Change link" onClick={() => { setSubView(null); setSharedUrl(null) }}/>
              </div>
              <SharedLinkBrowser provider={activeProvider} url={sharedUrl} onClose={() => setSubView(null)}/>
            </div>
          ) : subView === 'file-browser' ? (
            <FileBrowser provider={activeProvider} onBack={handleDisconnect} onImportStart={handleImportStart}/>
          ) : (
            // Connect screen
            <div style={{ height: '100%', overflowY: 'auto', padding: '20px 28px' }}>
              {/* Provider identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                  {p.logo}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{p.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Browse and import files into your Beacon library</div>
                </div>
                {isSignedIn && (
                  <button onClick={() => setSubView('file-browser')} style={{ ...btn(p.color, false, false), marginLeft: 'auto' }}>
                    Open My {p.label} →
                  </button>
                )}
              </div>

              {/* Two-option tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 22, background: 'var(--border-solid)', borderRadius: 10, padding: 4 }}>
                {[
                  { id: 'link', label: '🔗 Shared Link', sub: 'No sign-in needed' },
                  { id: 'signin', label: '👤 My Account', sub: 'Full access' },
                ].map(t => (
                  <button key={t.id} onClick={() => setActiveConnTab(t.id)}
                    style={{ flex: 1, padding: '8px 10px', border: 'none', borderRadius: 7, cursor: 'pointer', background: activeConnTab === t.id ? 'var(--bg)' : 'transparent', boxShadow: activeConnTab === t.id ? 'var(--neu-raise-sm)' : 'none', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: activeConnTab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{t.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{t.sub}</div>
                  </button>
                ))}
              </div>

              {activeConnTab === 'link' ? (
                <SharedLinkEntry provider={activeProvider} onOpen={handleOpenLink}/>
              ) : (
                <SignInTab provider={activeProvider} onConnected={handleSignedIn}/>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Style helper ─────────────────────────────────────────────────────────────
function btn(color, disabled = false, small = false) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: small ? '5px 11px' : '9px 18px', borderRadius: small ? 8 : 10, border: 'none',
    background: color ? (disabled ? `${color}66` : color) : 'var(--border-solid)',
    color: color ? '#fff' : 'var(--text-primary)',
    fontWeight: 600, fontSize: small ? 11 : 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1, transition: 'opacity 0.15s', flexShrink: 0,
  }
}
