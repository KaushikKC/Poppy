import numpy as np
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


def _transcribe_mlx(pcm: np.ndarray) -> str:
    import mlx_whisper
    result = mlx_whisper.transcribe(
        pcm, path_or_hf_repo=WHISPER_MLX_REPO, language="en"
    )
    return (result.get("text") or "").strip()


def _transcribe_faster(pcm: np.ndarray) -> str:
    segments, _ = _faster_model().transcribe(pcm, beam_size=5, language="en")
    return " ".join(s.text.strip() for s in segments).strip()


def transcribe(pcm: np.ndarray) -> str:
    """Transcribe 16 kHz mono float32 audio (already decoded by audio_utils)."""
    global _use_mlx
    if pcm is None or len(pcm) == 0:
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
