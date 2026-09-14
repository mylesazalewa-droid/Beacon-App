import { useState, useCallback, createContext, useContext, useRef } from 'react'

const ToastCtx = createContext(null)
let _toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id])
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message, { icon = null, type = 'success', duration = 2600 } = {}) => {
    const id = ++_toastId
    setToasts(prev => [...prev.slice(-4), { id, message, icon, type }])
    timers.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const fn = useContext(ToastCtx)
  return fn ?? (() => {})
}

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-10 right-5 z-[400] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-[12.5px] font-semibold cursor-default select-none"
          style={{
            background: 'var(--bg)',
            color: t.type === 'error' ? 'var(--red)' : 'var(--text-primary)',
            boxShadow: '8px 8px 24px #BBBDCC, -4px -4px 14px rgba(255,255,255,0.9)',
            border: '1px solid rgba(255,255,255,0.7)',
            animation: 'toast-in 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            maxWidth: 300,
            whiteSpace: 'nowrap',
          }}
        >
          {t.icon && <span style={{ fontSize: 15, lineHeight: 1 }}>{t.icon}</span>}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
