#!/usr/bin/env python3
"""Fetch clean, rights-clean English voice reference clips into refs/ — no recording.

Uses the Hugging Face datasets-server API (no dataset scripts, works with datasets
5.x) to pull single-speaker English clips from a permissive dataset (default:
mythicinfinity/libritts_r — clean read English, CC-BY-4.0), trims each to ~10s, and
saves them as the character wavs Chatterbox clones from. If the dataset labels gender
it assigns female clips to the female characters and male to the male ones; otherwise
it saves generic clip1..clipN for you to listen and rename.

    pip install soundfile          # (numpy comes with it)
    python3 fetch_refs.py                                   # LibriTTS-R, 6 clips
    python3 fetch_refs.py --dataset <hf/dataset> --config <c> --split <s>

Confirm the dataset's license fits your use and keep attribution (CC-BY sources need a
credit). Clips land in refs/, which is gitignored — they stay local.
"""

import argparse
import io
import json
import os
import ssl
import time
import urllib.parse
import urllib.request
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://datasets-server.huggingface.co"
FEMALE = ["poppy", "luna", "zoe"]
MALE = ["leo", "kai", "ravi"]
_HDRS = {"Authorization": f"Bearer {os.getenv('HF_TOKEN')}"} if os.getenv("HF_TOKEN") else {}

# macOS python.org builds don't trust the system keychain for urllib, so verification
# fails ("unable to get local issuer certificate"). Use certifi's CA bundle if present.
try:
    import certifi
    _SSL = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL = None


def _open(url: str, tries: int = 5):
    # The datasets-server returns transient 429/5xx under load; retry with backoff.
    req = urllib.request.Request(url, headers=_HDRS)
    for attempt in range(tries):
        try:
            return urllib.request.urlopen(req, timeout=60, context=_SSL)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise
        except urllib.error.URLError:
            if attempt < tries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise


def _get_json(url: str) -> dict:
    with _open(url) as r:
        return json.loads(r.read())


def _pick_split(dataset: str, config: str | None, split: str | None):
    if config and split:
        return config, split
    data = _get_json(f"{API}/splits?dataset={urllib.parse.quote(dataset)}")
    splits = data.get("splits", [])
    if not splits:
        raise SystemExit(f"no splits found for {dataset} (no preview available)")
    # prefer a "clean"/"test" split — smaller and cleaner — else the first one.
    ranked = sorted(splits, key=lambda s: (
        "clean" not in s["split"], "test" not in s["split"] and "dev" not in s["split"]))
    chosen = ranked[0]
    return config or chosen["config"], split or chosen["split"]


def _audio_url(row: dict) -> str | None:
    for v in row.values():
        if isinstance(v, list) and v and isinstance(v[0], dict) and v[0].get("src"):
            return v[0]["src"]
        if isinstance(v, dict) and v.get("src"):
            return v["src"]
    return None


def _gender_of(row: dict) -> str | None:
    for k in ("gender", "sex", "speaker_gender"):
        g = str(row.get(k, "")).strip().lower()
        if g.startswith("f"):
            return "female"
        if g.startswith("m"):
            return "male"
    return None


def _speaker_of(row: dict) -> str | None:
    for k in ("speaker_id", "client_id", "speaker", "spk_id", "id"):
        if row.get(k):
            return str(row[k])
    return None


def _save(url: str, path: str, seconds: float, min_seconds: float) -> bool:
    import numpy as np
    import soundfile as sf

    with _open(url) as r:
        raw = r.read()
    audio, sr = sf.read(io.BytesIO(raw), dtype="float32", always_2d=False)
    if getattr(audio, "ndim", 1) > 1:
        audio = audio.mean(axis=1)
    audio = np.asarray(audio, dtype=np.float32)
    # Too-short utterances make weak voice references — skip them.
    if audio.size < int(sr * min_seconds):
        return False
    audio = audio[: int(sr * seconds)]
    peak = float(np.max(np.abs(audio))) or 1.0
    pcm = (np.clip(audio / peak * 0.95, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sr))
        wf.writeframes(pcm.tobytes())
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="mythicinfinity/libritts_r")
    ap.add_argument("--config", default="clean")
    ap.add_argument("--split", default="test.clean")
    ap.add_argument("--seconds", type=float, default=10.0)
    ap.add_argument("--min-seconds", type=float, default=5.0,
                    help="skip source clips shorter than this (weak references)")
    ap.add_argument("--count", type=int, default=6,
                    help="how many distinct-speaker clips to fetch. Bump it (e.g. 16) "
                         "to get a bigger pool to pick 3 male + 3 female from by ear.")
    ap.add_argument("--out", default=os.path.join(HERE, "refs"))
    ap.add_argument("--max-scan", type=int, default=4000)
    a = ap.parse_args()

    config, split = _pick_split(a.dataset, a.config, a.split)
    os.makedirs(a.out, exist_ok=True)
    print(f"fetching from {a.dataset} [{config}/{split}] via datasets-server ...")

    # Gender auto-assign to the 6 character names only makes sense for the default
    # count with a gender-labeled dataset. For any other count (a pick-by-ear pool),
    # save generic clip1..clipN instead.
    want_f, want_m = (list(FEMALE), list(MALE)) if a.count == 6 else ([], [])
    generic, seen = [], set()
    saved, offset, PAGE = 0, 0, 100

    while offset < a.max_scan and (want_f or want_m or len(generic) < a.count):
        url = (f"{API}/rows?dataset={urllib.parse.quote(a.dataset)}"
               f"&config={urllib.parse.quote(config)}&split={urllib.parse.quote(split)}"
               f"&offset={offset}&length={PAGE}")
        rows = _get_json(url).get("rows", [])
        if not rows:
            break
        for item in rows:
            row = item.get("row", {})
            spk = _speaker_of(row)
            if spk and spk in seen:
                continue
            src = _audio_url(row)
            if not src:
                continue
            # Choose a target name but don't consume the slot until the save succeeds
            # (so a too-short/failed clip doesn't burn a character name).
            gender = _gender_of(row)
            if gender == "female" and want_f:
                kind, name = "f", want_f[0]
            elif gender == "male" and want_m:
                kind, name = "m", want_m[0]
            elif gender is None and len(generic) < a.count:
                kind, name = "g", f"clip{len(generic) + 1}"
            else:
                continue
            try:
                ok = _save(src, os.path.join(a.out, f"{name}.wav"), a.seconds, a.min_seconds)
            except Exception as e:
                print(f"  skip ({e})")
                continue
            if not ok:            # too short / empty — slot not consumed, keep scanning
                continue
            if kind == "f":
                want_f.pop(0)
            elif kind == "m":
                want_m.pop(0)
            else:
                generic.append(name)
            if spk:
                seen.add(spk)
            saved += 1
            print(f"  saved {name}.wav  ({gender or 'unlabeled'})")
            if not (want_f or want_m or len(generic) < a.count):
                break
        offset += PAGE

    print(f"\nDone: {saved} clips in {a.out}")
    if generic:
        print("No gender labels in this dataset — listen to clip1..clipN and rename the "
              "ones you like to poppy/luna/zoe/leo/kai/ravi.wav (3 female, 3 male).")
    if want_f or want_m:
        print(f"Still need: {', '.join(want_f + want_m)} — rerun with a bigger "
              "--max-scan or another --dataset.")
    print("Keep attribution for CC-BY sources.")


if __name__ == "__main__":
    main()
