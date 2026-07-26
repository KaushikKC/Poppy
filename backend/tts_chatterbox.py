"""Chatterbox backend (Resemble AI) — MIT-licensed, most natural in blind tests,
0.5B. Clones a voice from a short reference clip: point CHATTERBOX_REF at a ~10s WAV
of an Indian girl voice to make her sound Indian; without it, Chatterbox uses its
built-in default voice.

Install (one-time): pip install chatterbox-tts
"""

import os
import threading

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np

from tts_util import float_to_wav_bytes

SAMPLE_RATE = 24000  # corrected from the model on load
# ~10s reference clip to clone (an Indian girl voice). Empty = built-in default voice.
_REF = os.getenv("CHATTERBOX_REF", "")

_model = None
_lock = threading.Lock()


def _load() -> None:
    global _model, SAMPLE_RATE
    if _model is not None:
        return
    import torch
    from chatterbox.tts import ChatterboxTTS

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    _model = ChatterboxTTS.from_pretrained(device=device)
    SAMPLE_RATE = int(getattr(_model, "sr", 24000))


def synthesize_to_wav_bytes(
    text: str, accent: str | None = None, gender: str | None = None,
    voice: str | None = None,
) -> bytes:
    _load()
    with _lock:
        kwargs = {}
        if _REF and os.path.exists(_REF):
            kwargs["audio_prompt_path"] = _REF
        wav = _model.generate(text, **kwargs)
    audio = wav.squeeze().detach().cpu().numpy() if hasattr(wav, "detach") else np.asarray(wav).squeeze()
    return float_to_wav_bytes(audio, SAMPLE_RATE)


def warmup() -> None:
    try:
        synthesize_to_wav_bytes("Hello.")
    except Exception:
        pass
