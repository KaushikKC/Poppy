"""Characters the user writes themselves.

The built-in cast in characters.py is six people we chose. This is the other half:
someone who wants to talk to a character of their own — a name, a voice, and a
description of who they are — writes one and it sits in the picker beside ours.

## What a custom character actually is

A `personality` paragraph, and little else. That paragraph goes into the system prompt
in exactly the slot the built-in characters' own personality lines occupy, so a custom
character is not a lesser thing running through a side path: it is assembled the same
way, by the same function, and the model cannot tell the difference.

That is also why the paragraph is capped. It rides in the prompt on every single turn,
and the prompt is the largest part of the wait before the first word — an unbounded
field here would let someone quietly make their own app slow, with no way to connect
the two.

## Keys

Prefixed `custom:` so they can never collide with a built-in, and so any code that
sees a key knows immediately which side it came from. The suffix is derived from the
name plus a short random tail, because two characters called "Kai" must not overwrite
one another.
"""

import json
import random
import re
import string

import paths

_PATH = paths.user_data_dir() / "characters_custom.json"

PREFIX = "custom:"

# The prompt-bearing fields, and what they cost. `personality` is the character; the
# rest is presentation. See the note above on why this is bounded.
NAME_MAX_CHARS = 40
TAGLINE_MAX_CHARS = 60
PERSONALITY_MAX_CHARS = 700
GREETING_MAX_CHARS = 200

# The voices the TTS actually has a speaker id for. Offering anything else would
# silently fall back to a default voice, which reads as the app ignoring the choice.
VOICES = [
    {"key": "af_heart", "label": "Warm", "gender": "female"},
    {"key": "af_bella", "label": "Bright", "gender": "female"},
    {"key": "af_nicole", "label": "Soft", "gender": "female"},
    {"key": "am_adam", "label": "Easy", "gender": "male"},
    {"key": "am_fenrir", "label": "Deep", "gender": "male"},
    {"key": "am_michael", "label": "Steady", "gender": "male"},
]
_VOICE_KEYS = {v["key"]: v for v in VOICES}
DEFAULT_VOICE = "af_heart"

# Picked for the user rather than asked for. A colour picker is a decision nobody
# wants to make about someone they are inventing, and every one of these already
# reads against the app's cream and sky.
PALETTE = [
    {"face": "#2d1b3d", "gradient": "#4a2d5f", "eyes": "#c9a5f0", "outline": "#a06fd6", "glow": "160,111,214"},
    {"face": "#1b2d3d", "gradient": "#2d4a5f", "eyes": "#8fd4f0", "outline": "#4fa8d6", "glow": "79,168,214"},
    {"face": "#3d2b1b", "gradient": "#5f452d", "eyes": "#f0c98f", "outline": "#d6994f", "glow": "214,153,79"},
    {"face": "#1b3d2b", "gradient": "#2d5f45", "eyes": "#8ff0b5", "outline": "#4fd68a", "glow": "79,214,138"},
    {"face": "#3d1b28", "gradient": "#5f2d42", "eyes": "#f08fae", "outline": "#d64f7d", "glow": "214,79,125"},
]


def _load() -> list[dict]:
    if not _PATH.exists():
        return []
    try:
        data = json.loads(_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    return data if isinstance(data, list) else []


def _save(rows: list[dict]) -> None:
    _PATH.parent.mkdir(parents=True, exist_ok=True)
    _PATH.write_text(json.dumps(rows, indent=2))


def _new_key(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")[:20] or "character"
    tail = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
    return f"{PREFIX}{slug}-{tail}"


def normalise(payload: dict, existing: dict | None = None) -> dict:
    """Coerce whatever came off the wire into something safe to prompt with."""
    old = existing or {}
    name = str(payload.get("name") or old.get("name") or "").strip()[:NAME_MAX_CHARS]
    voice = payload.get("voice") or old.get("voice") or DEFAULT_VOICE
    if voice not in _VOICE_KEYS:
        voice = DEFAULT_VOICE
    # Gender follows the voice rather than being asked separately: it only exists here
    # to choose an avatar, and a voice the user picked is a better signal than a
    # question they did not want to answer.
    gender = _VOICE_KEYS[voice]["gender"]
    return {
        "key": old.get("key") or _new_key(name),
        "name": name,
        "voice": voice,
        "gender": gender,
        "accent": "american",
        "tagline": str(payload.get("tagline") or old.get("tagline") or "").strip()[:TAGLINE_MAX_CHARS],
        "personality": str(
            payload.get("personality") or old.get("personality") or ""
        ).strip()[:PERSONALITY_MAX_CHARS],
        "greeting": str(payload.get("greeting") or old.get("greeting") or "").strip()[:GREETING_MAX_CHARS],
        "color": old.get("color") or random.choice(PALETTE),
        "custom": True,
    }


def all_characters() -> list[dict]:
    return _load()


def get(key: str) -> dict | None:
    return next((c for c in _load() if c.get("key") == key), None)


def save(payload: dict) -> dict:
    """Create, or update in place when the payload carries a key we already hold."""
    rows = _load()
    key = payload.get("key")
    existing = next((c for c in rows if c.get("key") == key), None) if key else None
    row = normalise(payload, existing)
    if not row["name"]:
        raise ValueError("a character needs a name")
    if existing:
        rows = [row if c.get("key") == row["key"] else c for c in rows]
    else:
        rows.append(row)
    _save(rows)
    return row


def remove(key: str) -> bool:
    rows = _load()
    kept = [c for c in rows if c.get("key") != key]
    if len(kept) == len(rows):
        return False
    _save(kept)
    return True
