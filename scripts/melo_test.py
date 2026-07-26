#!/usr/bin/env python3
"""Quick test of MeloTTS's Indian-English voice — fast, non-gated, real-time-capable.
Writes clips into the A/B folder next to the Kokoro/Chatterbox ones."""
import sys
import time

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/poppy_tts_ab"

LINES = {
    "1_english":    "Hey, I'm really glad you called. How has your day been going so far?",
    "2_supportive": "That sounds really heavy. I'm right here, take your time, tell me everything.",
    "3_hinglish":   "Arre, don't worry so much, sab theek ho jayega. I believe in you, okay?",
}


def main() -> None:
    from melo.api import TTS
    try:
        import torch
        device = "mps" if torch.backends.mps.is_available() else "cpu"
    except Exception:
        device = "cpu"
    model = TTS(language="EN", device=device)
    spk = model.hps.data.spk2id
    # pick the Indian-English speaker if present
    key = next((k for k in spk if "INDIA" in k.upper()), None) or next(iter(spk))
    print(f"device={device}  speakers={list(spk.keys())}  using={key}")
    for name, text in LINES.items():
        t = time.time()
        model.tts_to_file(text, spk[key], f"{OUT}/melo_{name}.wav", speed=1.0)
        print(f"[ok] melo {name:12s} {time.time()-t:5.1f}s")


if __name__ == "__main__":
    main()
