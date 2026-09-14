const { app, BrowserWindow, ipcMain, shell, dialog, Menu, session } = require('electron')
const path = require('path')
const { spawn, execFile, exec } = require('child_process')
const http = require('http')
const https = require('https')
const fs = require('fs')
const os = require('os')
const log = require('electron-log')

const OLLAMA_TGZ_URL = 'https://github.com/ollama/ollama/releases/latest/download/ollama-darwin.tgz'

const IS_DEV = process.env.ELECTRON_IS_DEV === '1'
const BACKEND_PORT = 7842
const VITE_PORT = 5173

let mainWindow = null
let pythonProcess = null
let ollamaProcess = null

// ─── Paths ───────────────────────────────────────────────────────────────────

function getResourcesPath() {
  return IS_DEV
    ? path.join(__dirname, '..')
    : process.resourcesPath
}

function getBundledBin(name) {
  // In production: Resources/bin/ffmpeg
  // In dev: assets/bin/ffmpeg
  const base = IS_DEV
    ? path.join(__dirname, '..', 'assets', 'bin')
    : path.join(process.resourcesPath, 'bin')
  return path.join(base, name)
}

function getDataDir() {
  return path.join(app.getPath('userData'), 'beacon_data')
}

function getUserBinDir() {
  return path.join(app.getPath('userData'), 'ollama')
}

function getVenvDir() {
  // In dev use the local project venv so deps are immediately available
  if (IS_DEV) return path.join(__dirname, '..', 'backend', '.venv')
  return path.join(app.getPath('userData'), 'beacon_venv')
}

function getBackendPath() {
  return IS_DEV
    ? path.join(__dirname, '..', 'backend', 'main.py')
    : path.join(process.resourcesPath, 'backend', 'main.py')
}

function getRequirementsPath() {
  return IS_DEV
    ? path.join(__dirname, '..', 'requirements.txt')
    : path.join(process.resourcesPath, 'requirements.txt')
}

function getPythonInVenv() {
  const venv = getVenvDir()
  return path.join(venv, 'bin', 'python3')
}

// Packaged builds ship a fully self-contained Python runtime (interpreter +
// all pip dependencies pre-installed) under Resources/python-runtime, so
// end users never need a system Python or an internet-dependent pip install.
function getBundledRuntimePython() {
  if (IS_DEV) return null
  const p = path.join(process.resourcesPath, 'python-runtime', 'bin', 'python3')
  return fs.existsSync(p) ? p : null
}

// ─── Python Detection ─────────────────────────────────────────────────────────

