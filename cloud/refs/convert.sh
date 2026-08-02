#!/usr/bin/env bash
# Prep a manually-downloaded clip into a clean reference wav.
#   ./convert.sh <input-audio> <character>
#   ./convert.sh ~/Downloads/some_voice.mp3 poppy      -> refs/poppy.wav
#
# Trims to the first 10s, converts to 24 kHz mono WAV, and normalizes loudness —
# what Chatterbox wants to clone from. Needs ffmpeg (brew install ffmpeg).
set -euo pipefail
cd "$(dirname "$0")"

IN="${1:?usage: ./convert.sh <input-audio> <character>}"
NAME="${2:?usage: ./convert.sh <input-audio> <character>}"
SECONDS_LEN="${SECONDS_LEN:-10}"

ffmpeg -y -i "$IN" -t "$SECONDS_LEN" -ac 1 -ar 24000 \
  -af "loudnorm=I=-18:TP=-2" "$NAME.wav"

echo "wrote $(pwd)/$NAME.wav  (${SECONDS_LEN}s, 24kHz mono)"
