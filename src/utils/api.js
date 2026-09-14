const BASE_URL = 'http://localhost:7842'

async function req(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== null) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE_URL}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

// ── Clips ─────────────────────────────────────────────────────────────────────
export const getClips = (categoryId, colorFamily, limit = 100, offset = 0, starred = false, ratingMin = 0, shotType = null, status = null, hasProject = false, noProject = false) => {
  const params = new URLSearchParams({ limit, offset })
  if (categoryId) params.set('category_id', categoryId)
  if (colorFamily) params.set('color_family', colorFamily)
  if (starred) params.set('starred', 'true')
  if (ratingMin > 0) params.set('rating_min', ratingMin)
  if (shotType) params.set('shot_type', shotType)
  if (status) params.set('status', status)
  if (hasProject) params.set('has_project', 'true')
  if (noProject) params.set('no_project', 'true')
  return req('GET', `/clips?${params}`)
}
export const batchUpdateClips = (clip_ids, updates) => req('POST', '/clips/batch', { clip_ids, ...updates })
export const getClip = (id) => req('GET', `/clips/${id}`)
export const hideClip = (id, hidden) => req('POST', `/clips/${id}/hide`, { clip_id: id, hidden })
export const rotateClip = (id, direction) => req('POST', `/clips/${id}/rotate`, { direction })
export const getSimilarClips = (id, limit = 24) => req('GET', `/clips/${id}/similar?limit=${limit}`)
export const starClip = (id, starred) => req('POST', `/clips/${id}/star`, { starred })

// ── Search ────────────────────────────────────────────────────────────────────
export const searchClips = (query, categoryId, limit = 100, offset = 0) => {
  const params = new URLSearchParams({ q: query, limit, offset })
  if (categoryId) params.set('category_id', categoryId)
  return req('GET', `/search?${params}`)
}

// ── Categories ────────────────────────────────────────────────────────────────
export const getCategories = () => req('GET', '/categories')
export const createCategory = (name) => req('POST', '/categories', { name })
export const updateCategory = (id, data) => req('PUT', `/categories/${id}`, data)
export const deleteCategory = (id) => req('DELETE', `/categories/${id}`)
export const reorderCategories = (orderedIds) => req('POST', '/categories/reorder', { ordered_ids: orderedIds })

// ── Settings ──────────────────────────────────────────────────────────────────
export const getSettings = () => req('GET', '/settings')
export const updateSetting = (key, value) => req('PUT', '/settings', { key, value })
export const getOllamaStatus = () => req('GET', '/settings/ollama-status')
export const getDbStats = () => req('GET', '/settings/db-stats')
export const clearIndex = () => req('POST', '/settings/clear-index')

// ── Watch Folders ─────────────────────────────────────────────────────────────
export const getWatchFolders = () => req('GET', '/watch-folders')
export const addWatchFolder = (folderPath) => req('POST', '/watch-folders', { folder_path: folderPath })
export const removeWatchFolder = (folderPath) => {
  const params = new URLSearchParams({ folder_path: folderPath })
  return req('DELETE', `/watch-folders?${params}`)
}

// ── Colors ────────────────────────────────────────────────────────────────────
export const getColorFamilies = () => req('GET', '/colors/families')

// ── Smart Collections ─────────────────────────────────────────────────────────
export const getCollections = () => req('GET', '/collections')
export const createCollection = (data) => req('POST', '/collections', data)
export const updateCollection = (id, data) => req('PUT', `/collections/${id}`, data)
export const deleteCollection = (id) => req('DELETE', `/collections/${id}`)

// Collection clip membership (manual drag-and-drop collections)
export const getCollectionClips = (id) => req('GET', `/collections/${id}/clips`)
export const addClipToCollection = (collId, clipId) => req('POST', `/collections/${collId}/clips`, { clip_id: clipId })
export const removeClipFromCollection = (collId, clipId) => req('DELETE', `/collections/${collId}/clips/${clipId}`)

// ── Incomplete clip detection ─────────────────────────────────────────────────
export const getIncompleteClips = () => req('GET', '/clips/incomplete')

// ── Re-analyze (resume crashed ingest — runs AI on clips missing descriptions) ─
export function reanalyzeClips(onUpdate, onComplete, onError) {
  fetch(`${BASE_URL}/clips/reanalyze`, { method: 'POST' })
    .then((res) => {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { onComplete?.(); return }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              onUpdate?.(data)
              if (data.type === 'complete') { onComplete?.(data); return }
            } catch (_) {}
          }
        }
        pump()
      })
      pump()
    })
    .catch(onError)
}

