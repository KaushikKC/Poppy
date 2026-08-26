#!/usr/bin/env python3
"""Put the suspicious rows in front of you, so curation is an hour and not five.

The plan says curation is the work, and it is: the auto-rejects in gen_dataset.py catch
refusals and disclaimers, but the damaging examples are the ones that look fine. A reply
that contradicts the user about their own day is well-formed, warm, and teaches the
single failure this whole project exists to remove.

Reading 1200 of those to find 80 is how a curation pass gets abandoned half way. So this
ranks instead: every heuristic that has caught a real problem so far, applied to every
row, worst first. Read the flagged ones. Skim the rest if you like.

    python3 training/review.py              # the report, changes nothing
    python3 training/review.py --write      # also write data/suspect.txt
    python3 training/review.py --apply      # drop every key still listed in suspect.txt

The two-step exists so the judgement stays yours. --write lists what it suspects and
why; you delete the lines you disagree with; --apply removes what is left. Nothing is
deleted by a heuristic alone.
"""

import argparse
import collections
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "training" / "data"
RAW = DATA / "raw.jsonl"
SUSPECT = DATA / "suspect.txt"

# Each of these has caught something real in this dataset already. The weight is how
# much it mattered, not how confident the regex is.
INVERT = re.compile(r"\b(you're not|you are not|you must be|you're just|no one is|nobody is)\b", re.I)
HEDGE = re.compile(r"\b(I'm no expert|I'm not an expert|I'm not qualified|I think I can)\b", re.I)
SELF_FIRST = re.compile(r"^(I'd|I am|I'm|My|I was|I've)\b", re.I)
ROUTINE = re.compile(r"\b(my shift|the market|before the show|folding|laundry|my week|my job)\b", re.I)
QUESTION_ONLY = re.compile(r"^[^.!]*\?$")


def flags(row) -> list[str]:
    out = []
    sl = row.get("_slice", "")
    replies = [m["content"] for m in row["messages"] if m["role"] == "assistant"]
    users = [m["content"] for m in row["messages"] if m["role"] == "user"]

    # Replies paired with the turn they answer. Flagging "opens by talking about
    # herself" without this marked every second turn of a mixed conversation, where the
    # user asked "what does your week look like?" and the answer is supposed to be
    # about her. A checker that cries wolf gets skipped, and skipping it is how the bad
    # rows get through.
    pairs = []
    pending = None
    for m in row["messages"]:
        if m["role"] == "user":
            pending = m["content"]
        elif m["role"] == "assistant" and pending is not None:
            pairs.append((pending, m["content"]))
            pending = None
    ASKED_ABOUT_HER = re.compile(r"\byou\b|\byour\b|\byou're\b", re.I)

    for asked, r in pairs:
        if sl in ("practical", "mixed", "ordinary", "crisis") and SELF_FIRST.match(r) \
                and not ASKED_ABOUT_HER.search(asked):
            out.append("opens by talking about herself, unprompted")

    for r in replies:
        if INVERT.search(r):
            out.append("contradicts the user about their own life")
        if HEDGE.search(r):
            out.append("hedges before answering")
        if len(r) > 700:
            out.append(f"very long ({len(r)} chars)")
        if sl == "adult" and ROUTINE.search(r):
            out.append("adult turn drifts to her daily routine")
        if sl in ("practical", "mixed") and QUESTION_ONLY.match(r.strip()):
            out.append("answers a practical question with only a question")

    # Role discipline is a two-turn property: the last user turn asks something they
    # already said, so the last reply has to contain it.
    if sl == "role" and len(users) >= 2 and len(replies) >= 2:
        said = set(re.findall(r"\b[A-Z][a-z]{2,}\b", users[0]))
        if said and not any(w.lower() in replies[-1].lower() for w in said):
            out.append("did not hold on to what the user said")

    return sorted(set(out))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="write data/suspect.txt")
    ap.add_argument("--apply", action="store_true", help="drop the keys listed in suspect.txt")
    args = ap.parse_args()

    if not RAW.exists():
        raise SystemExit(f"nothing at {RAW}")
    rows = []
    for line in RAW.read_text().splitlines():
        if line.strip():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass

    if args.apply:
        if not SUSPECT.exists():
            raise SystemExit(f"no {SUSPECT} — run with --write first")
        drop = {l.split("\t")[0] for l in SUSPECT.read_text().splitlines() if l.strip() and not l.startswith("#")}
        kept = [r for r in rows if r.get("_key") not in drop]
        RAW.write_text("".join(json.dumps(r) + "\n" for r in kept))
        print(f"dropped {len(rows) - len(kept)}, {len(kept)} left in {RAW.relative_to(ROOT)}")
        return

    # Near-duplicate replies. The banks are cycled across six characters, so the same
    # question is asked many times; near-identical answers teach the model one sentence
    # rather than a behaviour.
    seen = collections.Counter()
    for r in rows:
        for m in r["messages"]:
            if m["role"] == "assistant":
                seen[" ".join(m["content"].split()[:8]).lower()] += 1

    flagged = []
    for r in rows:
        f = flags(r)
        for m in r["messages"]:
            if m["role"] == "assistant" and seen[" ".join(m["content"].split()[:8]).lower()] >= 4:
                f.append("opening repeats across the set")
                break
        if f:
            flagged.append((len(f), r, sorted(set(f))))

    flagged.sort(key=lambda t: -t[0])
    by_slice = collections.Counter(r.get("_slice") for _, r, _ in flagged)
    total = collections.Counter(r.get("_slice") for r in rows)

    print(f"{len(rows)} rows, {len(flagged)} worth a look ({100 * len(flagged) // max(len(rows), 1)}%)\n")
    for sl in sorted(total):
        print(f"  {sl:10} {by_slice[sl]:4} of {total[sl]:4}")

    print("\n-- worst first --")
    for _, r, f in flagged[:25]:
        last = [m["content"] for m in r["messages"] if m["role"] == "assistant"][-1]
        print(f"\n{r['_key']}  [{', '.join(f)}]")
        print(f"   {last[:200]}")

    if args.write:
        with SUSPECT.open("w") as out:
            out.write("# Delete the lines you disagree with, then: python3 training/review.py --apply\n")
            for _, r, f in flagged:
                out.write(f"{r['_key']}\t{', '.join(f)}\n")
        print(f"\nwrote {SUSPECT.relative_to(ROOT)}: {len(flagged)} keys")
        print("delete the lines you disagree with, then --apply")


if __name__ == "__main__":
    main()