function findSystemPython() {
  const candidates = [
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3',
    '/opt/homebrew/bin/python3.13',
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3.11',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function checkPythonVersion(pythonPath) {
  return new Promise((resolve) => {
    exec(`"${pythonPath}" -c "import sys; print(sys.version_info[:2])"`, (err, stdout) => {
      if (err) { resolve(false); return }
      const match = stdout.match(/\((\d+),\s*(\d+)\)/)
      if (match) {
        const major = parseInt(match[1])
        const minor = parseInt(match[2])
        resolve(major === 3 && minor >= 11)
      } else {
        resolve(true) // assume ok if we can't parse
      }
    })
  })
}

// ─── Setup Detection ─────────────────────────────────────────────────────────

async function checkSetupNeeded() {
  // Packaged builds bundle their own Python runtime with all deps
  // pre-installed — never needs first-run setup.
  if (getBundledRuntimePython()) {
    return { needsSetup: false, bundledRuntime: true }
  }

  const venvPython = getPythonInVenv()
  const venvOk = fs.existsSync(venvPython)

  const systemPython = findSystemPython()

  return {
    needsSetup: !venvOk,
    venvExists: venvOk,
    venvDir: getVenvDir(),
    systemPython,
    systemPythonFound: !!systemPython,
  }
}

// ─── First-Run Setup ──────────────────────────────────────────────────────────

function runSetup(sender) {
  return new Promise(async (resolve, reject) => {
    const systemPython = findSystemPython()
    if (!systemPython) {
      reject(new Error('Python 3 not found. Install from https://brew.sh then run: brew install python'))
      return
    }

    const venvDir = getVenvDir()
    const requirementsPath = getRequirementsPath()

    const steps = [
      { id: 'python', label: 'Checking Python version' },
      { id: 'venv', label: 'Creating virtual environment' },
      { id: 'pip', label: 'Installing Python dependencies (this takes a few minutes)' },
    ]

    sender.send('setup-progress', { step: 'python', status: 'running', message: `Using ${systemPython}` })

    // Step 1: Check Python version
    const ok = await checkPythonVersion(systemPython)
    if (!ok) {
      sender.send('setup-progress', { step: 'python', status: 'warning', message: 'Python 3.11+ recommended — trying anyway' })
    } else {
      sender.send('setup-progress', { step: 'python', status: 'done', message: 'Python OK' })
    }

    // Step 2: Create venv
    sender.send('setup-progress', { step: 'venv', status: 'running', message: `Creating at ${venvDir}` })
    await new Promise((res, rej) => {
      const proc = spawn(systemPython, ['-m', 'venv', venvDir])
      proc.on('close', (code) => code === 0 ? res() : rej(new Error(`venv creation failed (exit ${code})`)))
      proc.on('error', rej)
    })
    sender.send('setup-progress', { step: 'venv', status: 'done', message: 'Virtual environment ready' })

    // Step 3: pip install
    const venvPip = path.join(venvDir, 'bin', 'pip')
    sender.send('setup-progress', { step: 'pip', status: 'running', message: 'Downloading packages…' })

    await new Promise((res, rej) => {
      const proc = spawn(venvPip, [
        'install', '--quiet', '--no-input',
        '-r', requirementsPath,
      ])

      let lastMsg = ''
      proc.stdout.on('data', (d) => {
        const line = d.toString().trim()
        if (line && line !== lastMsg) {
          lastMsg = line
          sender.send('setup-progress', { step: 'pip', status: 'running', message: line })
        }
      })
      proc.stderr.on('data', (d) => {
        const line = d.toString().trim()
        if (line && !line.startsWith('WARNING') && line !== lastMsg) {
          lastMsg = line
          sender.send('setup-progress', { step: 'pip', status: 'running', message: line })
        }
      })
      proc.on('close', (code) => code === 0 ? res() : rej(new Error(`pip install failed (exit ${code})`)))
      proc.on('error', rej)
    })

    sender.send('setup-progress', { step: 'pip', status: 'done', message: 'All packages installed' })
    resolve()
  })
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

function findOllamaBin() {
  const home = process.env.HOME || ''
  const candidates = [
    path.join(getUserBinDir(), 'ollama'),  // downloaded by Beacon setup
    '/usr/local/bin/ollama',
    '/opt/homebrew/bin/ollama',
    '/opt/homebrew/opt/ollama/bin/ollama',
    `${home}/.ollama/bin/ollama`,
    `${home}/bin/ollama`,
    '/usr/bin/ollama',
    '/usr/local/sbin/ollama',
  ]
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  // Fallback: ask the shell where ollama lives
  try {
    const { execSync } = require('child_process')
    const found = execSync(
      'PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin which ollama 2>/dev/null',
      { encoding: 'utf8', timeout: 3000 }
    ).trim()
    if (found && fs.existsSync(found)) return found
  } catch (_) {}
  return null
}

// Download a URL following redirects into destPath, calling onProgress(downloaded, total)
function downloadToFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl) => {
      const mod = currentUrl.startsWith('https') ? https : http
      mod.get(currentUrl, { headers: { 'User-Agent': 'Beacon/0.1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading Ollama`))
          return
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let downloaded = 0
        const file = fs.createWriteStream(destPath)
        res.on('data', (chunk) => {
          downloaded += chunk.length
          if (onProgress) onProgress(downloaded, total)
        })
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
        file.on('error', reject)
        res.on('error', reject)
      }).on('error', reject)
    }
    follow(url)
  })
}

async function isOllamaRunning() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:11434/api/tags', (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => { req.destroy(); resolve(false) })
  })
}

async function ensureOllamaRunning() {
  const running = await isOllamaRunning()
  if (running) return true

  const ollama = findOllamaBin()
  if (!ollama) return false

  log.info('Starting Ollama serve...')
  ollamaProcess = spawn(ollama, ['serve'], {
    detached: true,
    stdio: 'ignore',
  })
  ollamaProcess.unref()

  // Wait up to 8 seconds for Ollama to start
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await isOllamaRunning()) return true
  }
  return false
}

// ─── Python Backend ───────────────────────────────────────────────────────────

