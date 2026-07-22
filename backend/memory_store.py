"""
Encrypted, categorized, consent-gated local memory (POPPY_PRODUCT_PLAYBOOK §5).

Memory is the retention moat, and it's also what both competitors get most
complaints about, so it's done transparently: every fact is a typed record the
user can see, edit, delete, and understand ("why do you remember this?"). Nothing
durable is stored without the user tapping Save — extraction only *proposes*
(see memory_extract.py); this module stores what's confirmed.

Records are encrypted at rest with Fernet (AES-128-CBC + HMAC); the key lives in a
local file readable only by the owner. This is privacy hygiene for an on-device
app, not protection against an attacker who already owns the user's account.

A record:
    {
      "id":         "<12-hex>",
      "text":       "Training for a 10k",
      "category":   "goals",              # see CATEGORIES
      "why":        "You said you're training for a 10k",   # the source moment
      "created_at": "<iso>",
      "expires_at": "<iso> | null",       # temporary facts self-expire
      "sensitive":  false,                # off by default, explicit opt-in only
    }
"""

import json
import os
import re
import uuid
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet, InvalidToken

import paths

_ROOT = paths.user_data_dir()
_KEY_PATH = _ROOT / "companion.key"
_DATA_PATH = _ROOT / "companion_memory.enc"
_MAX_FACTS = 60

# The memory categories the product exposes (§5). `temporary` facts carry a TTL and
# self-expire; `sensitive` is off by default and only ever stored on explicit opt-in.
CATEGORIES = ("profile", "goals", "people", "ongoing", "temporary", "sensitive")
_DEFAULT_CATEGORY = "ongoing"
_TEMPORARY_TTL_DAYS = 14

