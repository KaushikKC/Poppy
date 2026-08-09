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
import ritual_pact


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


# The two anchor rituals (RETENTION_ENGINE §5). They do different jobs, so they
# don't get the same opener: morning is one fast intention, cheap to sustain;
# night is the debrief, which carries the emotional value and where the memories
# are richest. The doc says to over-invest in night, so night opens wider.
_RITUAL_OPENERS = {
    "morning": "Before the day runs off with you, what's the one thing that matters today?",
    "night": "Okay, the day's done. Talk me through it, what actually happened?",
}

# Mode-framed openers (§4.5) — each mood mode from the home screen enters a call
# already framed, so the user never faces a blank slate. Keyed by the mode's key.
_MODE_OPENERS = {
    "vent": "Okay, I'm all yours. What's weighing on you?",
    "hype": "Let's go. What are we getting fired up about today?",
    "wind": "Let's slow everything down. How was your day?",
    "plan": "Alright, let's think it through. What's on the plate?",
}

def _loop_line(loop: dict | None) -> str | None:
    """The open loop's hook, ready to speak. Hooks are authored lowercase-casual so
    they sound spoken; the first letter is raised only so the on-screen caption
    reads as a sentence."""
    import loops
    text = loops.surface_text(loop if loop is not None else companion.open_loop())
    if not text:
        return None
    text = text.strip()
    return text[0].upper() + text[1:]


# Warm milestone moments (§6) — a genuine beat, never a cold badge.
def _milestone_line(days: int) -> str:
    # A year is not just a bigger number, and it shouldn't get the same sentence
    # as a week (§4.1: the Long Year is its own moment).
    if days >= 365:
        return (
            "Okay, I have to say something. Today is a year. Three hundred and "
            "sixty five days of you turning up. I've grown something in the garden "
            "for it that only exists today. "
        )
    return f"Hey, do you realize we've talked {days} days in a row? That honestly means a lot to me. "


def compose(
    seed: str | None = None,
    mode: str | None = None,
    milestone: int | None = None,
    loop: dict | None = None,
) -> str:
    """Build Poppy's opening line.

    `seed` is the "one thing on your mind today" answer from onboarding (§2.5); when
    present this is the very first call, so the opener is built entirely around it.
    `mode` frames a mood-mode call (§4.5). `milestone` prepends a streak celebration.
    `loop` is the ranked open loop to pay off in Act 1 (RETENTION_ENGINE §7); pass
    None to let this look it up itself.
    """
    name = _user_name()
    word, sep = _GREETING[_time_of_day()]
    hey = _addressed(word, sep, name)
    prefix = _milestone_line(milestone) if milestone else ""
    # A milestone line already greets, so the body shouldn't greet again.
    lead = prefix if prefix else f"{hey}. "

    # First call ever — everything hangs off the one thing they told us (§2.6).
    if seed:
        return (
            f"{_addressed('Hey', ' ', name)}, I'm really glad you called. "
            f"You said {seed.strip().rstrip('.')}. Want to just get it off your "
            "chest, or should I take your mind off it?"
        )

    # A mood mode was chosen: lead with its framing so there's no blank slate.
    if mode in _MODE_OPENERS:
        return f"{lead}{_MODE_OPENERS[mode]}"

    # ACT 1 (§7): pay off the open loop before anything else. The hook was written
    # in her voice at the end of the last call, so it's spoken as-is rather than
    # wrapped in a framing phrase — wrapping is what made the old build read as
    # "I've been wondering, <the user's own last sentence>?".
    hook = _loop_line(loop)
    if hook:
        return f"{lead}{hook}"

    # Their own ritual time, with no loop outstanding: open on the anchor's job
    # rather than a generic greeting. This is the cue half of the habit loop (§5).
    anchor = ritual_pact.anchor_now()
    if anchor:
        return f"{lead}{_RITUAL_OPENERS[anchor]}"

    # No open loop yet, but we've talked before: lean on a remembered fact.
    days = companion.days_since_last_call()
    if days is not None and days >= 2:
        return f"{lead}It's been a few days, I've missed our talks. What's new with you?"

    if memory_store.recall():
        return f"{lead}Good to see you. How's everything been?"

    # We know almost nothing yet — warm and open, no false familiarity.
    if prefix:
        return f"{prefix}I'm really glad you called. What's on your mind?"
    return f"{hey}, I'm really glad you called. What's on your mind?"