function killPortProcess(port) {
  return new Promise((resolve) => {
    // Find and kill any process already holding the port (Errno 48 fix)
    exec(`lsof -ti:${port}`, (err, stdout) => {
      if (err || !stdout.trim()) return resolve()
      const pids = stdout.trim().split('\n').filter(Boolean)
      let done = 0
      if (!pids.length) return resolve()
      pids.forEach(pid => {
        exec(`kill -9 ${pid}`, () => { if (++done === pids.length) resolve() })
      })
    })
  })
}

function startPythonBackend() {
  const venvPython = getPythonInVenv()
  const pythonPath = getBundledRuntimePython() || (fs.existsSync(venvPython) ? venvPython : 'python3')
  const backendPath = getBackendPath()
  const dataDir = getDataDir()
  const ffmpegPath = getBundledBin('ffmpeg')
  const ffprobePath = getBundledBin('ffprobe')

  // Kill any stale process on our port before starting — prevents [Errno 48]
  killPortProcess(BACKEND_PORT).then(() => {
    log.info(`Port ${BACKEND_PORT} cleared, starting backend…`)
    _spawnBackend(pythonPath, backendPath, dataDir, ffmpegPath, ffprobePath)
  })
}

/** Resolve a binary: bundled copy first, then common macOS install paths, then just the name. */
function resolveBin(bundledPath, name) {
  if (fs.existsSync(bundledPath)) return bundledPath
  const candidates = [
    `/opt/homebrew/bin/${name}`,   // Apple Silicon Homebrew
    `/usr/local/bin/${name}`,      // Intel Homebrew
    `/opt/local/bin/${name}`,      // MacPorts
    `/usr/bin/${name}`,
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return name  // last resort: rely on PATH
}

function _spawnBackend(pythonPath, backendPath, dataDir, ffmpegPath, ffprobePath) {
  const resolvedFfmpeg = resolveBin(ffmpegPath, 'ffmpeg')
  const resolvedFfprobe = resolveBin(ffprobePath, 'ffprobe')
  log.info(`Starting backend: ${pythonPath} ${backendPath}`)
  log.info(`ffmpeg: ${resolvedFfmpeg}  ffprobe: ${resolvedFfprobe}`)

  // Augment PATH so any subprocess spawned by Python can also find these tools
  const extraPath = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin'].join(':')
  const augmentedPath = process.env.PATH ? `${extraPath}:${process.env.PATH}` : extraPath

  pythonProcess = spawn(pythonPath, [backendPath], {
    env: {
      ...process.env,
      PATH: augmentedPath,
      BEACON_DATA_DIR: dataDir,
      BEACON_PORT: String(BACKEND_PORT),
      FFMPEG_PATH: resolvedFfmpeg,
      FFPROBE_PATH: resolvedFfprobe,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stderrBuf = ''
  pythonProcess.stdout.on('data', (d) => log.info(`[python] ${d.toString().trim()}`))
  pythonProcess.stderr.on('data', (d) => {
    const m = d.toString().trim()
    if (m) { log.warn(`[python] ${m}`); stderrBuf += m + '\n' }
  })
  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      log.warn(`Python exited with code ${code}`)
      // If deps are missing, trigger the setup wizard
      const needsSetup = stderrBuf.includes('ModuleNotFoundError') || stderrBuf.includes('No module named')
      if (needsSetup) {
        mainWindow?.webContents.send('needs-setup', 'Missing Python dependencies — running setup…')
      } else {
        mainWindow?.webContents.send('backend-error', `Backend crashed (exit ${code}): ${stderrBuf.slice(-200)}`)
      }
    }
  })
  pythonProcess.on('error', (err) => {
    log.error('Backend spawn error:', err)
    mainWindow?.webContents.send('backend-error', err.message)
  })
}

function waitForBackend(maxMs = 45000, intervalMs = 400) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const req = http.get(`http://localhost:${BACKEND_PORT}/health`, (res) => {
        res.statusCode === 200 ? resolve() : retry()
      })
      req.on('error', retry)
      req.setTimeout(800, () => { req.destroy(); retry() })
    }
    const retry = () => {
      Date.now() - start > maxMs ? reject(new Error('Backend timeout')) : setTimeout(check, intervalMs)
    }
    check()
  })
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0A0A0F',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 11 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (IS_DEV) {
    mainWindow.loadURL(`http://localhost:${VITE_PORT}`)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
  buildMenu()
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Beacon',
      submenu: [
        { label: 'About Beacon', role: 'about' },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'Cmd+,', click: () => mainWindow?.webContents.send('navigate', 'settings') },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'Ingest Folder…', accelerator: 'Cmd+O', click: () => mainWindow?.webContents.send('navigate', 'ingest') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Search', accelerator: 'Cmd+K', click: () => mainWindow?.webContents.send('focus-search') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
    {
      label: 'Help',
      submenu: [
        { label: 'Beacon Help', accelerator: 'Cmd+Shift+H', click: () => mainWindow?.webContents.send('open-help') },
        { type: 'separator' },
        { label: 'Keyboard Shortcuts', accelerator: 'Cmd+/', click: () => mainWindow?.webContents.send('open-shortcuts') },
        { type: 'separator' },
        { label: 'Report a Bug', click: () => shell.openExternal('https://github.com/beacon-app/beacon/issues') },
        { label: 'View Release Notes', click: () => shell.openExternal('https://github.com/beacon-app/beacon/releases') },
      ],
    },
  ]))
}