// ── Re-detect faces (runs face detection on clips with no face data yet) ──────
export function redetectFaces(onUpdate, onComplete, onError) {
  fetch(`${BASE_URL}/clips/redetect-faces`, { method: 'POST' })
    .then((res) => {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { onComplete?.(); return }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              onUpdate?.(data)
              if (data.type === 'complete') { onComplete?.(data); return }
            } catch (_) {}
          }
        }
        pump()
      })
      pump()
    })
    .catch(onError)
}

// ── Re-thumbnail (regenerate thumbnails for all photos, applying EXIF rotation) ─
export function rethumbClips(onUpdate, onComplete, onError) {
  fetch(`${BASE_URL}/clips/rethumb`, { method: 'POST' })
    .then((res) => {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { onComplete?.(); return }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              onUpdate?.(data)
              if (data.type === 'complete') { onComplete?.(data); return }
            } catch (_) {}
          }
        }
        pump()
      })
      pump()
    })
    .catch(onError)
}

// ── Re-embed (generate SigLIP visual embeddings for existing clips) ───────────
export function reembedClips(onUpdate, onComplete, onError) {
  fetch(`${BASE_URL}/clips/reembed`, { method: 'POST' })
    .then((res) => {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { onComplete?.(); return }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              onUpdate?.(data)
              if (data.type === 'complete') { onComplete?.(data); return }
            } catch (_) {}
          }
        }
        pump()
      })
      pump()
    })
    .catch(onError)
}

// ── Persons (face recognition) ────────────────────────────────────────────────
export const getPersons = () => req('GET', '/persons')
export const updatePerson = (id, data) => req('PUT', `/persons/${id}`, data)
export const deletePerson = (id) => req('DELETE', `/persons/${id}`)
export const mergePersons = (id, otherId) => req('POST', `/persons/${id}/merge/${otherId}`)
export const getPersonClips = (id) => req('GET', `/persons/${id}/clips`)
export const reclusterFaces = () => req('POST', '/persons/cluster')
export const personThumbnailUrl = (id) => `${BASE_URL}/persons/${id}/thumbnail`

// ── Thumbnails ────────────────────────────────────────────────────────────────
export const thumbnailUrl = (clipId) => `${BASE_URL}/thumbnail/${clipId}`

// ── Rating ────────────────────────────────────────────────────────────────────
export const rateClip = (id, rating) => req('PATCH', `/clips/${id}`, { rating })
export const updateClip = (id, data) => req('PATCH', `/clips/${id}`, data)
export const getRecentlyImported = (hours = 48) => {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
  const params = new URLSearchParams({ limit: 200, since })
  return req('GET', `/clips?${params}`)
}

// ── Tags ──────────────────────────────────────────────────────────────────────
export const getTags = () => req('GET', '/tags')
export const createTag = (name, color) => req('POST', '/tags', { name, color })
export const deleteTag = (id) => req('DELETE', `/tags/${id}`)
export const getClipTags = (id) => req('GET', `/clips/${id}/tags`)
export const addClipTag = (clipId, tagId) => req('POST', `/clips/${clipId}/tags`, { tag_id: tagId })
export const removeClipTag = (clipId, tagId) => req('DELETE', `/clips/${clipId}/tags/${tagId}`)

// ── Saved Searches ────────────────────────────────────────────────────────────
export const getSavedSearches = () => req('GET', '/saved-searches')
export const createSavedSearch = (data) => req('POST', '/saved-searches', data)
export const deleteSavedSearch = (id) => req('DELETE', `/saved-searches/${id}`)

// ── Highlights ────────────────────────────────────────────────────────────────
export const getHighlights = (limit = 50) => req('GET', `/highlights?limit=${limit}`)

