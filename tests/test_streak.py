"""Sprint 3 item 15: the streak rebuild. Closes P0-3."""
import pathlib
import sys
from datetime import datetime, timedelta

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import companion
import streak

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


def reset(**over):
    """Fresh profile with streak fields under our control."""
    for f in (companion._PATH,):
        f.unlink(missing_ok=True)
    companion.create("poppy")
    companion.update(**over)


D = lambda s: datetime.fromisoformat(s)

print("\n== P0-3: the 4am local boundary ==")
check("00:30 belongs to the previous day",
      streak.today(D("2026-08-05T00:30:00")).isoformat() == "2026-08-04")
check("03:59 still the previous day",
      streak.today(D("2026-08-05T03:59:00")).isoformat() == "2026-08-04")
check("04:00 flips over",
      streak.today(D("2026-08-05T04:00:00")).isoformat() == "2026-08-05")
check("21:00 is that day",
      streak.today(D("2026-08-05T21:00:00")).isoformat() == "2026-08-05")

print("\n== P0-3: the floor is a real call, not opening the app ==")
check("a 5 second call does not count", streak.qualifies(5) is False)
check("59 seconds does not count", streak.qualifies(59) is False)
check("60 seconds counts", streak.qualifies(60) is True)
check("a quest counts on its own", streak.qualifies(0, quest_done=True) is True)
check("30s + quest counts (the bad-day path)", streak.qualifies(30, quest_done=True) is True)

print("\n== counting up, and idempotence within a day ==")
reset()
s = streak.record_activity(D("2026-08-01T20:00:00"))
check("day 1", s["current"] == 1, str(s["current"]))
s = streak.record_activity(D("2026-08-01T23:30:00"))
check("second call same day changes nothing", s["current"] == 1, str(s["current"]))
s = streak.record_activity(D("2026-08-02T02:00:00"))
check("2am is still that same streak-day", s["current"] == 1, str(s["current"]))
s = streak.record_activity(D("2026-08-02T20:00:00"))
check("next evening is day 2", s["current"] == 2, str(s["current"]))

print("\n== states ==")
reset()
streak.record_activity(D("2026-08-01T20:00:00"))
check("met today -> safe", streak.state(D("2026-08-01T21:00:00")) == "safe")
check("next day, plenty of time -> safe", streak.state(D("2026-08-02T10:00:00")) == "safe")
check("next day, close to rollover -> at_risk",
      streak.state(D("2026-08-03T01:00:00")) == "at_risk",
      streak.state(D("2026-08-03T01:00:00")))

print("\n== freezes: silent, consumed, disclosed after the fact ==")
reset(streak_freezes=2)
for d in ("2026-08-01", "2026-08-02", "2026-08-03"):
    streak.record_activity(D(f"{d}T20:00:00"))
check("3 day run", streak.status(D("2026-08-03T21:00:00"))["current"] == 3)
# Miss one whole day, come back the day after.
s = streak.status(D("2026-08-05T20:00:00"))
check("one missed day is covered", s["current"] == 4, str(s["current"]))
check("a freeze was spent", s["freezes"] == 1, str(s["freezes"]))
notice = streak.take_freeze_notice()
print("   notice:", notice)
check("told after the fact", bool(notice))
check("notice is warm, not a warning",
      notice and "covered you" in notice and "!" not in notice)
check("notice clears after reading", streak.take_freeze_notice() is None)

print("\n== freezes run out -> the run ends, but stays repairable ==")
reset(streak_freezes=0)
streak.record_activity(D("2026-08-01T20:00:00"))
streak.record_activity(D("2026-08-02T20:00:00"))
st = streak.state(D("2026-08-04T20:00:00"))
check("missed with no freeze -> repairable", st == "repairable", st)
s = streak.status(D("2026-08-04T20:00:00"))
check("remembers what was lost", s["broken_from"] == 2, str(s["broken_from"]))
s = streak.repair(D("2026-08-04T20:05:00"))
check("repair restores it", s["current"] == 2, str(s["current"]))
check("repair leaves it safe/at_risk", s["state"] in ("safe", "at_risk"), s["state"])

print("\n== repair is once a month, and free ==")
streak.record_activity(D("2026-08-04T20:10:00"))
companion.update(streak_freezes=0)
st = streak.state(D("2026-08-07T20:00:00"))
check("second break in the same month is not repairable", st == "broken", st)

print("\n== outside the 48h window it is simply gone ==")
reset(streak_freezes=0)
streak.record_activity(D("2026-08-01T20:00:00"))
check("5 days later -> broken", streak.state(D("2026-08-06T20:00:00")) == "broken")

print("\n== nothing ever shrinks ==")
reset(streak_freezes=0)
for d in ("2026-08-01", "2026-08-02", "2026-08-03"):
    streak.record_activity(D(f"{d}T20:00:00"))
