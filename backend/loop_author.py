"""
Authoring the open loop (POPPY_RETENTION_ENGINE §1.2, §7 Act 3).

At the end of every call Poppy plants a forward hook. The hook has to be *hers* —
a specific, narrow question in her voice that names one unknown ("how'd the
interview go?"). What it must never be is the user's own last sentence played
back at them, which reads as a bug and kills the mechanic (§1.3 Rule 3).

**Why this extracts a topic instead of writing the line.** The obvious design is
to ask the model for the finished hook. Measured against the on-device 3B that
v1 ships, that produces an unusable line most of the time: it collapses every
loop to one type, invents details that were never said, and — worst — flips point
of view, so she ends up saying "I'm still wondering what it means to prioritize me
over my job" as though she were the user. A hook that lands is the entire premise
of §1, so reliability beats phrasing variety here.

So the model does the one job it is good at: naming what the call was about, as a
short third-person noun phrase. This module owns the sentence. Point-of-view
errors become structurally impossible, and the phrasing stays hers.

The §2 "reliable warmth, unpredictable delight" split says the same thing from the
product side: openings and closings are supposed to be the fixed, dependable part.
The variable element belongs in Act 2, not here.

Runs off the reply latency path, from /call/close.
"""

import json
import re

import llm

# Types this module can plant. `ritual` loops belong to the ritual system rather
# than to a call, and `callback` loops are held back until the memory system can
# guarantee they land next call — an unlanded callback reads as a broken promise,
# which is worse than no promise at all (§1.2). Three choices rather than six also
# measurably improves classification on a small local model.
_AUTHORABLE = ("event", "question", "serial")

_MAX_TURNS = 8        # how much of the tail the author reads
_MAX_TOPIC_WORDS = 8  # a topic is a noun phrase, not a sentence

_SYSTEM = (
    "You read the end of a conversation and name what it was about, so a warm "
    "companion can follow up next time. Output ONLY a JSON object, nothing else: "
    '{"topic": a short noun phrase}.\n'
    "The topic:\n"
    "- Names the ONE thing most worth following up on.\n"
    "- Is a NOUN PHRASE of 2 to 6 words, not a sentence, with no verb tense.\n"
    "- Is written in the third person about the other person's life. Never use "
    "'I', 'my', 'me', 'we' or 'you'.\n"
    "- Uses only things actually said. Never invent a detail.\n"
    "- Is empty if nothing specific enough came up.\n"
    "Examples:\n"
    'They mention an interview on Thursday -> {"topic":"the Thursday interview"}\n'
    'They go back and forth about quitting a well paid job -> '
    '{"topic":"the decision about quitting"}\n'
    'They are upset about what their sister Anjali said -> '
    '{"topic":"what Anjali said at dinner"}\n'
    'They said almost nothing -> {"topic":""}'
)

# The type decides the loop's half-life and how she phrases the follow-up, so it
# is inferred here rather than asked for. The local 3B classifies it as "serial"
# almost every time regardless of content, while these markers read the same
# signal directly off the transcript and cost nothing.
_DATED = re.compile(
    r"\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|"
    r"sunday|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|"
    r"sunday)|this\s+(?:week|weekend|evening|afternoon|morning)|in\s+a\s+(?:few\s+)?"
    r"(?:days?|weeks?)|later\s+this\s+week)\b",
    re.I,
)
_UNDECIDED = re.compile(
    r"\b(should\s+i|not\s+sure|unsure|torn|deciding|decide|whether|or\s+not|"
    r"back\s+and\s+forth|can'?t\s+decide|thinking\s+about\s+(?:quitting|leaving|"
    r"moving|taking)|considering|debating|two\s+minds)\b",
    re.I,
)

# A call where the user said literally nothing has no topic to name. This is only
# meant to skip empty calls.
#
# It used to be 12 words, which was badly wrong for a *voice* product: people
# speak in short sentences, so "I'm having an interview on Friday" (6 words) is a
# perfectly hookable call that never reached the model at all. The invention
# problem that threshold was guarding against is handled properly by
# `_is_grounded` below, which checks the topic against what was actually said.
_MIN_USER_WORDS = 3

