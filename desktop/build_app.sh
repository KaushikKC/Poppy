#!/bin/sh
# Build dist/Poppys.app with PyInstaller.
#
# Usage: ./desktop/build_app.sh
#
# The bundle includes torch + mlx + transformers, so the build needs a lot of
# scratch space (build/ + dist/ can hit ~10 GB combined). Guarded below.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── Guard: free disk ─────────────────────────────────────────────────────────
FREE_GB=$(df -g . | awk 'NR==2 {print $4}')
if [ "$FREE_GB" -lt 15 ]; then
  echo "Only ${FREE_GB} GB free on disk — the build needs ~15 GB of scratch space."
  echo "Free up space (or empty ~/Library/Caches) and re-run."
  exit 1
fi

# ── PyInstaller present? ─────────────────────────────────────────────────────
if ! python3 -c "import PyInstaller" 2>/dev/null; then
  echo "Installing PyInstaller…"
  python3 -m pip install --user pyinstaller
fi

# ── Icon present? ────────────────────────────────────────────────────────────
if [ ! -f desktop/icons/poppys.icns ]; then
  echo "Missing desktop/icons/poppys.icns — generate it from frontend/poppys-logo.png first."
  exit 1
fi

echo "Building Poppys.app (this takes several minutes)…"
python3 -m PyInstaller --noconfirm desktop/poppys.spec

echo
echo "Done → dist/Poppys.app"
echo "Smoke test:   open dist/Poppys.app   (logs: ~/Library/Logs/Poppys/poppys.log)"
echo "Then: codesign + notarize (see PRODUCTION_PLAN A7/A8) before sharing."
