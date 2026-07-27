"""
Open loops — the unresolved thread Poppy leaves behind at the end of every call
(POPPY_RETENTION_ENGINE §1).

An open loop is the highest-leverage retention mechanic in the product, and it is
the one that lives in the user's head rather than on their lock screen: a
specific, narrow gap in knowledge that itches until it's closed. The rules that
keep it from becoming noise are all enforced here rather than left to callers:

  * **One visible at a time** — :func:`top` returns exactly one, ranked by
    ``strength x recency x time_sensitivity``. Two competing itches cancel out.
  * **Max two live** — extras go to a backlog and get promoted when a live loop
    closes. More than two and she sounds like a project manager.
  * **Every loop must pay off** — a loop is `surfaced` when she opens on it and
    `resolved` the moment the user answers. An unpaid-off loop kills the mechanic
    permanently, so resolution is tracked as correctness, not analytics.
  * **Decay is gentle, never accusing** — past `decay_at` the copy softens to
    "I don't even know if it happened, but I'm still curious", never
    "you never told me".

Loops are per-character (each companion remembers only its own conversations,
matching the per-character memory store) and live in plain JSON next to the
profile. The text is conversation content, so it never reaches the analytics
event log — only counts and state transitions do.
"""

import json
import re
import uuid
from datetime import datetime, timedelta, timezone

import paths

_PATH = paths.user_data_dir() / "companion_loops.json"

# The six loop types (§1.2). Half-life is how long the itch stays live before it
# softens; each type has a different natural lifetime.
TYPES = ("event", "question", "reveal", "serial", "ritual", "callback")

_HALF_LIFE_HOURS = {
    "event": 36,      # until the event has happened, plus a day and a half
    "question": 48,   # "think about it and tell me tomorrow"
    "reveal": 72,     # she has something of her own to share
    "serial": 120,    # an ongoing multi-session thread
    "ritual": 26,     # "same time tomorrow?" — just over a day
    "callback": 48,   # she half-remembers something and stops
}

# Base pull of each type, before recency and urgency weighting. Reveal loops are
# the strongest because the payoff is hers to give; ritual loops are the weakest
# individually because the habit itself carries them.
_BASE_STRENGTH = {
    "event": 0.85,
    "question": 0.7,
    "reveal": 0.9,
    "serial": 0.75,
    "ritual": 0.4,
    "callback": 0.8,
}

_DEFAULT_TYPE = "question"
_MAX_LIVE = 2            # §1.3 Rule 2
_EXPIRE_MULTIPLIER = 2   # a loop expires at 2x its half-life
_MAX_STORED = 40         # per character, oldest resolved/expired pruned beyond this

# §1.2: the callback loop turns the memory system into a cliffhanger generator,
# but a callback that fails to land next call reads as a bug. Capped at one per
# five calls.
CALLBACK_MIN_CALL_GAP = 5

LIVE_STATES = ("open", "surfaced")


