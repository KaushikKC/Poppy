"""The prompt must fit the window whatever the user types.

Adult mode lifted the two-to-four-sentence rule, and a turn-count cap cannot see
message size, so these are the shapes that used to overflow. Overflow is not a
soft failure: llama.cpp and Ollama discard from the left of the prompt, which is
where the system prompt lives, so the first casualty is the character.

Offline: pure arithmetic, no model, no server.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import context_budget as cb  # noqa: E402

WINDOW = 4096
REPLY = 512

PASS = "PASS"
_failures = []


def check(name, cond):
    print(f"  {PASS if cond else 'FAIL'}  {name}")
    if not cond:
        _failures.append(name)


def total(system, history, user):
    return (
        cb.estimate_tokens(system)
        + cb.estimate_tokens(user)
        + sum(cb.estimate_tokens(m["content"]) + 4 for m in history)
        + 8
    )


def run():
    print(__doc__.strip().splitlines()[0])

    big_system = "S" * 3400          # ~850 tokens: full character + memories
    short = [{"role": "user", "content": "hi"} for _ in range(12)]

    # 1. The ordinary case is untouched.
    hist, text, used = cb.fit(short, big_system, "how was your day", WINDOW, REPLY)
    check("short history is kept whole", len(hist) == 12)
    check("ordinary turn fits", used + REPLY <= WINDOW)

    # 2. The case that broke: six exchanges of long adult-mode replies.
    long_hist = []
    for _ in range(6):
        long_hist.append({"role": "user", "content": "u" * 160})
        long_hist.append({"role": "assistant", "content": "a" * 2000})
    hist, text, used = cb.fit(long_hist, big_system, "and then?", WINDOW, REPLY)
    check("long history is trimmed", len(hist) < len(long_hist))
    check("newest exchange survives", hist[-1] is long_hist[-1])
    check("long-reply turn fits", total(big_system, hist, text) + REPLY <= WINDOW)

    # 3. A single pasted message big enough to fill the window on its own. This is
    #    the one trimming history alone could never fix.
    huge = "x" * 60_000
    hist, text, used = cb.fit(long_hist, big_system, huge, WINDOW, REPLY)
    check("huge message is clamped", cb.estimate_tokens(text) < cb.estimate_tokens(huge))
    check("clamp keeps the tail (the question)", text.endswith("x"))
    check("clamp is signposted", cb.ELISION in text)
    check("huge-message turn fits", total(big_system, hist, text) + REPLY <= WINDOW)

    # 4. A character so long there is nothing left over. History goes, the
    #    character stays — sacrificing her to keep old small talk is never right.
    hist, text, used = cb.fit(long_hist, "S" * 14_000, "hi", WINDOW, REPLY)
    check("history yields to the character", hist == [])

    # 5. The phone, at half the window.
    hist, text, used = cb.fit(long_hist, big_system, "and then?", 2048, 320)
    check("fits the 2048 mobile window", total(big_system, hist, text) + 320 <= 2048)

    print("ALL PASS" if not _failures else f"{len(_failures)} FAILED")
    return 1 if _failures else 0


if __name__ == "__main__":
    raise SystemExit(run())
