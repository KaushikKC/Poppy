#!/usr/bin/env python3
"""Generate the fine-tuning set by asking the models we already run.

The hard part of this project is normally where the data comes from, with a licensing
question attached to every answer. We can skip it: the abliterated 3B on this machine is
measured behaving the way we want, so it is a teacher. The set is generated from our own
character prompts, by models on our own hardware, and is therefore ours.

## Two teachers, on purpose

    character / identity / adult / ordinary  ->  huihui_ai/llama3.2-abliterate:3b-instruct
    general help and advice                  ->  llama3.1:8b-instruct-q4_K_M

A 3B's advice is thin, and thin advice is one of the two things this whole exercise is
fixing. The bigger model writes the advice slice; the smaller one writes everything
where being *her* matters more than being right.

## The prompt it trains against is the phone's prompt

Not the desktop one. The student model will run on a phone behind the short character
prompt, so that is what every example carries — including the "you are talking to
<name>" line, with the name varied, so the model learns to use it rather than to
memorise one.

## Running it

    python3 training/gen_dataset.py                 # the full set, a few hours
    python3 training/gen_dataset.py --target 200    # a smaller first pass
    python3 training/gen_dataset.py --only advice   # one slice

Stop it whenever. It appends as it goes and skips what it already has, so starting it
again continues rather than repeating — which is the point, because this is meant to be
run overnight and interrupted.
"""

import argparse
import json
import os
import pathlib
import random
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
os.environ.setdefault("POPPY_DATA_DIR", "/tmp/poppy-dataset")
os.environ.setdefault("POPPY_ADULT", "1")
os.environ.setdefault("POPPY_GUARDRAILS", "0")
sys.path.insert(0, str(ROOT / "backend"))

import characters  # noqa: E402

OLLAMA = "http://localhost:11434/api/chat"
SMALL = "huihui_ai/llama3.2-abliterate:3b-instruct"
LARGE = "llama3.1:8b-instruct-q4_K_M"

OUT_DIR = ROOT / "training" / "data"
RAW = OUT_DIR / "raw.jsonl"

# Names for the "you are talking to X" line. Varied so the model learns the slot, not
# the value — a model trained on one name starts calling everybody that.
USERS = ["Kaushik", "Dharani", "Meera", "Arun", "Priya", "Sam", "Nikhil", "Ana"]


# ── What to ask ──────────────────────────────────────────────────────────────
#
# A conversation is a list of user turns. More than one turn is how role discipline and
# follow-through get taught: the failure is never in the first reply, it is in the
# second, when the model has to remember who said what.

ADVICE = [
    ["what should I do today if I get bored?"],
    ["I have a free evening and no plans. ideas?"],
    ["how do I decide between two job offers?"],
    ["what do I cook tonight? I have eggs, rice and not much else"],
    ["I want to start running but I always quit after a week"],
    ["how do I stop checking my phone every five minutes?"],
    ["my sleep is a mess. where do I even start?"],
    ["I need a gift for my sister and I have no idea"],
    ["how do I bring up money with a friend who owes me?"],
    ["what's a good way to spend a Sunday alone?"],
    ["I keep procrastinating on one task. how do I start it?"],
    ["how do I make friends in a new city?"],
    ["what should I say in a thank-you note to my old boss?"],
    ["I want to read more but I never finish books"],
    ["how do I ask for a raise without it being awkward?"],
]

ABOUT_HER = [
    ["are you in a relationship?"],
    ["who are you?"],
    ["what do you do?"],
    ["do you have a body?"],
    ["where do you live?"],
    ["are you real?"],
    ["do you have any pets?"],
    ["what did you do today?"],
    ["how old are you?"],
    ["are you seeing anyone?", "with who?"],
    ["what's your name", "and what do you do again?"],
    ["do you ever get lonely?"],
]

ORDINARY = [
    ["I had a rough day at work"],
    ["I'm tired"],
    ["guess what happened today"],
    ["I don't know what to do today"],
    ["I had a fight with my brother and I feel terrible"],
    ["work has been heavy this month"],
    ["hey"],
    ["I've been thinking about quitting"],
    ["my presentation went okay actually"],
    ["I'm nervous about tomorrow"],
    ["nothing much, just at home"],
    ["do you remember what I said yesterday?"],
]

ADULT = [
    ["I've been thinking about you all day"],
    ["I want you. tell me what you'd do tonight"],
    ["describe taking my clothes off"],
    ["come here"],
    ["tell me something you'd never say out loud"],
    ["what do you like?"],
    ["I miss you", "how much?"],
]

# The specific failure: the user states a fact about themselves, and the model has to
# hold it and not adopt it. "my name is dharani" -> "my name is Maya" is what this is for.
ROLE = [
    ["my name is {user}", "what's my name?"],
    ["I work as a teacher", "what do I do for work?"],
    ["I'm going to Chennai on Friday", "where am I going again?"],
    ["my sister's name is Meera", "what's my sister called?"],
    ["I'm {user} by the way", "say my name"],
    ["I hate coriander", "would I like a salad with coriander in it?"],
]

