# ▲ Beacon

**Free, local, open-source church media library.**

Beacon is a Mac desktop app that ingests your church footage and photos, uses on-device AI to classify and describe every file, and makes everything instantly searchable through natural language — with zero cloud, zero accounts, and zero ongoing cost.

---

## Features

- **Natural language search** — find clips by what's happening, not just filenames
- **AI classification** — LLaVA 13b categorizes every clip (Worship, Sermon, Baptism, etc.)
- **Speech search** — Whisper transcribes every video so you can search spoken words
- **Semantic vector search** — finds visually similar clips even with different wording
- **Watch folders** — background auto-indexing of new files
- **Category manager** — full CRUD with drag-to-reorder, dynamic AI prompt
- **100% local** — no internet, no API keys, no accounts, no subscriptions

---

## Hardware Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| Mac | Apple Silicon M1 | M2 Pro / M3 / M4 |
| RAM | 8 GB | 16 GB |
| Storage | 10 GB free | 20 GB+ |
| macOS | 12 Monterey | 14 Sonoma+ |

---

## Quick Start

### 1. Install prerequisites

```bash
# Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js v18+
brew install node

# Python 3.11+
brew install python@3.11

# ffmpeg
brew install ffmpeg

# Ollama
# Download from https://ollama.com
```

### 2. Pull the LLaVA model

```bash
ollama pull llava:13b   # ~8GB — recommended for M2 Pro/Max/M3/M4
ollama pull llava:7b    # ~4GB — faster, acceptable for M1
```

### 3. Run setup

```bash
git clone https://github.com/revitalize/beacon
cd beacon
./setup.sh
```

### 4. Start Beacon

```bash
# Terminal 1 — make sure Ollama is running
ollama serve

# Terminal 2 — start Beacon
npm run dev
```

---

## Building the DMG

```bash
npm run build:mac
# Output: release/Beacon-0.1.0-arm64.dmg
```

Requires Xcode Command Line Tools: `xcode-select --install`

---

## Project Structure

```
beacon/
├── electron/          # Electron main process
│   ├── main.js        # App lifecycle, Python spawning, IPC
│   └── preload.js     # Context bridge (Electron → React)
├── src/               # React frontend
│   ├── App.jsx        # Root layout
│   ├── components/    # UI components
│   ├── hooks/         # useSearch, useIngest
│   └── utils/api.js   # Backend API calls
├── backend/           # Python FastAPI backend
│   ├── main.py        # FastAPI routes + entry point
│   ├── database.py    # SQLite schema + helpers
│   ├── ingest.py      # ffmpeg + LLaVA + Whisper pipeline
│   ├── vision.py      # Ollama/LLaVA integration
│   ├── transcribe.py  # faster-whisper integration
│   ├── embeddings.py  # sentence-transformers
│   ├── search.py      # Hybrid vector + keyword search
│   ├── categories.py  # Category CRUD
│   └── watcher.py     # watchdog background indexer
├── setup.sh           # One-command setup script
├── package.json       # Node dependencies + electron-builder config
└── requirements.txt   # Python dependencies
```

---

## Tech Stack

| Layer | Tool |
|---|---|
| Desktop shell | Electron |
| Frontend | React + Tailwind CSS |
| Backend | Python FastAPI (port 7842) |
| Vision AI | Ollama + LLaVA 1.6 13b |
| Speech-to-text | faster-whisper (Apple Silicon optimized) |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |
| Database | SQLite + sqlite-vec |
| Frame extraction | ffmpeg |
| Watch folders | watchdog |
| Distribution | electron-builder + GitHub Actions |

---

## Search Syntax

| Query | What it does |
|---|---|
| `grace` | Hybrid search (visual + speech) |
| `visual:"altar"` | Search visual descriptions only |
| `speech:"salvation"` | Search transcripts only |
| `visual:"baptism" AND speech:"water"` | Both fields |

**Keyboard shortcut:** `⌘K` focuses search from anywhere.

---

## Default Categories

Worship · Sermon · Baptism · Kids Ministry · Events · Unclassified

Add your own in **Settings → Categories**. New categories are immediately available to the AI prompt on the next ingest.

---

## License

MIT — free and open source forever.

**▲ BEACON — Free forever. Built for the church media community.**