// ── Share / ZIP ───────────────────────────────────────────────────────────────
export async function shareClips(clipIds) {
  const res = await fetch(`${BASE_URL}/clips/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clip_ids: clipIds }),
  })
  if (!res.ok) throw new Error('Share failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'beacon_export.zip'
  a.click()
  URL.revokeObjectURL(url)
}

// ── FCP XML Export ────────────────────────────────────────────────────────────
export async function exportFcpXml(clipIds, eventName = 'Beacon Export') {
  const res = await fetch(`${BASE_URL}/export/fcpxml`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clip_ids: clipIds, event_name: eventName }),
  })
  if (!res.ok) throw new Error('FCP XML export failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${eventName}.fcpxml`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Projects ──────────────────────────────────────────────────────────────────
export const getProjects = () => req('GET', '/projects')
export const createProject = (data) => req('POST', '/projects', data)
export const updateProject = (id, data) => req('PATCH', `/projects/${id}`, data)
export const deleteProject = (id) => req('DELETE', `/projects/${id}`)
export const addClipToProject = (clipId, projectId) => req('POST', `/projects/${projectId}/clips`, { clip_id: clipId })
export const removeClipFromProject = (clipId, projectId) => req('DELETE', `/projects/${projectId}/clips/${clipId}`)
export const getProjectClips = (projectId) => req('GET', `/projects/${projectId}/clips`)

// ── Shot Lists ────────────────────────────────────────────────────────────────
export const getShotLists = () => req('GET', '/shot-lists')
export const createShotList = (name) => req('POST', '/shot-lists', { name })
export const getShotListItems = (id) => req('GET', `/shot-lists/${id}/items`)
export const deleteShotList = (id) => req('DELETE', `/shot-lists/${id}`)
export const addClipToShotList = (listId, clipId) => req('POST', `/shot-lists/${listId}/items`, { clip_id: clipId })
export const removeShotListItem = (listId, itemId) => req('DELETE', `/shot-lists/${listId}/items/${itemId}`)
export const reorderShotListItems = (listId, orderedItemIds) => req('POST', `/shot-lists/${listId}/reorder`, { ordered_item_ids: orderedItemIds })

// ── Export (copy organized files) ────────────────────────────────────────────
export const exportClips = (body) => req('POST', '/export', body)

// ── Scripture references ──────────────────────────────────────────────────────
export const getClipScripture = (id) => req('GET', `/clips/${id}/scripture`)
export const searchByScripture = (book, reference) => {
  const params = new URLSearchParams()
  if (book) params.set('book', book)
  if (reference) params.set('reference', reference)
  return req('GET', `/scripture/search?${params}`)
}

// ── Transcript segments ───────────────────────────────────────────────────────
export const getTranscriptSegments = (id) => req('GET', `/clips/${id}/transcript-segments`)

// ── Usage tracking ────────────────────────────────────────────────────────────
export const markClipUsed = (id) => req('POST', `/clips/${id}/mark-used`)

// ── LLaVA description enrichment (SSE) ───────────────────────────────────────
export function enrichDescriptions(onUpdate, onComplete, onError) {
  fetch(`${BASE_URL}/clips/enrich-descriptions`, { method: 'POST' })
    .then((res) => {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { onComplete?.(); return }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              onUpdate?.(data)
              if (data.type === 'complete') { onComplete?.(data); return }
            } catch (_) {}
          }
        }
        pump()
      })
      pump()
    })
    .catch(onError)
}

// ── Duplicates ────────────────────────────────────────────────────────────────
export const findDuplicates = () => req('GET', '/duplicates')
export const bulkDeleteClips = (clip_ids, also_trash_files = false) =>
  req('POST', '/bulk-delete', { clip_ids, also_trash_files })

// ── Ingest (SSE streaming) ────────────────────────────────────────────────────
export function startIngest(folderPath, reingest, onUpdate, onComplete, onError, eventMeta = null) {
  const body = {
    folder_path: folderPath,
    reingest: !!reingest,
    event_name: eventMeta?.eventName || null,
    camera_angle: eventMeta?.cameraAngle || null,
    rename_files: !!(eventMeta?.renameFiles && eventMeta?.eventName),
  }
  fetch(`${BASE_URL}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const pump = () => reader.read().then(({ done, value }) => {
      if (done) { onComplete?.(); return }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            onUpdate(data)
            if (data.type === 'complete') { onComplete?.(data); return }
          } catch (_) {}
        }
      }
      pump()
    })
    pump()
  }).catch(onError)
}

export function startFilesIngest(filePaths, onUpdate, onComplete, onError) {
  fetch(`${BASE_URL}/ingest/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: filePaths }),
  }).then((res) => {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) { onComplete?.(); return }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            onUpdate(data)
            if (data.type === 'complete') { onComplete?.(data); return }
          } catch (_) {}
        }
      }
      pump()
    })
    pump()
  }).catch(onError)
}
