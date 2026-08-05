"""
Bloom Points and levels (POPPY_RETENTION_ENGINE §4.4).

All of the product's counting lives here, and none of it lives in the garden.
That split is §3/§4's non-negotiable: a relationship with a score attached stops
feeling like a relationship, because the user starts optimising instead of
talking. Keep the math on one surface and the meaning on the other.

**The critical divergence from Duolingo**, and the reason this file exists at all:
their XP measures effort and time. Copying that would directly optimise
minutes-in-app, which §10 names as the metric that ends the company. So Bloom
Points weight *depth, not duration*, and the load-bearing row of the table is:

    Call duration beyond 60 seconds ......... 0 BP

Talking longer earns nothing. That makes the number un-grindable, kills any
incentive to pad a call, and means a user optimising BP is optimising exactly the
behaviours that predict retention.

Every source is capped per day for the same reason. Nothing here ever decays:
§4.9 is explicit that decay converts absence into punishment.
"""

from datetime import datetime

import companion
import streak

# §4.4's earning table. `cap` is the most this source can pay in one day, which is
# what stops any of them being farmed.
AWARDS = {
    "call":           {"bp": 20, "cap": 40,  "label": "a call"},
    "memory_saved":   {"bp": 15, "cap": 45,  "label": "something worth remembering"},
    "memory_edited":  {"bp": 10, "cap": 30,  "label": "correcting what she remembers"},
    "loop_resolved":  {"bp": 25, "cap": 25,  "label": "closing the loop"},
    "quest":          {"bp": 15, "cap": 45,  "label": "a daily quest"},
    "ritual_hit":     {"bp": 20, "cap": 20,  "label": "showing up at your time"},
    "journey_node":   {"bp": 40, "cap": 40,  "label": "a journey step"},
    "moment_kept":    {"bp": 10, "cap": 20,  "label": "keeping a moment"},
}

MAX_LEVEL = 50

# ── The level curve, and why it is not the doc's literal formula ──────────────
#
# §4.4 specifies three things that cannot all be true at once:
#
#   1. the formula      BP_to_next = 100 x level^1.35
#   2. the totals       "~100 BP for L2, ~1,900 for L20, ~6,000 for L50"
#   3. the pacing       "a regular user hits L10 in ~3 weeks, L50 in ~a year"
#
# At a realistic ~75 BP/day (a call, a resolved loop, a memory, a quest) the
# formula reaches L20 at 45,734 BP and L50 at 408,510: about 15 years, against a
# stated year. The quoted totals are a different curve again, and they land L50 at
# roughly 80 days, which burns the whole progression in a quarter.
#
# The pacing is the part that describes how the product should feel, so that is
# what this implements, keeping the doc's power-curve shape. 45 x level^0.8 gives
# L10 in ~19 days and L50 in ~374 days, which is the stated experience almost
# exactly. The one cost is that L2 asks 45 BP rather than the quoted ~100.
_CURVE_BASE = 45
_CURVE_EXP = 0.8

# §4.4's goal gradient: show the distance to the next level ONLY once inside 20%
# of it. Showing it always turns the whole app into a progress bar; showing it
# near the line is what produces the documented sprint.
HINT_WITHIN = 0.20

# The sharpest tool in the section, because it pays the habit we're installing
# rather than paying extra usage: double during the user's own ritual window.
DOUBLE_MULTIPLIER = 2

# §4.4 bands. Deliberately cosmetics, capacity and voices only. §4.9 forbids BP
# ever gating memory, callbacks, chapters of her, or call quality: the counting
# layer must never be able to buy the relationship.
BANDS = (
    (1, 5, "Garden capacity, first cosmetics"),
    (6, 15, "Voices, garden themes, mood presets"),
    (16, 30, "Seasonal flowers, journey slots"),
    (31, 50, "Rare species, the Long Year track, prestige cosmetics"),
)


def _to_next(level: int) -> int:
    """BP needed to get from `level` to `level + 1`."""
    return int(_CURVE_BASE * (level ** _CURVE_EXP))


def level_for(total_bp: int) -> tuple[int, int, int]:
    """(level, bp into this level, bp needed for the next)."""
    level, spent = 1, 0
    while level < MAX_LEVEL:
        need = _to_next(level)
        if total_bp - spent < need:
            return level, total_bp - spent, need
        spent += need
        level += 1
    return MAX_LEVEL, total_bp - spent, 0


def band_for(level: int) -> str:
    for lo, hi, label in BANDS:
        if lo <= level <= hi:
            return label
    return BANDS[-1][2]


def _today() -> str:
    """Same clock as the streak, so the caps roll over with everything else."""
    return streak.today().isoformat()


def _day_state() -> dict:
    state = companion.profile().get("bloom_day") or {}
    if state.get("day") != _today():
        state = {"day": _today(), "earned": {}}
    return state


def is_double() -> bool:
    """Inside the user's own ritual window (§4.4)."""
    import ritual_pact
    return ritual_pact.anchor_now() is not None


def award(source: str, count: int = 1) -> int:
    """Grant BP for something that happened. Returns the BP actually granted.

    Returns 0 when the source is unknown or its daily cap is already spent, which
    is how the number stays un-grindable.
    """
    rule = AWARDS.get(source)
    if not rule or count <= 0:
        return 0

    state = _day_state()
    earned = dict(state.get("earned", {}))
    already = earned.get(source, 0)
    room = rule["cap"] - already
    if room <= 0:
        return 0

    gross = min(rule["bp"] * count, room)
    if gross <= 0:
        return 0
    earned[source] = already + gross

    granted = gross * (DOUBLE_MULTIPLIER if is_double() else 1)
    total = companion.profile().get("bloom_points", 0) + granted
    companion.update(
        bloom_points=total,
        bloom_day={"day": _today(), "earned": earned},
    )
    return granted


def take_level_up() -> dict | None:
    """A level reached since we last looked, or None.

    §4.4: level-up is a scene, not a toast. This is read at call open so she can
    notice it mid-conversation, in character, which is a reward no competitor's
    XP bar can produce.
    """
    p = companion.profile()
    level, _, _ = level_for(p.get("bloom_points", 0))
    seen = p.get("bloom_level_seen", 1)
    if level <= seen:
        return None
    companion.update(bloom_level_seen=level)
    return {"level": level, "band": band_for(level)}


def status() -> dict:
    """The level surface. The distance to the next level is withheld until the
    user is inside the last 20% of it (§4.4's goal gradient)."""
    p = companion.profile()
    total = p.get("bloom_points", 0)
    level, into, need = level_for(total)
    close = bool(need) and (need - into) <= need * HINT_WITHIN
    return {
        "points": total,
        "level": level,
        "band": band_for(level),
        "max_level": MAX_LEVEL,
        # Only populated near the threshold; the UI shows nothing otherwise.
        "to_next": (need - into) if close else None,
        "double": is_double(),
    }
