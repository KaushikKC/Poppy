"""
Lightweight, fully-offline vibe suggester.

Classifies the user's conversational *register* from the STT transcript and
proposes a matching companion vibe (§2.3): a task-y, precise register suggests
`partner` (a thinking partner), a high-energy register suggests `hype`, and the
neutral baseline is `friend`. `calm` is a deliberate end-of-day mood, not a
speaking register, so it's never auto-suggested. State accumulates across turns
(a streaming EMA) so a suggestion only fires once there is enough evidence.

This is text-based and unrelated to spoken-accent detection (see accent.py for
the accent → TTS voice mapping and accent_detect.py for the audio classifier).
"""

import re

# Style signals per register. Each is a set of lowercase cue tokens / patterns.
# The register names below map to vibe keys in _score(): partner / hype / friend.
_PROFESSIONAL_WORDS = {
    "please", "regarding", "schedule", "meeting", "report", "analysis",
    "summary", "deadline", "proposal", "review", "document", "request",
    "however", "therefore", "additionally", "furthermore", "kindly",
    "appreciate", "regards", "objective", "priority", "strategy",
}
_PLAYFUL_WORDS = {
    "lol", "haha", "hehe", "omg", "lmao", "yay", "woohoo", "cool", "awesome",
    "epic", "vibes", "dude", "bro", "wanna", "gonna", "gotta", "yeah", "yep",
    "nah", "super", "totally", "literally", "fun", "love", "amazing",
}
_EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF]"
)


def _score(text: str) -> dict[str, float]:
    """Return raw style scores for a single utterance."""
    lower = text.lower()
    tokens = re.findall(r"[a-z']+", lower)
    n = max(len(tokens), 1)

    prof_hits = sum(1 for t in tokens if t in _PROFESSIONAL_WORDS)
    play_hits = sum(1 for t in tokens if t in _PLAYFUL_WORDS)

    exclaims = text.count("!")
    emojis   = len(_EMOJI_RE.findall(text))
    avg_len  = sum(len(t) for t in tokens) / n

    partner = prof_hits / n
    # longer average word length nudges toward the precise/thinking register
    if avg_len >= 5.0:
        partner += 0.05

    hype = (play_hits + exclaims + emojis * 2) / n

    # friend is the neutral baseline; it wins when neither signal is strong
    friend = 0.04

    return {"partner": partner, "hype": hype, "friend": friend}


# Human-readable reason shown on the suggestion chip, per suggestible vibe.
_REASONS = {
    "partner": "sounds like you want to think something through",
    "hype": "you're bringing energy",
    "friend": "sounds like you just want to talk",
}


class PersonaSuggester:
    """Accumulates style evidence across a session via per-persona EMA."""

    def __init__(self, alpha: float = 0.5, min_confidence: float = 0.08):
        self._alpha = alpha
        self._min_confidence = min_confidence
        self._ema = {"partner": 0.0, "hype": 0.0, "friend": 0.04}
        self._turns = 0

    def observe(self, text: str, current_persona: str) -> dict | None:
        """
        Fold a new utterance into the running estimate and, if a different
        persona clearly leads, return a suggestion dict. Otherwise None.
        """
        if not text or not text.strip():
            return None

        self._turns += 1
        scores = _score(text)
        for k, v in scores.items():
            self._ema[k] = self._alpha * v + (1 - self._alpha) * self._ema[k]

        leader = max(self._ema, key=self._ema.get)
        top = self._ema[leader]
        runner_up = sorted(self._ema.values())[-2]
        margin = top - runner_up

        # Need at least two turns, a clear leader, and a meaningful margin.
        if self._turns < 2 or leader == current_persona or margin < self._min_confidence:
            return None

        return {
            "persona": leader,
            "confidence": round(min(margin * 4, 1.0), 2),
            "reason": _REASONS.get(leader, "this might fit you better"),
        }

    def reset(self) -> None:
        self._ema = {"partner": 0.0, "hype": 0.0, "friend": 0.04}
        self._turns = 0


# Single-user local app → one module-level suggester is sufficient.
_suggester = PersonaSuggester()


def observe(text: str, current_persona: str) -> dict | None:
    return _suggester.observe(text, current_persona)


def reset() -> None:
    _suggester.reset()
