"""Poppy cloud voice server — runs ON the AWS g5, not on the desktop.

Loads Chatterbox once and serves realistic, per-character cloned voices over HTTP.
The desktop app's tts_cloud backend POSTs {text, speaker} here; we map `speaker`
(the character's Kokoro voice id) to that character's ~10s reference clip in refs/
and return WAV bytes. Missing clip -> Chatterbox's built-in default voice.

Run (on the box):
    pip install -r requirements.txt
    python voice_server.py            # serves on 0.0.0.0:8600

Then on the desktop:  TTS_BACKEND=cloud CLOUD_GPU_URL=http://<ec2-ip>:8600
See README.md for the full AWS setup.
"""

import io
import os
import threading
import wave

import numpy as np
import uvicorn
from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

HERE = os.path.dirname(os.path.abspath(__file__))
REFS_DIR = os.path.join(HERE, "refs")
PORT = int(os.getenv("VOICE_PORT", "8600"))

# Character voice id (what the desktop sends as `speaker`) -> reference clip filename
# in refs/. Name the clips by character so the assets are human-readable. Drop a
# clean ~10s single-speaker WAV at refs/<name> to give that character its own voice;
# leave it absent to fall back to Chatterbox's default voice.
SPEAKER_REFS = {
    "af_heart":   "poppy.wav",   # Poppy
    "af_nicole":  "luna.wav",    # Luna
    "af_bella":   "zoe.wav",     # Zoe
    "am_adam":    "leo.wav",     # Leo
    "am_fenrir":  "kai.wav",     # Kai
    "am_michael": "ravi.wav",    # Ravi
}

app = FastAPI(title="Poppy Voice Server")

_model = None
_sr = 24000
_lock = threading.Lock()


def _load():
    global _model, _sr
    if _model is not None:
        return
    import torch
    from chatterbox.tts import ChatterboxTTS

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[voice] loading Chatterbox on {device} ...")
    _model = ChatterboxTTS.from_pretrained(device=device)
    _sr = int(getattr(_model, "sr", 24000))
    print(f"[voice] ready, sample_rate={_sr}")


def _ref_path(speaker: str) -> str | None:
    name = SPEAKER_REFS.get(speaker or "")
    if not name:
        return None
    path = os.path.join(REFS_DIR, name)
    return path if os.path.exists(path) else None


def _to_wav_bytes(samples, sample_rate: int) -> bytes:
    arr = np.asarray(samples, dtype=np.float32).flatten()
    pcm = (np.clip(arr, -1.0, 1.0) * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sample_rate))
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()


class TTSRequest(BaseModel):
    text: str
    speaker: str = ""


@app.get("/health")
def health():
    return {
        "ok": True,
        "loaded": _model is not None,
        "sample_rate": _sr,
        "speakers": sorted(SPEAKER_REFS),
        "refs_present": sorted(
            s for s in SPEAKER_REFS if _ref_path(s) is not None
        ),
    }


@app.post("/tts")
def tts(req: TTSRequest):
    text = (req.text or "").strip()
    if not text:
        return Response(content=b"", media_type="audio/wav")
    _load()
    ref = _ref_path(req.speaker)
    with _lock:
        kwargs = {"audio_prompt_path": ref} if ref else {}
        wav = _model.generate(text, **kwargs)
    audio = (
        wav.squeeze().detach().cpu().numpy()
        if hasattr(wav, "detach")
        else np.asarray(wav).squeeze()
    )
    return Response(content=_to_wav_bytes(audio, _sr), media_type="audio/wav")


if __name__ == "__main__":
    # Preload so the first request isn't the one that pays the model-load cost.
    _load()
    uvicorn.run(app, host="0.0.0.0", port=PORT)
