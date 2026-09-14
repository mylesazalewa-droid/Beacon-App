// Dropbox API v2 client
const API  = 'https://api.dropboxapi.com/2'
const CONTENT = 'https://content.dropboxapi.com/2'

const MEDIA_EXT = /\.(jpg|jpeg|png|heic|heif|webp|tiff|mp4|mov|avi|mkv|m4v)$/i

export function getStoredTokens() {
  try { return JSON.parse(localStorage.getItem('beacon_dropbox_tokens') || 'null') } catch { return null }
}
export function storeTokens(t) { localStorage.setItem('beacon_dropbox_tokens', JSON.stringify(t)) }
export function clearTokens()  { localStorage.removeItem('beacon_dropbox_tokens') }
export function isConnected()  { return !!getStoredTokens()?.access_token }

async function getToken() {
  const t = getStoredTokens()
  if (!t) throw new Error('Not authenticated with Dropbox')
  if (t.expires_at && Date.now() > t.expires_at - 300_000 && t.refresh_token) {
    const appKey = localStorage.getItem('beacon_dropbox_app_key')
    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: appKey }),
    })
    const data = await res.json()
    const refreshed = { ...t, access_token: data.access_token, expires_at: Date.now() + (data.expires_in || 14400) * 1000 }
    storeTokens(refreshed)
    return refreshed.access_token
  }
  return t.access_token
}

async function dbx(endpoint, body) {
  const token = await getToken()
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error_summary || `Dropbox API ${res.status}`) }
  return res.json()
}

export async function getAccountInfo() {
  return dbx('/users/get_current_account', null)
}

export async function listFolder(path = '') {
  return dbx('/files/list_folder', {
    path: path || '',
    include_media_info: true,
    include_thumbnail_info: true,
  })
}

export async function listFolderContinue(cursor) {
  return dbx('/files/list_folder/continue', { cursor })
}

export async function searchFiles(query) {
  return dbx('/files/search_v2', {
    query,
    options: { max_results: 50, file_status: { '.tag': 'active' } },
  })
}

export function isMediaFile(entry) {
  return entry['.tag'] === 'file' && MEDIA_EXT.test(entry.name)
}

export function isFolder(entry) { return entry['.tag'] === 'folder' }

export async function getThumbnailBatch(entries) {
  // entries: array of { path: string }
  const token = await getToken()
  const res = await fetch(`${CONTENT}/files/get_thumbnail_batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      entries: entries.slice(0, 25).map(e => ({
        path: e.path_lower,
        format: { '.tag': 'jpeg' },
        size: { '.tag': 'w256h256' },
        mode: { '.tag': 'bestfit' },
      })),
    }),
  })
  const data = await res.json()
  const map = {}
  for (const r of data.entries || []) {
    if (r['.tag'] === 'success') {
      map[r.metadata.path_lower] = `data:image/jpeg;base64,${r.thumbnail}`
    }
  }
  return map
}

export async function getDownloadUrl(path) {
  const token = await getToken()
  // Get a temporary download link
  const res = await fetch(`${API}/files/get_temporary_link`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) throw new Error('Could not get download URL')
  const data = await res.json()
  return data.link
}

export async function createFolder(path) {
  return dbx('/files/create_folder_v2', { path, autorename: false })
}

export async function ensureFolder(parentPath, name) {
  const fullPath = parentPath === '' ? `/${name}` : `${parentPath}/${name}`
  try { return await createFolder(fullPath) } catch { return { metadata: { path_lower: fullPath.toLowerCase() } } }
}
