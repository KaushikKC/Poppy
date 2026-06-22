import io
import wave
import numpy as np
from pathlib import Path
from piper.voice import PiperVoice
from config import PIPER_MODEL_PATH, PIPER_SAMPLE_RATE

_voice: PiperVoice | None = None
_model_path = Path(__file__).parent / PIPER_MODEL_PATH


def _get_voice() -> PiperVoice:
    global _voice
    if _voice is None:
        _voice = PiperVoice.load(str(_model_path))
    return _voice


def synthesize_to_wav_bytes(text: str) -> bytes:
    voice = _get_voice()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(voice.config.sample_rate)
        for chunk in voice.synthesize(text):
            pcm = (chunk.audio_float_array * 32767).clip(-32768, 32767).astype(np.int16)
            wf.writeframes(pcm.tobytes())
    return buf.getvalue()
