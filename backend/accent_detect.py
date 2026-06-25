"""Detect the speaker's accent from their voice.

A wav2vec2 classifier labels each uploaded clip (us / england / indian / ...),
which accent.map_raw() folds into our three voices. Readings are smoothed by an
AccentTracker: low-confidence clips are ignored and a rolling majority vote
keeps the reply accent stable across a session (no flip-flopping turn to turn).

The model loads lazily on first use and runs offline thereafter.
"""

import os
import threading

# Match tts.py: enable Apple-Silicon fallback before importing torch.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np
import torch
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

import accent as accent_mod
from audio_utils import TARGET_RATE
from config import (
    ACCENT_HISTORY,
    ACCENT_MIN_CONFIDENCE,
    ACCENT_MIN_SECONDS,
    ACCENT_MODEL_REPO,
)

_fe = None
_model = None
_id2label: dict[int, str] = {}
_load_lock = threading.Lock()
_infer_lock = threading.Lock()


def _ensure_model():
    global _fe, _model, _id2label
    if _model is not None:
        return
    with _load_lock:
        if _model is not None:
            return
        _fe = AutoFeatureExtractor.from_pretrained(ACCENT_MODEL_REPO)
        _model = AutoModelForAudioClassification.from_pretrained(ACCENT_MODEL_REPO).eval()
        _id2label = _model.config.id2label


def _classify(pcm: np.ndarray) -> tuple[str, float]:
    """Return (raw_label, confidence) for 16 kHz mono float32 audio."""
    _ensure_model()
    with _infer_lock:
        inputs = _fe(pcm, sampling_rate=TARGET_RATE, return_tensors="pt")
        with torch.no_grad():
            logits = _model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0]
        idx = int(probs.argmax())
    return _id2label[idx], float(probs[idx])


class AccentTracker:
    """Confidence-gated, majority-voted accent that's sticky across a session."""

    def __init__(self):
        self._history: list[str] = []
        self._current = accent_mod.DEFAULT_ACCENT
        self._lock = threading.Lock()

    def update(self, pcm: np.ndarray) -> str:
        """Feed one clip; return the (possibly unchanged) current accent."""
        if pcm is None or len(pcm) < TARGET_RATE * ACCENT_MIN_SECONDS:
            return self.current  # too short to trust — keep what we have

        raw, conf = _classify(pcm)
        mapped = accent_mod.map_raw(raw)

        with self._lock:
            if conf >= ACCENT_MIN_CONFIDENCE:
                self._history.append(mapped)
                self._history = self._history[-ACCENT_HISTORY:]
                self._current = max(set(self._history), key=self._history.count)
            return self._current

    @property
    def current(self) -> str:
        with self._lock:
            return self._current


# Single-user local app: one shared tracker for the whole process.
tracker = AccentTracker()
