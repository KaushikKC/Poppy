"""TTS backend dispatcher.

Selects the voice engine from TTS_BACKEND (kokoro | parler | qwen3 | chatterbox |
cloud) and exposes one interface — synthesize_to_wav_bytes / warmup / SAMPLE_RATE —
so the rest of the app doesn't care which is active. The chosen backend is imported
lazily so an unused one's heavy deps (parler-tts, chatterbox, …) are never loaded.

"cloud" is special: it does no local model work, it just calls our AWS GPU voice
server (cloud/voice_server.py) over HTTP — realistic per-character cloned voices at
real-time speed. See POPPY_CLOUD_PLAN.md.

To A/B the realistic voices, run scripts/tts_ab.py — it drives each backend module
directly and writes labeled WAVs to compare.
"""

from config import TTS_BACKEND

if TTS_BACKEND == "parler":
    import tts_parler as _backend
elif TTS_BACKEND == "qwen3":
    import tts_qwen3 as _backend
elif TTS_BACKEND == "chatterbox":
    import tts_chatterbox as _backend
elif TTS_BACKEND == "cloud":
    import tts_cloud as _backend
else:
    import tts_kokoro as _backend

# The active backend's native sample rate (ws_handler reports it to the client so
# the browser's AudioContext matches whatever engine is speaking).
SAMPLE_RATE = _backend.SAMPLE_RATE


def synthesize_to_wav_bytes(
    text: str, accent: str | None = None, gender: str | None = None,
    voice: str | None = None,
) -> bytes:
    return _backend.synthesize_to_wav_bytes(text, accent, gender, voice)


def warmup() -> None:
    _backend.warmup()
