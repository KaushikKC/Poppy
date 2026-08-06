"""
The daily goal and daily quests (POPPY_RETENTION_ENGINE §4.2, §4.3).

This is the 24-hour heartbeat: the reason to open the app *today* that is
different from yesterday's reason. §4.3's fusion rule is the important one and it
is hard-coded here rather than left to configuration:

    **Slot 1 is always the open loop.**

That single line is where the gamification layer and the conversational layer stop
being two products. The day's first task is literally "go resolve the thing she
left hanging", so a user who does the quest has done the thing that actually
retains them.

Two other rules from §4.3 shape the pool:

  * **~70% should complete inside one normal session.** Quests that need an extra
    trip feel like homework; quests you finish without trying feel like the app
    noticing you.
  * **Never all three passively completable.** One has to require a real choice,
    or the mechanic is decorative. The pool is split into passive and active for
    exactly this, and `_pick` guarantees at least one active slot.

Ending the day at 2 of 3 is a feature, not a failure state (§4.7). Nothing here
ever scolds, and there is no penalty for an unfinished day.
"""

import random
import re
from datetime import datetime

import companion
import streak

# §4.2 — the goal the user picks out loud, in a call. A goal someone chose is an
# implementation intention; a goal the app assigned is a target. They defend the
# number they picked.
GOALS = {
    "light": {
        "label": "Light",
        "blurb": "one check-in",
        "for": "busy weeks, low-energy days",
        "quests_required": 1,
    },
    "regular": {
        "label": "Regular",
        "blurb": "one call",
        "for": "the default",
        "quests_required": 2,
    },
    "deep": {
        "label": "Deep",
        "blurb": "one call and one thing worth remembering",
        "for": "when you want the habit to bite",
        "quests_required": 3,
    },
}
DEFAULT_GOAL = "regular"

# The rotating pool (§4.3). Every entry maps to something that genuinely helps the
# relationship, never busywork. `signal` is the key the call-close payload sets.
_PASSIVE = [
    {"id": "call_5min", "signal": "call_5min", "text": "Have a call longer than 5 minutes"},
    {"id": "ritual_time", "signal": "ritual_time", "text": "Show up at your ritual time"},
    {"id": "good_thing", "signal": "good_thing", "text": "Tell her one thing that went well today"},
]
# These need a deliberate act, which is what keeps the set from being decorative.
# The memory edit is the highest-value one in the list and looks like a chore:
# editing what she remembers is the IKEA effect, and it measurably raises how much
# the user values the companion (§2).
_ACTIVE = [
    {"id": "memory_saved", "signal": "memory_saved", "text": "Save something worth remembering"},
    {"id": "memory_edited", "signal": "memory_edited", "text": "Fix something she remembers"},
    {"id": "mood_new", "signal": "mood_new", "text": "Try a mood you haven't used"},
]

SLOTS = 3
FRAGMENTS_PER_QUEST = 1  # five fragments make a freeze (§4.1)


# "Tell her one thing that went well today" has to be detected from what was
# actually said, like every other quest signal. It was previously read from a
# field the frontend never sent, so the quest could never be completed at all.
#
# Deterministic rather than another model pass: this runs on every call close, and
# a quest that ticks itself when you didn't do it is worse than one that doesn't.
_GOOD_THING = re.compile(
    r"\b("
    r"went (?:really |pretty |so )?(?:well|great|good)"
    r"|(?:good|great|nice|lovely|better|productive) day"
    r"|i'?m (?:really |so )?(?:happy|glad|proud|pleased|chuffed)"
    r"|(?:i|we) (?:finally|actually) \w+"
    r"|managed to \w+"
    r"|i did it"
    r"|got the (?:job|offer|role|place|part)"
    r"|(?:it|that) was (?:really |so )?(?:nice|lovely|good|great|fun)"
    r"|best (?:part|bit|thing)"
    r"|(?:i )?enjoyed"
    r"|proud of (?:myself|me)"
    r"|good news"
    r")\b",
    re.I,
)


