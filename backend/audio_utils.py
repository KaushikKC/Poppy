"""Audio decoding shared by STT and accent detection.

The browser uploads WebM/Opus (or WAV). Both Whisper and the accent classifier
want 16 kHz mono float32, so we decode once here with PyAV (already a
faster-whisper dependency — no extra install, no ffmpeg subprocess).
"""

import io

import av
import numpy as np

TARGET_RATE = 16000


def decode_16k_mono(data: bytes) -> np.ndarray:
    """Decode arbitrary compressed audio bytes to 16 kHz mono float32 in [-1, 1]."""
    if not data:
        return np.zeros(0, dtype=np.float32)

    container = av.open(io.BytesIO(data))
    resampler = av.AudioResampler(format="s16", layout="mono", rate=TARGET_RATE)
    out: list[np.ndarray] = []
    try:
        for frame in container.decode(audio=0):
            for rframe in resampler.resample(frame):
                out.append(rframe.to_ndarray().reshape(-1))
    finally:
        container.close()

    if not out:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(out).astype(np.float32) / 32768.0
