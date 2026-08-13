import numpy as np
from audio_utils import TARGET_RATE
from config import (
    WHISPER_BACKEND,
    WHISPER_MLX_REPO,
    WHISPER_MODEL,
    WHISPER_DEVICE,
    WHISPER_COMPUTE,
)

# Selected STT backend: MLX (Metal GPU) when configured, else CPU faster-whisper.
# If the MLX path errors at runtime we flip this off and fall back for the session.
_use_mlx = WHISPER_BACKEND == "mlx"
_faster = None  # lazily-loaded faster-whisper model (CPU fallback)


def _faster_model():
    global _faster
    if _faster is None:
        from faster_whisper import WhisperModel
        _faster = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
    return _faster


# ── Refusing to invent words ─────────────────────────────────────────────────
# Whisper does not return "nothing" for silence. Given a silent clip it emits
# something plausible from its training data, and the model itself flags this:
# measured on pure silence it produced "You" with no_speech_prob 0.862. That
# signal was being thrown away, which is why auto-listen typed words nobody said
# ("thank you" for "how are you", and text with no one speaking at all).
#
# Three gates, cheapest first.

# Below this the clip carries no speech, so it never reaches the model at all.
MIN_RMS = 0.004
MIN_SECONDS = 0.35

# The model's own confidence. no_speech_prob is how sure it is that nobody spoke;
# avg_logprob near zero is a confident transcription and very negative is noise.
NO_SPEECH_MAX = 0.6
AVG_LOGPROB_MIN = -1.0

# What it reaches for when there is nothing to hear. These are only dropped when
# they are the *entire* result, so a real "thank you" in a sentence survives.
_INVENTED = {
    "you", "thank you", "thanks", "thank you.", "you.", "bye", "bye.",
    "thanks for watching", "thanks for watching!", "thank you for watching",
    "please subscribe", "subscribe", "okay", "ok", "mm", "mhm", "hmm",
    "[blank_audio]", "(silence)", "...", ".",
}


def _is_invented(text: str) -> bool:
    return text.strip().strip(" .!?,").lower() in {
        s.strip(" .!?,").lower() for s in _INVENTED
    }


def _carries_speech(pcm: np.ndarray) -> bool:
    """Enough signal, and enough of it, to be worth transcribing."""
    if len(pcm) < int(TARGET_RATE * MIN_SECONDS):
        return False
    return float(np.sqrt(np.mean(np.square(pcm)))) >= MIN_RMS


def _transcribe_mlx(pcm: np.ndarray) -> str:
    import mlx_whisper
    result = mlx_whisper.transcribe(
        pcm, path_or_hf_repo=WHISPER_MLX_REPO, language="en"
    )
    segments = result.get("segments") or []
    if not segments:
        # No segments but text anyway is exactly the invented case.
        text = (result.get("text") or "").strip()
        return "" if _is_invented(text) else text

    kept = [
        s.get("text", "") for s in segments
        if s.get("no_speech_prob", 0.0) <= NO_SPEECH_MAX
        and s.get("avg_logprob", 0.0) >= AVG_LOGPROB_MIN
    ]
    text = " ".join(x.strip() for x in kept).strip()
    return "" if _is_invented(text) else text


def _transcribe_faster(pcm: np.ndarray) -> str:
    # vad_filter drops non-speech before decoding, which is the same defence on
    # the CPU path.
    segments, _ = _faster_model().transcribe(
        pcm, beam_size=5, language="en", vad_filter=True,
    )
    kept = [
        s.text for s in segments
        if getattr(s, "no_speech_prob", 0.0) <= NO_SPEECH_MAX
        and getattr(s, "avg_logprob", 0.0) >= AVG_LOGPROB_MIN
    ]
    text = " ".join(x.strip() for x in kept).strip()
    return "" if _is_invented(text) else text


def transcribe(pcm: np.ndarray) -> str:
    """Transcribe 16 kHz mono float32 audio (already decoded by audio_utils)."""
    global _use_mlx
    if pcm is None or len(pcm) == 0:
        return ""
    # Silence and room noise never reach the model: asked to transcribe nothing,
    # it answers with something.
    if not _carries_speech(pcm):
        return ""
    if _use_mlx:
        try:
            return _transcribe_mlx(pcm)
        except Exception as e:
            # MLX unavailable/broken on this machine — degrade to CPU for the
            # rest of the session rather than failing the turn.
            print(f"[stt] MLX backend failed ({e}); falling back to faster-whisper (CPU).")
            _use_mlx = False
    return _transcribe_faster(pcm)


def warmup() -> None:
    """Load + compile the STT model so the first real transcription isn't slow
    (MLX downloads the Metal weights and JIT-compiles on first use)."""
    try:
        transcribe(np.zeros(16000, dtype=np.float32))
    except Exception:
        pass
