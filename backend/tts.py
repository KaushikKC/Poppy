import io
import wave
import numpy as np
from pathlib import Path
from piper.voice import PiperVoice
from config import PIPER_MODEL_PATH

_DEFAULT_PATH = str((Path(__file__).parent / PIPER_MODEL_PATH).resolve())
_voices: dict[str, PiperVoice] = {}


def _get_voice(path: str | None = None) -> PiperVoice:
    resolved = str(Path(path).resolve()) if path else _DEFAULT_PATH
    if resolved not in _voices:
        if not Path(resolved).exists():
            resolved = _DEFAULT_PATH
        _voices[resolved] = PiperVoice.load(resolved)
    return _voices[resolved]


def synthesize_to_wav_bytes(text: str, voice_path: str | None = None) -> bytes:
    voice = _get_voice(voice_path)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(voice.config.sample_rate)
        for chunk in voice.synthesize(text):
            pcm = (chunk.audio_float_array * 32767).clip(-32768, 32767).astype(np.int16)
            wf.writeframes(pcm.tobytes())
    return buf.getvalue()
