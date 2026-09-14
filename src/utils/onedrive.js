// Microsoft Graph API client for OneDrive integration
// Docs: https://learn.microsoft.com/en-us/graph/api/overview

const GRAPH = 'https://graph.microsoft.com/v1.0'

// ── Token helpers ─────────────────────────────────────────────────────────────

export function getStoredTokens() {
  try {
    const raw = localStorage.getItem('beacon_onedrive_tokens')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function storeTokens(tokens) {
  // tokens: { access_token, refresh_token, expires_at }
  localStorage.setItem('beacon_onedrive_tokens', JSON.stringify(tokens))
}

export function clearTokens() {
  localStorage.removeItem('beacon_onedrive_tokens')
}

export function isConnected() {
  const t = getStoredTokens()
  return !!(t?.access_token)
}

async function getAccessToken() {
  const tokens = getStoredTokens()
  if (!tokens) throw new Error('Not authenticated with OneDrive')

  // Refresh if within 5 min of expiry
  if (tokens.expires_at && Date.now() > tokens.expires_at - 300_000) {
    const clientId = localStorage.getItem('beacon_onedrive_client_id')
    if (!tokens.refresh_token || !clientId) throw new Error('Token expired, please reconnect OneDrive')
    const refreshed = await refreshToken(tokens.refresh_token, clientId)
    storeTokens(refreshed)
    return refreshed.access_token
  }
  return tokens.access_token
}

export async function refreshToken(refreshToken, clientId) {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'Files.ReadWrite offline_access User.Read',
    }),
  })
  if (!res.ok) throw new Error('Token refresh failed')
  const data = await res.json()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}

// ── Graph API request helper ──────────────────────────────────────────────────

async function graph(method, path, body = null) {
  const token = await getAccessToken()
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }
  if (body !== null) opts.body = JSON.stringify(body)
  const res = await fetch(`${GRAPH}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Graph API error ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── User ──────────────────────────────────────────────────────────────────────

export async function getMe() {
  return graph('GET', '/me?$select=displayName,mail,userPrincipalName')
}

// ── Drive / Folders ───────────────────────────────────────────────────────────

export async function listRootFolders() {
  return graph('GET', '/me/drive/root/children?$select=id,name,folder,file,lastModifiedDateTime,size&$orderby=name')
}

export async function listFolder(itemId) {
  if (itemId === 'root') {
    return graph('GET', '/me/drive/root/children?$select=id,name,folder,file,lastModifiedDateTime,size,thumbnails&$expand=thumbnails&$orderby=name')
  }
  return graph('GET', `/me/drive/items/${itemId}/children?$select=id,name,folder,file,lastModifiedDateTime,size,thumbnails&$expand=thumbnails&$orderby=name`)
}

export async function getItem(itemId) {
  return graph('GET', `/me/drive/items/${itemId}?$select=id,name,folder,file,parentReference`)
}

// ── Thumbnails ────────────────────────────────────────────────────────────────
// Returns a URL you can use directly in <img src>. No download needed.

export async function getThumbnailUrl(itemId, size = 'medium') {
  // size: small (48x48), medium (176x176), large (800x600)
  try {
    const data = await graph('GET', `/me/drive/items/${itemId}/thumbnails/0/${size}`)
    return data?.url || null
  } catch {
    return null
  }
}

// Batch fetch thumbnails for a list of item IDs
export async function batchThumbnails(items, size = 'medium') {
  const token = await getAccessToken()
  // Graph batch API: max 20 requests per batch
  const results = {}
  const chunks = []
  for (let i = 0; i < items.length; i += 20) chunks.push(items.slice(i, i + 20))

  for (const chunk of chunks) {
    const requests = chunk
      .filter(item => item.file) // only files have thumbnails
      .map((item, idx) => ({
        id: String(idx),
        method: 'GET',
        url: `/me/drive/items/${item.id}/thumbnails/0/${size}`,
      }))
    if (!requests.length) continue

    const res = await fetch(`${GRAPH}/$batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    })
    const data = await res.json()
    for (const r of data.responses || []) {
      const item = requests[parseInt(r.id)]
      if (r.status === 200 && r.body?.url) {
        results[chunk.filter(i => i.file)[parseInt(r.id)]?.id] = r.body.url
      }
    }
  }
  return results
}

// ── Download ──────────────────────────────────────────────────────────────────

export async function getDownloadUrl(itemId) {
  // Returns a pre-auth download URL (valid ~1hr, no extra auth header needed)
  const token = await getAccessToken()
  const res = await fetch(`${GRAPH}/me/drive/items/${itemId}?$select=@microsoft.graph.downloadUrl`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return data['@microsoft.graph.downloadUrl'] || null
}

// ── Move / Rename / Create ────────────────────────────────────────────────────

export async function moveItem(itemId, newParentId, newName = null) {
  const body = { parentReference: { id: newParentId } }
  if (newName) body.name = newName
  return graph('PATCH', `/me/drive/items/${itemId}`, body)
}

export async function renameItem(itemId, newName) {
  return graph('PATCH', `/me/drive/items/${itemId}`, { name: newName })
}

export async function createFolder(parentId, name) {
  const path = parentId === 'root'
    ? '/me/drive/root/children'
    : `/me/drive/items/${parentId}/children`
  return graph('POST', path, {
    name,
    folder: {},
    '@microsoft.graph.conflictBehavior': 'rename',
  })
}

export async function deleteItem(itemId) {
  return graph('DELETE', `/me/drive/items/${itemId}`)
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function searchDrive(query) {
  return graph('GET', `/me/drive/root/search(q='${encodeURIComponent(query)}')?$select=id,name,folder,file,lastModifiedDateTime,parentReference&$top=50`)
}

// ── Reorganize: push Beacon category structure to OneDrive ────────────────────
// Creates category folders under a target OneDrive folder and moves files by name pattern

export async function ensureFolder(parentId, name) {
  // Creates if not exists, returns the folder item
  try {
    return await createFolder(parentId, name)
  } catch (e) {
    // If folder already exists (409), fetch it
    const children = await listFolder(parentId)
    const existing = (children.value || []).find(
      i => i.folder && i.name.toLowerCase() === name.toLowerCase()
    )
    if (existing) return existing
    throw e
  }
}
