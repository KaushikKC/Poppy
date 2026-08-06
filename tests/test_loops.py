"""Smoke test for the open-loop engine (no LLM, no server)."""
import json
import pathlib
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import loops
import loop_author

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


print("\n== plant / rank / Rule 2 (max two live) ==")
a = loops.plant("how'd the interview go?", "event")
b = loops.plant("think about it and tell me next time: what would you do?", "question")
c = loops.plant("we're not done with the anjali thing", "serial")
check("three planted", all([a, b, c]))
live = loops.live()
check("only two live", len(live) == 2, f"got {len(live)}")
check("top is one loop", loops.top() is not None)
print("   live:", [(l["type"], round(loops._score(l), 3)) for l in live])
print("   top :", loops.top()["hook_text"])

print("\n== surfaced boost + resolve + backlog promotion ==")
top = loops.top()
loops.mark_surfaced(top["id"])
check("surfaced outranks", loops.top()["id"] == top["id"])
loops.resolve(top["id"])
check("resolved leaves live set", all(l["id"] != top["id"] for l in loops.live()))
check("backlog promoted back to two", len(loops.live()) == 2, f"got {len(loops.live())}")

print("\n== counts / close_rate ==")
print("  ", loops.counts())
check("one resolved counted", loops.counts()["resolved"] == 1)

print("\n== decay softening (Rule 4: curious, never accusing) ==")
store = loops._load()
bucket = loops._bucket(store)
target = next(l for l in bucket if l["state"] in loops.LIVE_STATES)
target["decay_at"] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
loops._save(store)
soft = loops.surface_text(target)
print("   soft:", soft)
check("softened copy differs", soft != target["hook_text"])
check("no accusation", "never told" not in soft.lower() and "you didn't" not in soft.lower())
import nudges
check("passes guilt guardrail", nudges.is_healthy(soft))

print("\n== expiry ==")
target["created_at"] = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
loops._save(store)
check("expired out of live", all(l["id"] != target["id"] for l in loops.live()))
check("state is expired", loops.get(target["id"])["state"] == "expired")

print("\n== echo rejection (the P0 this engine exists to prevent) ==")
user_line = "so my manager rescheduled the review to thursday and I'm kind of dreading it"
check("verbatim echo rejected", loop_author._is_echo(user_line, [user_line]))
check("near echo rejected", loop_author._is_echo("my manager rescheduled the review to thursday", [user_line]))
check("real hook accepted", not loop_author._is_echo("how'd it land with your manager?", [user_line]))

print("\n== author: topic parsing ==")
good = loop_author._parse('{"topic":"the Thursday interview"}')
check("parses topic", good and good["topic"] == "the Thursday interview")
check("rejects a sentence", loop_author._parse('{"topic":"they said they would call me back on friday about it"}') is None)
check("rejects junk", loop_author._parse("sorry, I can't do that") is None)
check("rejects empty", loop_author._parse('{"topic":""}') is None)
check("rejects one word", loop_author._parse('{"topic":"work"}') is None)
check("rejects wrong person", loop_author._parse('{"topic":"my job situation"}') is None,
      repr(loop_author._parse('{"topic":"my job situation"}')))
check("rejects inner punctuation", loop_author._parse('{"topic":"the interview. it went badly"}') is None)
check("strips redundant lead-in",
      loop_author._parse('{"topic":"the decision about quitting"}')["topic"] == "quitting")

print("\n== author: type inference (beats the 3B classifier) ==")
check("dated -> event", loop_author._infer_type("Person: the interview is on thursday") == "event")
check("tomorrow -> event", loop_author._infer_type("Person: I fly out tomorrow") == "event")
check("undecided -> question", loop_author._infer_type("Person: I'm not sure if I should take it") == "question")
check("dated beats undecided",
      loop_author._infer_type("Person: not sure if I should go on friday") == "event")
check("neither -> serial", loop_author._infer_type("Person: my sister has been distant lately") == "serial")

print("\n== author: composed lines are grammatical and in her voice ==")
for kind in loop_author._AUTHORABLE:
    for topic in ("the Thursday interview", "quitting", "what Anjali said at dinner"):
        line = loop_author._compose(kind, topic.lower())
        check(f"{kind}/{topic[:14]}: no wrong-person leak",
              not loop_author._WRONG_PERSON.search(topic.lower()), line)
        check(f"{kind}/{topic[:14]}: healthy", nudges.is_healthy(line), line)
print("   sample:", loop_author._compose("event", "the thursday interview"))
print("   sample:", loop_author._compose("question", "quitting"))
print("   sample:", loop_author._compose("serial", "what anjali said at dinner"))

print("\n== migration of the legacy user-echo loops ==")
loops._PATH.unlink(missing_ok=True)
recent = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
stale = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
moved = loops.migrate_from_profile({"poppy": [
    {"text": "so my manager rescheduled it", "created_at": recent},
    {"text": "an ancient thing they said once", "created_at": stale},
]})
check("migrated both", moved == 2)
legacy_top = loops.top()
check("recent legacy loop survives", legacy_top is not None)
check("legacy carries min strength", legacy_top and legacy_top["strength"] == 0.2)
check("stale legacy loop expired, not resurrected", len(loops.live()) == 1, f"live={len(loops.live())}")
fresh = loops.plant("how'd the review land?", "event")
check("fresh hook outranks legacy echo", loops.top()["id"] == fresh["id"])
check("migration runs once", loops.migrate_from_profile({"poppy": [{"text": "x"}]}) == 0)

print("\n== softened copy reads as sentences ==")
store = loops._load()
for l in loops._bucket(store):
    l["decay_at"] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
loops._save(store)
for kind in loops.TYPES:
    sample = {"type": kind, "hook_text": "how'd the interview go?",
              "decay_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}
    text = loops.surface_text(sample)
    print(f"   {kind:9s} {text}")
    check(f"{kind}: no lowercase sentence start", ". h" not in text and ". w" not in text)
    check(f"{kind}: healthy", nudges.is_healthy(text))


# ── Regression: the hook must survive a SHORT call ──────────────────────────
# Found in QA. `_MIN_USER_WORDS` was 12, so "I'm having an interview on Friday"
# (6 words) never reached the model and every call fell back to the reveal hook.
# Voice users speak in short sentences; the guard against invention is grounding,
# not length.
print("\n== short calls still produce a real hook ==")
check("a 6-word call is above the floor", loop_author._MIN_USER_WORDS <= 6,
      str(loop_author._MIN_USER_WORDS))
check("a topic drawn from what was said is grounded",
      loop_author._is_grounded("the Friday interview", ["I'm having an interview on Friday."]))
check("an invented topic is not",
      not loop_author._is_grounded("the long conversation", ["not much today, just tired"]))
check("filler alone cannot ground a topic",
      not loop_author._is_grounded("the thing today", ["yeah", "just today"]))
check("second person is allowed in a topic",
      loop_author._clean_topic("your interview on Friday") is not None)
check("first person is still rejected",
      loop_author._clean_topic("my interview on Friday") is None)

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
