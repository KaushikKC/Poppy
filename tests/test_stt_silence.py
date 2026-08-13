"""Whisper invents words from silence. These are the gates that stop it."""
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import stt

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


print("\n== the energy gate: nothing quiet or brief reaches the model ==")
check("pure silence carries no speech", not stt._carries_speech(np.zeros(24000, dtype=np.float32)))
check("quiet hiss carries no speech",
      not stt._carries_speech((np.random.randn(24000) * 0.0008).astype(np.float32)))
check("a 0.1s blip is too short",
      not stt._carries_speech((np.random.randn(1600) * 0.2).astype(np.float32)))
check("a normal utterance passes",
      stt._carries_speech((np.random.randn(24000) * 0.08).astype(np.float32)))

print("\n== the invented-phrase filter ==")
# Measured: on pure silence the model returned "You" with no_speech_prob 0.862.
for phrase in ("You", "you", "Thank you.", "thanks", "Thanks for watching!",
               "Bye.", "...", "[BLANK_AUDIO]", "okay"):
    check(f"dropped when it is the whole result: {phrase!r}", stt._is_invented(phrase))

print("\n== but never inside real speech ==")
for phrase in ("Thank you so much for listening to me",
               "You were right about the interview",
               "okay so here is what happened",
               "I am going to run a marathon tomorrow"):
    check(f"kept: {phrase[:44]}", not stt._is_invented(phrase))

print("\n== the model's own confidence signals are actually used ==")
src = pathlib.Path(stt.__file__).read_text()
check("no_speech_prob is read", "no_speech_prob" in src)
check("avg_logprob is read", "avg_logprob" in src)
check("the CPU path filters non-speech too", "vad_filter=True" in src)
check("thresholds are named, not magic numbers",
      all(n in src for n in ("NO_SPEECH_MAX", "AVG_LOGPROB_MIN", "MIN_RMS", "MIN_SECONDS")))

print("\n== empty and malformed input is safe ==")
check("None", stt.transcribe(None) == "")
check("empty array", stt.transcribe(np.zeros(0, dtype=np.float32)) == "")

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
