"""Qwen3-TTS backend (Alibaba/Qwen) — open weights on Hugging Face, English +
cloning via the CustomVoice model, small (0.6B/1.7B). Deferred: we only add this to
the A/B if Indic Parler-TTS and Chatterbox don't win, and its Python API should be
pinned against the repo when we install it.

Install (one-time):
    pip install qwen3-tts        # or: pip install git+https://github.com/QwenLM/Qwen3-TTS
    # weights: Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice (Hugging Face)

Wiring TODO (finalize against the repo README on install):
    from qwen3_tts import Qwen3TTS
    model = Qwen3TTS.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice")
    audio, sr = model.generate(text, ref_audio=<indian-girl.wav>)
"""

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

SAMPLE_RATE = 24000

_model = None


def _load() -> None:
    raise NotImplementedError(
        "Qwen3-TTS not wired yet. Install it and finalize tts_qwen3.py against the "
        "repo README (see the module docstring). We only reach for Qwen3 if Parler "
        "and Chatterbox don't win the A/B."
    )


def synthesize_to_wav_bytes(text, accent=None, gender=None, voice=None) -> bytes:
    _load()


def warmup() -> None:
    pass
