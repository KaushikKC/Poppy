"""Detect the speaker's voice gender from pitch — fully offline, no model.

We estimate the median fundamental frequency (F0) of the voiced parts of the
clip by autocorrelation and threshold it: low pitch reads as male, high as
female. Like accent, gender is a stable identity, so a GenderTracker smooths
readings (sticky majority vote) and keeps the reply voice from flipping.

A pitch heuristic (rather than another wav2vec2 model) keeps us inside the
16 GB / offline budget alongside the LLM, Whisper, and the accent/emotion models.
"""

import threading

import numpy as np

import gender as gender_mod
from audio_utils import TARGET_RATE
from config import (
    GENDER_F0_THRESHOLD,
    GENDER_HISTORY,
    GENDER_MIN_SECONDS,
    GENDER_MIN_VOICED_FRAMES,
)

# Human voice F0 lives roughly in this band; search autocorrelation lags for it.
_F0_MIN = 70.0
_F0_MAX = 320.0


def _median_f0(pcm: np.ndarray) -> float | None:
    """Median F0 (Hz) over voiced frames, or None if too little voiced audio."""
    sr = TARGET_RATE
    frame = int(0.04 * sr)   # 40 ms analysis window
    hop = int(0.02 * sr)     # 20 ms hop
    if len(pcm) < frame:
        return None

    lag_min = int(sr / _F0_MAX)
    lag_max = int(sr / _F0_MIN)
    ref_rms = float(np.sqrt(np.mean(pcm ** 2))) + 1e-9

    f0s: list[float] = []
    for start in range(0, len(pcm) - frame, hop):
        f = pcm[start:start + frame]
        rms = float(np.sqrt(np.mean(f ** 2)))
        # Skip silence / clearly unvoiced frames.
        if rms < 0.01 or rms < 0.5 * ref_rms:
            continue

        f = f - f.mean()
        corr = np.correlate(f, f, mode="full")[len(f) - 1:]
        if corr[0] <= 0:
            continue

        seg = corr[lag_min:lag_max]
        if seg.size == 0:
            continue
        peak = int(np.argmax(seg)) + lag_min
        # Require a clear periodic peak (voiced), not noise.
        if corr[peak] < 0.3 * corr[0]:
            continue
        f0s.append(sr / peak)

    if len(f0s) < GENDER_MIN_VOICED_FRAMES:
        return None
    return float(np.median(f0s))


def detect(pcm: np.ndarray) -> str | None:
    """Return 'male' / 'female' for 16 kHz mono float32 audio, or None if unsure."""
    if pcm is None or len(pcm) < TARGET_RATE * GENDER_MIN_SECONDS:
        return None
    f0 = _median_f0(pcm)
    if f0 is None:
        return None
    return gender_mod.MALE if f0 < GENDER_F0_THRESHOLD else gender_mod.FEMALE


class GenderTracker:
    """Confidence-gated, majority-voted gender that's sticky across a session."""

    def __init__(self):
        self._history: list[str] = []
        self._current = gender_mod.DEFAULT_GENDER
        self._lock = threading.Lock()

    def update(self, pcm: np.ndarray) -> str:
        """Feed one clip; return the (possibly unchanged) current gender."""
        reading = detect(pcm)
        with self._lock:
            if reading is not None:
                self._history.append(reading)
                self._history = self._history[-GENDER_HISTORY:]
                self._current = max(set(self._history), key=self._history.count)
            return self._current

    @property
    def current(self) -> str:
        with self._lock:
            return self._current


# Single-user local app: one shared tracker for the whole process.
tracker = GenderTracker()
