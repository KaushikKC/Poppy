"""Cloud GPU TTS backend (TTS_BACKEND=cloud).

Does no local synthesis: it POSTs the phrase to our own voice server running on an
AWS g5 (cloud/voice_server.py, Chatterbox), which clones each character's voice from
a reference clip and returns WAV bytes. This is how we get realistic, per-character
voices at real-time speed that the Mac can't do locally (see POPPY_CLOUD_PLAN.md).

The character's Kokoro voice id (e.g. "af_heart") is passed through as the `speaker`;
the server maps it to that character's reference clip. Kept dependency-free (stdlib
urllib) so selecting another backend never drags in an HTTP library.

Contract matches the other backends: synthesize_to_wav_bytes / warmup / SAMPLE_RATE.
"""

import json
import urllib.error
import urllib.request

from config import CLOUD_GPU_URL, CLOUD_SAMPLE_RATE, CLOUD_TTS_TIMEOUT

# Reported to the browser so its AudioContext matches. The returned WAV also carries
# its own header, so this is advisory; keep it in sync with the server (Chatterbox 24k).
SAMPLE_RATE = CLOUD_SAMPLE_RATE


def _require_url() -> str:
    if not CLOUD_GPU_URL:
        raise RuntimeError(
            "TTS_BACKEND=cloud but CLOUD_GPU_URL is unset. Point it at the AWS voice "
            "server, e.g. CLOUD_GPU_URL=http://<ec2-ip>:8600 (see cloud/README.md)."
        )
    return CLOUD_GPU_URL


def synthesize_to_wav_bytes(
    text: str, accent: str | None = None, gender: str | None = None,
    voice: str | None = None,
) -> bytes:
    """Synthesize one phrase on the GPU box and return WAV bytes. Raises on transport
    or server error — the caller (ws_handler._synthesize_safe) already turns any raise
    into "this phrase gets no audio" without hanging the turn."""
    text = (text or "").strip()
    if not text:
        return b""
    url = f"{_require_url()}/tts"
    body = json.dumps({"text": text, "speaker": voice or ""}).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/json", "Accept": "audio/wav"},
    )
    try:
        with urllib.request.urlopen(req, timeout=CLOUD_TTS_TIMEOUT) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:200]
        raise RuntimeError(f"cloud TTS {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"cloud TTS unreachable at {url} ({e.reason}). Is the g5 box started and "
            "the port open to you?"
        ) from e


def warmup() -> None:
    """Best-effort: wake the model so the first real phrase isn't slow. Never raises —
    the box may be stopped at desktop-app startup; the first live phrase will surface
    any real problem."""
    try:
        synthesize_to_wav_bytes("Hello.")
    except Exception as e:
        print(f"[tts_cloud] warmup skipped: {e}")
