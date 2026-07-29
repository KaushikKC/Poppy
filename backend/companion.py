"""
The companion profile — the small, durable state that makes Poppy feel like a
someone rather than a chat window.

This is the data model the product loop (POPPY_PRODUCT_PLAYBOOK) is built on and
that the old app was missing entirely:

  * identity   — the name the user gave Poppy, the chosen vibe, the avatar preset
  * ritual     — an opt-in morning/night time the user chose (§6)
  * streak     — days connected, celebrated gently, never punished (§6)
  * open loops — the forward hooks Poppy plants at the end of a call, which drive
                 the opener, the home-screen strip and the notification. The model
                 itself lives in `loops.py` (RETENTION_ENGINE §1); this module just
                 forwards to it and migrates the pre-engine entries across.

It is plain JSON (config, not conversation content) in the per-user data dir, next
to the SQLite history and the encrypted memory. Single-user local app, so one
module-level profile is all we need.
"""

import json
from datetime import date, datetime, timezone

import paths

_PATH = paths.user_data_dir() / "companion_profile.json"

_DEFAULTS = {
    "onboarded": False,
    "character": "poppy",        # chosen character id (characters.py)
    "companion_name": "Poppy",   # the character's name (their identity)
    "gender": "female",          # character gender -> voice + avatar
    "voice": "af_heart",         # the character's Kokoro voice
    "vibe": "friend",            # legacy vibe key (mood modes still layer on top)
    "avatar": "brunette",        # avatar preset id (frontend/avatar/*.glb)
    "created_at": None,
    "last_call_date": None,      # ISO date (YYYY-MM-DD) of the most recent call
    "current_streak": 0,
    "longest_streak": 0,
    "total_calls": 0,
    "ritual_time": None,         # "HH:MM" (local) the user opted into, or None
    "ritual_kind": None,         # "morning" | "night" | None
    "last_reminded_date": None,  # local ISO date the ritual was met (talked/dismissed)
    "last_notified_date": None,  # local ISO date the native OS reminder last fired
    # Both drained into loops.py on first run; the real loop model lives there now.
    "open_loops": [],               # legacy global list
    "open_loops_by_character": {},  # legacy {character: [{text, created_at}]}
    "personality_version": None, # the vibe-prompt version Poppy was pinned to (§3.6)
    "model": None,               # the LLM model her personality was calibrated on
    "celebrated_milestones": [], # streak milestones already celebrated, so we don't repeat
    "plan": "free",              # entitlement tier: "free" | "plus" (§8)
    "referral_code": None,       # the user's share code (§7 growth loop B)
}

# Days-connected milestones worth a warm moment (§6). Celebration only, never an
# obligation, and a broken streak is never punished — that's handled in the opener.
_MILESTONES = (7, 30, 100, 365)


