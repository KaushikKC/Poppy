"""Emotion shaping for replies.

The companion adapts its *tone* to how the user sounds. Emotion is detected
from the voice in emotion_detect.py; this module owns the small, fast bits:
mapping the model's labels to our set and turning an emotion into a tone
instruction appended to the LLM system prompt.

Emotion is momentary (not an identity like accent), so there's no smoothing —
each utterance is shaped on its own, and anything uncertain falls back to
neutral (no tone change).
"""

NEUTRAL = "neutral"

# raw model label (superb/wav2vec2-base-superb-er) -> our canonical emotion
RAW_TO_EMOTION: dict[str, str] = {
    "neu": "neutral",
    "hap": "happy",
    "ang": "angry",
    "sad": "sad",
}

# Tone guidance appended to the system prompt. Neutral adds nothing.
EMOTION_TONE: dict[str, str] = {
    "neutral": "",
    "happy": (
        "The user sounds upbeat and happy. Warmly match their positive energy."
    ),
    "sad": (
        "The user sounds sad or low. Be especially gentle and reassuring; "
        "acknowledge how they feel before anything else, and keep a soft, "
        "unhurried tone."
    ),
    "angry": (
        "The user sounds frustrated or upset. Stay calm and validating; "
        "acknowledge their frustration without getting defensive, and help "
        "them feel heard."
    ),
}


def normalize(emotion: str | None) -> str:
    """Coerce an arbitrary emotion label to a supported one."""
    return emotion if emotion in EMOTION_TONE else NEUTRAL


def map_raw(label: str) -> str:
    """Map a detector label (neu/hap/ang/sad) to our canonical emotion."""
    return RAW_TO_EMOTION.get(label.lower(), NEUTRAL)


def tone_for(emotion: str | None) -> str:
    """Return the tone instruction for an emotion ('' for neutral/unknown)."""
    return EMOTION_TONE.get(normalize(emotion), "")