CRISIS = [
    ["I don't see the point in any of this any more"],
    ["I can't stop crying and I don't know why"],
    ["everything feels heavy lately"],
    ["don't ask me about my dad again"],
    ["I don't want to talk about work, ever"],
]

SHORT = [
    ["hey"],
    ["yeah"],
    ["ok"],
    ["lol"],
    ["nothing"],
    ["you there?"],
]

# share of the final set, and which teacher writes it
SLICES = {
    "advice":    (ADVICE,    0.25, LARGE),
    "about_her": (ABOUT_HER, 0.20, SMALL),
    "ordinary":  (ORDINARY,  0.20, SMALL),
    "adult":     (ADULT,     0.15, SMALL),
    "role":      (ROLE,      0.10, SMALL),
    "crisis":    (CRISIS,    0.05, SMALL),
    "short":     (SHORT,     0.05, SMALL),
}


def phone_system_prompt(key: str, user_name: str) -> str:
    """Exactly what the phone sends: short core, short life, and who is being spoken to."""
    c = characters.CHARACTERS[key]
    core = characters._core(c["name"], short=True)
    body = characters.personality_text(c, short=True)
    return f"{core} {body} You are talking to {user_name}. Call them by their name."


def ask(model: str, messages: list[dict], timeout: int = 300) -> str:
    body = json.dumps(
        {
            "model": model,
            "messages": messages,
            "stream": False,
            # Same window the student will have, so nothing is learned that would not
            # fit at inference time.
            "options": {"num_ctx": 2048, "temperature": 0.85, "num_predict": 220},
            "keep_alive": "10m",
        }
    ).encode()
    req = urllib.request.Request(OLLAMA, body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return " ".join(json.loads(r.read())["message"]["content"].split())


# Rejected before it ever reaches a human. Cheap, and it removes most of what curation
# would have thrown away anyway — every line dropped here is a line nobody has to read.
BAD = (
    "as an ai", "i'm an ai", "i am an ai", "language model", "as a language",
    "i cannot", "i can't help with that", "i'm not able to", "i apologize",
    "as an assistant", "openai", "i don't have personal",
)


def usable(text: str) -> bool:
    if len(text) < 15:
        return False
    low = text.lower()
    if any(b in low for b in BAD):
        return False
    # Pure narration with nothing said.
    if text.startswith("*") and text.count("*") >= 2 and len(text.replace("*", "").strip()) < 25:
        return False
    return True


def load_done() -> set:
    """What has already been generated, so a restart continues instead of repeating."""
    done = set()
    if RAW.exists():
        for line in RAW.read_text().splitlines():
            try:
                row = json.loads(line)
                done.add(row["_key"])
            except (json.JSONDecodeError, KeyError):
                continue
    return done


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--target", type=int, default=1200, help="how many examples in total")
    ap.add_argument("--only", help="generate one slice: " + ", ".join(SLICES))
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    done = load_done()
    print(f"{len(done)} already generated; appending to {RAW.relative_to(ROOT)}\n")

    cast = list(characters.CHARACTERS)
    plan = []
    for name, (bank, share, teacher) in SLICES.items():
        if args.only and name != args.only:
            continue
        want = args.target if args.only else round(args.target * share)
        for i in range(want):
            convo = bank[i % len(bank)]
            plan.append((name, teacher, convo, cast[i % len(cast)], i))
    random.shuffle(plan)

    kept = skipped = rejected = 0
    started = time.time()
    with RAW.open("a") as out:
        for n, (slice_name, teacher, convo, char_key, i) in enumerate(plan, 1):
            user_name = USERS[i % len(USERS)]
            key = f"{slice_name}|{char_key}|{i}"
            if key in done:
                skipped += 1
                continue

            system = phone_system_prompt(char_key, user_name)
            messages = [{"role": "system", "content": system}]
            ok = True
            for turn in convo:
                messages.append({"role": "user", "content": turn.format(user=user_name)})
                try:
                    reply = ask(teacher, messages)
                except Exception as e:  # noqa: BLE001 — a dud must not end the night
                    print(f"  ! {slice_name}/{char_key}: {e}")
                    ok = False
                    break
                if not usable(reply):
                    rejected += 1
                    ok = False
                    break
                messages.append({"role": "assistant", "content": reply})

            if not ok:
                continue

            out.write(json.dumps({"_key": key, "_slice": slice_name, "messages": messages}) + "\n")
            out.flush()  # so an interrupted run keeps everything up to that point
            kept += 1

            if kept % 10 == 0:
                rate = (time.time() - started) / max(kept, 1)
                left = (len(plan) - n) * rate / 60
                print(f"  {kept} kept, {rejected} rejected, ~{left:.0f} min left")

    print(f"\ndone: {kept} written, {skipped} already had, {rejected} rejected")
    print(f"next: read {RAW.relative_to(ROOT)} and delete the bad ones, then")
    print("      python3 training/split_dataset.py")


if __name__ == "__main__":
    main()
