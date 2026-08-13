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
# 8 GB, not 15. Measured across several real builds: dist/ peaks at ~3.9 GB and
# build/ at ~0.3 GB, so ~4.2 GB total. The old 15 GB figure was a guess that
# blocked builds on a machine with three times the space actually required.
FREE_GB=$(df -g . | awk 'NR==2 {print $4}')
if [ "$FREE_GB" -lt 8 ]; then
  echo "Only ${FREE_GB} GB free on disk — the build needs ~4.2 GB plus headroom."
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
