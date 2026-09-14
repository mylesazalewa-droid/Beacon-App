const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('beacon', {
  // File system
  openInFinder: (p) => ipcRenderer.invoke('open-in-finder', p),
  openFile: (p) => ipcRenderer.invoke('open-file', p),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  downloadClips: (filePaths) => ipcRenderer.invoke('download-clips', filePaths),

  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  getBackendPort: () => ipcRenderer.invoke('backend-port'),

  // First-run setup
  checkSetup: () => ipcRenderer.invoke('check-setup'),
  runSetup: () => ipcRenderer.send('run-setup'),
  onSetupProgress: (cb) => {
    ipcRenderer.on('setup-progress', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('setup-progress')
  },
  onSetupComplete: (cb) => {
    ipcRenderer.once('setup-complete', cb)
    return () => ipcRenderer.removeAllListeners('setup-complete')
  },
  onSetupError: (cb) => {
    ipcRenderer.once('setup-error', (_, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('setup-error')
  },
  onBackendReady: (cb) => {
    ipcRenderer.once('backend-ready', cb)
    return () => ipcRenderer.removeAllListeners('backend-ready')
  },

  // Ollama
  checkOllama: () => ipcRenderer.invoke('check-ollama'),
  launchOllama: () => ipcRenderer.invoke('launch-ollama'),
  installOllama: () => ipcRenderer.send('install-ollama'),
  onOllamaInstallProgress: (cb) => {
    ipcRenderer.on('ollama-install-progress', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('ollama-install-progress')
  },
  onOllamaInstallComplete: (cb) => {
    ipcRenderer.once('ollama-install-complete', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('ollama-install-complete')
  },
  pullModel: (model) => ipcRenderer.send('pull-model', model),
  onPullProgress: (cb) => {
    ipcRenderer.on('pull-progress', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('pull-progress')
  },
  onPullComplete: (cb) => {
    ipcRenderer.once('pull-complete', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('pull-complete')
  },

  // Navigation events from main menu
  onNavigate: (cb) => {
    ipcRenderer.on('navigate', (_, view) => cb(view))
    return () => ipcRenderer.removeAllListeners('navigate')
  },
  onFocusSearch: (cb) => {
    ipcRenderer.on('focus-search', cb)
    return () => ipcRenderer.removeAllListeners('focus-search')
  },
  onBackendError: (cb) => {
    ipcRenderer.on('backend-error', (_, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('backend-error')
  },
  onNeedsSetup: (cb) => {
    ipcRenderer.on('needs-setup', (_, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('needs-setup')
  },

  // Volume / SD card detection
  onVolumeMounted: (cb) => {
    ipcRenderer.on('volume-mounted', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('volume-mounted')
  },

  // Ingest helpers
  renameMediaFile: (oldPath, newPath) => ipcRenderer.invoke('rename-media-file', { oldPath, newPath }),

  // Badge + open with app
  setBadgeCount: (n) => ipcRenderer.invoke('set-badge-count', n),
  openWithApp: (appName, filePath) => ipcRenderer.invoke('open-with-app', { appName, filePath }),

  // Machine specs (for startup recommendations)
  getMachineSpecs: () => ipcRenderer.invoke('get-machine-specs'),

  // Cloud browser (no app key — intercepts downloads)
  openCloudBrowser: (url, destDir) => ipcRenderer.invoke('open-cloud-browser', { url, destDir }),
  onCloudDownloadProgress: (cb) => {
    ipcRenderer.on('cloud-download-progress', (_, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('cloud-download-progress')
  },
  onCloudDownloadDone: (cb) => {
    ipcRenderer.on('cloud-download-done', (_, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('cloud-download-done')
  },

  // Zip extraction
  extractZip: (zipPath, destDir) => ipcRenderer.invoke('extract-zip', { zipPath, destDir }),

  // OneDrive OAuth
  onedriveAuth: (clientId) => ipcRenderer.invoke('onedrive-auth', clientId),
  onedriveDownload: (url, destPath) => ipcRenderer.invoke('onedrive-download', { url, destPath }),

  // Google Drive OAuth
  googleDriveAuth: (clientId) => ipcRenderer.invoke('googledrive-auth', clientId),

  // Dropbox OAuth
  dropboxAuth: (appKey) => ipcRenderer.invoke('dropbox-auth', appKey),

  // Help panel events
  onOpenHelp: (cb) => {
    ipcRenderer.on('open-help', cb)
    return () => ipcRenderer.removeAllListeners('open-help')
  },
  onOpenShortcuts: (cb) => {
    ipcRenderer.on('open-shortcuts', cb)
    return () => ipcRenderer.removeAllListeners('open-shortcuts')
  },
})
