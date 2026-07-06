#!/bin/sh
# Launch Private Companion as a desktop app (native window onto the local server).
# Preflight (Ollama, model, espeak-ng, speech models) runs automatically; missing
# pieces are auto-fixed where safe, otherwise a setup screen explains what to do.
#
# Usage: ./run_app.sh
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$ROOT/desktop/launcher.py"
