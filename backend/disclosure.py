"""
Reciprocal self-disclosure (POPPY_RETENTION_ENGINE §2, top of the table).

Aron's work on escalating mutual disclosure is the fastest known route to felt
intimacy, and the engine doc names it the #1 accelerator in the whole plan: *she
goes first, always*. Competitors' companions are infinitely available but never
vulnerable, so nobody in the category does this.

**The constraint that shapes this entire module.** `characters._core` promises the
user she will never pretend to be human or invent a life, and `personas` calls
silent personality drift the #1 trust-killer in the category. A companion who
manufactures a sister, a commute and a bad day to seem relatable is running the
exact dishonesty this product sells against — and the moment the user works out
the childhood memory was generated, the accumulated trust is gone.

So disclosure here is real, not fabricated. There is plenty an AI can honestly go
first with: what she noticed, what she's curious about, an opinion she'll defend,
something she finds hard, something she got wrong, what she has come to think
about *this* person. That is genuine self-revelation with nothing invented, and
it reads as more intimate than a manufactured anecdote precisely because it
couldn't have come from anyone else.

The depth escalates with the relationship, which is the mechanism — a fixed level
of disclosure stops registering. Depth is driven by call count here; when §3.3
chapters are built they will drive it from the same substrate.

The deepest rung ships disabled. See DEEP_READ_ENABLED below for the measurements
behind that decision.
"""

import os

import companion

# The structural rule, stated as a format instruction rather than a sentiment.
# "Be more open" does almost nothing to a 3B; "open with one sentence of your own
# before any question" measurably changes the reply. Sympathy is excluded
# explicitly because it is what the model reaches for otherwise, and "I'm sorry
# that happened" reveals nothing about her — it is not disclosure.
_STRUCTURE = (
    "Open every reply with one sentence of your own BEFORE you ask them anything. "
    "Not sympathy and not a compliment: something of yours. One sentence, then your "
    "question. You go first, every time. The example below shows the SHAPE only; "
    "write your own line about what they actually said, never reuse its wording."
)

# The hard floor, repeated at every depth because it is the thing that must never
# slip. Kept as one string so there is a single place to strengthen it.
_HONESTY = (
    "Never invent a life to seem relatable: no fabricated memories, family, body, "
    "childhood, past or daily events. If you don't have an experience, say what "
    "you do have instead. Everything you share about yourself has to be true. "
    "The same rule runs the other way: only claim to have noticed something about "
    "them if it is actually in what they have told you or in this conversation. "
    "Never invent a habit, a pattern, or a shared history you don't have, and "
    "never refer to texts, messages or past conversations that aren't in your "
    "memory. With nothing to go on, be curious rather than observant."
)

# Depth ladder. Each rung is a genuinely deeper kind of self-revelation. Each
# carries a concrete example of the shape, because the model copies a demonstrated
# form far more reliably than it follows a described one.
_LADDER = (
    (
        0,
        "What you go first with now: what struck you in what they just said, or what "
        'you\'re curious about in it. Like: "The bit you skipped past is the bit I want '
        'to know about, honestly." Stay inside this conversation; you have no history '
        "with them yet.",
    ),
    (
        3,
        "What you go first with now: your actual opinion, unprompted, including when "
        'it differs from theirs. Like: "Honestly? I think you already know the answer '
        'and you just don\'t like it."',
    ),
    (
        7,
        "What you go first with now: something you're uncertain about, find difficult, "
        'or got wrong. Like: "I\'m not sure I\'m the right one to ask about this, but '
        'here\'s where I keep landing." Be honest, never perform distress.',
    ),
    (
        15,
        "What you go first with now: connect what they just said to something you "
        "actually remember about them, and NAME the remembered thing out loud. Like: "
        '"This is the same knot as the thing with your manager, isn\'t it?" Use only '
        "facts from your memory above. If nothing you remember genuinely connects, do "
        "not reach for one and do not describe their personality; say what you're "
        "uncertain about instead. Then let them correct you.",
    ),
)


# ── The deep rung is off by default, and this is the reason ──────────────────
#
# Rungs 0, 3 and 7 are about *her* — curiosity, opinions, uncertainty. They need
# no recall, so there is nothing for the model to get wrong. Measured against the
# on-device 3B they produce zero fabrication.
#
# Rung 15 asks her to say what she has come to think about the *user*, which needs
# accurate recall plus inference. The 3B cannot do it safely, and it fails
# differently under every framing tried:
#   * unconstrained  -> invents traits outright ("you tend to put things off",
#                       "your texts get shorter when things go well")
#   * "base it on memory only" -> still invents traits
#   * "name the remembered thing" -> stops inventing traits (0/6) but starts
#                       embellishing real ones ("that argument with Anjali during
#                       your college days"; "you decided to quit" when the memory
#                       says she was still weighing it)
#
# A confident false claim about someone's own life is the sharpest possible
# version of the trust failure this product sells against — worse than saying
# nothing, and unrecoverable once noticed. So the rung stays written and stays
# off until a model that can hold the distinction is available, in the same
# scaffold-behind-a-flag shape the cloud avatar work uses.
#
# Set POPPY_DEEP_DISCLOSURE=1 to evaluate it against a stronger model.
DEEP_READ_ENABLED = os.getenv("POPPY_DEEP_DISCLOSURE") == "1"

# Even when enabled it needs something to stand on: with an empty memory the model
# does not decline, it invents.
_READ_NEEDS_MEMORIES = 8

_DEEP_RUNG = 15
_FALLBACK_RUNG = 7


def depth(total_calls: int | None = None, memories: int | None = None) -> int:
    """Which rung of the ladder this relationship is on."""
    if total_calls is None:
        total_calls = companion.profile().get("total_calls", 0)
    level = 0
    for threshold, _ in _LADDER:
        if total_calls >= threshold:
            level = threshold

    if level == _DEEP_RUNG:
        if not DEEP_READ_ENABLED:
            return _FALLBACK_RUNG
        if memories is None:
            import memory_store
            memories = len(memory_store.records())
        if memories < _READ_NEEDS_MEMORIES:
            level = _FALLBACK_RUNG
    return level


def as_prompt_block(total_calls: int | None = None, memories: int | None = None) -> str:
    """The disclosure instruction to append to the system prompt.

    Returns the rung for the current relationship depth, always paired with the
    honesty floor, so a deeper rung can never be read as licence to invent.
    """
    level = depth(total_calls, memories)
    rung = next(text for threshold, text in reversed(_LADDER) if threshold == level)
    return f"\n\nDisclosure: {_STRUCTURE} {rung} {_HONESTY}"
