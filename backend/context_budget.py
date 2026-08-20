"""Keep the prompt inside the context window, whatever the user does.

The first version of this was a constant: reserve a thousand tokens for the system
prompt, five hundred for the reply, give the rest to history. That is a guess, and a
guess is wrong in exactly the cases that matter — a character written to the full 700
characters, fifteen remembered facts, and a long list of boundaries can push the real
system prompt past the reserve on its own, at which point nothing has been prevented.

So nothing is guessed here. Every part is measured on the turn it is used, and history
gets whatever is genuinely left over. It also clamps the user's own message, which was
never bounded anywhere: recording length caps a spoken turn, but a typed one can be a
paste of any size, and a single message big enough to fill the window would have
overflowed no matter how much history was dropped.

Why overflowing is worse than it sounds: llama.cpp and Ollama both discard from the
*left* of the prompt when it exceeds n_ctx, and the left is the system prompt. The
first thing thrown away is the character definition. The user does not see "context
full", they see her stop being herself, halfway through a conversation, for no visible
reason. That is the bug this module exists to make impossible.

Estimation is four characters a token. Close enough for English prose, conservative on
the punctuation-heavy text a chat produces, and free — an exact count would mean
tokenising the whole prompt on the critical path to her first word, to sharpen a number
that only ever needs to err on the safe side.
"""

# Deliberately an underestimate of characters-per-token, which makes the token
# estimate an *over*estimate. Erring high leaves headroom; erring low overflows.
_CHARS_PER_TOKEN = 4

# Chat templates wrap every message in role tags and delimiters.
_PER_MESSAGE_OVERHEAD = 4

# The user's own message never gets more than this share of the window. Past it
# there is no room left for who she is or for what she says back, and a reply
# written without a character is not worth the tokens it would cost.
_USER_SHARE = 0.5

# Kept when a message has to be cut, so the model is not silently handed a
# fragment that reads like the whole thing.
ELISION = "…[earlier part of this message trimmed]…\n"


def estimate_tokens(text: str) -> int:
    """Rough token count for a string. Over-estimates rather than under."""
    return len(text or "") // _CHARS_PER_TOKEN + 1


def _messages_tokens(messages: list[dict]) -> int:
    return sum(
        estimate_tokens(m.get("content", "")) + _PER_MESSAGE_OVERHEAD for m in messages
    )


def clamp_user_text(user_text: str, window: int) -> str:
    """Bound a single message so it can never fill the window on its own.

    The tail is kept, not the head: when someone pastes something and then asks
    about it, the question is at the bottom. Losing the question to keep the
    preamble would answer nothing.
    """
    limit = int(window * _USER_SHARE)
    if estimate_tokens(user_text) <= limit:
        return user_text
    keep_chars = limit * _CHARS_PER_TOKEN - len(ELISION)
    return ELISION + user_text[-keep_chars:]


def fit(
    history: list[dict],
    system_prompt: str,
    user_text: str,
    window: int,
    reply_reserve: int,
) -> tuple[list[dict], str, int]:
    """Trim history (and if it must, the message) so the whole prompt fits.

    Returns (history_to_send, user_text_to_send, tokens_used). History is trimmed
    from the oldest end, because the newest exchange is the one the reply has to
    follow on from. Nothing else is dropped: the system prompt is never touched
    here, since sacrificing the character to keep old small talk is the wrong
    trade in every case.
    """
    user_text = clamp_user_text(user_text, window)

    fixed = (
        estimate_tokens(system_prompt)
        + _PER_MESSAGE_OVERHEAD
        + estimate_tokens(user_text)
        + _PER_MESSAGE_OVERHEAD
        + reply_reserve
    )
    budget = window - fixed

    if budget <= 0:
        # A character and a message that together leave no room. History goes
        # entirely rather than the prompt overflowing.
        return [], user_text, fixed

    used = 0
    keep = 0
    for message in reversed(history):
        cost = estimate_tokens(message.get("content", "")) + _PER_MESSAGE_OVERHEAD
        if used + cost > budget:
            break
        used += cost
        keep += 1

    kept = history[len(history) - keep:] if keep else []
    return kept, user_text, fixed + used
