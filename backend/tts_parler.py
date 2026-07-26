"""Indic Parler-TTS backend (AI4Bharat / IIT-Madras) — a realistic Indian-accented
voice, English + Hindi + Indic, Apache-2.0 (safe to ship). No reference clip needed:
Parler is steered by a natural-language *description* that names a recommended Indian
speaker and the tone.

Install (one-time, needs internet + a few GB disk):
    pip install git+https://github.com/huggingface/parler-tts.git
The model (ai4bharat/indic-parler-tts) downloads on first use.
"""

import os
import threading

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

from tts_util import float_to_wav_bytes

_MODEL_ID = os.getenv("PARLER_MODEL", "ai4bharat/indic-parler-tts")
# A warm, gentle Indian female voice. Indic Parler-TTS has recommended speakers per
# language (e.g. female speakers like "Anushka"/"Divya"); naming one keeps it stable.
_DESCRIPTION = os.getenv(
    "PARLER_DESCRIPTION",
    "Divya speaks in a warm, gentle and clear voice with an Indian accent, at a "
    "natural, relaxed pace, in a quiet room with very clean, close-up audio.",
)

SAMPLE_RATE = 44100  # corrected from the model config on load

_model = None
_tok = None
_desc_tok = None
_lock = threading.Lock()


def _load() -> None:
    global _model, _tok, _desc_tok, SAMPLE_RATE
    if _model is not None:
        return
    import torch
    from parler_tts import ParlerTTSForConditionalGeneration
    from transformers import AutoTokenizer

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    _model = ParlerTTSForConditionalGeneration.from_pretrained(_MODEL_ID).to(device)
    _tok = AutoTokenizer.from_pretrained(_MODEL_ID)
    _desc_tok = AutoTokenizer.from_pretrained(_model.config.text_encoder._name_or_path)
    SAMPLE_RATE = int(_model.config.sampling_rate)


def synthesize_to_wav_bytes(
    text: str, accent: str | None = None, gender: str | None = None,
    voice: str | None = None,
) -> bytes:
    _load()
    import torch

    with _lock:
        device = _model.device
        desc = _desc_tok(_DESCRIPTION, return_tensors="pt").to(device)
        prompt = _tok(text, return_tensors="pt").to(device)
        with torch.no_grad():
            gen = _model.generate(
                input_ids=desc.input_ids,
                attention_mask=desc.attention_mask,
                prompt_input_ids=prompt.input_ids,
                prompt_attention_mask=prompt.attention_mask,
            )
        audio = gen.cpu().numpy().squeeze()
    return float_to_wav_bytes(audio, SAMPLE_RATE)


def warmup() -> None:
    try:
        synthesize_to_wav_bytes("Hello.")
    except Exception:
        pass
