#!/usr/bin/env bash
# Stop the voice/avatar servers started by setup.sh (does NOT stop the EC2 instance).
# To stop billing you must stop the INSTANCE: aws ec2 stop-instances --instance-ids <id>
set -euo pipefail
cd "$(dirname "$0")"
for name in avatar voice; do
  pidfile=".$name.pid"
  if [[ -f "$pidfile" ]]; then
    pid="$(cat "$pidfile")"
    if kill "$pid" 2>/dev/null; then echo "stopped $name (pid $pid)"; fi
    rm -f "$pidfile"
  fi
done
echo "Servers stopped. Remember: stop the EC2 INSTANCE too, or you keep paying."
