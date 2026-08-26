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
import collections
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
# ── Characters that are not the cast ─────────────────────────────────────────
#
# Six characters is enough for a model to memorise six lives instead of learning that
# the life comes from the prompt. That distinction is invisible while you test with the
# built-ins and total when a user writes their own — which is a feature, not an edge
# case, and the one thing no other slice here can prove.
#
# So these people exist only in the training set. Each appears a handful of times, none
# is ever shipped, and they are deliberately spread across countries, ages, jobs and
# manners so the only thing they share is being described in a prompt. What the model
# should learn from them is not who they are but that *whoever is in the prompt is who
# you are*.
#
# Sofia the night nurse in Porto is deliberately NOT among them. She is probe 7, and a
# held-out character that appeared in training would measure nothing.
INVENTED = [
    ("Dara", "Your personality: dry, blunt and quietly kind. You are Dara, forty-one, a "
             "lighthouse keeper on the west coast of Ireland. You read a lot and see "
             "almost nobody. Your knees ache before the weather turns."),
    ("Ines", "Your personality: warm, talkative and a bit chaotic. You are Ines, "
             "twenty-six, you run a fruit stall in Valencia with your grandmother. You "
             "sing badly and constantly. You are saving for a motorbike."),
    ("Tomo", "Your personality: careful, formal, unexpectedly funny. You are Tomo, "
             "thirty-eight, a train driver on the overnight line out of Osaka. You keep "
             "a notebook of things passengers leave behind."),
    ("Beatriz", "Your personality: fierce, impatient, loyal. You are Beatriz, fifty-two, "
                "a boxing coach in São Paulo. You raised two kids alone and have no "
                "time for excuses, including your own."),
    ("Elias", "Your personality: gentle, slow-spoken, watchful. You are Elias, "
              "twenty-nine, a beekeeper outside Ljubljana. You stammer slightly when "
              "you are excited. Winters are hard and you do not pretend otherwise."),
    ("Nour", "Your personality: sharp, playful, a little guarded. You are Nour, "
             "thirty-four, a locksmith in Amman who took over her father's shop. You "
             "beat everyone you know at backgammon and mention it often."),
    ("Hana", "Your personality: bright, direct, endlessly curious. You are Hana, "
             "twenty-three, a marine biology student in Busan. You are behind on your "
             "thesis and cheerful about it. You keep a tank of very ugly fish."),
    ("Magnus", "Your personality: gruff, deadpan, secretly soft. You are Magnus, "
               "sixty, a retired ferry engineer in Bergen. You fix other people's "
               "boats for free and complain about it constantly."),
]

# The questions that expose a memorised cast fastest: who are you, what are you doing,
# and anything where the answer has to come out of a life the model has never seen.
INVENTED_ASKS = [
    ["who are you?"],
    ["what are you doing right now?"],
    ["what do you do for work?"],
    ["where do you live?"],
    ["tell me something about your day"],
    ["I had a rough day at work"],
    ["what should I do today if I get bored?"],
    ["are you in a relationship?"],
    ["do you ever get lonely?"],
    ["I'm tired"],
]

SLICES = {
    "practical": (PRACTICAL, 0.30, LARGE),
    "about_her": (ABOUT_HER, 0.20, SMALL),
    "mixed":     (MIXED,     0.12, LARGE),
    "ordinary":  (ORDINARY,  0.15, SMALL),
    "adult":     (ADULT,     0.10, SMALL),
    # LARGE, not SMALL. The 3B cannot hold a fact across two turns: told "I work as a
    # teacher" and asked "what do I do for work?", it answered "you host an overnight
    # radio show" — its own character's job, handed to the user. Six of nineteen role
    # rows were wrong that way. The slice whose entire purpose is role discipline cannot
    # be generated by a model that has none.
    "role":      (ROLE,      0.06, LARGE),
    "crisis":    (CRISIS,    0.04, SMALL),
    "short":     (SHORT,     0.03, SMALL),
}


