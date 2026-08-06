"""Integration: profile -> loop engine -> opener / nudge / metrics, with a real
legacy profile to exercise the migration path. No LLM, no server."""
import json
import pathlib
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA = Path(sys.argv[1])
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

# Seed a profile in the OLD shape: loops that are the user's own last sentences.
recent = (datetime.now(timezone.utc) - timedelta(hours=8)).isoformat()
(DATA / "companion_profile.json").write_text(json.dumps({
    "onboarded": True, "character": "poppy", "companion_name": "Poppy",
    "created_at": recent, "last_call_date": None, "current_streak": 3,
    "open_loops": [],
    "open_loops_by_character": {
        "poppy": [{"text": "so my manager rescheduled the review to thursday", "created_at": recent}]
    },
}, indent=2))

import companion
import loops
import opening
import nudges
import metrics

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


print("\n== legacy profile migrates on first read ==")
first = companion.open_loop()
check("legacy loop surfaced", first is not None)
check("profile drained", companion.profile()["open_loops_by_character"] == {})
check("loops file created", (DATA / "companion_loops.json").exists())

print("\n== the P0: opener no longer quotes the user back at themselves ==")
print("   legacy opener:", opening.compose())

print("\n== an authored hook takes over ==")
companion.add_open_loop("how'd the review land with your manager?", "event")
top = companion.open_loop()
check("authored hook is now top", top["hook_text"].startswith("how'd the review land"))
line = opening.compose()
print("   opener:", line)
check("opener leads with the hook", "How'd the review land" in line)
check("no framing wrapper", "I've been wondering," not in line)

print("\n== the notification IS the loop (no wrapper sentence) ==")
nudge = nudges.compose_nudge("night")
print("   nudge :", nudge)
check("nudge is the hook verbatim", nudge == "how'd the review land with your manager?")
check("nudge is healthy", nudges.is_healthy(nudge))

print("\n== seed and mood-mode calls do not surface a loop ==")
check("seed opener ignores loop", "review land" not in opening.compose(seed="work is a mess"))
check("mode opener ignores loop", "review land" not in opening.compose(mode="vent"))

print("\n== milestone still prepends, and still pays off the loop ==")
ms = opening.compose(milestone=7)
print("   milestone opener:", ms)
check("milestone line present", "7 days in a row" in ms)
check("loop still paid off", "How'd the review land" in ms)

print("\n== resolution flow ==")
loops.mark_surfaced(top["id"])
check("surfaced state", loops.get(top["id"])["state"] == "surfaced")
loops.resolve(top["id"])
check("resolved state", loops.get(top["id"])["state"] == "resolved")
check("gone from live", all(l["id"] != top["id"] for l in loops.live()))

print("\n== metrics expose the two numbers that matter ==")
d = metrics.dashboard()
for k in ("loop_close_rate", "loops_planted", "loops_open", "user_initiated_rate"):
    check(f"dashboard has {k}", k in d, repr(d.get(k)))
check("no hook text leaked into metrics", "review" not in json.dumps(d))

print("\n== analytics stay content-free ==")
import db
db.record_event("loop_planted")
events = db.get_events()
check("events carry no text", all(set(e.keys()) <= {"name", "value", "created_at"} for e in events))

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
