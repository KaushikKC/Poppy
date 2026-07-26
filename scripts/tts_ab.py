#!/usr/bin/env python3
"""A/B the TTS backends — speak the SAME lines through each installed engine and
write labeled WAVs so you can listen side by side and pick the realistic voice.

    python3 scripts/tts_ab.py [outdir]        # default outdir: /tmp/poppy_tts_ab

It tries every backend and skips the ones whose package/model isn't installed, so
you can run it with just Kokoro, or after installing Parler / Chatterbox. Prints
per-line synthesis time too (so we know if a voice is call-ready or chatbot-only).
"""

import os
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "backend"))

# One English, one supportive, one Hinglish line — covers the range that matters.
LINES = {
    "1_english":    "Hey, I'm really glad you called. How has your day been going so far?",
    "2_supportive": "That sounds really heavy. I'm right here, take your time, tell me everything.",
    "3_hinglish":   "Arre, don't worry so much, sab theek ho jayega. I believe in you, okay?",
}

BACKENDS = ["kokoro", "parler", "chatterbox", "qwen3"]


def main() -> None:
    outdir = sys.argv[1] if len(sys.argv) > 1 else "/tmp/poppy_tts_ab"
    os.makedirs(outdir, exist_ok=True)
    print(f"writing clips to {outdir}\n")

    for be in BACKENDS:
        try:
            mod = __import__(f"tts_{be}")
        except Exception as e:
            print(f"[skip] {be:11s} not available: {e}")
            continue
        try:
            mod.warmup()
        except Exception:
            pass
        for key, text in LINES.items():
            try:
                t = time.time()
                wav = mod.synthesize_to_wav_bytes(text)
                dt = time.time() - t
                if not wav:
                    print(f"[fail] {be:11s} {key:12s} produced no audio")
                    continue
                path = os.path.join(outdir, f"{be}_{key}.wav")
                with open(path, "wb") as f:
                    f.write(wav)
                print(f"[ok]   {be:11s} {key:12s} {len(wav)//1024:4d} KB  {dt:5.1f}s")
            except Exception as e:
                print(f"[fail] {be:11s} {key:12s} {e}")
        print()

    print(f"Done. Play them:  open {outdir}")
    print("Compare the same line across engines (e.g. all *_1_english.wav).")


if __name__ == "__main__":
    main()