// ─── OneDrive OAuth (PKCE — intercepts redirect via will-redirect) ────────────
// Uses the "nativeRedirect" pattern: redirect_uri = https://login.microsoftonline.com/common/oauth2/nativeclient
// Microsoft returns the auth code to that URI, we intercept it with will-redirect
// No localhost server needed, works reliably in Electron.
// The app registration needs to be a "Mobile and desktop application" with
// redirect URI: https://login.microsoftonline.com/common/oauth2/nativeclient

const ONEDRIVE_NATIVE_REDIRECT = 'https://login.microsoftonline.com/common/oauth2/nativeclient'

ipcMain.handle('onedrive-auth', async (_, clientId) => {
  const crypto = require('crypto')
  const verifier  = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state     = crypto.randomBytes(16).toString('hex')

  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
  authUrl.searchParams.set('client_id',             clientId)
  authUrl.searchParams.set('response_type',         'code')
  authUrl.searchParams.set('redirect_uri',          ONEDRIVE_NATIVE_REDIRECT)
  authUrl.searchParams.set('scope',                 'Files.ReadWrite offline_access User.Read')
  authUrl.searchParams.set('code_challenge',        challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state',                 state)
  authUrl.searchParams.set('prompt',                'select_account')

  return new Promise((resolve, reject) => {
    let authWin = new BrowserWindow({
      width: 520, height: 720, title: 'Sign in to Microsoft',
      webPreferences: { nodeIntegration: false, contextIsolation: true },
      parent: mainWindow, modal: false,
    })

    // Intercept the redirect to nativeclient URI — Microsoft puts the auth code here
    authWin.webContents.on('will-redirect', async (event, url) => {
      if (!url.startsWith(ONEDRIVE_NATIVE_REDIRECT)) return
      event.preventDefault()
      const params = new URL(url).searchParams
      const code   = params.get('code')
      const retState = params.get('state')

      authWin.destroy()
      authWin = null

      if (!code) return reject(new Error(params.get('error_description') || 'No auth code returned'))
      if (retState !== state) return reject(new Error('Auth state mismatch — please try again'))

      try {
        const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id:     clientId,
            grant_type:    'authorization_code',
            code,
            redirect_uri:  ONEDRIVE_NATIVE_REDIRECT,
            code_verifier: verifier,
          }),
        })
        const tokenData = await tokenRes.json()
        if (tokenData.error) return reject(new Error(tokenData.error_description || tokenData.error))
        resolve({
          access_token:  tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at:    Date.now() + tokenData.expires_in * 1000,
        })
      } catch (err) {
        reject(err)
      }
    })

    authWin.loadURL(authUrl.toString())
    authWin.on('closed', () => {
      if (authWin) reject(new Error('cancelled'))
    })
  })
})

ipcMain.handle('onedrive-download', async (_, { url, destPath }) => {
  // Ensure destination directory exists
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  // Download a file from a pre-auth OneDrive URL to a local path
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    const protocol = url.startsWith('https') ? https : http
    protocol.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        protocol.get(res.headers.location, (res2) => {
          res2.pipe(file)
          file.on('finish', () => { file.close(); resolve(destPath) })
          res2.on('error', reject)
        })
        return
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve(destPath) })
      res.on('error', reject)
    }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err) })
  })
})

