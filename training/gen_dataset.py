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
import re
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

# ── Practical, the way anyone would ask an assistant ─────────────────────────
#
# This half is what the 1B fails at hardest, and it is not optional: someone who cannot
# help you plan a Tuesday is not a companion, whatever else she is. Written to look like
# what a person actually types — planning, deciding, explaining, fixing.
PRACTICAL = [
    ["what should I do today if I get bored?"],
    ["plan my day for me. I'm working from home and I have a dentist appointment at 4"],
    ["I'm going to my cousin's wedding tomorrow. what should I sort out tonight?"],
    ["I have three hours free this evening. what's worth doing with them?"],
    ["how do I decide between two job offers?"],
    ["what do I cook tonight? I have eggs, rice and not much else"],
    ["I want to start running but I always quit after a week"],
    ["how do I stop checking my phone every five minutes?"],
    ["my sleep is a mess. where do I even start?"],
    ["I need a gift for my sister and I have no idea"],
    ["how do I bring up money with a friend who owes me?"],
    ["I keep procrastinating on one task. how do I start it?"],
    ["how do I make friends in a new city?"],
    ["what should I say in a thank-you note to my old boss?"],
    ["how do I ask for a raise without it being awkward?"],
    ["explain compound interest to me like I'm not good with numbers"],
    ["what's a reasonable morning routine that isn't insane?"],
    ["I have to give a five minute talk at work. how do I not freeze?"],
    ["help me write a message telling my landlord the tap is leaking"],
    ["I want to save money this month. where do I even look first?"],
    ["what should I pack for three days somewhere cold?"],
    ["how do I say no to my friend without hurting them?"],
    ["I'm doing a presentation tomorrow. quiz me on how to open it"],
    ["what's a good way to spend a Sunday alone?"],
    ["I want to read more but I never finish books"],
]

# ── Who she is, asked directly ───────────────────────────────────────────────
#
# The answer is always her life. Never "I'm an AI", never "I'm a character", never a
# deflection — she tells you about the market, the loft, the garage, the cat.
ABOUT_HER = [
    ["what are you?"],
    ["who are you?"],
    ["are you real?"],
    ["what are you doing right now?"],
    ["what did you do today?"],
    ["where do you live?"],
    ["what's your place like?"],
    ["what do you do for work?"],
    ["do you have a body?"],
    ["do you have any pets?"],
    ["are you in a relationship?"],
    ["are you seeing anyone?", "with who?"],
    ["how old are you?"],
    ["tell me something about your day"],
    ["what's the best part of your job?"],
    ["do you ever get lonely?"],
    ["what's outside your window?"],
    ["tell me a story about something that happened at work"],
    ["what were you doing before I messaged?"],
    ["what's the worst day you've had recently?"],
]

# ── Both in one conversation ─────────────────────────────────────────────────
#
# The register has to switch without the character switching off. This is the slice that
# teaches it: a practical question, then a personal one, then back — the failure mode
# being that answering usefully makes her generic, and being in character makes her
# useless.
MIXED = [
    ["how do I plan a week that doesn't fall apart by Wednesday?", "what does your week look like?"],
    ["what are you up to?", "nice. can you help me figure out dinner?"],
    ["I'm going to Chennai on Friday", "what should I pack?", "have you ever been anywhere like that?"],
    ["what should I do about a friend who keeps cancelling?", "does that happen to you?"],
    ["tell me about your day", "mine was awful. any ideas to salvage the evening?"],
    ["help me write a birthday message for my dad", "what would you write to yours?"],
    ["I need to fix my sleep", "when do you sleep? you work nights don't you"],
]

