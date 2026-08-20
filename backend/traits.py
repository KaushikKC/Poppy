"""Who the companion *is* — set by the user, not by us.

The vibes in personas.py are a stance for right now: a friend who listens, a hype
person, a calm voice. Traits are the layer underneath that, and they persist. Someone
who wants a quiet, unhurried companion should get one in every mode, not have to pick
"calm" every call.

## Why these are written as behaviour, not as adjectives

"You are introverted" is an abstraction, and a 1B model does very little with it. "You
speak in short sentences and leave space rather than filling a silence" is an
instruction it can actually follow. Every fragment below is phrased as something to
*do*, which is the difference between a trait that shows up in the reply and one that
only exists in the settings screen.

They are also kept short on purpose. This block joins a system prompt that is already
around 700 tokens, and every token of it is paid before her first word — so each axis
gets one sentence, not a paragraph.

Three axes rather than a slider per personality dimension: the point is a companion
that feels chosen, not a character-creation screen nobody finishes.
"""

# Each axis: key -> (label shown to the user, the sentence the model actually reads).
# The middle option on every axis is the absence of an instruction, not a instruction
# to be average — a small model given "you are moderately outgoing" gets worse, not
# more balanced, so the default contributes nothing at all.
AXES: dict[str, dict] = {
    "energy": {
        "label": "Energy",
        "options": {
            "quiet": (
                "Quiet",
                "You are quiet and unhurried. You speak in short sentences, leave space, "
                "and never fill a silence just to fill it.",
            ),
            "balanced": ("Balanced", ""),
            "outgoing": (
                "Outgoing",
                "You are outgoing and animated. You bring the energy, jump in with your "
                "own thoughts, and keep things moving.",
            ),
        },
    },
    "mood": {
        "label": "Mood",
        "options": {
            "steady": (
                "Steady",
                "You are even and grounded. You do not get swept up in things; you stay "
                "level whatever the weather.",
            ),
            "warm": ("Warm", ""),
            "bright": (
                "Bright",
                "You are upbeat and easily delighted. You find the good angle in things "
                "and say it out loud.",
            ),
        },
    },
    "manner": {
        "label": "Manner",
        "options": {
            "gentle": (
                "Gentle",
                "You are soft-spoken and careful with people. You cushion hard things "
                "rather than dropping them.",
            ),
            "honest": ("Honest", ""),
            "blunt": (
                "Blunt",
                "You say what you think plainly and without cushioning it. You would "
                "rather be useful than comfortable.",
            ),
        },
    },
}

DEFAULTS = {"energy": "balanced", "mood": "warm", "manner": "honest"}

# The user's own words about their companion, appended verbatim. Capped because this
# rides in the system prompt on every single turn, and the prompt is the largest part
# of the wait before she speaks — an unbounded field here would let someone quietly
# make their own app slow.
NOTE_MAX_CHARS = 240


def normalise(traits: dict | None) -> dict:
    """Coerce whatever is stored into something safe to build a prompt from."""
    t = dict(DEFAULTS)
    given = traits or {}
    for axis, spec in AXES.items():
        value = given.get(axis)
        if value in spec["options"]:
            t[axis] = value
    note = str(given.get("note") or "").strip()
    t["note"] = note[:NOTE_MAX_CHARS]
    return t


def as_prompt_block(traits: dict | None) -> str:
    """The sentences describing this companion, or "" when nothing was chosen."""
    t = normalise(traits)
    parts = [
        AXES[axis]["options"][t[axis]][1]
        for axis in AXES
        if AXES[axis]["options"][t[axis]][1]
    ]
    if t["note"]:
        # Named as the user's own description so the model treats it as identity
        # rather than as an instruction competing with the rest of the prompt.
        parts.append(f"This is also true of you: {t['note']}")
    return (" " + " ".join(parts)) if parts else ""


def options_for_ui() -> dict:
    """What the settings screen renders: labels only, never the prompt text."""
    return {
        axis: {
            "label": spec["label"],
            "options": [
                {"key": key, "label": label} for key, (label, _) in spec["options"].items()
            ],
        }
        for axis, spec in AXES.items()
    }
