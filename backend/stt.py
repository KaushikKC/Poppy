import numpy as np
from faster_whisper import WhisperModel
from config import WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE

_model: WhisperModel | None = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
    return _model


def transcribe(pcm: np.ndarray) -> str:
    """Transcribe 16 kHz mono float32 audio (already decoded by audio_utils)."""
    if pcm is None or len(pcm) == 0:
        return ""
    model = _get_model()
    segments, _ = model.transcribe(pcm, beam_size=5, language="en")
    return " ".join(s.text.strip() for s in segments).strip()
