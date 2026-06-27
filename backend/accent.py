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

# accent label -> kokoro lang_code (a = American, b = British, h = Hindi/Indian)
ACCENT_LANG: dict[str, str] = {
    "american": "a",
    "british": "b",
    "indian": "h",
}

# (accent, gender) -> kokoro voice. The detected accent picks the language and
# the detected gender picks the male vs female voice within it.
VOICES: dict[tuple[str, str], str] = {
    ("american", "female"): "af_heart",
    ("american", "male"):   "am_michael",
    ("british", "female"):  "bf_emma",
    ("british", "male"):    "bm_george",
    ("indian", "female"):   "hf_alpha",
    ("indian", "male"):     "hm_omega",
}

DEFAULT_ACCENT = "indian"
DEFAULT_GENDER = "female"

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
    return accent if accent in ACCENT_LANG else DEFAULT_ACCENT


def voice_for(accent: str | None, gender: str | None = None) -> tuple[str, str]:
    """Return (lang_code, voice) for the given accent + gender labels."""
    a = normalize(accent)
    g = gender if gender in ("male", "female") else DEFAULT_GENDER
    return ACCENT_LANG[a], VOICES[(a, g)]


def map_raw(label: str) -> str:
    """Map a detector label (us/england/indian/...) to one of our accents."""
    return RAW_TO_OURS.get(label.lower(), DEFAULT_ACCENT)
