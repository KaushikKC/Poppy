"""Whether a finished reply is worth hearing rather than reading.

The desktop half of mobile/src/core/reply_shape.ts. Kept in step by hand rather than
generated, because it is a rule with two constants and a regex — small enough that a
generator would be more machinery than the thing it generates. The tests on both sides
use the same cases, so a drift shows up as a failure rather than as a phone that
behaves differently from the browser it was designed in.

The default is set by how the message arrived: speak to her and she speaks back, type
and she types back. This is the one refinement on top of that — a spoken "how are you"
does not deserve a four-second recording, and forcing one would teach people that
speaking is the slow way to use the app.
"""

import re

# Below this, a recording costs more than the words are worth.
#
# Measured on device: synthesis runs at roughly 0.9s of fixed per-call cost plus 46ms
# a character. Sixty characters is therefore about 3.7 seconds of waiting for something
# that can be read at a glance — the wrong trade. Past it the reply is long enough that
# hearing it is the better experience, and the wait reads as her taking a moment rather
# than the app being slow.
MIN_SPOKEN_CHARS = 60

# A greeting is a greeting at any length. "Hey, good to see you. How has your week
# been?" is seventy characters of nothing in particular. Anchored to the start and
# capped, so it only catches a reply that *opens* as a pleasantry and stays short — a
# greeting followed by something real runs past the cap and is spoken.
_OPENS_WITH_PLEASANTRY = re.compile(
    r"""^[\s"']*(?:hi|hey|hello|hiya|morning|afternoon|evening"""
    r"""|good (?:morning|afternoon|evening|to see you))\b""",
    re.IGNORECASE,
)
PLEASANTRY_MAX_CHARS = 110


def speak_it(reply: str) -> bool:
    """True when the reply should be spoken; False when it should simply be read."""
    text = (reply or "").strip()
    if not text:
        return False
    if len(text) < MIN_SPOKEN_CHARS:
        return False
    if len(text) <= PLEASANTRY_MAX_CHARS and _OPENS_WITH_PLEASANTRY.match(text):
        return False
    return True


# ── "say it out loud" ────────────────────────────────────────────────────────
#
# How the message arrived is a good default, not a rule. Someone typing at their
# desk can still want to *hear* the answer, and asking for it in the message is
# the obvious way to say so — there is no menu for it and there should not be.
#
# Two cues have to appear together: something that names voice, and something
# that makes it a request. Either alone is a false positive waiting to happen —
# "I love your voice" names voice and asks for nothing, and "can you tell me
# about Lisbon" is a request about nothing audible.
_VOICE_CUE = re.compile(
    r"(?:"
    r"\bout\s+loud\b|\baloud\b"
    # An adjective or two is allowed, because "in your sweet voice" is how people
    # actually ask, and anchoring straight to "your voice" misses most of them.
    r"|\b(?:in|with|using)\s+(?:your|ur)\s+(?:\w+\s+){0,2}voice\b"
    r"|\bvoice\s*(?:note|message|msg|memo|reply|recording)\b"
    r"|\baudio\s*(?:note|message|msg|clip|reply|recording)?\b"
    r"|\b(?:record|say)\s+(?:it|that|this)\b"
    r"|\blet\s+me\s+hear\b|\bwanna\s+hear\b|\bwant\s+to\s+hear\b"
    r")",
    re.I,
)
_ASK_CUE = re.compile(
    r"\b(?:say|tell|read|reply|replies|answer|respond|send|record|speak|talk"
    r"|can|could|would|will|please|plz|wanna|want|let|give)\b",
    re.I,
)


def wants_voice(user_text: str) -> bool:
    """True when the user asked for this reply to be spoken.

    Overrides the arrival default in both directions of the rule it refines: a
    typed message that asks to be heard gets a recording, and it skips the length
    floor too — if someone asks to hear it, "yes, obviously" is still worth
    hearing, even though it is nowhere near MIN_SPOKEN_CHARS.
    """
    text = (user_text or "").strip()
    if not text:
        return False
    return bool(_VOICE_CUE.search(text) and _ASK_CUE.search(text))