# The line she actually says, built here so it is always grammatical and always
# in her voice. Two variants per type: enough that it doesn't feel canned, few
# enough that every one can be read and approved as copy.
#
# Every frame has to read correctly with ANY noun phrase, because the type is
# inferred from the whole transcript while the topic comes from one thread in it
# — a call that mentions Thursday but lands on something else would otherwise
# produce "tell me how what Anjali said at dinner went".
_TEMPLATES = {
    "event": [
        "tell me what happened with {topic}, I want the whole thing.",
        "how did {topic} turn out?",
    ],
    "question": [
        "have a think about {topic}. I want to hear where you land.",
        "tell me next time what you decide about {topic}.",
    ],
    "serial": [
        "we're not done talking about {topic}. next time?",
        "I want to pick {topic} back up next time.",
    ],
}

# The fallback is a reveal loop: it needs no detail from the conversation, it is
# always true (she can always have something to say next time), and a call with no
# hook is the one outcome not allowed.
#
# The reveal fallback fires whenever a call had nothing specific enough to hook
# on, which in practice is often. A single fixed line meant a user could see the
# identical sentence at the end of several calls in a row, and it stopped reading
# as her having something to say and started reading as a bug — that is exactly
# how it was reported in testing.
#
# The variants are all the same promise, phrased differently, so the mechanic is
# unchanged and only the surface varies.
_FALLBACKS = (
    "there's something I've been meaning to tell you. next time, okay?",
    "I've got something to tell you, but not tonight. next time.",
    "remind me to tell you something next time. it's not bad, I promise.",
    "there's a thing I keep not saying. I'll get to it next time.",
    "I'll tell you the other thing when we next talk.",
    "something occurred to me earlier. it'll keep until next time.",
)


def _fallback(user_lines: list[str] | None = None) -> dict:
    """A reveal hook, varied so the same sentence doesn't come back twice running.

    Seeded by what was said rather than by chance, so the same conversation
    always produces the same line and re-running a call can't reshuffle it.
    """
    # Not Python's hash(): it is salted per process, so the same call would get a
    # different line after every restart.
    text = "|".join(user_lines or [])
    seed = sum((i + 1) * ord(ch) for i, ch in enumerate(text))
    return {"type": "reveal", "hook": _FALLBACKS[seed % len(_FALLBACKS)]}


# Kept for callers that only need to recognise the shape.
_FALLBACK = {"type": "reveal", "hook": _FALLBACKS[0]}

_WORD = re.compile(r"[a-z0-9']+")
# First person in a topic means the model slipped into the user's voice, which is
# the failure mode that produced "prioritize me over my job": she would end up
# claiming their life as her own.
#
# Second person is fine and is the *natural* phrasing here. "your interview on
# Friday" reads correctly in every template ("how did your interview on Friday
# turn out?"), and rejecting it threw away good topics.
_WRONG_PERSON = re.compile(r"\b(i|i'm|my|me|mine|myself|we|our|us)\b", re.I)
# Framing the templates already provide; see _clean_topic.
_REDUNDANT_LEAD = re.compile(
    r"^(?:the\s+)?(?:decision|question|issue|topic|thing|matter)\s+(?:about|of|to|with)\s+",
    re.I,
)


def _words(text: str) -> list[str]:
    return _WORD.findall((text or "").lower())


# Filler that carries no subject, so it can't ground a topic on its own.
_STOP = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
    "with", "about", "that", "this", "it", "is", "was", "were", "be", "been",
    "im", "i", "my", "me", "you", "your", "we", "our", "they", "so", "just",
    "like", "yeah", "really", "very", "some", "any", "what", "how", "when",
    "thing", "things", "today", "day", "time", "going", "got", "get", "have",
    "had", "do", "did", "not", "no", "yes", "ok", "okay",
}


def _content_words(text: str) -> set[str]:
    return {w for w in _words(text) if w not in _STOP and len(w) > 2}


def _is_grounded(topic: str, user_lines: list[str]) -> bool:
    """True if the topic is built from something the user actually said.

    This is the real guard against invention, and it replaces a crude word-count
    threshold that was rejecting short but perfectly specific calls. Asked to name
    a topic for "not much today, just tired", a small model happily returns "the
    long conversation"; none of those content words appear in what was said, so it
    is rejected here and the call falls back to the reveal hook instead.
    """
    said = set()
    for line in user_lines:
        said |= _content_words(line)
    topic_words = _content_words(topic)
    if not topic_words:
        return False
    return bool(topic_words & said)


