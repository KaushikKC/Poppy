"""Poppy cloud avatar server — runs ON the AWS g5, alongside voice_server.py.

Turn-based talking-head: given {text, speaker}, it
  1. asks the voice server (localhost:8600) for that character's cloned-voice audio,
  2. runs MuseTalk on that character's portrait + the audio,
  3. returns an mp4 (audio baked in) that the desktop serves to the browser.

So the face you picked is the face that talks, in that character's own voice. See
POPPY_CLOUD_PLAN.md Phase 2.

MuseTalk itself is set up separately on the box (clone its repo + download weights).
We invoke it through a small wrapper command so this server doesn't hard-code any one
MuseTalk version: set AVATAR_RENDER_CMD to a command containing the placeholders
{image} {audio} {output}. Default: ./musetalk_render.sh {image} {audio} {output}.

Run (on the box, after voice_server.py is up):
    AVATAR_RENDER_CMD='./musetalk_render.sh {image} {audio} {output}' python avatar_server.py
    # serves on 0.0.0.0:8601
"""

import json
import os
import shlex
import subprocess
import tempfile
import urllib.request

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

HERE = os.path.dirname(os.path.abspath(__file__))
PORTRAITS_DIR = os.path.join(HERE, "portraits")
PORT = int(os.getenv("AVATAR_PORT", "8601"))
VOICE_URL = os.getenv("VOICE_URL", "http://127.0.0.1:8600").rstrip("/")
RENDER_CMD = os.getenv("AVATAR_RENDER_CMD", "./musetalk_render.sh {image} {audio} {output}")
VOICE_TIMEOUT = float(os.getenv("AVATAR_VOICE_TIMEOUT", "60"))
RENDER_TIMEOUT = float(os.getenv("AVATAR_RENDER_TIMEOUT", "120"))

# Character voice id (what the desktop sends as `speaker`) -> portrait filename in
# portraits/. Same characters as the voice server; name the images by character so
# the assets read clearly. A front-facing portrait is what MuseTalk animates.
SPEAKER_PORTRAITS = {
    "af_heart":   "poppy.png",   # Poppy
    "af_nicole":  "luna.png",    # Luna
    "af_bella":   "zoe.png",     # Zoe
    "am_adam":    "leo.png",     # Leo
    "am_fenrir":  "kai.png",     # Kai
    "am_michael": "ravi.png",    # Ravi
}

app = FastAPI(title="Poppy Avatar Server")


def _portrait_path(speaker: str) -> str | None:
    name = SPEAKER_PORTRAITS.get(speaker or "")
    if not name:
        return None
    for cand in (name, os.path.splitext(name)[0] + ".jpg"):
        path = os.path.join(PORTRAITS_DIR, cand)
        if os.path.exists(path):
            return path
    return None


def _fetch_voice(text: str, speaker: str) -> bytes:
    body = json.dumps({"text": text, "speaker": speaker}).encode("utf-8")
    req = urllib.request.Request(
        f"{VOICE_URL}/tts", data=body, method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=VOICE_TIMEOUT) as resp:
        return resp.read()


def _render(image_path: str, audio_path: str) -> bytes:
    """Run MuseTalk (via the wrapper command) to lip-sync `image_path` to
    `audio_path`, returning mp4 bytes."""
    out_path = tempfile.mktemp(suffix=".mp4")
    cmd = shlex.split(
        RENDER_CMD.format(
            image=shlex.quote(image_path),
            audio=shlex.quote(audio_path),
            output=shlex.quote(out_path),
        )
    )
    try:
        proc = subprocess.run(
            cmd, cwd=HERE, capture_output=True, timeout=RENDER_TIMEOUT
        )
        if proc.returncode != 0 or not os.path.exists(out_path):
            detail = proc.stderr.decode("utf-8", "replace")[-400:]
            raise HTTPException(status_code=500, detail=f"render failed: {detail}")
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(out_path):
            os.remove(out_path)


class AvatarRequest(BaseModel):
    text: str
    speaker: str = ""


@app.get("/health")
def health():
    return {
        "ok": True,
        "voice_url": VOICE_URL,
        "render_cmd": RENDER_CMD,
        "speakers": sorted(SPEAKER_PORTRAITS),
        "portraits_present": sorted(
            s for s in SPEAKER_PORTRAITS if _portrait_path(s) is not None
        ),
    }


@app.post("/avatar")
def avatar(req: AvatarRequest):
    text = (req.text or "").strip()
    if not text:
        return Response(content=b"", media_type="video/mp4")
    portrait = _portrait_path(req.speaker)
    if not portrait:
        raise HTTPException(
            status_code=404,
            detail=f"no portrait for speaker {req.speaker!r} (add one in portraits/)",
        )
    audio = _fetch_voice(text, req.speaker)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as af:
        af.write(audio)
        audio_path = af.name
    try:
        mp4 = _render(portrait, audio_path)
    finally:
        os.remove(audio_path)
    return Response(content=mp4, media_type="video/mp4")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
