#!/bin/bash
set -e

echo ""
echo "▲ Beacon — Setup"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

check() { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }
info()  { echo -e "${BLUE}→${NC} $1"; }

# 1. Check macOS + Apple Silicon
if [[ "$(uname)" != "Darwin" ]]; then
  fail "Beacon requires macOS. Detected: $(uname)"
fi
ARCH=$(uname -m)
if [[ "$ARCH" != "arm64" ]]; then
  warn "Beacon is optimized for Apple Silicon. Running on $ARCH — LLaVA 13b may be slow."
else
  check "Apple Silicon detected ($ARCH)"
fi

# 2. Check Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install from https://nodejs.org (v18+)"
fi
NODE_VER=$(node -v)
check "Node.js $NODE_VER"

# 3. Check Python 3.11+
PYTHON=""
for py in python3.11 python3.12 python3.13 python3; do
  if command -v "$py" &>/dev/null; then
    VER=$("$py" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    MAJOR=$(echo "$VER" | cut -d. -f1)
    MINOR=$(echo "$VER" | cut -d. -f2)
    if [[ "$MAJOR" -eq 3 && "$MINOR" -ge 11 ]]; then
      PYTHON="$py"
      break
    fi
  fi
done
if [[ -z "$PYTHON" ]]; then
  fail "Python 3.11+ not found. Install from https://python.org"
fi
check "Python $($PYTHON --version)"

# 4. Check Ollama
if ! command -v ollama &>/dev/null; then
  fail "Ollama not found. Install from https://ollama.com then run: ollama pull llava:13b"
fi
check "Ollama $(ollama --version 2>/dev/null | head -1)"

# 5. Check ffmpeg
if ! command -v ffmpeg &>/dev/null; then
  warn "ffmpeg not found. Installing via Homebrew..."
  if command -v brew &>/dev/null; then
    brew install ffmpeg
    check "ffmpeg installed"
  else
    fail "ffmpeg not found and Homebrew not available. Install: brew install ffmpeg"
  fi
else
  check "ffmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"
fi

# 6. Check LLaVA model
echo ""
info "Checking for LLaVA model..."
if ollama list 2>/dev/null | grep -q "llava"; then
  check "LLaVA model found"
else
  warn "LLaVA not pulled yet. Pulling llava:13b (~8GB)..."
  echo "  You can cancel and pull manually: ollama pull llava:13b"
  read -p "  Pull now? [Y/n] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    ollama pull llava:13b
    check "llava:13b pulled"
  else
    warn "Skipping model pull. Run: ollama pull llava:13b before using Beacon"
  fi
fi

# 7. Install Python deps
echo ""
info "Installing Python dependencies..."
$PYTHON -m pip install -r requirements.txt --quiet
check "Python dependencies installed"

# 8. Install Node deps
echo ""
info "Installing Node dependencies..."
npm install --quiet
check "Node dependencies installed"

# 9. Create data dirs
mkdir -p beacon_data/thumbnails
check "Data directories created"

echo ""
echo "================================"
echo -e "${GREEN}▲ Beacon is ready!${NC}"
echo ""
echo "  Start dev mode:   npm run dev"
echo "  Build .dmg:       npm run build:mac"
echo ""
echo "  Ollama must be running before you start Beacon."
echo "  Start Ollama:     ollama serve"
echo ""