// ─── Extract zip and return media file paths ─────────────────────────────────
ipcMain.handle('extract-zip', async (_, { zipPath, destDir }) => {
  fs.mkdirSync(destDir, { recursive: true })
  return new Promise((resolve, reject) => {
    // macOS always has /usr/bin/unzip
    execFile('/usr/bin/unzip', ['-o', zipPath, '-d', destDir], (err) => {
      if (err) { reject(new Error(`Zip extraction failed: ${err.message}`)); return }
      // Walk the extracted folder and collect all media files
      const mediaExts = /\.(jpg|jpeg|png|heic|heif|webp|tiff|mp4|mov|avi|mkv|m4v)$/i
      function walk(dir) {
        const results = []
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) results.push(...walk(full))
            else if (mediaExts.test(entry.name) && !entry.name.startsWith('.')) results.push(full)
          }
        } catch {}
        return results
      }
      resolve(walk(destDir))
    })
  })
})

// ─── Embedded cloud browser (no app key needed) ───────────────────────────────
// Opens any cloud storage shared link in an isolated BrowserWindow.
// Intercepts all downloads via session.will-download → saves to destDir →
// notifies renderer so it can ingest the files.

ipcMain.handle('open-cloud-browser', async (_, { url, destDir }) => {
  fs.mkdirSync(destDir, { recursive: true })

  const partition = `persist:cloud-${Date.now()}`
  const ses = session.fromPartition(partition)

  // Intercept every download that happens in this window
  ses.on('will-download', (event, item) => {
    const safeName = item.getFilename().replace(/[/\\:*?"<>|]/g, '_')
    const filePath = path.join(destDir, safeName)
    item.setSavePath(filePath)
    item.on('updated', (_, state) => {
      if (state === 'progressing') {
        mainWindow?.webContents.send('cloud-download-progress', {
          name: item.getFilename(),
          received: item.getReceivedBytes(),
          total: item.getTotalBytes(),
        })
      }
    })
    item.once('done', (_, state) => {
      mainWindow?.webContents.send('cloud-download-done', {
        name: item.getFilename(),
        path: filePath,
        success: state === 'completed',
      })
    })
  })

  const win = new BrowserWindow({
    width: 1160, height: 780,
    title: 'Browse Cloud Storage — download files to import into Beacon',
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
    },
    parent: mainWindow,
  })

  // Inject a slim top banner so user knows they're in Beacon's browser
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`
      (function() {
        if (document.getElementById('beacon-banner')) return;
        const b = document.createElement('div');
        b.id = 'beacon-banner';
        b.style = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:linear-gradient(90deg,#0D1535,#1a2456);padding:8px 16px;display:flex;align-items:center;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.4);';
        b.innerHTML = '<span style="color:#6B8FFF;font-weight:700;font-size:13px">BEACON</span><span style="color:rgba(255,255,255,0.7);font-size:12px;flex:1">Browse your files and click Download on the ones you want — Beacon will import them automatically.</span><button onclick="this.closest(\'#beacon-banner\').remove()" style="color:rgba(255,255,255,0.5);background:none;border:none;cursor:pointer;font-size:18px;line-height:1;padding:0 4px">×</button>';
        document.body.style.paddingTop = (parseInt(document.body.style.paddingTop)||0) + 40 + 'px';
        document.body.prepend(b);
      })();
    `).catch(() => {})
  })

  win.loadURL(url)

  return new Promise(resolve => {
    win.on('closed', () => resolve({ closed: true }))
  })
})

// ─── Generic OAuth helper (used by Google Drive + Dropbox) ───────────────────
// Opens a BrowserWindow, waits for will-redirect to the redirectUri, returns the URL.

function oauthPopup(authUrl, redirectUriPrefix, title = 'Sign in') {
  return new Promise((resolve, reject) => {
    let win = new BrowserWindow({
      width: 520, height: 720, title,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
      parent: mainWindow, modal: false,
    })
    const capture = (event, url) => {
      if (!url.startsWith(redirectUriPrefix)) return
      event.preventDefault?.()
      win.destroy(); win = null
      resolve(url)
    }
    win.webContents.on('will-redirect', capture)
    win.webContents.on('will-navigate', capture)
    win.loadURL(authUrl)
    win.on('closed', () => { if (win) reject(new Error('cancelled')) })
  })
}

// ─── Google Drive OAuth ───────────────────────────────────────────────────────
const GOOGLE_REDIRECT = 'http://localhost:3414/beacon-callback'

