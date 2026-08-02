#!/usr/bin/env bash
# One-shot setup for the Poppy cloud box: install deps and start the voice server
# (and the avatar server if MuseTalk is wired). Keeps the billed running-time short.
#
#   cd private-companion/cloud
#   ./setup.sh                 # voice only (works immediately)
#   ./setup.sh --avatar        # voice + avatar (needs MuseTalk + musetalk_render.sh)
#
# Logs -> voice.log / avatar.log ; PIDs -> .voice.pid / .avatar.pid
# Stop everything:  ./stop.sh
set -euo pipefail
cd "$(dirname "$0")"

WITH_AVATAR=0
[[ "${1:-}" == "--avatar" ]] && WITH_AVATAR=1

echo "== 1/3  Python env + deps =="
if [[ ! -d .venv ]]; then python3 -m venv .venv; fi
source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt

wait_health() {  # $1=url $2=name
  for _ in $(seq 1 60); do
    if curl -sf "$1/health" >/dev/null 2>&1; then echo "   $2 healthy: $1/health"; return 0; fi
    sleep 2
  done
  echo "   WARNING: $2 did not report healthy in time — check its log."; return 1
}

echo "== 2/3  Start voice server (:8600) =="
nohup python voice_server.py > voice.log 2>&1 &
echo $! > .voice.pid
wait_health "http://127.0.0.1:8600" "voice" || true

if [[ "$WITH_AVATAR" == "1" ]]; then
  echo "== 3/3  Start avatar server (:8601) =="
  : "${AVATAR_RENDER_CMD:=./musetalk_render.sh {image} {audio} {output}}"
  export AVATAR_RENDER_CMD
  nohup python avatar_server.py > avatar.log 2>&1 &
  echo $! > .avatar.pid
  wait_health "http://127.0.0.1:8601" "avatar" || true
else
  echo "== 3/3  Avatar server skipped (run with --avatar once MuseTalk is wired) =="
fi

echo
echo "Ready. From your laptop, benchmark real per-call time:"
echo "   python bench.py --n 20 --voice-url http://<ec2-ip>:8600 --avatar-url http://<ec2-ip>:8601"
echo "Watch the GPU here:   nvidia-smi dmon"
echo "STOP THE BOX when done (you pay per running-hour): aws ec2 stop-instances --instance-ids <id>"
