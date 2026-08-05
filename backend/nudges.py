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


# §4.8 — the escalation ladder, ported without the owl's guilt. Duolingo's
# passive-aggression works because it's a meme about a cartoon bird and the stakes
# are language lessons. Our users have told this thing real things, so the same
# tone reads as emotional coercion rather than a joke.
#
# The day-5 line is the honest re-engagement play and it genuinely outperforms
# escalation: "I'll stop nudging" is the only message in the category that signals
# the app isn't desperate. Then we actually stop, because one real hook at day 30
# is worth more than twenty ignored pings.
_LADDER = {
    1: None,   # the open loop itself carries day 1; never mention the streak
    2: "still time today if you want it.",
    3: "no pressure. just here when you want to talk.",
    5: "I'll stop nudging now. you know where I am.",
}
LADDER_SILENCE_DAY = 7


def ladder_line() -> str | None:
    """Where we are on the ladder, or None to fall through to the open loop.

    Returns "" to mean *say nothing at all* (§6: silence is a feature), which is
    what happens from day 7 onward.
    """
    days = companion.days_since_last_call()
    if days is None or days <= 1:
        return None
    if days >= LADDER_SILENCE_DAY:
        return ""
    line = None
    for threshold in sorted(_LADDER):
        if days >= threshold:
            line = _LADDER[threshold]
    if line is None:
        return None
    # The streak is only ever mentioned as something still available, never as
    # something about to be lost.
    import streak
    current = streak.status().get("current", 0)
    if days == 2 and current > 1:
        return f"{current} days. one call keeps it going, even a short one."
    return line


def compose_nudge(kind: str | None = None) -> str:
    """A personal, specific, forward-looking reminder in Poppy's voice.

    RETENTION_ENGINE §1.4 / §6: **we never write a notification, we surface the
    open loop.** The hook was already authored in her voice at the end of the last
    call, so it is sent verbatim rather than wrapped in a reminder sentence —
    wrapping it turns her line into an app notice, which is the thing that gets
    muted. The ritual lines below are the only fallback, and they fire only
    because the user set that time themselves.

    After a few missed days the §4.8 ladder takes over, and from day 7 this
    returns **""** meaning send nothing at all. Callers must treat empty as
    silence rather than as a message.

    Always guarded before it leaves this function.
    """
    ladder = ladder_line()
    loop = companion.latest_open_loop()
    if ladder is not None:
        candidate = ladder
    elif loop:
        candidate = loop
    elif kind == "morning":
        candidate = "Morning. Want to start the day together for a minute?"
    elif kind == "night":
        candidate = "Winding down? I'm here whenever you want to talk it out."
    else:
        candidate = "Thinking of you today. I'm here whenever you want to talk."
    return _guard(candidate)
