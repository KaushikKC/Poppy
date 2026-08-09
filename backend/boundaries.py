"""
What she should never bring up, and what she should always ask about.

The Octalysis audit found the product had almost no way for the user to shape
anything: they received a companion rather than made one. Arranging the garden
and naming a flower cover their own history. This covers *her* — the first place
the user gets to set a rule she then has to keep.

It is also simply a better companion. "Never ask me about my dad" is the kind of
thing a real friend learns once and remembers forever, and getting it wrong is
the most expensive mistake this product can make. So a boundary is enforced in
three places, not one:

  * her system prompt, so she doesn't raise it
  * the loop author, so a hook is never planted about it
  * memory extraction, so nothing about it is even proposed for storage

The last two matter because the prompt is advice a small model may ignore, while
those are refusals it cannot.

Boundaries are the user's own words about their own life, so the text never
reaches the analytics log. Only counts do.
"""

import re

import companion

MAX_TOPICS = 12
MAX_LEN = 60

# Spoken forms, so the rule can be set the way everything else in this product is
# set: out loud, in a call. The topic is whatever follows.
_AVOID = re.compile(
    r"\b(?:"
    r"(?:please\s+)?(?:don'?t|do not|never|stop|quit)\s+"
    r"(?:ever\s+)?(?:ask(?:ing)?(?:\s+me)?\s+about|bring(?:ing)?\s+up|"
    r"mention(?:ing)?|talk(?:ing)?\s+about|say(?:ing)?\s+anything\s+about)"
    r"|i\s+don'?t\s+want\s+to\s+talk\s+about"
    r"|let'?s\s+not\s+talk\s+about"
    r"|drop\s+the\s+subject\s+of"
    r")\s+(?P<topic>.{2,60}?)(?:[.,!?]|$)",
    re.I,
)
_ALWAYS = re.compile(
    r"\b(?:"
    r"always\s+(?:ask(?:\s+me)?\s+about|check(?:\s+in)?\s+(?:on|about)|remember\s+to\s+ask\s+about)"
    r"|(?:please\s+)?keep\s+asking\s+(?:me\s+)?about"
    r"|make\s+sure\s+(?:you\s+)?ask(?:\s+me)?\s+about"
    r"|don'?t\s+forget\s+to\s+ask\s+about"
    r")\s+(?P<topic>.{2,60}?)(?:[.,!?]|$)",
    re.I,
)

# Leading filler that would otherwise end up inside the stored topic.
_STRIP = re.compile(r"^(?:the|my|our|that|this|about|it|any)\s+", re.I)
_STOP = {"it", "that", "this", "anything", "things", "stuff", "them", "there"}


def _clean(topic: str) -> str | None:
    topic = (topic or "").strip().strip("\"'").rstrip(".,!?")
    topic = re.sub(r"\s+", " ", topic)[:MAX_LEN]
    bare = _STRIP.sub("", topic).strip()
    # A rule about "it" is not a rule we can keep, and guessing what "it" meant
    # is exactly the kind of inference that would get this wrong.
    if not bare or bare.lower() in _STOP or len(bare) < 2:
        return None
    return bare


def parse(text: str) -> dict | None:
    """Read a spoken rule, or None. `{"kind": "avoid"|"always", "topic": str}`."""
    for kind, pattern in (("avoid", _AVOID), ("always", _ALWAYS)):
        m = pattern.search(text or "")
        if m:
            topic = _clean(m.group("topic"))
            if topic:
                return {"kind": kind, "topic": topic}
    return None


def parse_from_turns(turns: list[dict]) -> list[dict]:
    """Every rule the user set in this call, oldest first."""
    found, seen = [], set()
    for t in turns or []:
        if t.get("role") != "user":
            continue
        rule = parse(str(t.get("content") or ""))
        if rule and rule["topic"].lower() not in seen:
            seen.add(rule["topic"].lower())
            found.append(rule)
    return found


def get() -> dict:
    p = companion.profile()
    return {
        "avoid": list(p.get("avoid_topics") or []),
        "always": list(p.get("always_topics") or []),
    }


def add(kind: str, topic: str) -> dict:
    """Add a rule. Adding to one list removes it from the other, because saying
    "actually, do ask about work" has to be able to undo "never ask about work"."""
    topic = _clean(topic) or ""
    if not topic or kind not in ("avoid", "always"):
        return get()
    current = get()
    other = "always" if kind == "avoid" else "avoid"
    mine = [t for t in current[kind] if t.lower() != topic.lower()]
    theirs = [t for t in current[other] if t.lower() != topic.lower()]
    mine.append(topic)
    companion.update(**{
        f"{kind}_topics": mine[-MAX_TOPICS:],
        f"{other}_topics": theirs,
    })
    return get()


def remove(kind: str, topic: str) -> dict:
    if kind not in ("avoid", "always"):
        return get()
    kept = [t for t in get()[kind] if t.lower() != (topic or "").strip().lower()]
    companion.update(**{f"{kind}_topics": kept})
    return get()


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9']+", (text or "").lower()) if len(w) > 2}


def is_blocked(text: str) -> bool:
    """Does this touch something she was told to leave alone?

    Matched on the topic's own words appearing in the text. Deliberately blunt:
    over-blocking costs a hook we could have used, while under-blocking means
    raising the thing the user explicitly asked her not to.
    """
    if not text:
        return False
    words = _tokens(text)
    for topic in get()["avoid"]:
        topic_words = _tokens(topic)
        if topic_words and topic_words <= words:
            return True
    return False


def as_prompt_block() -> str:
    """The rules, for her system prompt.

    Phrased as absolutes with no reasoning attached, because a small model
    softens anything hedged, and "don't raise my dad" is not a preference to
    weigh against being curious.
    """
    rules = get()
    lines = []
    if rules["avoid"]:
        lines.append(
            "NEVER raise these subjects, and never ask a question that leads to "
            "them. If the user raises one themselves, follow their lead, but do "
            "not bring it up yourself: " + "; ".join(rules["avoid"]) + "."
        )
    if rules["always"]:
        lines.append(
            "They have asked you to keep track of these, so ask about them when "
            "it fits: " + "; ".join(rules["always"]) + "."
        )
    return ("\n\n" + " ".join(lines)) if lines else ""


def counts() -> dict:
    """Content-free, for the event log."""
    rules = get()
    return {"avoid": len(rules["avoid"]), "always": len(rules["always"])}
