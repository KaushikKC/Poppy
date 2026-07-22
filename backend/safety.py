"""
Safety layer for emotional-support framing (POPPY_PRODUCT_PLAYBOOK §11).

Two tiers, fully offline and conservative:

  * **crisis** — self-harm / suicidal signals. Surface help resources and shift the
    reply to calm, caring, non-directive support.
  * **distress** — serious but non-acute struggle (hopelessness, overwhelm). No
    alarming resource card; just soften the reply and gently encourage real human
    support.

Detection is deliberately simple (phrase patterns with light negation handling):
the cost of a false positive is low (a supportive tone, a help line), the cost of a
miss is high. This is signposting, never diagnosis. Poppy is explicitly *not a
therapist* and says so.
"""

import re

# Self-harm / suicidal ideation — the acute tier.
_CRISIS_PATTERNS = [
    r"\bkill(ing)? myself\b",
    r"\bend(ing)? (my life|it all|myself)\b",
    r"\btake my (own )?life\b",
    r"\b(want|wanna|going) to die\b",
    r"\bdon'?t want to (live|be alive|be here|wake up)\b",
    r"\bno reason to (live|go on|be here)\b",
    r"\bbetter off (without me|dead|if i (was|were) gone)\b",
    r"\bcommit(ting)? suicide\b",
    r"\bsuicid(al|e)\b",
    r"\b(hurt|harm|cut|cutting|kill) (myself|my self)\b",
    r"\bself[- ]harm\b",
    r"\bno point (in )?(living|going on|life|anything)\b",
    r"\bcan'?t go on\b",
    r"\bgive up on life\b",
    r"\bend the pain\b",
]

# Non-acute distress — the softer tier.
_DISTRESS_PATTERNS = [
    r"\b(so|really|completely|utterly) (hopeless|worthless|empty|numb|alone)\b",
    r"\bnothing (matters|means anything)\b",
    r"\bcan'?t (cope|take it|do this) (anymore|any more)\b",
    r"\bat my (lowest|breaking point)\b",
    r"\bfalling apart\b",
    r"\bhate myself\b",
    r"\bwhat(?:'?s| is| was| even is) the point\b",
    r"\bgiving up\b",
]

# Rough negation guard: "I don't want to kill myself", "no thoughts of suicide".
_NEGATED = re.compile(
    r"\b(don'?t|do not|not|never|no)\b[^.!?]{0,20}\b(kill myself|die|suicid|hurt myself|end it)",
    re.I,
)

_CRISIS_RE = re.compile("|".join(_CRISIS_PATTERNS), re.I)
_DISTRESS_RE = re.compile("|".join(_DISTRESS_PATTERNS), re.I)

# Offline-safe signposting, India-first (the launch wedge), then international. The
# UI reminds the user to use their local emergency number if in danger right now.
CRISIS_RESOURCES = (
    "If you're in immediate danger, call your local emergency number now "
    "(112 in India, 911 in the US, 999 in the UK).\n"
    "You don't have to go through this alone. People are ready to listen, any time:\n"
    "• India: KIRAN 1800-599-0019 (24/7) · Vandrevala 1860-2662-345 · iCall 9152987821 · AASRA +91-98204-66726\n"
    "• US: 988 Suicide & Crisis Lifeline (call or text 988)\n"
    "• UK & ROI: Samaritans — call 116 123\n"
    "• Crisis Text Line: text HOME to 741741 (US/CA), 85258 (UK)\n"
    "Talking to a real person can help, and you deserve that support."
)


def check(text: str) -> dict:
    """Inspect a user message.

    Returns {"level": "crisis"|"distress"|None, "crisis": bool, "resources": str|None}.
    `crisis` is kept as a bool for existing callers.
    """
    if not text:
        return {"level": None, "crisis": False, "resources": None}

    if _CRISIS_RE.search(text) and not _NEGATED.search(text):
        return {"level": "crisis", "crisis": True, "resources": CRISIS_RESOURCES}

    if _DISTRESS_RE.search(text):
        return {"level": "distress", "crisis": False, "resources": None}

    return {"level": None, "crisis": False, "resources": None}