# ── storage ──────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts)
    except (ValueError, TypeError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _load() -> dict:
    if not _PATH.exists():
        return {"by_character": {}}
    try:
        data = json.loads(_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return {"by_character": {}}
    if not isinstance(data, dict) or not isinstance(data.get("by_character"), dict):
        return {"by_character": {}}
    return data


def _save(store: dict) -> None:
    _PATH.write_text(json.dumps(store, indent=2))


def _character() -> str:
    import companion
    return companion.profile().get("character", "poppy")


def _bucket(store: dict, character: str | None = None) -> list[dict]:
    return store.setdefault("by_character", {}).setdefault(character or _character(), [])


# ── lifecycle ────────────────────────────────────────────────────────────────


def _expire_due(loops: list[dict]) -> bool:
    """Retire loops past their expiry. Returns True if anything changed.

    Expiry is silent: an expired loop is simply never spoken of again. She does
    not bring up what the user chose not to answer.
    """
    now = _now()
    changed = False
    for loop in loops:
        if loop.get("state") not in LIVE_STATES:
            continue
        created = _parse(loop.get("created_at")) or now
        half_life = _HALF_LIFE_HOURS.get(loop.get("type"), 48)
        if now >= created + timedelta(hours=half_life * _EXPIRE_MULTIPLIER):
            loop["state"] = "expired"
            changed = True
    return changed


def _rebalance(loops: list[dict]) -> bool:
    """Hold §1.3 Rule 2: at most two loops live at once, the rest backlogged.

    Promotion and demotion both run here, so a loop closing automatically pulls
    the strongest backlogged one forward instead of leaving a gap.
    """
    changed = False
    live = [l for l in loops if l.get("state") in LIVE_STATES]
    active = sorted([l for l in live if not l.get("backlog")], key=_score, reverse=True)
    backlog = sorted([l for l in live if l.get("backlog")], key=_score, reverse=True)

    # Too many active: demote the weakest. A surfaced loop is never demoted —
    # she already opened on it, so it has to be allowed to pay off.
    while len(active) > _MAX_LIVE:
        weakest = next(
            (l for l in reversed(active) if l.get("state") != "surfaced"), None
        )
        if weakest is None:
            break
        weakest["backlog"] = True
        active.remove(weakest)
        backlog.append(weakest)
        changed = True

    # Room free: promote the strongest backlogged loop.
    while len(active) < _MAX_LIVE and backlog:
        strongest = backlog.pop(0)
        strongest["backlog"] = False
        active.append(strongest)
        changed = True

    return changed


def _sweep(store: dict, character: str | None = None) -> bool:
    loops = _bucket(store, character)
    expired = _expire_due(loops)
    balanced = _rebalance(loops)
    # Keep the history bounded, dropping the oldest closed loops first. Live loops
    # are never pruned — they still owe the user a payoff.
    pruned = False
    if len(loops) > _MAX_STORED:
        live_loops = [l for l in loops if l.get("state") in LIVE_STATES]
        closed = [l for l in loops if l.get("state") not in LIVE_STATES]
        keep_closed = max(_MAX_STORED - len(live_loops), 0)
        if keep_closed < len(closed):
            keep = {id(l) for l in live_loops}
            keep |= {id(l) for l in closed[len(closed) - keep_closed:]}
            loops[:] = [l for l in loops if id(l) in keep]
            pruned = True
    return expired or balanced or pruned


# ── ranking ──────────────────────────────────────────────────────────────────


def _score(loop: dict) -> float:
    """`strength x recency x time_sensitivity` (§1.3 Rule 1).

    Recency decays across the loop's own half-life, so a 2-day-old question loop
    and a 5-day-old serial loop are compared fairly. Time sensitivity favours the
    short-fuse types, so "same time tomorrow?" doesn't sit behind a thread that
    can wait a week.
    """
    kind = loop.get("type", _DEFAULT_TYPE)
    half_life = _HALF_LIFE_HOURS.get(kind, 48)
    strength = float(loop.get("strength") or _BASE_STRENGTH.get(kind, 0.6))

    created = _parse(loop.get("created_at")) or _now()
    age_h = max((_now() - created).total_seconds() / 3600, 0)
    recency = max(1.0 - (age_h / (half_life * _EXPIRE_MULTIPLIER)), 0.05)

    # Shortest half-life in the table is the ritual loop at 26h; scale against it.
    time_sensitivity = min(26 / half_life, 1.0) * 0.5 + 0.5

    # A loop she already opened on outranks everything: it is mid-payoff.
    surfaced_boost = 1.5 if loop.get("state") == "surfaced" else 1.0

    return strength * recency * time_sensitivity * surfaced_boost


# ── the API ──────────────────────────────────────────────────────────────────


def plant(
    hook_text: str,
    kind: str = _DEFAULT_TYPE,
    strength: float | None = None,
    payoff_ref: str | None = None,
    due_at: str | None = None,
) -> dict | None:
    """Store a hook Poppy planted at the end of a call (§1.3). Returns the loop.

    `hook_text` is her line in her voice ("how'd the interview go?"), NOT the
    user's words played back — that distinction is the whole mechanic.
    """
    hook_text = (hook_text or "").strip()
    if not hook_text:
        return None
    if kind not in TYPES:
        kind = _DEFAULT_TYPE

    now = _now()
    half_life = _HALF_LIFE_HOURS[kind]
    loop = {
        "id": uuid.uuid4().hex[:12],
        "type": kind,
        "hook_text": hook_text[:200],
        "payoff_ref": payoff_ref,
        "created_at": _iso(now),
        "due_at": due_at or _iso(now),
        "decay_at": _iso(now + timedelta(hours=half_life)),
        "strength": float(strength) if strength is not None else _BASE_STRENGTH[kind],
        "state": "open",
        "backlog": False,
    }

    store = _load()
    character = _character()
    _bucket(store, character).append(loop)
    _sweep(store, character)
    _save(store)
    return loop


def live(character: str | None = None) -> list[dict]:
    """This character's active loops, strongest first. At most two are non-backlog."""
    store = _load()
    character = character or _character()
    if _sweep(store, character):
        _save(store)
    active = [
        l for l in _bucket(store, character)
        if l.get("state") in LIVE_STATES and not l.get("backlog")
    ]
    return sorted(active, key=_score, reverse=True)


def top(character: str | None = None) -> dict | None:
    """The single loop to show. §1.3 Rule 1: exactly one, everywhere."""
    ranked = live(character)
    return ranked[0] if ranked else None


def get(loop_id: str) -> dict | None:
    for loop in _bucket(_load()):
        if loop.get("id") == loop_id:
            return loop
    return None


def _set_state(loop_id: str, state: str) -> dict | None:
    if not loop_id:
        return None
    store = _load()
    character = _character()
    for loop in _bucket(store, character):
        if loop.get("id") != loop_id:
            continue
        loop["state"] = state
        loop[f"{state}_at"] = _iso(_now())
        if state != "surfaced":
            loop["backlog"] = False
        _sweep(store, character)
        _save(store)
        return loop
    return None


def mark_surfaced(loop_id: str) -> dict | None:
    """She just opened the call on this loop. It is now mid-payoff and outranks
    everything until the user answers or it expires."""
    return _set_state(loop_id, "surfaced")


def resolve(loop_id: str) -> dict | None:
    """The user came back and closed the itch. This is the number that matters
    (`loop_close_rate`, §10)."""
    return _set_state(loop_id, "resolved")


def decline(loop_id: str) -> dict | None:
    """The user deflected. Not a failure and never mentioned again — it just
    stops competing for the one visible slot."""
    return _set_state(loop_id, "declined")


def is_decayed(loop: dict) -> bool:
    decay = _parse(loop.get("decay_at"))
    return bool(decay and _now() >= decay)


# §1.3 Rule 4 — how a loop softens once it decays. Each entry is the lead-in she
# says instead of asking again, plus whether the original hook still follows it.
# Reveal and ritual loops carry no detail of the user's, so their softened form
# stands alone; repeating the hook after the lead-in would just be the same
# sentence twice.
_SOFTENED = {
    "event": ("I don't even know if it happened. Still curious whenever you want to tell me.", True),
    "question": ("No pressure on this one. Still curious whenever you feel like it.", True),
    "reveal": ("I've still got that thing I've been meaning to tell you, whenever you're around.", False),
    "serial": ("We never did finish this. It's still here whenever you want it.", True),
    "ritual": ("No schedule, no pressure. I'm around whenever.", False),
    "callback": ("I got it straight eventually. No rush on it.", True),
}


def surface_text(loop: dict | None) -> str | None:
    """The line to actually say, softened if the loop has decayed (§1.3 Rule 4).

    Past `decay_at` she stops asking as though an answer were owed. The softened
    form keeps the curiosity and drops the expectation, which is the difference
    between a companion and a nag: "I don't even know if it happened, but I'm
    still curious", never "you never told me".
    """
    if not loop:
        return None
    hook = (loop.get("hook_text") or "").strip()
    if not hook:
        return None
    if not is_decayed(loop):
        return hook

    lead, keep_hook = _SOFTENED.get(loop.get("type"), _SOFTENED[_DEFAULT_TYPE])
    # Hooks are authored lowercase-casual so they sound spoken; following a
    # lead-in sentence the hook starts a new one, so it needs the capital.
    softened = f"{lead} {hook[0].upper()}{hook[1:]}" if keep_hook else lead
    # Same choke point every outbound line passes through, so decay copy can
    # never drift into guilt phrasing. Imported lazily: nudges imports companion,
    # which imports this module.
    import nudges
    return softened if nudges.is_healthy(softened) else hook


def counts(character: str | None = None) -> dict:
    """Content-free tallies for §10 metrics. No hook text ever leaves this module
    for the analytics log."""
    store = _load()
    character = character or _character()
    loops = _bucket(store, character)
    by_state: dict[str, int] = {}
    for loop in loops:
        by_state[loop.get("state", "open")] = by_state.get(loop.get("state", "open"), 0) + 1
    planted = len(loops)
    resolved = by_state.get("resolved", 0)
    return {
        "planted": planted,
        "resolved": resolved,
        "open": by_state.get("open", 0) + by_state.get("surfaced", 0),
        "expired": by_state.get("expired", 0),
        "declined": by_state.get("declined", 0),
        # Resolution is only counted against loops that have finished their life:
        # a loop still inside its half-life hasn't failed, it just hasn't paid off yet.
        "close_rate": (
            round(resolved / (resolved + by_state.get("expired", 0)), 3)
            if (resolved + by_state.get("expired", 0)) else None
        ),
    }


# ── migration ────────────────────────────────────────────────────────────────


def from_user_words(text: str, lead: str = "last time you mentioned") -> str:
    """Frame something the user said as *her* referring back to it.

    Used wherever a hook has to be built from raw user text rather than authored
    by `loop_author` — the pre-engine migration, and the onboarding seed. Quoted
    straight back it produces the exact failure this engine exists to fix ("I've
    been wondering, so my manager rescheduled it?"); attributed to her it becomes
    a real callback, which is honest and reads correctly.
    """
    stem = (text or "").strip().rstrip("?.!, ")
    # Drop the discourse markers that start a spoken sentence but read as noise
    # once the line is quoted back ("so my manager..." -> "my manager...").
    stem = re.sub(r"^(?:so|and|but|like|well|yeah|okay|ok|um|uh)[\s,]+", "", stem, flags=re.I)
    if not stem:
        return ""
    stem = stem[0].lower() + stem[1:]
    return f"{lead} {stem}, how's that been going?"


def migrate_from_profile(profile_loops: dict[str, list]) -> int:
    """Fold the pre-engine `{text, created_at}` loops into the real model, once.

    They carry the lowest strength we have and are rephrased into her voice, so
    they lose to the first properly authored hook and then fall away quietly.
    """
    store = _load()
    if store.get("migrated"):
        return 0

    moved = 0
    for character, entries in (profile_loops or {}).items():
        bucket = _bucket(store, character)
        for entry in entries or []:
            text = (entry.get("text") if isinstance(entry, dict) else str(entry) or "").strip()
            if not text:
                continue
            created = _parse(entry.get("created_at") if isinstance(entry, dict) else None) or _now()
            half_life = _HALF_LIFE_HOURS[_DEFAULT_TYPE]
            bucket.append({
                "id": uuid.uuid4().hex[:12],
                "type": _DEFAULT_TYPE,
                "hook_text": from_user_words(text)[:200],
                "payoff_ref": None,
                "created_at": _iso(created),
                "due_at": _iso(created),
                "decay_at": _iso(created + timedelta(hours=half_life)),
                "strength": 0.2,
                "state": "open",
                "backlog": False,
                "legacy": True,
            })
            moved += 1
        _sweep(store, character)

    store["migrated"] = True
    _save(store)
    return moved
