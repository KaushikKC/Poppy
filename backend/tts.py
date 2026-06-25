import io
import os
import threading
import wave

# Enable Apple-Silicon GPU fallback before torch/kokoro import so MPS can be used.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np
from kokoro import KModel, KPipeline

from config import KOKORO_REPO_ID, KOKORO_SAMPLE_RATE
from accent import voice_for

# One language-blind model, shared across all accent pipelines (saves memory).
_model: KModel | None = None
# One pipeline per language code (G2P + voice cache), lazily created.
_pipelines: dict[str, KPipeline] = {}
# Serialize inference: a single torch model shouldn't be driven by concurrent threads.
_lock = threading.Lock()


def _get_model() -> KModel:
    global _model
    if _model is None:
        _model = KModel(repo_id=KOKORO_REPO_ID)
    return _model


def _get_pipeline(lang_code: str) -> KPipeline:
    if lang_code not in _pipelines:
        _pipelines[lang_code] = KPipeline(
            lang_code=lang_code, model=_get_model(), repo_id=KOKORO_REPO_ID
        )
    return _pipelines[lang_code]


def synthesize_to_wav_bytes(text: str, accent: str | None = None) -> bytes:
    """Synthesize `text` in the given accent and return WAV bytes (24 kHz mono)."""
    lang_code, voice = voice_for(accent)

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
