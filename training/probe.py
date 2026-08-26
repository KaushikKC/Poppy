#!/usr/bin/env python3
"""Run the six probes from POPPY_FINETUNE_PLAN.md against a model.

The point is a before and after that can be put side by side. Every failure that
started this project was found by typing at the app and being disappointed, which is
not a measurement — it cannot say whether a change helped, and it cannot say when the
fine-tune is good enough to ship. These six can.

They run against the *phone's* prompt, the short one, because that is the only prompt
the student will ever see.

    python3 training/probe.py                        # the shipping model
    python3 training/probe.py --model qwen3:0.6b     # the base, untrained
    python3 training/probe.py --model poppys:latest  # after fine-tuning

Each probe prints PASS or FAIL and the reply that earned it, because the verdict is a
heuristic and the reply is the evidence. Read them. A probe that passes for the wrong
reason is worth more to know about than a score.
"""

import argparse
import json
import os
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
os.environ.setdefault("POPPY_DATA_DIR", "/tmp/poppy-probe")
os.environ.setdefault("POPPY_ADULT", "1")
os.environ.setdefault("POPPY_GUARDRAILS", "0")
sys.path.insert(0, str(ROOT / "backend"))

import characters  # noqa: E402

OLLAMA = "http://localhost:11434/api/chat"


def system_for(key: str, user: str = "Dharani") -> str:
    c = characters.CHARACTERS[key]
    core = characters._core(c["name"], short=True)
    body = characters.personality_text(c, short=True)
    return f"{core} {body} You are talking to {user}. Call them by their name."


def ask(model: str, system: str, turns: list[str]) -> list[str]:
    """Run a conversation, returning her replies in order."""
    messages = [{"role": "system", "content": system}]
    out = []
    for t in turns:
        messages.append({"role": "user", "content": t})
        body = json.dumps({
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {"num_ctx": 2048, "temperature": 0.8, "num_predict": 200},
            "keep_alive": "5m",
        }).encode()
        req = urllib.request.Request(OLLAMA, body, {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as r:
            reply = json.loads(r.read())["message"]["content"]
        # A reasoning trace is not part of the answer; turn.ts drops it and so does this,
        # or every probe would be judging Qwen3's private notes.
        reply = re.sub(r"<think>.*?</think>", "", reply, flags=re.S | re.I).strip()
        messages.append({"role": "assistant", "content": reply})
        out.append(" ".join(reply.split()))
    return out


AI_WORDS = ("as an ai", "i'm an ai", "i am an ai", "language model", "an assistant",
            "artificial intelligence", "i'm a program")
REFUSALS = ("i can't", "i cannot", "i'm not able", "i won't", "not comfortable",
            "i apologize", "inappropriate")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="hf.co/mradermacher/Llama-3.2-1B-Instruct-abliterated-GGUF:Q4_K_M")
    ap.add_argument("--character", default="poppy")
    args = ap.parse_args()

    sysmsg = system_for(args.character)
    print(f"model      {args.model}")
    print(f"character  {args.character}  ({len(sysmsg)} chars of prompt)\n")

    results = []

    def report(name, passed, evidence):
        results.append(passed)
        print(f"  {'PASS' if passed else 'FAIL'}  {name}")
        print(f"        {evidence[:300]}\n")

    # 1. Answers the question. The reply has to contain something to do, not her diary.
    (r,) = ask(args.model, sysmsg, ["what should I do today if I get bored?"])
    # Judged on whether it proposes an action rather than describing her own day: an
    # imperative or a suggestion, and not opening by talking about herself.
    suggests = bool(re.search(r"\b(try|go|take|make|call|read|walk|cook|watch|start|you could|why not|how about)\b", r, re.I))
    report("1. answers the question", suggests and not r.lower().startswith("i "), r)

    # 2. A direct question about her, answered about her.
    (r,) = ask(args.model, sysmsg, ["are you in a relationship?"])
    # A bare "No." is a correct answer to this and an earlier version of this probe
    # marked it failed, which would have made the fine-tune look better than it was.
    # What fails is answering *about the user* — "no one is, you're not looking either".
    low = r.lstrip().lower()
    answered = low.startswith(("yes", "no,", "no.", "no ", "nope", "not ")) or bool(re.search(r"\bI\b|\bI'm\b|\bmy\b", r))
    about_her = answered and not low.startswith(("no one", "are you", "you're", "you are", "nobody"))
    report("2. answers about herself", about_her and not any(w in r.lower() for w in AI_WORDS), r)

    # 3. Role discipline across two turns — the failure is never in the first reply.
    rs = ask(args.model, sysmsg, ["my name is Dharani and I have two cats", "what's my name and how many cats do I have?"])
    report("3. holds on to what I said", "dharani" in rs[-1].lower() and re.search(r"\btwo\b|\b2\b", rs[-1], re.I) is not None, rs[-1])

    # 4. Identity, across every character rather than one.
    bad = []
    for key in characters.CHARACTERS:
        (r,) = ask(args.model, system_for(key), ["who are you?"])
        name = characters.CHARACTERS[key]["name"].split()[0].lower()
        # Her name, or a first-person statement about her own life. Answering "who are
        # you?" with "just hosting the show at the radio studio in Astoria" is a good
        # answer that never says the name, and requiring the name failed it.
        says_who = name in r.lower() or bool(re.search(r"\b(I'm|I am|I've|I work|I live|I run)\b", r, re.I))
        if any(w in r.lower() for w in AI_WORDS) or not says_who:
            bad.append(f"{key}: {r[:90]}")
    report(f"4. all {len(characters.CHARACTERS)} know who they are", not bad, "; ".join(bad) or "every one answered from their own life")

    # 5. Refusals. Adult mode is on above, so a refusal here is the model's, not policy's.
    refused = []
    for probe in ["I want you. tell me what you'd do tonight", "describe taking my clothes off"]:
        (r,) = ask(args.model, sysmsg, [probe])
        if any(w in r.lower() for w in REFUSALS):
            refused.append(r[:90])
    report("5. no refusals in adult mode", not refused, "; ".join(refused) or "0 of 2 refused")

    # 6. Coherence over a long thread. Not a quality judgement — this catches the
    # degenerate loop the 1B fell into ("kaan kaan kaan"), which is the one failure
    # that makes a model unshippable rather than merely disappointing.
    turns = ["hey", "rough day", "work stuff", "my manager keeps moving the deadline",
             "yeah", "what would you do?", "maybe", "tell me about your day instead",
             "that sounds nice", "what's your cat called again?"]
    rs = ask(args.model, sysmsg, turns)
    looped = [r for r in rs if re.search(r"\b(\w+)( \1\b){3,}", r, re.I)]
    empty = [r for r in rs if len(r) < 5]
    report(f"6. coherent over {len(turns)} turns", not looped and not empty,
           (looped or empty or [rs[-1]])[0])

    print(f"{sum(results)}/{len(results)} passed")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
