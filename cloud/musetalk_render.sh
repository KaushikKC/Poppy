#!/usr/bin/env bash
# MuseTalk render wrapper — completed on the box, called by avatar_server.py.
#
#   ./musetalk_render.sh <image> <audio> <output.mp4>
#
# avatar_server.py passes a character portrait, the cloned-voice WAV, and the mp4
# path to write. Fill in the MuseTalk invocation for the version you installed. This
# indirection keeps avatar_server.py independent of any single MuseTalk release.
#
# Typical setup on the box:
#   git clone https://github.com/TMElyralab/MuseTalk && cd MuseTalk
#   # follow its README: create env, download weights (models/), etc.
#
# Then set MUSETALK_DIR below and adapt the command to that version's inference
# entrypoint (older releases use scripts/inference.py with a YAML config; realtime
# builds expose a realtime inference script). The exact flags vary by version, so
# this ships as a template rather than a guess.
set -euo pipefail

IMAGE="$1"; AUDIO="$2"; OUTPUT="$3"
MUSETALK_DIR="${MUSETALK_DIR:-$HOME/MuseTalk}"

echo "musetalk_render: image=$IMAGE audio=$AUDIO -> $OUTPUT" >&2

# ---------------------------------------------------------------------------
# TODO (on the box): replace the line below with the real MuseTalk call, e.g.
#
#   cd "$MUSETALK_DIR"
#   python -m scripts.inference \
#     --inference_config <(printf 'task_0:\n  video_path: "%s"\n  audio_path: "%s"\n' "$IMAGE" "$AUDIO") \
#     --result_dir "$(dirname "$OUTPUT")"
#   mv "$MUSETALK_DIR"/results/.../task_0.mp4 "$OUTPUT"
#
# Confirm the produced file lands at exactly "$OUTPUT" (avatar_server.py reads it).
# ---------------------------------------------------------------------------
echo "musetalk_render.sh is a template — wire the MuseTalk command (see TODO)." >&2
exit 1
