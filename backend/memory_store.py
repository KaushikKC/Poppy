"""
Encrypted, cross-session local memory.

Small facts the user reveals about themselves are persisted between sessions so
the companion feels continuous. Everything is encrypted at rest with Fernet
(AES-128-CBC + HMAC); the key lives in a local file readable only by the owner.
This is privacy hygiene for an on-device app — it is not protection against an
attacker who already has full access to the user's account.
"""

import json
import os
import re
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken

_ROOT = Path(__file__).parent.parent
_KEY_PATH = _ROOT / "companion.key"
_DATA_PATH = _ROOT / "companion_memory.enc"
_MAX_FACTS = 40

# Patterns → templates for extracting durable facts from user messages.
_EXTRACTORS = [
    (re.compile(r"\bmy name is ([A-Za-z][A-Za-z'\-]{1,30})", re.I), "Name: {}"),
    (re.compile(r"\bcall me ([A-Za-z][A-Za-z'\-]{1,30})", re.I),    "Prefers to be called {}"),
    (re.compile(r"\bi (?:really |also )?(?:like|love|enjoy) ([^.!?,;]{2,40})", re.I), "Likes {}"),
    (re.compile(r"\bi (?:really )?(?:hate|dislike|can'?t stand) ([^.!?,;]{2,40})", re.I), "Dislikes {}"),
    (re.compile(r"\bi work as (?:an? )?([^.!?,;]{2,40})", re.I), "Works as {}"),
    (re.compile(r"\bi live in ([^.!?,;]{2,40})", re.I), "Lives in {}"),
    (re.compile(r"\bi'?m from ([^.!?,;]{2,40})", re.I), "Is from {}"),
    (re.compile(r"\bi have (?:an? )?([a-z][^.!?,;]{2,40})", re.I), "Has {}"),
]


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


def _load() -> list[str]:
    if not _DATA_PATH.exists():
        return []
    try:
        raw = _fernet().decrypt(_DATA_PATH.read_bytes())
        return json.loads(raw).get("facts", [])
    except (InvalidToken, json.JSONDecodeError, ValueError):
        return []


def _save(facts: list[str]) -> None:
    blob = json.dumps({"facts": facts}).encode("utf-8")
    _DATA_PATH.write_bytes(_fernet().encrypt(blob))
    try:
        os.chmod(_DATA_PATH, 0o600)
    except OSError:
        pass


def recall() -> list[str]:
    return _load()


def remember(fact: str) -> bool:
    """Store a fact if new. Returns True if it was added."""
    fact = fact.strip()
    if not fact:
        return False
    facts = _load()
    if any(fact.lower() == f.lower() for f in facts):
        return False
    facts.append(fact)
    _save(facts[-_MAX_FACTS:])
    return True


_CLAUSE_BREAK = re.compile(r"\s+(?:and|but|because|so|while|when|since)\s+", re.I)


def _clean_value(value: str) -> str:
    """Trim a captured value at the first clause boundary, e.g. ' and '."""
    return _CLAUSE_BREAK.split(value, maxsplit=1)[0].strip().rstrip(".")


def extract_and_store(user_text: str) -> list[str]:
    """Pull durable facts from a user message and persist them."""
    added = []
    for pattern, template in _EXTRACTORS:
        m = pattern.search(user_text)
        if m:
            value = _clean_value(m.group(1))
            if not value:
                continue
            fact = template.format(value)
            if remember(fact):
                added.append(fact)
    return added


# Only the most recent facts are injected into the prompt — enough for continuity
# without ballooning the prefill (and slowing time-to-first-token) as memory grows.
_PROMPT_FACTS = 15


def as_prompt_block() -> str:
    facts = _load()[-_PROMPT_FACTS:]
    if not facts:
        return ""
    lines = "\n".join(f"- {f}" for f in facts)
    return f"\n\nThings you remember about the user:\n{lines}"


def forget_all() -> None:
    if _DATA_PATH.exists():
        _DATA_PATH.unlink()
