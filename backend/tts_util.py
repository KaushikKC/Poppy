"""Shared helper for the TTS backends: pack a float waveform into WAV bytes."""

import io
import wave

import numpy as np


def float_to_wav_bytes(samples, sample_rate: int) -> bytes:
    """Pack a mono float waveform (roughly -1..1) into 16-bit PCM WAV bytes."""
    arr = np.asarray(samples, dtype=np.float32).flatten()
    pcm = (np.clip(arr, -1.0, 1.0) * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sample_rate))
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()
