"""
"She speaks first" — the opening line Poppy says the instant a call connects
(POPPY_PRODUCT_PLAYBOOK §1.3 / §4). This is the moment that decides retention: it
has to feel like she was waiting and already knows them a little, never a generic
"how can I help?".

The line is composed, not canned — from the time of day, her name and theirs, how
long it's been since they last called, and the forward hook she left last time (an
open loop). It's deterministic and instant so it's ready the moment audio opens;
an LLM-polish pass can be layered on later without changing callers.
"""

import re
from datetime import datetime

import companion
import memory_store


def _time_of_day() -> str:
    h = datetime.now().hour
    if h < 5:
        return "late"
    if h < 12:
        return "morning"
    if h < 17:
        return "afternoon"
    if h < 22:
        return "evening"
    return "late"


# Greeting word by time of day, plus whether a name attaches with a comma
# ("Morning, Nova") or a space ("Hey Nova") — so it reads the way it's spoken.
_GREETING = {
    "morning": ("Morning", ", "),
    "afternoon": ("Hey", " "),
    "evening": ("Hey", " "),
    "late": ("Hey", " "),
}


def _user_name() -> str | None:
    """Pull the user's name from memory, if they've shared it."""
    for fact in memory_store.recall():
        m = re.match(r"(?:Name|Prefers to be called):?\s*(.+)", fact, re.I)
        if m:
            return m.group(1).strip().rstrip(".")
    return None


def _addressed(word: str, sep: str, name: str | None) -> str:
    return f"{word}{sep}{name}" if name else word


def compose(seed: str | None = None) -> str:
    """Build Poppy's opening line.

    `seed` is the "one thing on your mind today" answer from onboarding (§2.5); when
    present this is the very first call, so the opener is built entirely around it.
    """
    name = _user_name()
    word, sep = _GREETING[_time_of_day()]
    hey = _addressed(word, sep, name)

    # First call ever — everything hangs off the one thing they told us (§2.6).
    if seed:
        return (
            f"{_addressed('Hey', ' ', name)}, I'm really glad you called. "
            f"You said {seed.strip().rstrip('.')}. Want to just get it off your "
            "chest, or should I take your mind off it?"
        )

    # Returning call: close the open loop if there is one — the goosebump moment.
    loop = companion.latest_open_loop()
    if loop:
        return f"{hey}. I've been wondering, {loop.strip().rstrip('.')}?"

    # No open loop yet, but we've talked before: lean on a remembered fact.
    days = companion.days_since_last_call()
    if days is not None and days >= 2:
        return f"{hey}. It's been a few days, I've missed our talks. What's new with you?"

    if memory_store.recall():
        return f"{hey}. Good to see you. How's everything been?"

    # We know almost nothing yet — warm and open, no false familiarity.
    return f"{hey}, I'm really glad you called. What's on your mind?"
