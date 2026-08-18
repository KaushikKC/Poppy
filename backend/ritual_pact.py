"""
The ritual pact (POPPY_RETENTION_ENGINE §5, §8 day 2).

Loops drive *return*; rituals drive *automaticity*. The engine doc calls the
ritual the higher-retention half and the cheaper one, and `metrics.ritual_set` is
already the strongest single retention predictor the app logs. The whole potency
of the mechanic, though, is in *how* it gets set:

    "I want to be a part of your day, not an interruption in it.
     When's actually good, right after work, or right before you sleep?"

The user says it out loud, and she repeats it back as a commitment. That is an
implementation intention (Gollwitzer, §2) formed verbally in the voice of someone
they like, which is roughly the highest-conversion form of habit installation
available, and it measurably beats a goal the app assigned. A time tapped into a
settings form is not the same mechanic at all.

**Why this is a prompt block and a parser rather than a scripted modal.** The
codebase can already make her say a fixed line (`speakLine`), so a scripted
question was the obvious build. But a modal that interrogates the user is exactly
the "form" this is supposed to replace, and it would land mid sign-off where §7
has already assigned the beat to the open-loop hook. Instead she is *told to ask*
when it fits, in her own words, and the answer is read back out of the transcript
at call close. The settings editor stays as the edit path.

Parsing is deterministic rather than another LLM pass: times are structured, the
phrasings are few, and a wrong ritual time is a daily wrong notification.
"""

import re
from datetime import datetime

import companion

# §8 puts the pact on day 2: late enough that she isn't asking a stranger, early
# enough to install the habit inside week 1.
_MIN_CALLS = 2
# Asked at most once a day, and never more than this in total. A pact declined
# three times is an answer, and §6's "silence is a feature" applies to asking too.
_MAX_ASKS = 3

# The two anchors (§5). Morning is the cheap 60-second intention; night is the
# debrief, which is where the memories are richest and the retention lives.
_DEFAULT_TIME = {"morning": "08:00", "night": "21:30"}

# Plurals matter: "nights work for me" is how people actually answer, and \bnight\b
# does not match "nights" because the s blocks the word boundary. Without the s? the
# whole answer parsed as nothing and she asked again next call.
_MORNING_CUES = re.compile(
    r"\b(mornings?|wake up|waking up|before work|first thing|start of (?:the|my) day|"
    r"on (?:the|my) commute|breakfast)\b", re.I,
)
_NIGHT_CUES = re.compile(
    r"\b(nights?|evenings?|before bed|bed ?time|before i sleep|before sleeping|"
    r"after work|end of (?:the|my) day|wind ?down|dinner|once i'?m home|"
    r"when i get (?:home|back))\b", re.I,
)
_DECLINE_CUES = re.compile(
    r"\b(not (?:now|really|right now)|maybe later|another time|no thanks?|"
    r"i'?d rather not|rather not|skip (?:it|that)|don'?t (?:remind|set)|"
    r"no schedule|not sure|dunno|i don'?t know)\b", re.I,
)

# A clock time. Bare numbers are ignored unless something marks them as a time
# ("at 9", "around 9", "9pm", "9:30") so "I have 3 meetings" can't set a ritual.
_TIME_RE = re.compile(
    r"(?:\b(?:at|around|about|by|before)\s+)?\b(\d{1,2})(?::(\d{2}))?\s*"
    r"(a\.?m\.?|p\.?m\.?|o'?clock)?",
    re.I,
)
_WORD_HOUR = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
}
_WORD_TIME_RE = re.compile(
    r"\b(" + "|".join(_WORD_HOUR) + r")\s*(?:o'?clock)?\s*"
    r"(?:(thirty|fifteen|forty ?five)\s*)?(a\.?m\.?|p\.?m\.?|in the morning|"
    r"at night|in the evening|tonight)?\b",
    re.I,
)
_WORD_MINUTE = {"thirty": 30, "fifteen": 15, "fortyfive": 45, "forty five": 45}


def is_due(profile: dict | None = None) -> bool:
    """Should she raise the pact in this call?"""
    p = profile or companion.profile()
    if not p.get("onboarded") or p.get("ritual_kind"):
        return False
    if p.get("ritual_pact_declined"):
        return False
    if p.get("total_calls", 0) < _MIN_CALLS:
        return False
    if p.get("ritual_pact_asks", 0) >= _MAX_ASKS:
        return False
    return p.get("ritual_pact_asked_on") != datetime.now().date().isoformat()


def mark_asked() -> None:
    """Record that she raised it, so it's at most once a day and gives up after
    a few tries rather than asking every call forever."""
    p = companion.profile()
    companion.update(
        ritual_pact_asked_on=datetime.now().date().isoformat(),
        ritual_pact_asks=p.get("ritual_pact_asks", 0) + 1,
    )


# The call turn from which she may raise it. Not the opening turn, which belongs
# to the loop payoff (§7 Act 1), and not so late that the user has hung up.
ASK_FROM_TURN = 2


def as_prompt_block() -> str:
    """The instruction that makes her ask.

    Phrased as a mandatory, positioned instruction rather than an invitation.
    "Raise it when it fits naturally" reads to a small model as permission to
    skip, and measured that way it asked in 1 call out of 3. Telling it where the
    question goes is the same fix that worked for the disclosure block.

    Two things are non-negotiable: she asks for a *time*, and she says it back.
    The repeat-back is the commitment, and without it this is just a question.
    """
    return (
        "\n\nIMPORTANT, do this in this reply: after you respond to what they said, "
        "END your reply by asking when they would like you to expect them each day. "
        "Offer the two options out loud, right after work, or right before they "
        "sleep. Say you want to be part of their day rather than an interruption in "
        "it. Ask it as a real question and stop there, do not ask anything else. "
        "If they answer with a time, say that time back to them as a plan the two "
        "of you just made. If they would rather not pick one, let it go warmly."
    )