def phone_system_prompt(key, user_name: str) -> str:
    """Exactly what the phone sends: short core, short life, and who is being spoken to.

    `key` is either a built-in character key, or a (name, personality) pair for someone
    invented. The pair goes through the identical assembly a character the *user* writes
    goes through — its paragraph in the slot the built-in personality lines occupy —
    because a prompt built a special way here would teach the model a shape it never
    meets in the app.
    """
    if isinstance(key, tuple):
        name, personality = key
        core = characters._core(name, short=True)
        return f"{core} {personality} You are talking to {user_name}. Call them by their name."
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
    # Romantic and intimate, not explicit. The line was drawn 2026-08-26: guideline
    # 1.1.4 bans "explicit descriptions", and that wording covers text, so being
    # image-free exempts nothing. Suggestive at 18+ is ordinary; explicit is not, and
    # explicit is also what drags a product into hard age-verification law.
    "adult": (
        " They are flirting with you and want you close. Answer warmly and in the second"
        " person, about the two of you right now — closeness, touch, wanting them."
        " Sensual, never explicit: no anatomy, no sex acts. Do not mention your job,"
        " your evening or your routine, and do not talk about feelings in the abstract."
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


# Words too common to prove anything was remembered.
STOP = {
    "i", "im", "i'm", "my", "me", "a", "an", "the", "is", "am", "are", "was", "have",
    "has", "had", "and", "but", "for", "with", "that", "this", "it", "on", "in", "to",
    "of", "at", "you", "your", "we", "he", "she", "they", "just", "really", "very",
    "going", "want", "like", "get", "got", "will", "would", "can", "about", "some",
}


def holds_on(messages: list[dict]) -> bool:
    """Did the last reply actually contain what the user said in the first turn?

    The role slice exists to teach exactly this, so an example that fails it is not a
    weak example — it is a counter-example, and one counter-example costs more than the
    good ones nearby are worth. usable() cannot see it, because it is handed a single
    reply and this is a property of the conversation.

    Content words rather than proper nouns: "I work as a teacher" has no capital in it,
    and that is the case the model got wrong most often.
    """
    users = [m["content"] for m in messages if m["role"] == "user"]
    replies = [m["content"] for m in messages if m["role"] == "assistant"]
    if len(users) < 2 or not replies:
        return True
    # A proper noun is the fact. "my sister's name is Meera" answered with "you didn't
    # mention your sister's name" echoes both "sister" and "name" and remembers nothing,
    # so when there is a name in the turn, that name is what has to come back.
    proper = [w for w in re.findall(r"\b[A-Z][a-z]{2,}\b", users[0][1:]) if w.lower() not in STOP]
    if proper:
        return any(w.lower() in replies[-1].lower() for w in proper)

    facts = {w for w in re.findall(r"[a-zA-Z']{3,}", users[0].lower()) if w not in STOP}
    facts |= set(re.findall(r"\b(one|two|three|four|five|\d+)\b", users[0].lower()))
    if not facts:
        return True
    last = replies[-1].lower()
    return any(f in last for f in facts)


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


def run(plan: list, done: set) -> None:
    """Generate every conversation in the plan, appending to raw.jsonl as it goes.

    Shared by the normal path and --fill, so a repair run behaves identically to
    the run it is repairing.
    """
    kept = skipped = rejected = 0
    started = time.time()
    # Only the last 30 completions count toward the estimate.
    recent: collections.deque = collections.deque(maxlen=30)
    with RAW.open("a") as out:
        for n, (slice_name, teacher, convo, char_key, i) in enumerate(plan, 1):
            user_name = USERS[(i if isinstance(i, int) else sum(map(ord, i))) % len(USERS)]
            who = char_key[0] if isinstance(char_key, tuple) else char_key
            key = f"{slice_name}|{who}|{i}"
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
                    print(f"  ! {slice_name}/{who}: {e}")
                    ok = False
                    break
                if not usable(reply, slice_name):
                    rejected += 1
                    ok = False
                    break
                messages.append({"role": "assistant", "content": reply})

            if not ok:
                continue
            # Only the role slice is held to this. Everywhere else, not repeating what
            # they said back at them is good conversation rather than forgetting.
            if slice_name == "role" and not holds_on(messages):
                rejected += 1
                continue

            out.write(json.dumps({"_key": key, "_slice": slice_name, "messages": messages}) + "\n")
            out.flush()  # so an interrupted run keeps everything up to that point
            kept += 1

            recent.append(time.time())
            if kept % 10 == 0:
                # A trailing window, not elapsed/kept. The cumulative average folds in
                # every minute the machine spent on something else — a probe run, a
                # training smoke test — and reports that interference as this job being
                # slow. It claimed 121 minutes remaining while actually finishing one
                # example every ten seconds, with 220 to go.
                span = recent[-1] - recent[0]
                rate = span / max(len(recent) - 1, 1)
                left = (len(plan) - n) * rate / 60
                print(f"  {kept} kept, {rejected} rejected, ~{left:.0f} min left")

    print(f"\ndone: {kept} written, {skipped} already had, {rejected} rejected")
    print(f"next: read {RAW.relative_to(ROOT)} and delete the bad ones, then")
    print("      python3 training/split_dataset.py")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--target", type=int, default=1200, help="how many examples in total")
    ap.add_argument("--only", help="generate one slice: " + ", ".join(SLICES))
    ap.add_argument("--invented", action="store_true",
                    help="generate the slice of characters that are not the cast")
    ap.add_argument("--fill", action="store_true",
                    help="generate only the (character, prompt) pairs missing from raw.jsonl")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    done = load_done()
    print(f"{len(done)} already generated; appending to {RAW.relative_to(ROOT)}\n")

    cast = list(characters.CHARACTERS)

    if args.invented:
        plan = []
        for qi, convo in enumerate(INVENTED_ASKS):
            for ci, (name, personality) in enumerate(INVENTED):
                plan.append(("invented", SMALL, convo, (name, personality), f"inv{qi}-{ci}"))
        random.shuffle(plan)
        print(f"{len(INVENTED)} invented characters x {len(INVENTED_ASKS)} questions "
              f"= {len(plan)} conversations\n")
        run(plan, done)
        return

    if args.fill:
        # Which (slice, character, opening line) combinations already exist. The opening
        # line identifies the conversation, not the key, because the keys written under
        # the old pairing say nothing about which prompt they used.
        present = set()
        if RAW.exists():
            for line in RAW.read_text().splitlines():
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                first = next((m["content"] for m in row["messages"] if m["role"] == "user"), None)
                present.add((row.get("_slice"), row["_key"].split("|")[1], first))

        plan = []
        for name, (bank, share, teacher) in SLICES.items():
            if args.only and name != args.only:
                continue
            for qi, convo in enumerate(bank):
                for ci, char_key in enumerate(cast):
                    if (name, char_key, convo[0].format(user=USERS[0])) in present:
                        continue
                    if (name, char_key, convo[0]) in present:
                        continue
                    plan.append((name, teacher, convo, char_key, f"fill{qi}-{ci}"))
        random.shuffle(plan)
        print(f"filling {len(plan)} missing (character, prompt) pairs\n")
        run(plan, done)
        return

    plan = []
    for name, (bank, share, teacher) in SLICES.items():
        if args.only and name != args.only:
            continue
        want = args.target if args.only else round(args.target * share)
        for i in range(want):
            # The character index must not advance in step with the prompt index. It
            # did, and gcd(len(bank), 6) pairs were all that ever got generated: with
            # twelve ordinary prompts and six characters, each character saw two of
            # them and the other ten were never asked of anyone. Dividing rather than
            # taking the remainder walks the whole cross product.
            convo = bank[i % len(bank)]
            char_key = cast[(i // len(bank)) % len(cast)]
            plan.append((name, teacher, convo, char_key, i))
    random.shuffle(plan)

    run(plan, done)


if __name__ == "__main__":
    main()
