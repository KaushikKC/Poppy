"""
The garden (POPPY_RETENTION_ENGINE §3.1).

The long game: the thing that makes leaving painful after two months. Every
meaningful call grows something, and the garden is the rendered form of the
user's history with her.

**It carries no number.** Not one. §3's split is that the garden holds the
meaning and the daily layer (bloom.py) holds all the counting, and the moment a
relationship gets a score attached the emotional register breaks. There is
deliberately no total, no percentage and no score anywhere in this module's
output.

Why a garden rather than XP: it is sunk cost that feels like a possession rather
than a score. You don't quit a game to lose points; you quit a garden to abandon
something you grew. Same mechanism, far stronger valence, and it doesn't cheapen
the relationship.

**Nothing here ever wilts.** Miss a week and nothing dies, it just doesn't grow.
A wilting garden is streak-shame with a paint job: it produces a spike and then a
cliff, and it is the one thing §3.1 marks red about this section.
"""

import uuid
from datetime import datetime

import companion
import streak

# A call plants a bud; a call with a real moment in it blooms (§3.1).
BUD = "bud"
BLOOM = "bloom"

# Flowers have identity, so the garden reads as an emotional record of the year
# rather than a scoreboard. The kind comes from the mood mode the call entered
# with; a vent-call flower should not look like a hype-call flower.
KINDS = {
    "vent":  {"label": "vent",      "petals": 5, "hue": "#c2456b"},
    "hype":  {"label": "hype",      "petals": 8, "hue": "#f2913c"},
    "wind":  {"label": "wind down", "petals": 6, "hue": "#5aa9d6"},
    "plan":  {"label": "plan",      "petals": 4, "hue": "#63a85b"},
    "talk":  {"label": "talk",      "petals": 6, "hue": "#e0554f"},
    "ritual": {"label": "ritual",   "petals": 7, "hue": "#8b7bd8"},
}
DEFAULT_KIND = "talk"

# Seasons shift the garden with the real calendar (§3.1): temporal landmarks made
# visual. Northern-hemisphere months; the label is what the UI tints from.
_SEASONS = (
    ((12, 1, 2), "winter"),
    ((3, 4, 5), "spring"),
    ((6, 7, 8), "summer"),
    ((9, 10, 11), "autumn"),
)

_MAX_FLOWERS = 800  # a couple of years of daily calls


def season_for(when: datetime | None = None) -> str:
    month = (when or datetime.now()).month
    for months, name in _SEASONS:
        if month in months:
            return name
    return "summer"


def _flowers() -> list[dict]:
    return list(companion.profile().get("garden") or [])


def plant(kind: str | None = None, bloomed: bool = False, when: datetime | None = None) -> dict:
    """Grow one flower for a call.

    A bud for turning up, a bloom for a call that had something real in it. The
    two are stored the same way so a bud is never a failure, just a smaller thing
    that happened.
    """
    when = when or datetime.now()
    kind = kind if kind in KINDS else DEFAULT_KIND
    flower = {
        "id": uuid.uuid4().hex[:10],
        "kind": kind,
        "state": BLOOM if bloomed else BUD,
        "date": streak.today(when).isoformat(),
        "season": season_for(when),
        # Stable per-flower jitter so the field looks grown rather than plotted,
        # and looks the same every time it is drawn.
        "seed": int(uuid.uuid4().int % 10_000),
    }
    flowers = _flowers() + [flower]
    companion.update(garden=flowers[-_MAX_FLOWERS:])
    return flower


def bloom_last(when: datetime | None = None) -> dict | None:
    """Open today's bud, if a real moment landed after it was planted."""
    flowers = _flowers()
    day = streak.today(when or datetime.now()).isoformat()
    for f in reversed(flowers):
        if f.get("date") == day and f.get("state") == BUD:
            f["state"] = BLOOM
            companion.update(garden=flowers)
            return f
    return None


def arrange(positions: dict) -> int:
    """Save where the user put their flowers. Returns how many moved.

    Until now the garden arranged itself and the user only watched it. Placing
    things yourself is the one motivation this product had no answer for: it is
    why people rearrange a room or keep a shelf a particular way, and unlike a
    level cap it never runs out, because the novelty comes from them rather than
    from us.

    `x` and `y` are 0-1 in field space, not pixels, so an arrangement survives a
    resized window and a different screen.
    """
    flowers = _flowers()
    by_id = {f.get("id"): f for f in flowers}
    moved = 0
    for fid, pos in (positions or {}).items():
        f = by_id.get(fid)
        if not f or not isinstance(pos, dict):
            continue
        try:
            x, y = float(pos["x"]), float(pos["y"])
        except (KeyError, TypeError, ValueError):
            continue
        # Clamped rather than rejected: a flower dragged off the edge should end
        # up at the edge, not vanish.
        f["x"] = min(max(x, 0.0), 1.0)
        f["y"] = min(max(y, 0.0), 1.0)
        moved += 1
    if moved:
        companion.update(garden=flowers)
    return moved


MAX_LABEL = 60


def label(flower_id: str, text: str) -> dict | None:
    """Name one flower. "the day I quit."

    The garden already records *that* something happened; a label is the user
    saying what it meant. That is theirs to write, not ours to infer, and it is
    the second thing in the product they make rather than receive.

    An empty label clears it, so a name is never permanent by accident.
    """
    flowers = _flowers()
    text = (text or "").strip()[:MAX_LABEL]
    for f in flowers:
        if f.get("id") != flower_id:
            continue
        if text:
            f["label"] = text
        else:
            f.pop("label", None)
        companion.update(garden=flowers)
        return f
    return None


def labelled_count() -> int:
    """How many flowers carry a name. A count only: the labels themselves are the
    user's own words about their own life and never reach the analytics log."""
    return sum(1 for f in _flowers() if f.get("label"))


def state(limit: int = 400) -> dict:
    """What the renderer needs.

    Note what is absent: no count, no total, no level, no percentage. §3 keeps
    every number on the other surface, and the moment one appears here the user
    starts gardening for the score instead of talking.
    """
    flowers = _flowers()[-limit:]
    return {
        "flowers": flowers,
        "season": season_for(),
        "kinds": KINDS,
        # True only before anything has ever grown, so the UI can stay hidden
        # rather than render an empty plot (§8: first sight is never zero).
        "empty": not flowers,
    }


def year_in_review(when: datetime | None = None) -> dict:
    """"My year with Poppy" (§3.1): the private-by-default share artifact.

    Returns the shape of the year, never a scoreboard: which kinds of call the
    year was made of, and across which seasons.
    """
    when = when or datetime.now()
    year = str(when.year)
    flowers = [f for f in _flowers() if str(f.get("date", ""))[:4] == year]
    by_kind: dict[str, int] = {}
    by_season: dict[str, int] = {}
    for f in flowers:
        by_kind[f["kind"]] = by_kind.get(f["kind"], 0) + 1
        by_season[f["season"]] = by_season.get(f["season"], 0) + 1
    return {
        "year": year,
        "flowers": flowers,
        "by_kind": by_kind,
        "by_season": by_season,
        "empty": not flowers,
    }
