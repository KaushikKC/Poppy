"""
Spoken-reply accent → TTS voice mapping.

The companion replies in the *same accent* the user speaks in. This module owns
the accent label → concrete Kokoro voice mapping and the folding of raw detector
labels into our supported set. The detected accent (from accent_detect.py), not
the selected persona, decides the reply voice; the persona only shapes the
prompt and the avatar colors.

tts.py and ws_handler.py route through here, so the voice set can change without
touching the TTS or WebSocket layers.
"""

# accent label -> (kokoro lang_code, kokoro voice)
#   a = American English, b = British English, h = Hindi (Indian)
ACCENT_VOICES: dict[str, tuple[str, str]] = {
    "american": ("a", "af_heart"),
    "british": ("b", "bf_emma"),
    "indian": ("h", "hf_alpha"),
}

DEFAULT_ACCENT = "indian"

# The detector (dima806/english_accents_classification) knows more accents than
# we have voices for. Fold each raw label into the nearest of our three:
#   rhotic North-American -> american; non-rhotic -> british; indian -> indian.
RAW_TO_OURS: dict[str, str] = {
    "us": "american",
    "canada": "american",
    "england": "british",
    "australia": "british",
    "indian": "indian",
}


def normalize(accent: str | None) -> str:
    """Coerce an arbitrary accent label to a supported one."""
    return accent if accent in ACCENT_VOICES else DEFAULT_ACCENT


def voice_for(accent: str | None) -> tuple[str, str]:
    """Return (lang_code, voice) for the given accent label."""
    return ACCENT_VOICES[normalize(accent)]


def map_raw(label: str) -> str:
    """Map a detector label (us/england/indian/...) to one of our accents."""
    return RAW_TO_OURS.get(label.lower(), DEFAULT_ACCENT)
