"""Voice-gender labels for the spoken reply.

Like accent, gender is treated as a stable identity: it picks the male vs female
Kokoro voice within the detected accent (see accent.voice_for) and drives the
avatar. Detection itself lives in gender_detect.py (pitch-based, offline).
"""

MALE = "male"
FEMALE = "female"
DEFAULT_GENDER = FEMALE


def normalize(gender: str | None) -> str:
    """Coerce an arbitrary gender label to a supported one."""
    return gender if gender in (MALE, FEMALE) else DEFAULT_GENDER
