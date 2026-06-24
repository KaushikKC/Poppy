#!/bin/sh
# Start the Private Companion backend (which also serves the frontend).
# Usage: ./run.sh
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
HOST="127.0.0.1"
PORT="8000"

# 1. Ensure Ollama is reachable; it must be serving the LLM locally.
if ! curl -s "http://localhost:11434/api/tags" >/dev/null 2>&1; then
  echo "Ollama is not responding on http://localhost:11434"
  echo "Start it first:  ollama serve   (or open the Ollama app)"
  exit 1
fi

# 2. Launch the FastAPI app (serves API + frontend at http://HOST:PORT).
echo "Starting Private Companion on http://${HOST}:${PORT}"
echo "Open that URL in Chrome. Press Ctrl+C to stop."
cd "$ROOT/backend"
exec python3 -m uvicorn main:app --host "$HOST" --port "$PORT"