def _load() -> dict:
    if not _PATH.exists():
        return dict(_DEFAULTS)
    try:
        data = json.loads(_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return dict(_DEFAULTS)
    # Merge over defaults so a profile written by an older build gains new keys.
    return {**_DEFAULTS, **data}


def _save(profile: dict) -> None:
    _PATH.write_text(json.dumps(profile, indent=2))


def profile() -> dict:
    """The full profile (safe to send to the frontend — it holds no secrets)."""
    return _load()


def is_onboarded() -> bool:
    return _load().get("onboarded", False)


def _current_signature() -> tuple[int, str]:
    """The personality version + model the app is running right now."""
    import personas
    import llm
    return personas.PERSONALITY_VERSION, llm.model_id()


def _apply_character(p: dict, character: str) -> None:
    """Copy a chosen character's identity (name, gender, voice, look) onto the profile."""
    import characters
    c = characters.get(character)
    p["character"] = character if character in characters.CHARACTERS else characters.DEFAULT_CHARACTER
    p["companion_name"] = c["name"]
    p["gender"] = c["gender"]
    p["voice"] = c["voice"]
    p["avatar"] = c["avatar"]


def create(character: str = "poppy", **_legacy) -> dict:
    """Complete onboarding: pick a character, who becomes the companion (name, gender,
    voice, look all come from the character)."""
    p = _load()
    now = datetime.now(timezone.utc).isoformat()
    _apply_character(p, character or "poppy")
    p["onboarded"] = True
    if not p["created_at"]:
        p["created_at"] = now
    # Pin the personality this companion is calibrated on (§3.6).
    p["personality_version"], p["model"] = _current_signature()
    _save(p)
    return p


def set_character(character: str) -> dict:
    """Switch to a different character later. Memory and open loops are per-character
    (so each companion remembers only its own conversations); the streak and ritual are
    the user's own habit and stay shared."""
    p = _load()
    _apply_character(p, character)
    _save(p)
    return p


def personality_status() -> dict:
    """Whether Poppy's personality (vibe-prompt version or model) has changed under
    the user since they created her (§3.6). If it was never pinned (an older
    profile), adopt the current signature silently — that's the baseline, not a
    change worth alarming about."""
    p = _load()
    version, model = _current_signature()
    if p.get("personality_version") is None:
        p["personality_version"], p["model"] = version, model
        _save(p)
        return {"pending": False, "version": version, "model": model}

    pending = p["personality_version"] != version or p.get("model") != model
    return {
        "pending": pending,
        "pinned": {"version": p["personality_version"], "model": p.get("model")},
        "current": {"version": version, "model": model},
    }


def accept_personality_update() -> dict:
    """Re-pin to the current personality, deliberately (the user tapped Update)."""
    p = _load()
    p["personality_version"], p["model"] = _current_signature()
    _save(p)
    return p


def update(**fields) -> dict:
    """Patch arbitrary profile fields (vibe change, ritual pick, etc.)."""
    p = _load()
    for k, v in fields.items():
        if k in _DEFAULTS:
            p[k] = v
    _save(p)
    return p


def _today() -> date:
    return datetime.now(timezone.utc).date()


def record_call() -> dict:
    """Mark that a call happened today and roll the streak forward (§6).

    Streak rules, deliberately kind: a same-day repeat call doesn't change it; a
    call the day after the last one increments it; a longer gap resets it to 1.
    A broken streak is never punished — that's a UI concern, and the copy on
    return is warmth, not shame.
    """
    p = _load()
    today = _today()
    last = p.get("last_call_date")
    last_date = date.fromisoformat(last) if last else None

    if last_date == today:
        pass  # already counted today
    elif last_date == date.fromordinal(today.toordinal() - 1):
        p["current_streak"] = p.get("current_streak", 0) + 1
    else:
        p["current_streak"] = 1

    p["last_call_date"] = today.isoformat()
    p["longest_streak"] = max(p.get("longest_streak", 0), p["current_streak"])
    p["total_calls"] = p.get("total_calls", 0) + 1
    # Talking counts as meeting today's ritual, so the reminder won't nag afterwards.
    p["last_reminded_date"] = datetime.now().date().isoformat()
    _save(p)
    return p


def check_milestone() -> int | None:
    """If today's call just reached a days-connected milestone we haven't celebrated,
    return it (once). Call after record_call(). Celebration, never obligation (§6)."""
    p = _load()
    streak = p.get("current_streak", 0)
    celebrated = p.get("celebrated_milestones", [])
    if streak in _MILESTONES and streak not in celebrated:
        celebrated.append(streak)
        p["celebrated_milestones"] = celebrated
        _save(p)
        return streak
    return None


def set_ritual(kind: str | None, time_str: str | None) -> dict:
    """Opt into (or clear) a daily ritual time the user chose themselves (§6). A
    ritual the user picks is a habit; a ping they didn't ask for is spam."""
    kind = kind if kind in ("morning", "night") else None
    if not kind:
        time_str = None
    # A freshly set/changed ritual can fire again today, so clear both marks.
    return update(
        ritual_kind=kind, ritual_time=(time_str or None),
        last_reminded_date=None, last_notified_date=None,
    )


def ritual_due() -> dict:
    """Is a ritual reminder due right now? True once the local clock passes the
    chosen time and the ritual hasn't been met (talked or dismissed) today. Uses
    local time throughout, so it can't drift against the user's clock (§6)."""
    p = _load()
    kind, t = p.get("ritual_kind"), p.get("ritual_time")
    if not kind or not t:
        return {"due": False}
    try:
        hh, mm = (int(x) for x in t.split(":"))
    except (ValueError, AttributeError):
        return {"due": False}
    now = datetime.now()
    if (now.hour, now.minute) < (hh, mm):
        return {"due": False}  # not yet today
    if p.get("last_reminded_date") == now.date().isoformat():
        return {"due": False}  # already met/dismissed today
    return {"due": True, "kind": kind, "time": t}


def mark_reminded() -> None:
    """Record that today's ritual reminder was met (talked/dismissed), so the in-app
    banner won't nag."""
    update(last_reminded_date=datetime.now().date().isoformat())


def should_notify() -> bool:
    """Whether the native OS reminder still needs to fire today. Separate from the
    in-app 'met' mark so the notification fires once, yet the banner still greets
    the user in-app when they open the window."""
    return _load().get("last_notified_date") != datetime.now().date().isoformat()


def mark_notified() -> None:
    update(last_notified_date=datetime.now().date().isoformat())


def days_since_last_call() -> int | None:
    """Whole days since the last call, or None if there's never been one."""
    p = _load()
    last = p.get("last_call_date")
    if not last:
        return None
    return (_today() - date.fromisoformat(last)).days


def _migrate_loops() -> None:
    """Hand the old `{text, created_at}` entries to the loop engine, once.

    Those entries were never authored hooks — the pre-engine build stored the
    user's own last utterance — so loops.py takes them in at minimum strength and
    lets them fall away behind the first real hook.
    """
    import loops
    p = _load()
    legacy = dict(p.get("open_loops_by_character") or {})
    if p.get("open_loops"):
        char = p.get("character", "poppy")
        legacy[char] = list(legacy.get(char, [])) + p["open_loops"]
    if not legacy:
        loops.migrate_from_profile({})
        return
    if loops.migrate_from_profile(legacy):
        p["open_loops"] = []
        p["open_loops_by_character"] = {}
        _save(p)


def add_open_loop(text: str, kind: str = "question", strength: float | None = None) -> dict | None:
    """Plant a forward hook for the CURRENT character (§1.3). Thin wrapper kept so
    callers don't need to know about loops.py; the model lives there."""
    import loops
    _migrate_loops()
    return loops.plant(text, kind, strength=strength)


def open_loop() -> dict | None:
    """The single ranked open loop to surface right now, or None (§1.3 Rule 1)."""
    import loops
    _migrate_loops()
    return loops.top()


def latest_open_loop() -> str | None:
    """The text of the loop to surface, softened if it has decayed. Kept under the
    original name because the opener and the nudge composer both call it."""
    import loops
    return loops.surface_text(open_loop())


def as_prompt_block() -> str:
    """Identity line injected into the system prompt so Poppy knows her own name
    and, if a forward hook is open, is nudged to close it in this call."""
    p = _load()
    name = p.get("companion_name", "Poppy")
    line = f"\n\nYour name is {name}." if name and name != "Poppy" else ""
    loop = latest_open_loop()
    if loop:
        line += (
            f"\nLast time you left this hanging with the user: \"{loop}\" — close it "
            "early and warmly, before anything else."
        )
    return line