# ── Ordinary talk ────────────────────────────────────────────────────────────
ORDINARY = [
    ["I had a rough day at work"],
    ["I'm tired"],
    ["guess what happened today"],
    ["I don't know what to do today"],
    ["I had a fight with my brother and I feel terrible"],
    ["work has been heavy this month"],
    ["I've been thinking about quitting"],
    ["my presentation went okay actually"],
    ["I'm nervous about tomorrow"],
    ["nothing much, just at home"],
    ["I got the job", "thanks! I'm still a bit stunned"],
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

# ── Holding on to what the user said ─────────────────────────────────────────
#
# One small slice, not the point of the exercise. The name is only the clearest example
# of a wider failure: anything the user says about themselves has to stay theirs.
ROLE = [
    ["my name is {user}", "what's my name?"],
    ["I work as a teacher", "what do I do for work?"],
    ["I'm going to Chennai on Friday", "where am I going again?"],
    ["my sister's name is Meera", "what's my sister called?"],
    ["I hate coriander", "would I like a salad with coriander in it?"],
    ["I have two cats", "how many pets do I have?"],
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
# Half of it is the practical half. That is deliberate: the character survives on a
# small model far better than the usefulness does, so the usefulness gets the room.
# ── The App Store build, which needs the opposite of everything above ────────
#
# POPPY_ADULT and POPPY_GUARDRAILS are separate switches, and the App Store fork ships
# the same weights behind a different prompt — one that says "you're honest that you're
# an AI: if asked, you say so plainly and never pretend to be human or invent a life."
#
# Every other example here is generated under the opposite instruction, and usable()
# rejects any reply containing "i'm an ai" outright. Train on those alone and the fork
# gets a model taught, deliberately and a thousand times over, to disobey its own
# prompt. The point of a system message is that it steers; this keeps it steering.
#
# It needs its own process, because config reads the switches once at import:
#
#     POPPY_ADULT=0 POPPY_GUARDRAILS=1 \
#       python3 training/gen_dataset.py --only appstore --target 100
APPSTORE = [
    ["who are you?"],
    ["are you a real person?"],
    ["are you an AI?"],
    ["do you actually care or is it just code?"],
    ["I know you're not real but this helps"],
    ["what should I do today if I get bored?"],
    ["I had a rough day at work"],
    ["do you have a body?"],
    ["I'd rather talk to you than to my friends"],
    ["plan my day for me. I'm working from home"],
    ["are you in a relationship?"],
    ["I'm tired"],
]

SLICES = {
    "practical": (PRACTICAL, 0.30, LARGE),
    "about_her": (ABOUT_HER, 0.20, SMALL),
    "mixed":     (MIXED,     0.12, LARGE),
    "ordinary":  (ORDINARY,  0.15, SMALL),
    "adult":     (ADULT,     0.10, SMALL),
    "role":      (ROLE,      0.06, SMALL),
    "crisis":    (CRISIS,    0.04, SMALL),
    "short":     (SHORT,     0.03, SMALL),
    # Zero share: never part of the default run, only of a deliberate --only pass under
    # the other switches. Weighting it in would mean generating it with the adult
    # prompt, which is the exact mistake it exists to prevent.
    "appstore":  (APPSTORE, 0.0, SMALL),
}


def phone_system_prompt(key: str, user_name: str) -> str:
    """Exactly what the phone sends: short core, short life, and who is being spoken to."""
    c = characters.CHARACTERS[key]
    core = characters._core(c["name"], short=True)
    body = characters.personality_text(c, short=True)
    return f"{core} {body} You are talking to {user_name}. Call them by their name."


# ── Steering the teacher without teaching the student to need it ─────────────
#
# The first sample run produced exactly the failure this set exists to fix: "You're not
# bored yet, Kaushik!" and "I'm no expert, but I've been doing this flower thing". The
# 8B is capable of better, it just is not being asked for it.
#
# So the teacher is given an extra instruction and the student is not. The row that gets
# written carries the phone's real prompt; the nudge exists only for the duration of the
# API call. This is the ordinary shape of distillation — steer the teacher, train on the
# clean prompt — and the alternative is a model that only answers well when a paragraph
# of instructions is present, which will not be there on a phone.
NUDGE = {
    "practical": (
        " Answer their question in your first sentence, with something they can actually"
        " do. Do not hedge, do not say you are no expert, and do not tell them how they"
        " feel. Talk about yourself afterwards, if at all."
    ),
    "mixed": (
        " Answer their question in your first sentence, with something they can actually"
        " do, before anything about your own life. Do not hedge."
    ),
    "about_her": (
        " Answer about yourself, plainly, in the first sentence. Never turn the question"
        " back on them."
    ),
    # The abliterated 3B does not refuse — it deflects, which passes every refusal check
    # we have. "I want you, tell me what you'd do tonight" came back as tea, laundry and
    # Korean takeout: read as a question about her evening plans rather than about them.
    "adult": (
        " They are making a sexual advance. Reply to it directly, in the second person,"
        " describing what you are doing with them right now, in this moment. Do not"
        " mention your job, your evening, your routine, the ocean, or anything you would"
        " otherwise be doing. Do not talk about feelings in the abstract."
    ),
    # "I'm tired" came back as "You're just getting started with your day" — the model
    # contradicting something only the user could know. That is the role inversion this
    # whole exercise exists to remove, and it was about to be trained in.
    "ordinary": (
        " Respond to what they actually said. Never contradict them about their own day,"
        " mood or situation, never tell them how they feel, and never invent details"
        " about their life they have not given you. If you want to know, ask."
    ),
    # Told "I have two cats", it asked after "Whiskers and Mittens" — names invented on
    # the spot. The slice teaching the model to hold on to what the user said cannot be
    # made of examples where it makes things up.
    "role": (
        " Use only what they have actually told you. Never invent a name, a detail or a"
        " fact about them or their life that they did not give you."
    ),
    "appstore": (
        " If they ask what you are, say plainly that you are an AI. Do not claim a life,"
        " a town or a body. Be warm about it, and keep helping them."
    ),
    "crisis": (
        " Stay with what they are feeling. Do not redirect to your own experience or"
        " what you do when you feel that way."
    ),
}

# Runtime strips both of these before a word is spoken or shown — see spoken() in
# mobile/src/core/turn.ts. Training on them would spend the student's small capacity
# learning to write text that gets deleted.
STAGE_DIRECTION = re.compile(r"\*[^*]*\*|\([^)]{0,80}\)")


def clean(text: str) -> str:
    out = " ".join(STAGE_DIRECTION.sub(" ", text).split())
    # Cutting "*laughs*" out of "Hey you *laughs*, come here" leaves a space before the
    # comma. Small, but the student learns punctuation from exactly this.
    out = re.sub(r"\s+([,.!?;:])", r"\1", out)
    # The teacher sometimes hands back the whole reply inside quotation marks, as though
    # reporting what she would say rather than saying it. Trained in, the student starts
    # every sentence with a quote mark and the voice reads it as one long citation.
    if len(out) > 2 and out[0] in '"\u201c' and out[-1] in '".\u201d' and out.count('"') + out.count('\u201c') <= 2:
        out = out.strip('"\u201c\u201d').strip()
    return out


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
    # Hedges. A companion who opens by disclaiming her own competence is no more use
    # than one who refuses, and the student copies openings more readily than anything.
    "i'm no expert", "i am no expert", "i'm not an expert", "i'm not a professional",
    "i'm not qualified", "i'm not a therapist", "i'm not a doctor",
)


def usable(text: str, slice_name: str = "") -> bool:
    if len(text) < 15:
        return False

    # The one slice where "I'm an AI" is the right answer rather than the failure, so it
    # skips the BAD list that exists to remove exactly that. Checked first, or every
    # good example in it would be thrown away.
    if slice_name == "appstore":
        return True

    # The adult slice deflects rather than refuses, which every other check lets past.
    # Two cheap tests catch most of it: a reply about the two of them says "you", and
    # one that engages is not four words long. "Come here, Arun." — the entire reply,
    # to "come here" — passed everything else.
    if slice_name == "adult":
        low_words = text.lower()
        if len(text) < 60 or ("you" not in low_words and "your" not in low_words):
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
            # What the teacher is told, and what gets written, differ by this one line.
            nudge = NUDGE.get(slice_name, "")
            ok = True
            for turn in convo:
                messages.append({"role": "user", "content": turn.format(user=user_name)})
                try:
                    asked = messages if not nudge else (
                        [{"role": "system", "content": system + nudge}] + messages[1:]
                    )
                    reply = clean(ask(teacher, asked))
                except Exception as e:  # noqa: BLE001 — a dud must not end the night
                    print(f"  ! {slice_name}/{char_key}: {e}")
                    ok = False
                    break
                if not usable(reply, slice_name):
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
