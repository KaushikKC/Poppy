"""
The companion profile — the small, durable state that makes Poppy feel like a
someone rather than a chat window.

This is the data model the product loop (POPPY_PRODUCT_PLAYBOOK) is built on and
that the old app was missing entirely:

  * identity   — the name the user gave Poppy, the chosen vibe, the avatar preset
  * ritual     — an opt-in morning/night time the user chose (§6)
  * streak     — days connected, celebrated gently, never punished (§6)
  * open loops — the forward hooks Poppy plants at the end of a call ("tell me how
                 it goes"), which drive the home-screen "she remembers" strip and,
                 later, notifications (§4/§6)

It is plain JSON (config, not conversation content) in the per-user data dir, next
to the SQLite history and the encrypted memory. Single-user local app, so one
module-level profile is all we need.
"""

import json
from datetime import date, datetime, timezone

import paths

_PATH = paths.user_data_dir() / "companion_profile.json"
_MAX_OPEN_LOOPS = 10

_DEFAULTS = {
    "onboarded": False,
    "companion_name": "Poppy",   # what the user named Poppy (§4)
    "vibe": "friend",            # chosen vibe key (§2.3)
    "avatar": "avaturn",         # avatar preset id (frontend/avatar/*.glb)
    "created_at": None,
    "last_call_date": None,      # ISO date (YYYY-MM-DD) of the most recent call
    "current_streak": 0,
    "longest_streak": 0,
    "total_calls": 0,
    "ritual_time": None,         # "HH:MM" the user opted into, or None
    "ritual_kind": None,         # "morning" | "night" | None
    "open_loops": [],            # list of {text, created_at}
    "personality_version": None, # the vibe-prompt version Poppy was pinned to (§3.6)
    "model": None,               # the LLM model her personality was calibrated on
    "celebrated_milestones": [], # streak milestones already celebrated, so we don't repeat
    "plan": "free",              # entitlement tier: "free" | "plus" (§8)
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


def create(companion_name: str, vibe: str, avatar: str) -> dict:
    """Complete onboarding: name Poppy, pick a vibe and a look (§2.3/§2.4)."""
    p = _load()
    now = datetime.now(timezone.utc).isoformat()
    p["companion_name"] = (companion_name or "Poppy").strip()[:40] or "Poppy"
    p["vibe"] = vibe or "friend"
    p["avatar"] = avatar or "avaturn"
    p["onboarded"] = True
    if not p["created_at"]:
        p["created_at"] = now
    # Pin the personality this companion is calibrated on (§3.6).
    p["personality_version"], p["model"] = _current_signature()
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
    return update(ritual_kind=kind, ritual_time=(time_str or None))


def days_since_last_call() -> int | None:
    """Whole days since the last call, or None if there's never been one."""
    p = _load()
    last = p.get("last_call_date")
    if not last:
        return None
    return (_today() - date.fromisoformat(last)).days


def add_open_loop(text: str) -> None:
    """Store a forward hook Poppy planted at the end of a call (§4)."""
    text = (text or "").strip()
    if not text:
        return
    p = _load()
    loops = p.get("open_loops", [])
    loops.append({"text": text, "created_at": datetime.now(timezone.utc).isoformat()})
    p["open_loops"] = loops[-_MAX_OPEN_LOOPS:]
    _save(p)


def latest_open_loop() -> str | None:
    loops = _load().get("open_loops", [])
    return loops[-1]["text"] if loops else None


def as_prompt_block() -> str:
    """Identity line injected into the system prompt so Poppy knows her own name
    and, if a forward hook is open, is nudged to close it in this call."""
    p = _load()
    name = p.get("companion_name", "Poppy")
    line = f"\n\nYour name is {name}." if name and name != "Poppy" else ""
    loop = latest_open_loop()
    if loop:
        line += (
            f"\nLast time you told the user: \"{loop}\" — if it comes up naturally, "
            "follow up on it warmly."
        )
    return line
