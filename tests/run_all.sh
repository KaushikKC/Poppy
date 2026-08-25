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
test_boundaries.py
test_updates.py
test_memory_capture.py
test_context_budget.py
test_launcher_setup.py
test_stt_silence.py
test_model_presence.py
"

# The VAD pre-roll suite is JavaScript, because the bug it guards lives in the
# browser half of the app and testing a Python re-implementation of it would
# prove nothing. Skipped rather than failed when node is absent.
JS_SUITES="test_vad_preroll.js test_style_contract.js"

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

for s in $JS_SUITES; do
  printf "%-34s " "$s"
  if ! command -v node > /dev/null 2>&1; then
    echo "SKIPPED (node not installed)"
    continue
  fi
  if node "$ROOT/tests/$s" > "$TMP/out.txt" 2>&1; then
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
