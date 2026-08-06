"""Sprint 3 items 17-21: goal, quests, kill switch, notification ladder."""
import pathlib
import sys
from datetime import datetime, timedelta

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import companion
import loops
import nudges
import quests
import streak

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


def reset(**over):
    companion._PATH.unlink(missing_ok=True)
    loops._PATH.unlink(missing_ok=True)
    companion.create("poppy")
    if over:
        companion.update(**over)


print("\n== §4.3: slot 1 is ALWAYS the open loop ==")
reset()
companion.add_open_loop("how did the interview go?", "event")
q = quests.today_quests()
check("three quests", len(q) == 3, str(len(q)))
check("slot 1 is the loop", q[0]["id"] == "open_loop", q[0]["id"])
check("slot 1 carries her actual hook", "how did the interview go" in q[0]["text"], q[0]["text"])
check("slot 1 is pinned", q[0].get("pinned") is True)
print("   ", [x["text"] for x in q])

print("\n== slot 1 still exists with no loop yet ==")
reset()
q = quests.today_quests()
check("slot 1 present without a loop", q[0]["id"] == "open_loop", q[0]["id"])
check("no empty text", bool(q[0]["text"].strip()))

print("\n== never all three completable by just turning up ==")
reset()
active_ids = {x["id"] for x in quests._ACTIVE}
for day in range(40):
    picked = quests._pick(f"2026-09-{day % 28 + 1:02d}")
    if not any(p["id"] in active_ids for p in picked):
        check(f"day {day}: at least one deliberate quest", False, str([p['id'] for p in picked]))
        break
else:
    check("every day has at least one deliberate quest", True)

print("\n== the set is stable within a day, not rerolled on refresh ==")
reset()
a = [x["id"] for x in quests.today_quests()]
b = [x["id"] for x in quests.today_quests()]
check("stable across reads", a == b, f"{a} vs {b}")

print("\n== completion comes from real signals ==")
reset()
companion.add_open_loop("how did the interview go?", "event")
before = quests.status()
check("nothing done yet", before["completed"] == 0, str(before["completed"]))
newly = quests.complete({"loop_resolved": True})
check("resolving the loop completes slot 1", "open_loop" in newly, str(newly))
check("counted", quests.status()["completed"] == 1)
check("idempotent", quests.complete({"loop_resolved": True}) == [])
check("a quest grants a freeze fragment",
      companion.profile()["streak_fragments"] >= 1,
      str(companion.profile()["streak_fragments"]))

print("\n== 2 of 3 is a feature, not a failure ==")
s = quests.status()
check("no failure flag anywhere", "failed" not in s and "missed" not in s)
check("ring is a fraction", 0 <= s["ring"] <= 1, str(s["ring"]))

print("\n== §4.2: the goal the user picks ==")
reset()
check("default is regular", quests.goal()["key"] == "regular", quests.goal()["key"])
for key in ("light", "regular", "deep"):
    g = quests.set_goal(key)
    check(f"{key} sets", g["key"] == key, g["key"])
check("junk falls back", quests.set_goal("banana")["key"] == "regular")
quests.set_goal("light")
quests.complete({"loop_resolved": True})
check("light is met by one quest", quests.status()["goal_met"] is True)
quests.set_goal("deep")
check("deep is not met by one", quests.status()["goal_met"] is False)

print("\n== §4.9: the kill switch ==")
reset()
check("layer on by default", companion.daily_layer_off() is False)
companion.update(daily_layer_off=True)
check("switch takes effect", companion.daily_layer_off() is True)

print("\n== §4.8: the notification ladder ==")
reset()


def ladder_at(days_ago):
    when = (datetime.now() - timedelta(days=days_ago)).date().isoformat()
    companion.update(last_call_date=when)
    return nudges.ladder_line()


check("day 0: no ladder, the loop carries it", ladder_at(0) is None, repr(ladder_at(0)))
check("day 1: no ladder", ladder_at(1) is None, repr(ladder_at(1)))
for d in (2, 3, 5):
    line = ladder_at(d)
    print(f"   day {d}: {line!r}")
    check(f"day {d} has copy", bool(line))
    check(f"day {d} is healthy", nudges.is_healthy(line))
    check(f"day {d} has no exclamation", "!" not in line)
    check(f"day {d} has no em dash", "—" not in line)
check("day 5 says it will stop", "stop nudging" in (ladder_at(5) or ""))
for d in (7, 10, 30):
    check(f"day {d}: silence", ladder_at(d) == "", repr(ladder_at(d)))
check("compose_nudge returns empty at day 7", nudges.compose_nudge() == "")

print("\n== the ladder never threatens the streak ==")
# A run that is still alive: they last showed up 2 days ago and a freeze covered
# yesterday. That is exactly when the doc's "23 days, one call keeps it going"
# line applies.
reset(streak_freezes=2)
streak.record_activity(datetime.now() - timedelta(days=3))
streak.record_activity(datetime.now() - timedelta(days=2))
companion.update(last_call_date=(datetime.now() - timedelta(days=2)).date().isoformat())
check("the run is still alive", streak.status()["current"] > 1, str(streak.status()["current"]))
line = nudges.ladder_line()
print("   day 2 with a run:", repr(line))
check("mentions the run as still available", "keeps it going" in (line or ""), repr(line))
for bad in ("lose", "don't lose", "about to end", "expire", "!!"):
    check(f"never says {bad!r}", bad not in (line or "").lower())

print("\n== every ladder line passes the guilt guardrail ==")
for d in range(0, 12):
    line = ladder_at(d)
    if line:
        check(f"day {d} healthy", nudges.is_healthy(line), line)

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
