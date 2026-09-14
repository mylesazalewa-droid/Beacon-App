// Google Drive API v3 client
const DRIVE = 'https://www.googleapis.com/drive/v3'

const MEDIA_MIME = new Set([
  'image/jpeg','image/png','image/heic','image/heif','image/webp','image/tiff','image/gif',
  'video/mp4','video/quicktime','video/x-msvideo','video/x-matroska','video/x-m4v',
])

export function getStoredTokens() {
  try { return JSON.parse(localStorage.getItem('beacon_gdrive_tokens') || 'null') } catch { return null }
}
export function storeTokens(t) { localStorage.setItem('beacon_gdrive_tokens', JSON.stringify(t)) }
export function clearTokens()  { localStorage.removeItem('beacon_gdrive_tokens') }
export function isConnected()  { return !!getStoredTokens()?.access_token }

async function getToken() {
  const t = getStoredTokens()
  if (!t) throw new Error('Not authenticated with Google Drive')
  if (t.expires_at && Date.now() > t.expires_at - 300_000 && t.refresh_token) {
    const clientId = localStorage.getItem('beacon_gdrive_client_id')
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: t.refresh_token }),
    })
    const data = await res.json()
    const refreshed = { ...t, access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 }
    storeTokens(refreshed)
    return refreshed.access_token
  }
  return t.access_token
}

async function drive(path, params = {}) {
  const token = await getToken()
  const url = new URL(`${DRIVE}${path}`)
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) url.searchParams.set(k, v) })
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `Drive API ${res.status}`) }
  return res.json()
}

export async function getMe() {
  return drive('/about', { fields: 'user(displayName,emailAddress,photoLink)' })
}

export async function listFolder(folderId = 'root') {
  return drive('/files', {
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,hasThumbnail,parents)',
    orderBy: 'folder,name',
    pageSize: 200,
  })
}

export async function searchFiles(query) {
  return drive('/files', {
    q: `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,parents)',
    pageSize: 50,
  })
}

export function isMediaFile(f) { return MEDIA_MIME.has(f.mimeType) }
export function isFolder(f)    { return f.mimeType === 'application/vnd.google-apps.folder' }

export async function getDownloadUrl(fileId) {
  const token = await getToken()
  // Returns a URL you can use with a Bearer header to download
  return { url: `${DRIVE}/files/${fileId}?alt=media`, token }
}

export async function getThumbnailUrl(file) {
  // Google Drive provides thumbnailLink directly on file metadata (128px default)
  // Replace s220 with larger size
  return file.thumbnailLink?.replace(/=s\d+$/, '=s400') || null
}

export async function createFolder(parentId, name) {
  const token = await getToken()
  const res = await fetch(`${DRIVE}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  if (!res.ok) throw new Error('Failed to create folder')
  return res.json()
}

export async function ensureFolder(parentId, name, existingItems) {
  const existing = (existingItems || []).find(f => isFolder(f) && f.name.toLowerCase() === name.toLowerCase())
  if (existing) return existing
  return createFolder(parentId, name)
}
