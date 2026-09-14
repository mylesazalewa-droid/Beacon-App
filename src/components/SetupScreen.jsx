import { useState, useEffect, useRef } from 'react'

const STEPS = [
  { id: 'python', label: 'Python environment' },
  { id: 'venv', label: 'Virtual environment' },
  { id: 'pip', label: 'AI libraries' },
]

const StepIcon = ({ status }) => {
  if (status === 'done') return <span className="text-green-400 text-[16px]">✓</span>
  if (status === 'running') return (
    <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />
  )
  if (status === 'warning') return <span className="text-yellow-400 text-[16px]">⚠</span>
  if (status === 'error') return <span className="text-red-400 text-[16px]">✗</span>
  return <span className="w-4 h-4 rounded-full border-2 border-border inline-block" />
}

export default function SetupScreen({ onComplete }) {
  const [phase, setPhase] = useState('welcome') // 'welcome' | 'installing' | 'error' | 'ollama'
  const [stepStatuses, setStepStatuses] = useState({})
  const [stepMessages, setStepMessages] = useState({})
  const [errorMsg, setErrorMsg] = useState('')
  const [ollamaStatus, setOllamaStatus] = useState(null)
  const [installingOllama, setInstallingOllama] = useState(false)
  const [ollamaInstallPct, setOllamaInstallPct] = useState(0)
  const [ollamaInstallMsg, setOllamaInstallMsg] = useState('')
  const [ollamaInstallError, setOllamaInstallError] = useState('')
  const [pullingModel, setPullingModel] = useState(false)
  const [pullLines, setPullLines] = useState([])
  const [modelName, setModelName] = useState('llava:13b')
  const logRef = useRef(null)
  const cleanupRef = useRef([])

  useEffect(() => {
    // Pre-check Ollama status
    window.beacon?.checkOllama().then(setOllamaStatus).catch(() => {})
    return () => cleanupRef.current.forEach((fn) => fn?.())
  }, [])

  const handleStartSetup = () => {
    setPhase('installing')

    const unProgress = window.beacon?.onSetupProgress((data) => {
      setStepStatuses((prev) => ({ ...prev, [data.step]: data.status }))
      setStepMessages((prev) => ({ ...prev, [data.step]: data.message }))
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
    })

    const unComplete = window.beacon?.onSetupComplete(() => {
      setPhase('ollama')
      window.beacon?.checkOllama().then(setOllamaStatus).catch(() => {})
    })

    const unError = window.beacon?.onSetupError((msg) => {
      setErrorMsg(msg)
      setPhase('error')
    })

    const unBackend = window.beacon?.onBackendReady(() => {
      if (phase === 'ollama') onComplete?.()
    })

    cleanupRef.current = [unProgress, unComplete, unError, unBackend]
    window.beacon?.runSetup()
  }

  const handleInstallOllama = () => {
    setInstallingOllama(true)
    setOllamaInstallError('')
    setOllamaInstallPct(0)
    setOllamaInstallMsg('Starting download...')

    const unProgress = window.beacon?.onOllamaInstallProgress((data) => {
      setOllamaInstallPct(data.pct || 0)
      setOllamaInstallMsg(data.message || '')
    })

    const unComplete = window.beacon?.onOllamaInstallComplete(async (data) => {
      unProgress?.()
      setInstallingOllama(false)
      if (data.success) {
        setOllamaInstallPct(100)
        setOllamaInstallMsg('Installed!')
        // Auto-start and refresh status
        await window.beacon?.launchOllama()
        const status = await window.beacon?.checkOllama()
        setOllamaStatus(status)
      } else {
        setOllamaInstallError(data.error || 'Download failed')
      }
    })

    cleanupRef.current.push(unProgress, unComplete)
    window.beacon?.installOllama()
  }

  const handleLaunchOllama = async () => {
    setOllamaStatus((prev) => ({ ...prev, running: false }))
    await window.beacon?.launchOllama()
    const status = await window.beacon?.checkOllama()
    setOllamaStatus(status)
  }

  const handlePullModel = () => {
    setPullingModel(true)
    setPullLines([])

    const unProgress = window.beacon?.onPullProgress((data) => {
      if (data.line) setPullLines((prev) => [...prev.slice(-20), data.line])
    })

    const unComplete = window.beacon?.onPullComplete((data) => {
      setPullingModel(false)
      if (data.success) {
        setOllamaStatus((prev) => ({ ...prev, model_available: true }))
      }
      unProgress?.()
    })

    window.beacon?.pullModel(modelName)
    cleanupRef.current.push(unProgress, unComplete)
  }

  const canFinish = ollamaStatus?.running && ollamaStatus?.model_available

  // ─── Welcome ────────────────────────────────────────────────────────────────
  if (phase === 'welcome') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
        <div className="text-6xl mb-5">▲</div>
        <h1 className="text-[28px] font-bold text-text-primary mb-2">Welcome to Beacon</h1>
        <p className="text-[14px] text-text-muted max-w-[440px] leading-relaxed mb-8">
          Free, local, open-source church media library. Beacon runs entirely on your Mac — no internet required after setup.
        </p>

        <div className="w-full max-w-[420px] bg-surface border border-border rounded-2xl p-6 text-left mb-6 space-y-4">
          <p className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">First-time setup</p>
          <SetupItem icon="🐍" title="Python AI libraries" desc="Installs faster-whisper, LLaVA, sentence-transformers — takes ~5 min" />
          <SetupItem icon="🤖" title="Ollama AI engine" desc="Beacon installs this for you — plus the LLaVA vision model (~8 GB, one time)" />
          <SetupItem icon="⚡" title="ffmpeg" desc="Bundled inside Beacon — no install needed" status="done" />
        </div>

        <button
          onClick={handleStartSetup}
          className="px-8 h-11 rounded-xl text-[14px] font-bold bg-accent hover:bg-accent-hover text-white transition-colors mb-3"
        >
          Set Up Beacon
        </button>
        <p className="text-[11px] text-text-dim">Requires internet for first-time library download</p>
      </div>
    )
  }

  // ─── Installing ─────────────────────────────────────────────────────────────
  if (phase === 'installing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
        <div className="w-full max-w-[480px]">
          <h2 className="text-[20px] font-bold text-text-primary mb-1 text-center">Installing dependencies</h2>
          <p className="text-[13px] text-text-muted text-center mb-8">This only happens once. Grab a coffee ☕</p>

          <div className="space-y-4 mb-6">
            {STEPS.map((step) => (
              <div key={step.id} className="flex items-start gap-3">
                <div className="mt-0.5 w-5 flex-shrink-0 flex items-center justify-center">
                  <StepIcon status={stepStatuses[step.id] || 'pending'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-medium ${stepStatuses[step.id] === 'done' ? 'text-text-primary' : 'text-text-muted'}`}>
                    {step.label}
                  </p>
                  {stepMessages[step.id] && (
                    <p className="text-[11px] text-text-dim truncate mt-0.5">{stepMessages[step.id]}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div
            ref={logRef}
            className="bg-surface border border-border rounded-lg p-3 h-[120px] overflow-y-auto"
          >
            {Object.entries(stepMessages).map(([step, msg]) => (
              <div key={step + msg} className="log-line text-[10px]">{msg}</div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-[20px] font-bold text-text-primary mb-2">Setup failed</h2>
        <div className="bg-surface border border-red-800 rounded-xl p-4 max-w-[440px] mb-6 text-left">
          <p className="font-mono text-[11px] text-red-400 break-words">{errorMsg}</p>
        </div>
        <div className="text-[13px] text-text-muted space-y-1 mb-6">
          <p>Make sure you have Python 3.11+ installed:</p>
          <code className="block bg-surface border border-border rounded px-3 py-1.5 text-[12px] text-accent">
            brew install python@3.11
          </code>
        </div>
        <button onClick={handleStartSetup} className="px-6 h-10 rounded-lg text-[13px] font-semibold bg-accent hover:bg-accent-hover text-white transition-colors">
          Try Again
        </button>
      </div>
    )
  }

  // ─── Ollama Setup ────────────────────────────────────────────────────────────
  if (phase === 'ollama') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
        <div className="w-full max-w-[480px]">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🤖</div>
            <h2 className="text-[20px] font-bold text-text-primary mb-1">Set up Ollama</h2>
            <p className="text-[13px] text-text-muted">Beacon uses Ollama to run LLaVA locally. Free, private, on-device.</p>
          </div>

          <div className="space-y-3 mb-6">
            {/* Step 1: Install Ollama */}
            <OllamaStep
              number="1"
              title="Install Ollama AI engine"
              done={ollamaStatus?.installed}
              action={
                !ollamaStatus?.installed && !installingOllama && (
                  <button
                    onClick={handleInstallOllama}
                    className="px-3 h-7 rounded text-[11px] font-semibold bg-accent hover:bg-accent-hover text-white transition-colors"
                  >
                    Install
                  </button>
                )
              }
            >
              {installingOllama && (
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-text-muted mb-1">
                    <span>{ollamaInstallMsg}</span>
                    <span>{ollamaInstallPct}%</span>
                  </div>
                  <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-300"
                      style={{ width: `${ollamaInstallPct}%` }}
                    />
                  </div>
                </div>
              )}
              {!installingOllama && ollamaInstallPct === 100 && !ollamaStatus?.installed && (
                <p className="mt-2 text-[11px] text-yellow-400">Verifying installation…</p>
              )}
              {ollamaInstallError && (
                <div className="mt-2">
                  <p className="text-[11px] text-red-400 mb-1">{ollamaInstallError}</p>
                  <button onClick={handleInstallOllama} className="text-[11px] text-accent hover:underline">
                    Try again
                  </button>
                </div>
              )}
            </OllamaStep>

            {/* Step 2: Start Ollama */}
            <OllamaStep
              number="2"
              title="Start Ollama"
              done={ollamaStatus?.running}
              action={
                ollamaStatus?.installed && !ollamaStatus?.running && (
                  <button
                    onClick={handleLaunchOllama}
                    className="px-3 h-7 rounded text-[11px] font-medium bg-surface2 hover:bg-surface3 text-text-primary border border-border transition-colors"
                  >
                    Start Ollama
                  </button>
                )
              }
            />

            {/* Step 3: Pull LLaVA */}
            <OllamaStep
              number="3"
              title="Download LLaVA model (~8 GB)"
              done={ollamaStatus?.model_available}
              action={
                ollamaStatus?.running && !ollamaStatus?.model_available && !pullingModel && (
                  <div className="flex items-center gap-2">
                    <select
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="h-7 px-2 rounded text-[11px] bg-surface2 border border-border text-text-primary"
                    >
                      <option value="llava:13b">llava:13b — best (M2 Pro+)</option>
                      <option value="llava:7b">llava:7b — faster (M1)</option>
                    </select>
                    <button
                      onClick={handlePullModel}
                      className="px-3 h-7 rounded text-[11px] font-semibold bg-accent hover:bg-accent-hover text-white transition-colors"
                    >
                      Pull Model
                    </button>
                  </div>
                )
              }
            >
              {pullingModel && (
                <div className="mt-2 bg-surface2 rounded p-2 max-h-[80px] overflow-y-auto">
                  {pullLines.map((line, i) => (
                    <div key={i} className="log-line text-[10px]">{line}</div>
                  ))}
                </div>
              )}
            </OllamaStep>
          </div>

          {/* Refresh status */}
          <button
            onClick={() => window.beacon?.checkOllama().then(setOllamaStatus)}
            className="w-full h-9 mb-4 rounded-lg text-[12px] text-text-muted border border-border hover:bg-surface2 transition-colors"
          >
            ↻ Refresh Status
          </button>

          {/* Continue */}
          <button
            onClick={onComplete}
            disabled={!canFinish}
            className="w-full h-11 rounded-xl text-[14px] font-bold bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {canFinish ? 'Open Beacon →' : 'Complete all steps above'}
          </button>

          {!ollamaStatus?.installed && (
            <p className="text-center text-[11px] text-text-dim mt-3">
              Already have Ollama running?{' '}
              <button onClick={onComplete} className="text-accent hover:underline">
                Skip →
              </button>
            </p>
          )}
        </div>
      </div>
    )
  }

  return null
}

function SetupItem({ icon, title, desc, status }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[18px] flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-text-primary">{title}</p>
          {status === 'done' && <span className="text-green-400 text-[11px]">✓ Included</span>}
        </div>
        <p className="text-[11px] text-text-muted">{desc}</p>
      </div>
    </div>
  )
}

function OllamaStep({ number, title, done, action, children }) {
  return (
    <div className={`p-4 rounded-xl border transition-colors ${done ? 'border-green-800 bg-green-900/10' : 'border-border bg-surface'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${done ? 'bg-green-500 text-white' : 'bg-surface2 text-text-muted border border-border'}`}>
          {done ? '✓' : number}
        </div>
        <p className={`flex-1 text-[13px] font-medium ${done ? 'text-green-400' : 'text-text-primary'}`}>{title}</p>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  )
}