ipcMain.handle('googledrive-auth', async (_, clientId) => {
  const crypto = require('crypto')
  const verifier  = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state     = crypto.randomBytes(16).toString('hex')

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id',             clientId)
  authUrl.searchParams.set('redirect_uri',          GOOGLE_REDIRECT)
  authUrl.searchParams.set('response_type',         'code')
  authUrl.searchParams.set('scope',                 'https://www.googleapis.com/auth/drive.readonly email profile')
  authUrl.searchParams.set('code_challenge',        challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state',                 state)
  authUrl.searchParams.set('access_type',           'offline')
  authUrl.searchParams.set('prompt',                'consent')

  // Spin up a temp server to catch the Google redirect (Google requires http://localhost)
  const redirectUrl = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="font-family:sans-serif;text-align:center;margin-top:80px;background:#fff"><h2>✓ Connected to Google Drive</h2><p>You can close this window.</p><script>window.close()</script></body></html>')
      server.close()
      resolve(`http://localhost:3414${req.url}`)
    })
    server.listen(3414, '127.0.0.1')
    server.on('error', reject)

    let win = new BrowserWindow({
      width: 520, height: 720, title: 'Sign in to Google',
      webPreferences: { nodeIntegration: false, contextIsolation: true },
      parent: mainWindow, modal: false,
    })
    win.loadURL(authUrl.toString())
    win.on('closed', () => { server.close(); reject(new Error('cancelled')) })
  })

  const params = new URL(redirectUrl).searchParams
  const code = params.get('code')
  if (!code) throw new Error(params.get('error') || 'No auth code returned')
  if (params.get('state') !== state) throw new Error('State mismatch')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, redirect_uri: GOOGLE_REDIRECT,
      grant_type: 'authorization_code', code_verifier: verifier,
    }),
  })
  const tokenData = await tokenRes.json()
  if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)
  return {
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at:    Date.now() + tokenData.expires_in * 1000,
  }
})

// ─── Dropbox OAuth ────────────────────────────────────────────────────────────
const DROPBOX_REDIRECT = 'http://localhost:3415/beacon-callback'

ipcMain.handle('dropbox-auth', async (_, appKey) => {
  const crypto = require('crypto')
  const verifier  = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state     = crypto.randomBytes(16).toString('hex')

  const authUrl = new URL('https://www.dropbox.com/oauth2/authorize')
  authUrl.searchParams.set('client_id',             appKey)
  authUrl.searchParams.set('redirect_uri',          DROPBOX_REDIRECT)
  authUrl.searchParams.set('response_type',         'code')
  authUrl.searchParams.set('code_challenge',        challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state',                 state)
  authUrl.searchParams.set('token_access_type',     'offline')

  const redirectUrl = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="font-family:sans-serif;text-align:center;margin-top:80px;background:#fff"><h2>✓ Connected to Dropbox</h2><p>You can close this window.</p><script>window.close()</script></body></html>')
      server.close()
      resolve(`http://localhost:3415${req.url}`)
    })
    server.listen(3415, '127.0.0.1')
    server.on('error', reject)

    let win = new BrowserWindow({
      width: 520, height: 720, title: 'Sign in to Dropbox',
      webPreferences: { nodeIntegration: false, contextIsolation: true },
      parent: mainWindow, modal: false,
    })
    win.loadURL(authUrl.toString())
    win.on('closed', () => { server.close(); reject(new Error('cancelled')) })
  })

  const params = new URL(redirectUrl).searchParams
  const code = params.get('code')
  if (!code) throw new Error(params.get('error_description') || 'No auth code returned')
  if (params.get('state') !== state) throw new Error('State mismatch')

  const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: appKey, redirect_uri: DROPBOX_REDIRECT,
      grant_type: 'authorization_code', code_verifier: verifier,
    }),
  })
  const tokenData = await tokenRes.json()
  if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)
  return {
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at:    tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
    account_id:    tokenData.account_id,
  }
})

// ─── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.handle('open-in-finder', (_, p) => shell.showItemInFolder(p))
ipcMain.handle('open-file', (_, p) => shell.openPath(p))
ipcMain.handle('open-external', (_, url) => shell.openExternal(url))
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: 'Select Media Folder' })
  return r.canceled ? null : r.filePaths[0]
})

