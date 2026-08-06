#!/bin/sh
# Run every offline retention-engine suite (RETENTION_ENGINE Sprints 1-4).
#
# Offline: no server, no Ollama, no models. Each suite gets its own throwaway
# POPPY_DATA_DIR, so none of this ever touches your real companion data.
#
# Usage:  ./tests/run_all.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SUITES="
test_loops.py
test_loop_integration.py
test_disclosure_onboarding.py
test_ritual_pact.py
test_streak.py
test_quests.py
test_garden_bloom.py
"

fail=0
for s in $SUITES; do
  d="$TMP/$(basename "$s" .py)"
  mkdir -p "$d"
  printf "%-34s " "$s"
  if POPPY_DATA_DIR="$d" python3 "$ROOT/tests/$s" "$d" > "$TMP/out.txt" 2>&1; then
    tail -1 "$TMP/out.txt"
  else
    tail -1 "$TMP/out.txt"
    echo "  ---- failures in $s ----"
    grep "FAIL" "$TMP/out.txt" || cat "$TMP/out.txt"
    fail=1
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "All offline suites passed."
else
  echo "Some suites failed (see above)."
fi
exit "$fail"
