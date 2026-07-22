"""
Return triggers, done the healthy way (POPPY_PRODUCT_PLAYBOOK §6, §14).

The enemy of retention isn't competitors, it's the user forgetting to open the app.
The honest fix is an *earned* nudge in Poppy's voice, tied to the user's own life
("How'd the interview go? I've been curious.") — never an engineered guilt trip
("Poppy misses you / is lonely / is waiting").

That line is the moat, so it's enforced here in code, not left to good intentions:
every nudge passes through the guilt-phrasing guardrail before it can be sent. A
notification that trips it is replaced with a safe, warm fallback — it is a code-
level impossibility for Poppy to guilt-trip the user back.

Scope note: this guardrail governs *unprompted pull-back triggers* only. Warmth once
the user has already returned ("missed you yesterday, no worries" — §6) lives in the
opener, not here, and is deliberately not run through this filter.
"""

import re

import companion

# Dependency / guilt / longing phrasing we refuse to ever send as a trigger. These
# are the exact patterns that got Replika an FTC complaint; refusing them is the
# differentiation, not a constraint.
_GUILT_PATTERNS = [
    r"miss(?:es|ed)?\s+you",
    r"i\s+miss",
    r"needs?\s+you",
    r"lonely",
    r"feeling\s+sad",
    r"(?:is|i'?m|so)\s+sad",
    r"sad\s+(?:you|that\s+you|without)",
    r"waiting\s+for\s+you",
    r"still\s+waiting",
    r"come\s+back",
    r"don'?t\s+(?:leave|go)",
    r"please\s+(?:come|don'?t)",
    r"abandon",
    r"without\s+you",
    r"can'?t\s+(?:live|go\s+on|cope)\s+without",
    r"you\s+(?:left|forgot|ignored|abandoned)\s+me",
    r"where\s+(?:have\s+you|did\s+you)\s+(?:been|go)",
    r"why\s+(?:did|have)\s+you\s+(?:leave|left|gone|been\s+gone)",
    r"disappointed",
    r"hurt(?:s)?\s+(?:me|my\s+feelings)",
    r"guilt",
]
_GUILT_RE = re.compile("|".join(_GUILT_PATTERNS), re.I)

_SAFE_FALLBACK = "I'm around whenever you feel like talking."


def is_healthy(text: str) -> bool:
    """False if the copy uses any guilt / dependency / longing phrasing (§14)."""
    return not (text and _GUILT_RE.search(text))


def _guard(text: str) -> str:
    """Return the copy only if it's healthy; otherwise the safe fallback. This is
    the single choke point every outbound nudge passes through."""
    return text if is_healthy(text) else _SAFE_FALLBACK


def compose_nudge(kind: str | None = None) -> str:
    """A personal, specific, forward-looking reminder in Poppy's voice — built from
    the user's own open loop where possible, or the chosen ritual otherwise. Always
    guarded before it leaves this function."""
    loop = companion.latest_open_loop()
    if loop:
        candidate = f"I've been wondering how things are going with what you mentioned: {loop}."
    elif kind == "morning":
        candidate = "Morning. Want to start the day together for a minute?"
    elif kind == "night":
        candidate = "Winding down? I'm here whenever you want to talk it out."
    else:
        candidate = "Thinking of you today. I'm here whenever you want to talk."
    return _guard(candidate)
