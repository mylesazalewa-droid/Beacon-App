import { useState, useEffect, useCallback, useRef } from 'react'
import { searchClips, getClips } from '../utils/api'

export function useSearch(initialCategoryId = null) {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [colorFamily, setColorFamily] = useState(null)
  const [status, setStatus] = useState(null)
  const [noProject, setNoProject] = useState(false)
  const [shotType, setShotType] = useState(null)
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(false)
  const [matchType, setMatchType] = useState('all')
  const [total, setTotal] = useState(0)
  const debounceRef = useRef(null)
  const abortRef = useRef(null)

  const doSearch = useCallback(async (q, catId, colFam, st, noPrj, shtType) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    try {
      const data = q.trim()
        ? await searchClips(q, catId)
        : await getClips(catId, colFam, 100, 0, false, 0, shtType, st, false, noPrj)
      if (!ctrl.signal.aborted) {
        setClips(data.clips || [])
        setMatchType(data.match_type || 'all')
        setTotal(data.total || (data.clips?.length ?? 0))
      }
    } catch (err) {
      if (!ctrl.signal.aborted) console.error('Search error:', err)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  // Debounced changes
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(query, categoryId, colorFamily, status, noProject, shotType)
    }, 150)
    return () => clearTimeout(debounceRef.current)
  }, [query, categoryId, colorFamily, status, noProject, shotType, doSearch])

  const refresh = useCallback(() => doSearch(query, categoryId, colorFamily, status, noProject, shotType), [query, categoryId, colorFamily, status, noProject, shotType, doSearch])

  // Cancel any pending debounce and abort any in-flight fetch.
  // Call this before manually loading clips in a handler (e.g. handleSelectPerson)
  // to prevent a stale doSearch from overwriting the manually-set clips.
  const abort = useCallback(() => {
    clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()
  }, [])

  return {
    query, setQuery,
    categoryId, setCategoryId,
    colorFamily, setColorFamily,
    status, setStatus,
    noProject, setNoProject,
    shotType, setShotType,
    clips, setClips,
    loading, matchType, total,
    refresh,
    abort,
  }
}
