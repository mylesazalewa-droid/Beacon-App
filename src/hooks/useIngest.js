import { useState, useCallback } from 'react'
import { startIngest, startFilesIngest } from '../utils/api'

export function useIngest(onDone) {
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [summary, setSummary] = useState(null)
  const [currentFile, setCurrentFile] = useState('')

  const start = useCallback((folderPath, reingest = false, eventMeta = null) => {
    setRunning(true)
    setLogs([])
    setProgress({ current: 0, total: 0 })
    setSummary(null)

    // Log event metadata if provided
    if (eventMeta?.eventName) {
      setLogs([{
        type: 'progress',
        text: `🏷  Event: ${eventMeta.eventName} · Camera: ${eventMeta.cameraAngle}${eventMeta.renameFiles ? ' · Auto-rename ON' : ''}`,
      }])
    }

    startIngest(
      folderPath,
      reingest,
      (update) => {
        setProgress({ current: update.index || 0, total: update.total || 0 })

        if (update.type === 'classified') {
          setCurrentFile(update.filename)
          setLogs((prev) => [...prev, {
            type: 'classified',
            text: `[${String(update.index).padStart(2, '0')}/${update.total}] ${update.filename}`,
            category: update.category,
            confidence: update.confidence,
          }])
        } else if (update.type === 'progress') {
          setCurrentFile(update.filename)
          setLogs((prev) => {
            const last = prev[prev.length - 1]
            const line = {
              type: 'progress',
              text: `[${String(update.index).padStart(2, '0')}/${update.total}] ${update.filename} → ${update.stage}`,
            }
            // Replace last progress line for same file
            if (last?.type === 'progress' && last.text.includes(update.filename)) {
              return [...prev.slice(0, -1), line]
            }
            return [...prev, line]
          })
        } else if (update.type === 'error') {
          setLogs((prev) => [...prev, {
            type: 'error',
            text: `✗ ${update.filename}: ${update.error}`,
          }])
        } else if (update.type === 'skip') {
          setLogs((prev) => [...prev, {
            type: 'skip',
            text: `↩ ${update.filename} (already indexed)`,
          }])
        }
      },
      (data) => {
        setRunning(false)
        setCurrentFile('')
        if (data?.summary) setSummary(data.summary)
        onDone?.()
      },
      (err) => {
        setRunning(false)
        setCurrentFile('')
        setLogs((prev) => [...prev, { type: 'error', text: `Fatal: ${err.message}` }])
      },
      eventMeta
    )
  }, [onDone])

  const startFiles = useCallback((filePaths) => {
    setRunning(true)
    setLogs([{ type: 'progress', text: `📂 Importing ${filePaths.length} file${filePaths.length !== 1 ? 's' : ''}…` }])
    setProgress({ current: 0, total: 0 })
    setSummary(null)

    startFilesIngest(
      filePaths,
      (update) => {
        setProgress({ current: update.index || 0, total: update.total || 0 })
        if (update.type === 'classified') {
          setCurrentFile(update.filename)
          setLogs((prev) => [...prev, { type: 'classified', text: `[${String(update.index).padStart(2,'0')}/${update.total}] ${update.filename}`, category: update.category }])
        } else if (update.type === 'progress') {
          setCurrentFile(update.filename)
          setLogs((prev) => {
            const last = prev[prev.length - 1]
            const line = { type: 'progress', text: `[${String(update.index).padStart(2,'0')}/${update.total}] ${update.filename} → ${update.stage}` }
            if (last?.type === 'progress' && last.text.includes(update.filename)) return [...prev.slice(0,-1), line]
            return [...prev, line]
          })
        } else if (update.type === 'error') {
          setLogs((prev) => [...prev, { type: 'error', text: `✗ ${update.filename}: ${update.error}` }])
        } else if (update.type === 'skip') {
          setLogs((prev) => [...prev, { type: 'skip', text: `↩ ${update.filename} (already indexed)` }])
        }
      },
      (data) => {
        setRunning(false)
        setCurrentFile('')
        if (data?.summary) setSummary(data.summary)
        onDone?.()
      },
      (err) => {
        setRunning(false)
        setCurrentFile('')
        setLogs((prev) => [...prev, { type: 'error', text: `Fatal: ${err.message}` }])
      }
    )
  }, [onDone])

  const reset = useCallback(() => {
    setLogs([])
    setProgress({ current: 0, total: 0 })
    setSummary(null)
    setCurrentFile('')
    setRunning(false)
  }, [])

  return { start, startFiles, reset, running, logs, progress, summary, currentFile }
}
