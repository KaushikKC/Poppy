"""Detect the user's emotion from their voice.

A wav2vec2 classifier labels each clip (neutral / happy / angry / sad) from
*prosody* — how it's said, not the words. Low-confidence or very short clips
fall back to neutral. Unlike accent, emotion is momentary: no tracker, no
smoothing — each utterance is judged on its own.

The model loads lazily on first use and runs offline thereafter.
"""

import os
import threading

# Match tts.py / accent_detect.py: enable Apple-Silicon fallback before torch.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np
import torch
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

import emotion as emotion_mod
from audio_utils import TARGET_RATE
from config import EMOTION_MODEL_REPO, EMOTION_MIN_CONFIDENCE, EMOTION_MIN_SECONDS

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
        _fe = AutoFeatureExtractor.from_pretrained(EMOTION_MODEL_REPO)
        _model = AutoModelForAudioClassification.from_pretrained(EMOTION_MODEL_REPO).eval()
        _id2label = _model.config.id2label


def detect(pcm: np.ndarray) -> tuple[str, float]:
    """Return (emotion, confidence) for 16 kHz mono float32 audio.

    Returns ('neutral', conf) when the clip is too short or confidence is low.
    """
    if pcm is None or len(pcm) < TARGET_RATE * EMOTION_MIN_SECONDS:
        return emotion_mod.NEUTRAL, 0.0

    _ensure_model()
    with _infer_lock:
        inputs = _fe(pcm, sampling_rate=TARGET_RATE, return_tensors="pt")
        with torch.no_grad():
            logits = _model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0]
        idx = int(probs.argmax())
    raw, conf = _id2label[idx], float(probs[idx])

    if conf < EMOTION_MIN_CONFIDENCE:
        return emotion_mod.NEUTRAL, conf
    return emotion_mod.map_raw(raw), conf


class EmotionTracker:
    """Holds the last detected emotion so background detection (off the /stt
    critical path) can stash this clip's mood for the *next* turn's reply tone.

    Emotion is momentary — no smoothing/majority vote like accent/gender — so this
    is just a thread-safe last-value holder, defaulting to neutral.
    """

    def __init__(self):
        self._current = emotion_mod.NEUTRAL
        self._lock = threading.Lock()

    def update(self, pcm: np.ndarray) -> str:
        """Classify one clip and store the result; return it."""
        emo, _ = detect(pcm)
        with self._lock:
            self._current = emo
            return self._current

    @property
    def current(self) -> str:
        with self._lock:
            return self._current


# Single-user local app: one shared holder for the whole process.
tracker = EmotionTracker()