ipcMain.handle('pick-files', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Select Media Files',
    filters: [
      { name: 'Media', extensions: ['mp4','mov','avi','mkv','m4v','wmv','flv','jpg','jpeg','png','heic','heif','tiff','webp'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return r.canceled ? null : r.filePaths
})
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('get-data-dir', () => getDataDir())
ipcMain.handle('backend-port', () => BACKEND_PORT)

// Machine specs for startup recommendations
ipcMain.handle('get-machine-specs', () => {
  const cpus     = os.cpus()
  const ramGb    = Math.round(os.totalmem() / (1024 ** 3))
  const cores    = cpus.length
  const model    = cpus[0]?.model || ''
  const isAppleSilicon = model.includes('Apple')
  const arch     = process.arch   // 'arm64' or 'x64'

  // Tier: 'low' | 'balanced' | 'full'
  let tier = 'balanced'
  if (ramGb < 8 || cores <= 4)          tier = 'low'
  else if (ramGb >= 16 && isAppleSilicon) tier = 'full'
  else if (ramGb >= 24)                  tier = 'full'

  return { ramGb, cores, model, isAppleSilicon, arch, tier }
})

// Download: copy files to user-chosen folder
ipcMain.handle('download-clips', async (_, filePaths) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose Download Destination',
    buttonLabel: 'Copy Here',
  })
  if (result.canceled || !result.filePaths[0]) return { success: false, reason: 'cancelled' }
  const destDir = result.filePaths[0]
  const { copyFile } = require('fs').promises
  let copied = 0
  const errors = []
  for (const src of filePaths) {
    try {
      const name = path.basename(src)
      let dest = path.join(destDir, name)
      let n = 1
      while (fs.existsSync(dest)) {
        const ext = path.extname(name)
        dest = path.join(destDir, `${path.basename(name, ext)}_${n}${ext}`)
        n++
      }
      await copyFile(src, dest)
      copied++
    } catch (e) {
      errors.push(e.message)
    }
  }
  return { success: true, copied, errors, destDir }
})

// ─── SD Card / Volume Auto-Detect ────────────────────────────────────────────
{
  const { execFile } = require('child_process')
  let _knownVolumes = new Set()
  let _volumeWatcher = null

  function getVolumes() {
    return new Promise((resolve) => {
      execFile('ls', ['/Volumes'], (err, stdout) => {
        if (err) return resolve([])
        const vols = stdout.trim().split('\n').filter(v => v && v !== 'Macintosh HD')
        resolve(vols)
      })
    })
  }

  async function initVolumeWatch() {
    const initial = await getVolumes()
    _knownVolumes = new Set(initial)

    _volumeWatcher = setInterval(async () => {
      try {
        const current = await getVolumes()
        const currentSet = new Set(current)
        // Detect newly mounted volumes
        for (const vol of current) {
          if (!_knownVolumes.has(vol)) {
            const volPath = `/Volumes/${vol}`
            log.info(`[volume-watch] New volume: ${volPath}`)
            mainWindow?.webContents.send('volume-mounted', { name: vol, path: volPath })
          }
        }
        _knownVolumes = currentSet
      } catch (e) {
        log.error('[volume-watch] Error:', e)
      }
    }, 3000)
  }

  app.whenReady().then(() => initVolumeWatch())
  app.on('before-quit', () => {
    if (_volumeWatcher) clearInterval(_volumeWatcher)
  })
}

// ─── Ingest Event Helpers ─────────────────────────────────────────────────────
ipcMain.handle('ingest-with-event', async (_, { folderPath, eventName, cameraAngle, renameFiles }) => {
  // Delegate to backend with event metadata
  return { folderPath, eventName, cameraAngle, renameFiles }
})

ipcMain.handle('set-badge-count', (_, n) => {
  if (app.dock) app.dock.setBadge(n > 0 ? String(n) : '')
})
ipcMain.handle('open-with-app', (_, { appName, filePath }) => {
  const { exec } = require('child_process')
  exec(`open -a "${appName}" "${filePath}"`, (err) => { if (err) log.warn('openWithApp error:', err.message) })
})

