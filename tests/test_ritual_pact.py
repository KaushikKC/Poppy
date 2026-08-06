"""Sprint 2: the ritual pact. The parser gets the most attention because a wrong
ritual time is a wrong notification every single day."""
import pathlib
import sys
from datetime import datetime, timedelta

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import companion
import ritual_pact
import opening

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


def parse_is(text, kind, time_str):
    got = ritual_pact.parse(text)
    good = got and got.get("kind") == kind and got.get("time") == time_str
    check(f"{text!r} -> {kind} {time_str}", good, "" if good else f"got {got}")


print("\n== spoken answers, phrase only ==")
parse_is("right before I sleep", "night", "21:30")
parse_is("probably before bed", "night", "21:30")
parse_is("in the morning I guess", "morning", "08:00")
parse_is("first thing when I wake up", "morning", "08:00")
parse_is("after work is better", "night", "21:30")
parse_is("when I get home", "night", "21:30")

print("\n== explicit times ==")
parse_is("around 9pm", "night", "21:00")
parse_is("at 7:30 am", "morning", "07:30")
parse_is("how about 10:15 at night", "night", "22:15")
parse_is("6am works", "morning", "06:00")
parse_is("let's say nine thirty in the morning", "morning", "09:30")
parse_is("maybe eight o'clock at night", "night", "20:00")
parse_is("12:30 am", "night", "00:30")

print("\n== phrase plus time, and bare hours disambiguated by the anchor ==")
parse_is("before bed, around 10", "night", "22:00")
parse_is("mornings at 7", "morning", "07:00")
parse_is("evening at 8", "night", "20:00")

print("\n== declines ==")
for t in ("not right now", "maybe later", "no thanks", "I'd rather not",
          "I don't know", "let's skip it"):
    got = ritual_pact.parse(t)
    check(f"{t!r} -> declined", bool(got and got.get("declined")), str(got))

print("\n== must NOT invent a ritual from ordinary conversation ==")
for t in ("I have 3 meetings tomorrow",
          "we've been together 5 years",
          "it cost like 40 quid",
          "yeah that sounds good",
          "I finished the report",
          "she said the same thing"):
    got = ritual_pact.parse(t)
    check(f"{t!r} -> no ritual", got is None, f"got {got}")

print("\n== latest answer wins (a correction beats the first guess) ==")
turns = [
    {"role": "user", "content": "before bed I think"},
    {"role": "assistant", "content": "Nights it is. What time?"},
    {"role": "user", "content": "actually make it 10:30 at night"},
]
got = ritual_pact.parse_from_turns(turns)
check("correction wins", got == {"kind": "night", "time": "22:30"}, str(got))

print("\n== due logic: day 2, once a day, gives up, never after a decline ==")
companion.create("poppy")
check("not due on call 0", ritual_pact.is_due() is False)
for _ in range(2):
    companion.record_call()
check("due from call 2", ritual_pact.is_due() is True)
ritual_pact.mark_asked()
check("not due twice in one day", ritual_pact.is_due() is False)

companion.update(ritual_pact_asked_on=None, ritual_pact_asks=3)
check("gives up after 3 asks", ritual_pact.is_due() is False)

companion.update(ritual_pact_asks=0, ritual_pact_declined=True)
check("never asks again after a decline", ritual_pact.is_due() is False)

companion.update(ritual_pact_declined=False)
companion.set_ritual("night", "21:30")
check("not due once a ritual exists", ritual_pact.is_due() is False)

print("\n== anchor window + ritual openers ==")
now = datetime.now()
companion.set_ritual("night", now.strftime("%H:%M"))
check("inside the window", ritual_pact.anchor_now() == "night")
line = opening.compose()
print("   night opener :", line)
check("night opens on the debrief", "day's done" in line.lower())

far = (now + timedelta(hours=6)).strftime("%H:%M")
companion.set_ritual("night", far)
check("outside the window", ritual_pact.anchor_now() is None)

companion.set_ritual("morning", now.strftime("%H:%M"))
line = opening.compose()
print("   morning opener:", line)
check("morning opens on the intention", "matters today" in line.lower())

print("\n== the ritual loop holds the cadence, and never outranks the real one ==")
import loops
companion.set_ritual("night", now.strftime("%H:%M"))
cadence = ritual_pact.closing_loop()
check("cadence loop exists on the anchor", bool(cadence), str(cadence))
companion.add_open_loop(cadence, "ritual")
real = companion.add_open_loop("how did the review turn out?", "event")
top = companion.open_loop()
check("conversational loop takes the visible slot", top["id"] == real["id"],
      f"top={top['hook_text']!r}")
check("ritual loop is still live underneath",
      any(l["type"] == "ritual" for l in loops.live()))

print("\n== confirm copy, and no em dashes in user-facing text ==")
for kind, t in (("night", "21:30"), ("morning", "08:00"), ("night", "22:00")):
    line = ritual_pact.confirm_line(kind, t)
    print("   ", line)
    check(f"{kind} {t}: no em dash", "—" not in line)
check("ask block has no em dash", "—" not in ritual_pact.as_prompt_block())
for v in opening._RITUAL_OPENERS.values():
    check(f"opener has no em dash: {v[:28]}...", "—" not in v)

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