def detect_good_thing(turns: list[dict]) -> bool:
    """Did they actually tell her something that went well?"""
    for t in turns or []:
        if t.get("role") == "user" and _GOOD_THING.search(str(t.get("content") or "")):
            return True
    return False


def _today() -> str:
    """Quests refresh on the streak's clock, so the two layers roll over together."""
    return streak.today().isoformat()


def goal() -> dict:
    p = companion.profile()
    key = p.get("daily_goal") or DEFAULT_GOAL
    if key not in GOALS:
        key = DEFAULT_GOAL
    return {"key": key, **GOALS[key]}


def set_goal(key: str) -> dict:
    """Set from the user's own words in a call (§4.2), or from settings."""
    key = (key or "").strip().lower()
    if key not in GOALS:
        key = DEFAULT_GOAL
    companion.update(daily_goal=key)
    return goal()


def _loop_quest() -> dict:
    """Slot 1, hard-wired to the open loop (§4.3)."""
    loop = companion.open_loop()
    if loop:
        hook = (loop.get("hook_text") or "").strip().rstrip("?.! ")
        # Her line, turned into the day's first task without losing whose it is.
        return {
            "id": "open_loop",
            "signal": "loop_resolved",
            "text": f"Answer her: {hook}",
            "pinned": True,
        }
    return {
        "id": "open_loop",
        "signal": "loop_resolved",
        "text": "Pick up where you left off with her",
        "pinned": True,
    }


def _pick(day: str) -> list[dict]:
    """Choose slots 2 and 3, seeded by the day so a refresh can't reroll them.

    At least one is always active, so the set can never be completed entirely by
    turning up (§4.3).
    """
    rng = random.Random(day)
    active = rng.choice(_ACTIVE)
    other_pool = [q for q in _PASSIVE + _ACTIVE if q["id"] != active["id"]]
    other = rng.choice(other_pool)
    picked = [active, other]
    rng.shuffle(picked)
    return picked


def _state() -> dict:
    p = companion.profile()
    state = p.get("quests_state") or {}
    if state.get("day") != _today():
        state = {"day": _today(), "done": []}
    return state


def today_quests() -> list[dict]:
    """The three quests for today, with their completion state."""
    day = _today()
    done = set(_state().get("done", []))
    quests = [_loop_quest()] + _pick(day)
    return [
        {**q, "done": q["id"] in done, "slot": i + 1}
        for i, q in enumerate(quests[:SLOTS])
    ]


def complete(signals: dict) -> list[str]:
    """Mark any quests whose signal fired this call. Returns the newly completed.

    Signals come from what actually happened, not from the user ticking a box.
    A quest you complete without trying should feel like the app noticing you.
    """
    day = _today()
    state = _state()
    done = set(state.get("done", []))
    newly = []
    for q in today_quests():
        if q["id"] in done:
            continue
        if signals.get(q["signal"]):
            done.add(q["id"])
            newly.append(q["id"])
    if newly:
        companion.update(quests_state={"day": day, "done": sorted(done)})
        streak.add_fragment(len(newly) * FRAGMENTS_PER_QUEST)
    return newly


def status() -> dict:
    """Everything a surface needs: the quests, the goal, and the ring.

    The ring is §4.2's cheapest open loop: a half-filled ring is a Zeigarnik
    trigger rendered as UI. It resets at rollover and is never left full for long.
    """
    quests = today_quests()
    g = goal()
    completed = sum(1 for q in quests if q["done"])
    required = min(g["quests_required"], SLOTS)
    return {
        "quests": quests,
        "goal": g,
        "completed": completed,
        "total": SLOTS,
        "goal_met": completed >= required,
        "ring": round(min(completed / required, 1.0), 2) if required else 0.0,
    }


def any_completed_today() -> bool:
    """Whether a quest has been finished today, which is the non-call half of the
    streak floor (§4.1)."""
    return bool(_state().get("done"))