ipcMain.handle('rename-media-file', async (_, { oldPath, newPath }) => {
  try {
    fs.renameSync(oldPath, newPath)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Setup IPC
ipcMain.handle('check-setup', () => checkSetupNeeded())

ipcMain.on('run-setup', async (event) => {
  try {
    await runSetup(event.sender)
    event.sender.send('setup-complete')
    // Start backend after setup
    await ensureOllamaRunning()
    startPythonBackend()
    try { await waitForBackend() } catch (_) {}
    event.sender.send('backend-ready')
  } catch (err) {
    log.error('Setup failed:', err)
    event.sender.send('setup-error', err.message)
  }
})

// Ollama IPC
ipcMain.handle('check-ollama', async () => {
  const bin = findOllamaBin()
  const running = await isOllamaRunning()
  return { installed: !!bin, running, binPath: bin }
})

ipcMain.handle('launch-ollama', async () => {
  const started = await ensureOllamaRunning()
  return { started }
})

ipcMain.on('install-ollama', async (event) => {
  const ollamaDir = getUserBinDir()
  const tgzPath = path.join(ollamaDir, '_download.tgz')

  try {
    fs.mkdirSync(ollamaDir, { recursive: true })
    log.info(`Downloading Ollama tgz to ${tgzPath}`)

    // Step 1: download the tarball
    await downloadToFile(OLLAMA_TGZ_URL, tgzPath, (downloaded, total) => {
      const pct = total ? Math.round((downloaded / total) * 100) : 0
      const mb = (downloaded / 1024 / 1024).toFixed(1)
      const totalMb = total ? `${(total / 1024 / 1024).toFixed(0)} MB` : '…'
      event.sender.send('ollama-install-progress', { pct, message: `Downloading… ${mb} / ${totalMb}` })
    })

    // Step 2: extract the tarball
    event.sender.send('ollama-install-progress', { pct: 95, message: 'Extracting…' })
    await new Promise((resolve, reject) => {
      const proc = spawn('tar', ['-xzf', tgzPath, '-C', ollamaDir])
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)))
      proc.on('error', reject)
    })

    // Step 3: make the binary executable and clean up
    const binPath = path.join(ollamaDir, 'ollama')
    fs.chmodSync(binPath, 0o755)
    fs.unlinkSync(tgzPath)

    log.info('Ollama installed at', binPath)
    event.sender.send('ollama-install-complete', { success: true })
  } catch (err) {
    log.error('Ollama install failed:', err)
    try { fs.unlinkSync(tgzPath) } catch (_) {}
    event.sender.send('ollama-install-complete', { success: false, error: err.message })
  }
})

ipcMain.on('pull-model', (event, modelName = 'llava:13b') => {
  // Use the Ollama REST API directly — works regardless of where the binary lives
  const postData = JSON.stringify({ name: modelName, stream: true })
  const options = {
    hostname: '127.0.0.1',
    port: 11434,
    path: '/api/pull',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
  }

  const req = http.request(options, (res) => {
    let buf = ''
    res.on('data', (chunk) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop()                       // keep incomplete trailing line
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const obj = JSON.parse(line)
          // obj.status is like "pulling manifest", "downloading …", "verifying sha256", "success"
          let msg = obj.status || ''
          if (obj.completed != null && obj.total > 0) {
            const pct = Math.round((obj.completed / obj.total) * 100)
            msg = `${msg} ${pct}%`
            event.sender.send('pull-progress', { line: msg, pct })
          } else {
            event.sender.send('pull-progress', { line: msg })
          }
          if (obj.status === 'success') {
            event.sender.send('pull-complete', { success: true, model: modelName })
          }
        } catch (_) {}
      }
    })
    res.on('end', () => {
      // If stream ended without an explicit success status, treat as done
      event.sender.send('pull-complete', { success: res.statusCode === 200, model: modelName })
    })
  })

  req.on('error', (err) => {
    event.sender.send('pull-progress', { line: `Error: ${err.message}` })
    event.sender.send('pull-complete', { success: false, error: err.message })
  })

  req.write(postData)
  req.end()
})

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  createWindow()

  const setup = await checkSetupNeeded()

  if (!setup.needsSetup) {
    // Already set up — start Ollama + backend immediately
    await ensureOllamaRunning()
    startPythonBackend()
    waitForBackend().then(() => {
      mainWindow?.webContents.send('backend-ready')
    }).catch((err) => {
      log.warn('Backend slow to start:', err.message)
    })
  }
  // If setup is needed, the renderer will drive the setup flow via IPC

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (pythonProcess) { pythonProcess.kill('SIGTERM') }
})

app.on('will-quit', () => {
  if (pythonProcess && !pythonProcess.killed) pythonProcess.kill('SIGKILL')
})
