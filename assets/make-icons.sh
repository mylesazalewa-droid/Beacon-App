#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Beacon icon builder
# Place your 1024×1024 PNG files here:
#   assets/icon-source.png          → produces assets/icon.icns  (app icon)
#   assets/uninstall-icon-source.png → produces the Uninstall app icon
#
# Run: bash assets/make-icons.sh
# ──────────────────────────────────────────────────────────────────────────────
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

make_icns() {
  local src="$1"
  local out="$2"
  local iconset="${out%.icns}.iconset"

  if [ ! -f "$src" ]; then
    echo "⚠  Source not found: $src — skipping"
    return
  fi

  echo "→ Building $(basename $out) from $(basename $src)…"
  mkdir -p "$iconset"

  sips -z 16   16   "$src" --out "$iconset/icon_16x16.png"      >/dev/null
  sips -z 32   32   "$src" --out "$iconset/icon_16x16@2x.png"   >/dev/null
  sips -z 32   32   "$src" --out "$iconset/icon_32x32.png"      >/dev/null
  sips -z 64   64   "$src" --out "$iconset/icon_32x32@2x.png"   >/dev/null
  sips -z 128  128  "$src" --out "$iconset/icon_128x128.png"    >/dev/null
  sips -z 256  256  "$src" --out "$iconset/icon_128x128@2x.png" >/dev/null
  sips -z 256  256  "$src" --out "$iconset/icon_256x256.png"    >/dev/null
  sips -z 512  512  "$src" --out "$iconset/icon_256x256@2x.png" >/dev/null
  sips -z 512  512  "$src" --out "$iconset/icon_512x512.png"    >/dev/null
  sips -z 1024 1024 "$src" --out "$iconset/icon_512x512@2x.png" >/dev/null

  iconutil -c icns "$iconset" -o "$out"
  rm -rf "$iconset"
  echo "   ✓ $(basename $out)"
}

make_icns "$SCRIPT_DIR/icon-source.png"          "$SCRIPT_DIR/icon.icns"
make_icns "$SCRIPT_DIR/uninstall-icon-source.png" "$SCRIPT_DIR/uninstall-icon.icns"

echo ""
echo "Done! Drop icon.icns into electron-builder config (already referenced)."
echo "Run 'npm run build:mac' to rebuild the app."