def _is_echo(hook: str, user_lines: list[str]) -> bool:
    """True if the line is mostly the user's own words — the exact failure this
    module exists to prevent. Compared on content words so that shared filler
    ("the", "i", "to") doesn't trip it."""
    hook_words = set(_words(hook))
    if not hook_words:
        return True
    for line in user_lines:
        line_words = set(_words(line))
        if not line_words:
            continue
        if len(hook_words & line_words) / len(hook_words) >= 0.7:
            return True
    return False


def _clean_topic(topic: str) -> str | None:
    """Validate the noun phrase, or None if it can't be trusted in a sentence."""
    topic = (topic or "").strip().strip('"').rstrip(".!?,")
    if not topic:
        return None
    if not 1 < len(topic.split()) <= _MAX_TOPIC_WORDS:
        return None
    if _WRONG_PERSON.search(topic):
        return None
    # A phrase with sentence punctuation inside it is a sentence, not a topic.
    if any(p in topic for p in (".", "?", "!", ";")):
        return None
    # The templates already supply the framing, so a topic that carries its own
    # ("the decision about quitting") would stutter: "what you decide about the
    # decision about quitting". Strip the lead-in and let the sentence do it.
    topic = _REDUNDANT_LEAD.sub("", topic).strip()
    if not topic:
        return None
    return topic[0].lower() + topic[1:]


def _parse(raw: str) -> dict | None:
    """Pull the JSON object out of the model's raw text, defensively."""
    m = re.search(r"\{.*\}", raw or "", re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(obj, dict):
        return None

    topic = _clean_topic(str(obj.get("topic") or ""))
    return {"topic": topic} if topic else None


def _infer_type(transcript: str) -> str:
    """Which of the three loop types this call ends on (§1.2).

    Dated beats undecided: something happening on Thursday is both more specific
    and shorter-fused than a decision with no deadline, so it wins the one
    visible slot.
    """
    if _DATED.search(transcript):
        return "event"
    if _UNDECIDED.search(transcript):
        return "question"
    return "serial"


def _compose(kind: str, topic: str) -> str:
    """Build her line from the template set. The variant is chosen by the topic
    itself, so the same subject always comes back phrased the same way and a
    different one is likely to sound different."""
    variants = _TEMPLATES[kind]
    return variants[sum(ord(c) for c in topic) % len(variants)].format(topic=topic)


def _transcript(turns: list[dict]) -> tuple[str, list[str]]:
    """The tail of the call as a plain transcript, plus the user's own lines so
    the echo check has something to compare against. Speakers are labelled from
    the reader's point of view, not hers, so the model is never invited to write
    as "you"."""
    tail = [t for t in (turns or []) if t.get("content")][-_MAX_TURNS:]
    lines, user_lines = [], []
    for t in tail:
        content = str(t["content"]).strip()
        if t.get("role") == "user":
            lines.append(f"Person: {content}")
            user_lines.append(content)
        else:
            lines.append(f"Companion: {content}")
    return "\n".join(lines), user_lines


async def author(turns: list[dict] | None = None) -> dict:
    """Write the hook to plant at the end of this call.

    Returns `{"type", "hook"}` — always. On any failure it returns the reveal
    fallback rather than nothing, because §1 only works if every call ends on an
    unresolved beat.
    """
    transcript, user_lines = _transcript(turns or [])
    if not transcript.strip():
        return _fallback(user_lines)
    if sum(len(line.split()) for line in user_lines) < _MIN_USER_WORDS:
        return _fallback(user_lines)

    try:
        raw = await llm.complete(
            f"Conversation:\n{transcript}\n\nName the follow-up topic.",
            _SYSTEM,
            max_tokens=60,
        )
    except Exception as e:
        print(f"[loops] hook authoring failed, using fallback: {e}")
        return _fallback(user_lines)

    parsed = _parse(raw)
    if not parsed:
        return _fallback(user_lines)

    # The topic has to come from something they actually said, not from the
    # model's sense of what a conversation usually contains.
    if not _is_grounded(parsed["topic"], user_lines):
        return _fallback(user_lines)

    kind = _infer_type(transcript)
    hook = _compose(kind, parsed["topic"])
    if _is_echo(hook, user_lines):
        return _fallback(user_lines)

    # Same guardrail every outbound line passes through (§14): a hook can never
    # be the thing that guilt-trips the user back.
    import nudges
    if not nudges.is_healthy(hook):
        return _fallback(user_lines)

    return {"type": kind, "hook": hook}