# Patterns → (category, template) for the offline regex fallback extractor. The LLM
# extractor (memory_extract.py) is the primary path; these still run when it's
# unavailable, and they now produce typed candidates instead of bare strings.
_EXTRACTORS = [
    (re.compile(r"\bmy name is ([A-Za-z][A-Za-z'\-]{1,30})", re.I), "profile", "Name: {}"),
    (re.compile(r"\bcall me ([A-Za-z][A-Za-z'\-]{1,30})", re.I),    "profile", "Prefers to be called {}"),
    (re.compile(r"\bi (?:really |also )?(?:like|love|enjoy) ([^.!?,;]{2,40})", re.I), "profile", "Likes {}"),
    (re.compile(r"\bi (?:really )?(?:hate|dislike|can'?t stand) ([^.!?,;]{2,40})", re.I), "profile", "Dislikes {}"),
    (re.compile(r"\bi work as (?:an? )?([^.!?,;]{2,40})", re.I), "profile", "Works as {}"),
    (re.compile(r"\bi live in ([^.!?,;]{2,40})", re.I), "profile", "Lives in {}"),
    (re.compile(r"\bi'?m from ([^.!?,;]{2,40})", re.I), "profile", "Is from {}"),
    (re.compile(r"\bi (?:want to|wanna|hope to|plan to|am trying to) ([^.!?,;]{2,50})", re.I), "goals", "Wants to {}"),
    (re.compile(r"\bi'?m (?:training|studying|working) (?:for|on|towards) ([^.!?,;]{2,50})", re.I), "goals", "Working towards {}"),
    (re.compile(r"\bi have (?:an? )?([a-z][^.!?,;]{2,40})", re.I), "ongoing", "Has {}"),
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_key() -> bytes:
    if _KEY_PATH.exists():
        return _KEY_PATH.read_bytes()
    key = Fernet.generate_key()
    _KEY_PATH.write_bytes(key)
    try:
        os.chmod(_KEY_PATH, 0o600)
    except OSError:
        pass
    return key


def _fernet() -> Fernet:
    return Fernet(_get_key())


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _migrate_old(texts: list[str]) -> list[dict]:
    """Upgrade the old flat list[str] format to typed records."""
    now = _now().isoformat()
    return [
        {
            "id": _new_id(),
            "text": t,
            "category": "profile" if t.startswith(("Name:", "Prefers", "Likes", "Dislikes")) else _DEFAULT_CATEGORY,
            "why": None,
            "created_at": now,
            "expires_at": None,
            "sensitive": False,
        }
        for t in texts
        if isinstance(t, str) and t.strip()
    ]


def _read() -> dict:
    """Decrypt and return the full store: {records, suppressed}."""
    if not _DATA_PATH.exists():
        return {"records": [], "suppressed": []}
    try:
        raw = _fernet().decrypt(_DATA_PATH.read_bytes())
        data = json.loads(raw)
    except (InvalidToken, json.JSONDecodeError, ValueError):
        return {"records": [], "suppressed": []}

    if "records" in data:
        records = data.get("records", [])
    else:
        # Old {"facts": [str, ...]} file — migrate in place on next write.
        records = _migrate_old(data.get("facts", []))
    return {"records": records, "suppressed": data.get("suppressed", [])}


def _write(store: dict) -> None:
    blob = json.dumps(store).encode("utf-8")
    _DATA_PATH.write_bytes(_fernet().encrypt(blob))
    try:
        os.chmod(_DATA_PATH, 0o600)
    except OSError:
        pass


def _prune_expired(store: dict) -> bool:
    """Drop temporary facts past their TTL. Returns True if anything changed."""
    now = _now()
    kept = []
    changed = False
    for r in store["records"]:
        exp = r.get("expires_at")
        if exp and datetime.fromisoformat(exp) < now:
            changed = True
            continue
        kept.append(r)
    store["records"] = kept
    return changed


def _load() -> dict:
    store = _read()
    if _prune_expired(store):
        _write(store)
    return store


# ── Read ──────────────────────────────────────────────────────────────────────

def records() -> list[dict]:
    """All live (non-expired) records, oldest first."""
    return _load()["records"]


def recall() -> list[str]:
    """Just the fact texts — backward-compatible with earlier callers."""
    return [r["text"] for r in records()]


def suppressed_categories() -> list[str]:
    return _load().get("suppressed", [])


# ── Write ─────────────────────────────────────────────────────────────────────

def remember(
    text: str,
    category: str = _DEFAULT_CATEGORY,
    why: str | None = None,
    sensitive: bool = False,
) -> dict | None:
    """Store a confirmed fact. Returns the new record, or None if it's a duplicate
    or empty. `temporary` facts get a TTL so they self-expire."""
    text = (text or "").strip()
    if not text:
        return None
    if category not in CATEGORIES:
        category = _DEFAULT_CATEGORY

    store = _load()
    if any(text.lower() == r["text"].lower() for r in store["records"]):
        return None

    expires_at = None
    if category == "temporary":
        expires_at = (_now() + timedelta(days=_TEMPORARY_TTL_DAYS)).isoformat()

    record = {
        "id": _new_id(),
        "text": text,
        "category": category,
        "why": (why or "").strip() or None,
        "created_at": _now().isoformat(),
        "expires_at": expires_at,
        "sensitive": bool(sensitive),
    }
    store["records"].append(record)
    store["records"] = store["records"][-_MAX_FACTS:]
    _write(store)
    return record


def update(fact_id: str, text: str) -> dict | None:
    """Edit a fact's text in place (§5: memories are editable)."""
    text = (text or "").strip()
    if not text:
        return None
    store = _load()
    for r in store["records"]:
        if r["id"] == fact_id:
            r["text"] = text
            _write(store)
            return r
    return None


def delete(fact_id: str) -> bool:
    store = _load()
    before = len(store["records"])
    store["records"] = [r for r in store["records"] if r["id"] != fact_id]
    if len(store["records"]) != before:
        _write(store)
        return True
    return False


def suppress_category(category: str) -> None:
    """Record "never remember this kind" so the extractor stops proposing it (§5)."""
    if category not in CATEGORIES:
        return
    store = _load()
    if category not in store["suppressed"]:
        store["suppressed"].append(category)
        _write(store)


def forget_all() -> None:
    if _DATA_PATH.exists():
        _DATA_PATH.unlink()


# ── Prompt injection ───────────────────────────────────────────────────────────

# Only the most recent facts are injected into the prompt — enough for continuity
# without ballooning the prefill (and slowing time-to-first-token) as memory grows.
_PROMPT_FACTS = 15


def as_prompt_block() -> str:
    facts = recall()[-_PROMPT_FACTS:]
    if not facts:
        return ""
    lines = "\n".join(f"- {f}" for f in facts)
    return f"\n\nThings you remember about the user:\n{lines}"


# ── Regex fallback extractor (typed candidates, not auto-stored) ───────────────

_CLAUSE_BREAK = re.compile(r"\s+(?:and|but|because|so|while|when|since)\s+", re.I)


def _clean_value(value: str) -> str:
    return _CLAUSE_BREAK.split(value, maxsplit=1)[0].strip().rstrip(".")


def regex_candidates(user_text: str) -> list[dict]:
    """Propose (do NOT store) typed candidate facts from a message via regex. This
    is the offline fallback for memory_extract.py when the LLM path is unavailable."""
    out = []
    for pattern, category, template in _EXTRACTORS:
        m = pattern.search(user_text)
        if m:
            value = _clean_value(m.group(1))
            if value:
                out.append({
                    "text": template.format(value),
                    "category": category,
                    "why": user_text.strip()[:140],
                })
    return out
