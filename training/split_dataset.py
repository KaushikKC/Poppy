#!/usr/bin/env python3
"""Turn the curated file into what mlx_lm expects.

Two jobs. It drops the bookkeeping fields the generator wrote (`_key`, `_slice`) — they
exist so a run can resume and so the mix can be counted, and mlx_lm does not want them.
And it splits 90/10 into train and valid.

The split is by *slice*, not at random across the file. A validation set that happened
to contain no adult examples and four short ones would report a loss that means nothing,
and the whole reason to watch validation loss is to know when to stop.

    python3 training/split_dataset.py
"""

import json
import pathlib
import random

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "training" / "data"
RAW = DATA / "raw.jsonl"


def main() -> None:
    if not RAW.exists():
        raise SystemExit(f"nothing at {RAW}. Run training/gen_dataset.py first.")

    by_slice: dict[str, list] = {}
    bad = 0
    for line in RAW.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            # A half-written line from an interrupted run, or a hand edit that broke
            # the JSON. Counted and skipped rather than crashing on it.
            bad += 1
            continue
        by_slice.setdefault(row.get("_slice", "other"), []).append(row["messages"])

    train, valid = [], []
    print("mix:")
    for name, rows in sorted(by_slice.items()):
        random.shuffle(rows)
        cut = max(1, round(len(rows) * 0.1)) if len(rows) > 9 else 0
        valid.extend(rows[:cut])
        train.extend(rows[cut:])
        print(f"  {name:10} {len(rows):5}  ({len(rows) - cut} train, {cut} valid)")

    random.shuffle(train)
    random.shuffle(valid)

    for name, rows in (("train", train), ("valid", valid)):
        path = DATA / f"{name}.jsonl"
        with path.open("w") as f:
            for messages in rows:
                f.write(json.dumps({"messages": messages}) + "\n")
        print(f"wrote {path.relative_to(ROOT)}: {len(rows)}")

    if bad:
        print(f"\n{bad} unparseable line(s) skipped — check the end of raw.jsonl")
    total = len(train) + len(valid)
    if total < 400:
        print(f"\n{total} examples is thin. Under about 400 a LoRA tends to overfit")
        print("before it learns the behaviour; generate more before training.")


if __name__ == "__main__":
    main()
