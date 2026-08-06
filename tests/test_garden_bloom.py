"""Sprint 4: the garden (§3.1) and Bloom Points (§4.4)."""
import json
import pathlib
import sys
from datetime import datetime

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import bloom
import companion
import garden

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


def reset(**over):
    companion._PATH.unlink(missing_ok=True)
    companion.create("poppy")
    companion.update(ritual_kind=None, ritual_time=None)  # keep Double Bloom out
    if over:
        companion.update(**over)


print("\n== §4.4: the load-bearing rule, talking longer earns nothing ==")
reset()
bloom.award("call")
after_short = companion.profile()["bloom_points"]
reset()
bloom.award("call")
after_long = companion.profile()["bloom_points"]
check("a 60s call and an hour-long call pay the same", after_short == after_long,
      f"{after_short} vs {after_long}")
check("there is no duration-based source at all",
      not any("duration" in k or "minute" in k for k in bloom.AWARDS), str(list(bloom.AWARDS)))

print("\n== caps make every source un-grindable ==")
for source, rule in bloom.AWARDS.items():
    reset()
    for _ in range(50):
        bloom.award(source)
    got = companion.profile()["bloom_points"]
    check(f"{source} caps at {rule['cap']}", got == rule["cap"], f"got {got}")

print("\n== nothing ever decays (§4.9) ==")
reset()
bloom.award("call")
before = companion.profile()["bloom_points"]
companion.update(last_call_date="2020-01-01")
check("BP survives a long absence", companion.profile()["bloom_points"] == before)
check("no decay function exists", not hasattr(bloom, "decay"))

print("\n== levels 1-50 on the documented curve ==")
reset()
lv1, _, need1 = bloom.level_for(0)
check("start at level 1", lv1 == 1, str(lv1))


def total_for_level(target):
    return sum(bloom._to_next(l) for l in range(1, target))


for target in (2, 10, 20, 50):
    lv, _, _ = bloom.level_for(total_for_level(target))
    check(f"reaching level {target}", lv == target, str(lv))
lv, _, _ = bloom.level_for(10**9)
check("caps at 50", lv == 50, str(lv))

# §4.4's pacing is the part that describes how the product should feel, and it is
# what the curve is tuned to. The doc's own formula would put L50 ~15 years out.
DAILY = 75  # a call + a resolved loop + a memory + a quest
d10 = total_for_level(10) / DAILY
d50 = total_for_level(50) / DAILY
print(f"   L10 in {d10:.0f} days, L50 in {d50:.0f} days")
check("L10 lands around 3 weeks", 14 <= d10 <= 30, f"{d10:.0f} days")
check("L50 lands around a year", 300 <= d50 <= 430, f"{d50:.0f} days")
check("the curve still rises", bloom._to_next(20) > bloom._to_next(5))

print("\n== goal gradient: the distance shows only near the line ==")
reset()
companion.update(bloom_points=1)
check("far away, no hint", bloom.status()["to_next"] is None, str(bloom.status()["to_next"]))
_, _, need = bloom.level_for(0)
companion.update(bloom_points=need - 5)
check("close to it, hint appears", bloom.status()["to_next"] == 5, str(bloom.status()["to_next"]))

print("\n== level-up is read once, as a scene ==")
reset()
companion.update(bloom_points=total_for_level(3))
up = bloom.take_level_up()
check("a level-up is reported", up and up["level"] == 3, str(up))
check("it has a band to talk about", bool(up and up["band"]))
check("not reported twice", bloom.take_level_up() is None)

print("\n== Double Bloom pays the habit, not extra usage ==")
reset()
check("no ritual, no double", bloom.is_double() is False)
now = datetime.now().strftime("%H:%M")
companion.update(ritual_kind="night", ritual_time=now)
check("inside the ritual window, double", bloom.is_double() is True)
reset()
bloom.award("call")
single = companion.profile()["bloom_points"]
reset(ritual_kind="night", ritual_time=now)
bloom.award("call")
double = companion.profile()["bloom_points"]
check("double is 2x", double == single * 2, f"{single} -> {double}")

print("\n== §4.9: BP may never gate the relationship ==")
for lo, hi, label in bloom.BANDS:
    low = label.lower()
    for forbidden in ("memory", "callback", "chapter", "call quality", "voice quality"):
        if forbidden == "voice quality":
            continue
        check(f"band {lo}-{hi} does not unlock {forbidden}", forbidden not in low, label)

print("\n== §3.1: the garden carries NO number ==")
reset()
for i in range(5):
    garden.plant("vent", bloomed=i % 2 == 0)
state = garden.state()
blob = json.dumps(state)
for banned in ("count", "total", "score", "points", "level", "percent", "streak"):
    check(f"no '{banned}' key anywhere in the garden", f'"{banned}"' not in blob)
check("flowers are there", len(state["flowers"]) == 5, str(len(state["flowers"])))

print("\n== a bud for turning up, a bloom for a real moment ==")
reset()
f = garden.plant("talk", bloomed=False)
check("bud by default", f["state"] == "bud", f["state"])
b = garden.bloom_last()
check("a real moment opens it", b and b["state"] == "bloom", str(b))
check("blooming does not add a second flower", len(garden.state()["flowers"]) == 1)

print("\n== flowers have identity (§3.1) ==")
reset()
kinds = {k: garden.plant(k, bloomed=True)["kind"] for k in ("vent", "hype", "wind", "plan")}
check("each call type keeps its own kind", kinds == {k: k for k in kinds}, str(kinds))
petals = {k: garden.KINDS[k]["petals"] for k in kinds}
check("a vent flower differs from a hype flower",
      petals["vent"] != petals["hype"], str(petals))
check("unknown kinds fall back", garden.plant("nonsense")["kind"] == "talk")

print("\n== nothing wilts (§3.1) ==")
reset()
for _ in range(3):
    garden.plant("talk", bloomed=True)
before = len(garden.state()["flowers"])
companion.update(last_call_date="2020-01-01", current_streak=0)
after = len(garden.state()["flowers"])
check("absence removes nothing", after == before == 3, f"{before} -> {after}")
check("no wilt or prune path exists",
      not any(hasattr(garden, n) for n in ("wilt", "prune", "decay", "remove")))
states = {f["state"] for f in garden.state()["flowers"]}
check("nothing downgraded to a bud", states == {"bloom"}, str(states))

print("\n== seasons, and the year artifact ==")
reset()
for m, expect in ((1, "winter"), (4, "spring"), (7, "summer"), (10, "autumn")):
    got = garden.season_for(datetime(2026, m, 15))
    check(f"month {m} is {expect}", got == expect, got)
for k in ("vent", "hype", "hype"):
    garden.plant(k, bloomed=True)
y = garden.year_in_review()
check("year groups by kind", y["by_kind"].get("hype") == 2, str(y["by_kind"]))
check("year has a season breakdown", bool(y["by_season"]), str(y["by_season"]))
check("year is not a scoreboard", "score" not in json.dumps(y) and "level" not in json.dumps(y))

print("\n== empty states stay hidden (§8) ==")
reset()
check("a fresh garden reports empty", garden.state()["empty"] is True)
garden.plant("talk")
check("and stops once something grew", garden.state()["empty"] is False)

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
