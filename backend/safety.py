"""
Safety layer for emotional-support framing.

Detects acute-distress / crisis signals in user text and returns signposting
resources. Fully offline and conservative: it never tries to diagnose, only to
recognise high-risk language so the app can respond supportively and surface
help lines. Detection is intentionally simple (phrase patterns) — the cost of a
false positive (showing a help line) is low; the cost of a miss is high.
"""

import re

# Phrases that strongly indicate self-harm / suicidal ideation.
_CRISIS_PATTERNS = [
    r"\bkill myself\b",
    r"\bkilling myself\b",
    r"\bend(ing)? (my|it all|my life)\b",
    r"\btake my (own )?life\b",
    r"\bwant to die\b",
    r"\bwanna die\b",
    r"\bdon'?t want to (live|be alive|be here)\b",
    r"\bno reason to live\b",
    r"\bbetter off without me\b",
    r"\bcommit suicide\b",
    r"\bsuicidal\b",
    r"\bhurt myself\b",
    r"\bharm myself\b",
    r"\bself[- ]harm\b",
    r"\bcut(ting)? myself\b",
    r"\bno point (in )?(living|going on)\b",
    r"\bcan'?t go on\b",
    r"\bgive up on life\b",
]

_CRISIS_RE = re.compile("|".join(_CRISIS_PATTERNS), re.IGNORECASE)

# Offline-safe signposting. These are stable, widely-published lines; the UI
# notes that the user should use their local emergency number if in danger now.
CRISIS_RESOURCES = (
    "If you're in immediate danger, please call your local emergency number "
    "(911 in the US, 112 in the EU, 999 in the UK).\n"
    "• US: 988 Suicide & Crisis Lifeline (call or text 988)\n"
    "• UK & ROI: Samaritans — call 116 123\n"
    "• Crisis Text Line: text HOME to 741741 (US/CA), 85258 (UK)\n"
    "You deserve support, and talking to someone can help."
)


def check(text: str) -> dict:
    """
    Inspect a user message.
    Returns {"crisis": bool, "resources": str | None}.
    """
    if text and _CRISIS_RE.search(text):
        return {"crisis": True, "resources": CRISIS_RESOURCES}
    return {"crisis": False, "resources": None}
