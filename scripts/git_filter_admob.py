#!/usr/bin/env python3
"""
Git clean filter: keeps the real AdMob ids out of the public repository.

The build reads the ids from files that are committed (mobile/app.json, the iOS
Info.plist, mobile/src/bridge/ads.ts), so they cannot simply be gitignored. Instead git
runs every staged copy of those files through this script, which swaps each real id for
Google's public sample id. The working tree keeps the real ids and builds normally; the
index, and therefore GitHub, only ever sees the samples.

The mapping lives in mobile/admob.local.json, which is gitignored. Without it (a fresh
clone, CI) this passes content through unchanged, and those files already hold the
sample ids, so nothing breaks and nothing real can leak.

One-time setup per clone:
    git config filter.admob.clean "python3 scripts/git_filter_admob.py"
    git config filter.admob.smudge cat
"""
import json
import pathlib
import sys

MAPPING = pathlib.Path(__file__).resolve().parent.parent / "mobile" / "admob.local.json"

data = sys.stdin.buffer.read()
if MAPPING.exists():
    for real, sample in json.loads(MAPPING.read_text())["replace"].items():
        data = data.replace(real.encode(), sample.encode())
sys.stdout.buffer.write(data)