before = companion.profile()["longest_streak"]
streak.state(D("2026-08-10T20:00:00"))  # long gap, breaks it
after = companion.profile()["longest_streak"]
check("longest is never reduced", after == before == 3, f"{before} -> {after}")
s = streak.record_activity(D("2026-08-10T20:30:00"))
check("a new run starts at 1", s["current"] == 1, str(s["current"]))
check("longest still remembered", s["longest"] == 3, str(s["longest"]))

print("\n== freeze regeneration and fragments ==")
reset(streak_freezes=0)
for i in range(1, 8):
    streak.record_activity(D(f"2026-08-{i:02d}T20:00:00"))
check("a freeze regenerates at 7 days", companion.profile()["streak_freezes"] >= 1,
      str(companion.profile()["streak_freezes"]))
reset(streak_freezes=0, streak_fragments=0)
for _ in range(4):
    streak.add_fragment()
check("4 fragments is not a freeze", companion.profile()["streak_freezes"] == 0)
streak.add_fragment()
check("5 fragments makes a freeze", companion.profile()["streak_freezes"] == 1)
check("fragments reset after converting", companion.profile()["streak_fragments"] == 0)

print("\n== Plus adds cushion, never a repair charge ==")
reset(streak_freezes=0, plan="plus")
streak.record_activity(D("2026-08-01T20:00:00"))
streak.record_activity(D("2026-08-02T20:00:00"))
s = streak.status(D("2026-08-06T20:00:00"))
# 2 earned + 3 covered days (08-03/04/05). 08-06 is still open, not yet met.
check("plus covers a long gap", s["current"] == 5, str(s["current"]))
check("plus never goes negative on freezes", s["freezes"] >= 0)

print("\n== milestones: the eleven tiers, once each ==")
reset()
seen = []
for i in range(1, 31):
    streak.record_activity(D("2026-08-01T20:00:00") + timedelta(days=i - 1))
    m = streak.check_milestone()
    if m:
        seen.append(m)
check("hits 3, 7, 14, 30", seen == [3, 7, 14, 30], str(seen))
check("no repeat", streak.check_milestone() is None)

print("\n== Perfect Week: seven dots ==")
reset()
for d in ("2026-08-01", "2026-08-03", "2026-08-04"):
    streak.record_activity(D(f"{d}T20:00:00"))
week = streak.perfect_week(D("2026-08-04T21:00:00"))
check("seven dots", len(week) == 7, str(len(week)))
check("last dot is today", week[-1]["today"] is True)
met = [w["date"] for w in week if w["met"]]
check("marks only the days they actually showed up",
      met == ["2026-08-01", "2026-08-03", "2026-08-04"], str(met))
froz = [w["date"] for w in week if w["frozen"]]
check("a covered day is shown as frozen, not as met", froz == ["2026-08-02"], str(froz))


print("\n== the Long Year: the endgame (§4.1) ==")
import garden
reset()
ly = streak.long_year()
check("visible from day one", ly["days"] == 365)
check("not reached", ly["reached"] is False)
check("no countdown when it's far off", ly["days_left"] is None, str(ly["days_left"]))
check("nothing to lose by not getting there", "lose" not in str(ly) and "fail" not in str(ly))

companion.update(current_streak=300)
ly = streak.long_year()
check("distance withheld while still far off (65 days)",
      ly["days_left"] is None, str(ly["days_left"]))
check("and not flagged near", ly["near"] is False)
companion.update(current_streak=350)
ly = streak.long_year()
check("distance appears once close", ly["days_left"] == 15, str(ly["days_left"]))
check("flagged as near", ly["near"] is True)

print("\n== the flower only exists at a year ==")
reset()
check("cannot be planted early", streak.mark_long_year() is False)
check("no rare flower in the garden",
      not any(f["kind"] == "longyear" for f in garden.state()["flowers"]))

companion.update(current_streak=365)
check("granted at 365", streak.mark_long_year() is True)
f = garden.plant_long_year()
check("the flower grows", f and f["kind"] == "longyear", str(f))
check("it always blooms, never a bud", f["state"] == "bloom")
check("it is marked rare", garden.KINDS["longyear"].get("rare") is True)
check("more petals than anything else",
      garden.KINDS["longyear"]["petals"] > max(
          v["petals"] for k, v in garden.KINDS.items() if k != "longyear"))

check("granted exactly once", streak.mark_long_year() is False)
check("and never duplicated", garden.plant_long_year() is None)
check("still only one in the garden",
      sum(1 for x in garden.state()["flowers"] if x["kind"] == "longyear") == 1)

print("\n== a year of showing up is not taken back ==")
companion.update(current_streak=0, streak_last_date=None)
check("the flower survives a broken streak",
      any(x["kind"] == "longyear" for x in garden.state()["flowers"]))
check("and it still reads as earned", streak.long_year()["reached"] is True)
check("it is never re-granted", streak.mark_long_year() is False)

print("\n== she says something different at a year ==")
import opening
week = opening._milestone_line(7)
year = opening._milestone_line(365)
check("a year is not phrased like a week", year != week)
check("she names it", "year" in year.lower())
check("she mentions the flower", "garden" in year.lower())
check("no em dash", "—" not in year and "—" not in week)

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