def _clamp(hour: int, minute: int, pm: str | None, kind_hint: str | None) -> str | None:
    if not 0 <= minute < 60:
        return None
    meridiem = (pm or "").lower().replace(".", "").replace("'", "")
    if meridiem.startswith("p") or meridiem in ("at night", "in the evening", "tonight"):
        if hour < 12:
            hour += 12
    elif meridiem.startswith("a") or meridiem == "in the morning":
        if hour == 12:
            hour = 0
    elif meridiem == "oclock" or not meridiem:
        # No meridiem given. A bare 1-7 said about the evening means pm; the
        # anchor they picked disambiguates better than any default could.
        if kind_hint == "night" and hour < 12:
            hour += 12
        elif kind_hint == "morning" and hour == 12:
            hour = 0
    if not 0 <= hour < 24:
        return None
    return f"{hour:02d}:{minute:02d}"


def _extract_time(text: str, kind_hint: str | None) -> str | None:
    m = _WORD_TIME_RE.search(text)
    if m and (m.group(3) or kind_hint):
        hour = _WORD_HOUR[m.group(1).lower()]
        minute = _WORD_MINUTE.get((m.group(2) or "").lower().replace(" ", ""), 0)
        got = _clamp(hour, minute, m.group(3), kind_hint)
        if got:
            return got

    for m in _TIME_RE.finditer(text):
        hour_s, minute_s, mer = m.group(1), m.group(2), m.group(3)
        # Reject a bare number with no clock marker at all: it's a quantity.
        if not minute_s and not mer and not m.group(0).strip()[0].isalpha():
            continue
        got = _clamp(int(hour_s), int(minute_s or 0), mer, kind_hint)
        if got:
            return got
    return None


def parse(text: str) -> dict | None:
    """Read a spoken answer into a ritual, or None if they didn't commit to one.

    Returns `{"kind", "time"}`, or `{"declined": True}` when they said no. The
    distinction matters: a decline stops her asking, an unparsed answer doesn't.
    """
    text = (text or "").strip()
    if not text:
        return None
    if _DECLINE_CUES.search(text):
        return {"declined": True}

    kind = None
    if _NIGHT_CUES.search(text):
        kind = "night"
    elif _MORNING_CUES.search(text):
        kind = "morning"

    time_str = _extract_time(text, kind)
    if not kind and time_str:
        # A bare time still tells us which anchor they mean. The small hours count
        # as night, not morning: someone who says "half twelve" means the
        # wind-down before they sleep, and greeting that with "what matters today?"
        # would be the wrong ritual entirely.
        hour = int(time_str[:2])
        kind = "morning" if 5 <= hour < 12 else "night"
    if not kind:
        return None
    return {"kind": kind, "time": time_str or _DEFAULT_TIME[kind]}


def parse_from_turns(turns: list[dict]) -> dict | None:
    """Find the pact answer in the call's user turns, latest first.

    Latest wins so a correction ("actually make it ten") beats the first guess.
    """
    for turn in reversed([t for t in (turns or []) if t.get("role") == "user"]):
        got = parse(str(turn.get("content") or ""))
        if got:
            return got
    return None


# How close to the chosen time still counts as "this is the ritual call". Wide
# enough that a habit doesn't need a stopwatch, narrow enough that a 3pm call
# isn't greeted as a wind-down.
_ANCHOR_WINDOW_MINUTES = 150

# §1.2 type 5, the ritual loop: the habit itself is the unfinished thing. It gets
# the lowest base strength in the table, so the conversational loop always takes
# the one visible slot (§4.7) and this just sits underneath holding the cadence.
_RITUAL_LOOP = {
    "morning": "same time tomorrow morning? I'll be here.",
    "night": "same time tomorrow night? I'll be here.",
}


def anchor_now() -> str | None:
    """The anchor whose window we're inside right now, if any."""
    p = companion.profile()
    kind, t = p.get("ritual_kind"), p.get("ritual_time")
    if not kind or not t:
        return None
    try:
        hh, mm = (int(x) for x in t.split(":"))
    except (ValueError, AttributeError):
        return None
    now = datetime.now()
    delta = abs((now.hour * 60 + now.minute) - (hh * 60 + mm))
    delta = min(delta, 24 * 60 - delta)  # wrap around midnight
    return kind if delta <= _ANCHOR_WINDOW_MINUTES else None


def closing_loop(kind: str | None = None) -> str | None:
    """The ritual loop to plant when a call lands on its anchor (§5).

    §5 describes two anchors holding each other's thread: the night call plants
    the morning's loop and back again. The profile carries a single chosen anchor
    today, so this reinforces the next occurrence of theirs rather than a second
    one they never asked for. When a second anchor exists, this is where the
    complementary hook goes.
    """
    kind = kind or anchor_now()
    return _RITUAL_LOOP.get(kind) if kind else None


def confirm_line(kind: str, time_str: str) -> str:
    """What the UI shows once the pact lands. She has already said it out loud in
    the call; this is the receipt, not the moment."""
    hh, mm = (int(x) for x in time_str.split(":"))
    suffix = "am" if hh < 12 else "pm"
    hour12 = hh % 12 or 12
    clock = f"{hour12}:{mm:02d}{suffix}" if mm else f"{hour12}{suffix}"
    when = "mornings" if kind == "morning" else "nights"
    return f"It's a plan. {when.capitalize()} at {clock}."
