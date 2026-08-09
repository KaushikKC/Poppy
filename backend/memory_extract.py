"""
Memory candidate extraction (POPPY_PRODUCT_PLAYBOOK §5, §3.1).

After a turn the frontend asks this module what, if anything, is worth remembering
from what the user just said. The local LLM is the primary extractor (it reads
meaning, not just keywords); the regex extractor in memory_store is the offline
fallback when the LLM path is unavailable or returns nothing usable.

Crucially this only *proposes*. Nothing is stored here — candidates go back to the
user as "Want me to remember that?" and are persisted only on Save (§3.2). Runs
off the reply's latency path (called from /memory/extract, after the turn).
"""

import json
import re

import llm
import memory_store

_CATS = memory_store.CATEGORIES

_SYSTEM = (
    "You extract durable facts about the USER from a single message, for a warm "
    "companion's long-term memory. Output ONLY a JSON array, nothing else. Each item "
    'is {"text": a short third-person fact, "category": one of '
    "profile|goals|people|ongoing|temporary}. "
    "Only include things genuinely worth remembering in future conversations: their "
    "name, stable preferences, the people in their life, their goals, and ongoing "
    "situations. Do NOT include questions, small talk, feelings about you, or generic "
    "statements. If there is nothing worth remembering, output []. "
    "Categories: profile = stable identity or preference; goals = something they want "
    "or are working toward; people = a person in their life; ongoing = a current "
    "situation like a trip or interview; temporary = a short-lived reminder. "
    "Examples:\n"
    'Message: "my name is Nina and I\'m training for a marathon" -> '
    '[{"text":"Name: Nina","category":"profile"},{"text":"Training for a marathon","category":"goals"}]\n'
    'Message: "how are you doing today?" -> []\n'
    'Message: "my sister Ava is visiting this weekend" -> '
    '[{"text":"Sister Ava is visiting this weekend","category":"people"}]'
)

_MAX_CANDIDATES = 3


def _parse(raw: str, source: str) -> list[dict]:
    """Pull a JSON array of candidates out of the model's raw text, defensively."""
    m = re.search(r"\[.*\]", raw, re.S)
    if not m:
        return []
    try:
        arr = json.loads(m.group(0))
    except (json.JSONDecodeError, ValueError):
        return []
    if not isinstance(arr, list):
        return []

    out = []
    for item in arr:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        cat = str(item.get("category") or "").strip().lower()
        if not text:
            continue
        if cat not in _CATS:
            cat = "ongoing"
        out.append({"text": text[:120], "category": cat, "why": source[:140]})
    return out


# The LLM extractor shares the single on-device model, so running it after every
# turn can make the NEXT reply wait behind it (an intermittent stall). Most turns
# ("how are you", "haha yeah") carry nothing durable, so we only spend an LLM pass
# when the message actually looks like a personal disclosure: enough words AND a
# first-person reference. Everything else uses the free regex extractor.
# Subject/possessive first person ("I", "my", "we") signals a disclosure ABOUT the
# user; object forms ("me", "myself") mostly show up in commands ("tell me a joke"),
# so they're deliberately excluded.
_FIRST_PERSON = re.compile(r"\b(i|i'?m|i'?ve|i'?d|i'?ll|my|we|we'?re|our)\b", re.I)


def _worth_llm(text: str) -> bool:
    return len(text.split()) >= 4 and bool(_FIRST_PERSON.search(text))


def _dedupe(candidates: list[dict]) -> list[dict]:
    """Drop candidates already known, of a suppressed category, or repeated."""
    import boundaries
    existing = {t.lower() for t in memory_store.recall()}
    suppressed = set(memory_store.suppressed_categories())
    seen: set[str] = set()
    result = []
    for c in candidates:
        key = c["text"].lower()
        if key in existing or key in seen or c["category"] in suppressed:
            continue
        # A subject she was told to leave alone is not offered for storage
        # either. Remembering it would mean she raises it again later.
        if boundaries.is_blocked(c["text"]):
            continue
        seen.add(key)
        result.append(c)
    return result[:_MAX_CANDIDATES]


async def propose(user_text: str) -> list[dict]:
    """Propose candidate memories from one user message (never stored here)."""
    user_text = (user_text or "").strip()
    if not user_text:
        return []

    # Cheap turns skip the LLM entirely (keeps the model free for the next reply).
    if not _worth_llm(user_text):
        return _dedupe(memory_store.regex_candidates(user_text))

    candidates: list[dict] = []
    try:
        raw = await llm.complete(user_text, _SYSTEM, max_tokens=120)
        candidates = _parse(raw, user_text)
    except Exception as e:
        print(f"[memory] LLM extraction failed, using regex fallback: {e}")

    if not candidates:
        candidates = memory_store.regex_candidates(user_text)

    return _dedupe(candidates)
