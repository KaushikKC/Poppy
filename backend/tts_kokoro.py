"""Kokoro-82M TTS backend (the original, fast, Apache-2.0 voice). Kept as the
lightweight default/fallback; the realistic backends (parler/chatterbox/qwen3) are
selected via TTS_BACKEND. Same interface as every backend: synthesize_to_wav_bytes,
warmup, SAMPLE_RATE."""

import io
import os
import threading
import wave

# Enable Apple-Silicon GPU fallback before torch/kokoro import so MPS can be used.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np
from kokoro import KModel, KPipeline

from config import KOKORO_REPO_ID, KOKORO_SAMPLE_RATE, KOKORO_DEVICE
from accent import voice_for

SAMPLE_RATE = KOKORO_SAMPLE_RATE

_model: KModel | None = None
_pipelines: dict[str, KPipeline] = {}
_lock = threading.Lock()


def _get_model() -> KModel:
    global _model
    if _model is None:
        _model = KModel(repo_id=KOKORO_REPO_ID)
        if KOKORO_DEVICE:
            _model = _model.to(KOKORO_DEVICE)
    return _model


def _get_pipeline(lang_code: str) -> KPipeline:
    if lang_code not in _pipelines:
        _pipelines[lang_code] = KPipeline(
            lang_code=lang_code, model=_get_model(), repo_id=KOKORO_REPO_ID
        )
    return _pipelines[lang_code]


def warmup() -> None:
    try:
        synthesize_to_wav_bytes("Hello there.")
    except Exception:
        pass


def synthesize_to_wav_bytes(
    text: str, accent: str | None = None, gender: str | None = None,
    voice: str | None = None,
) -> bytes:
    """Synthesize `text`, return WAV bytes (24 kHz mono). An explicit `voice` (a
    character's Kokoro voice) wins; else picked from accent + gender. Kokoro's
    language code is the voice's first letter (a/b/h)."""
    if voice:
        lang_code = voice[0]
    else:
        lang_code, voice = voice_for(accent, gender)

    with _lock:
        pipeline = _get_pipeline(lang_code)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(KOKORO_SAMPLE_RATE)
            for result in pipeline(text, voice=voice):
                if result.audio is None:
                    continue
                pcm = (result.audio.numpy() * 32767).clip(-32768, 32767).astype(np.int16)
                wf.writeframes(pcm.tobytes())
    return buf.getvalue()
