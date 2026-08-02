"""Cloud avatar client (AVATAR_BACKEND=video).

Turn-based talking-head avatar: per reply, ask our GPU box (cloud/avatar_server.py,
MuseTalk) to render the character's real portrait speaking the reply, get back an mp4
(with audio baked in), and hold it in a small in-memory cache so the browser can fetch
it at /avatar/clip/<id>. See POPPY_CLOUD_PLAN.md Phase 2.

Kept dependency-free (stdlib urllib) and fail-soft: any transport/timeout/server error
returns None so the turn still completes (the UI keeps the static portrait / 3d avatar).
"""

import json
import threading
import urllib.error
import urllib.request
import uuid
from collections import OrderedDict

from config import (
    AVATAR_BACKEND,
    AVATAR_CLIP_CACHE,
    CLOUD_AVATAR_TIMEOUT,
    CLOUD_AVATAR_URL,
)

ENABLED = AVATAR_BACKEND == "video"

# clip_id -> mp4 bytes, capped and FIFO-evicted (each turn supersedes the last).
_clips: "OrderedDict[str, bytes]" = OrderedDict()
_lock = threading.Lock()


def _store(data: bytes) -> str:
    clip_id = uuid.uuid4().hex
    with _lock:
        _clips[clip_id] = data
        while len(_clips) > max(1, AVATAR_CLIP_CACHE):
            _clips.popitem(last=False)
    return clip_id


def get_clip(clip_id: str) -> bytes | None:
    with _lock:
        return _clips.get(clip_id)


def render(text: str, speaker: str | None) -> str | None:
    """Render one talking-head clip for `text` in `speaker`'s face+voice. Returns a
    clip id to fetch at /avatar/clip/<id>, or None if disabled/unconfigured/failed."""
    text = (text or "").strip()
    if not (ENABLED and CLOUD_AVATAR_URL and text):
        return None
    url = f"{CLOUD_AVATAR_URL}/avatar"
    body = json.dumps({"text": text, "speaker": speaker or ""}).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/json", "Accept": "video/mp4"},
    )
    try:
        with urllib.request.urlopen(req, timeout=CLOUD_AVATAR_TIMEOUT) as resp:
            data = resp.read()
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"[avatar] render skipped ({e}): {text[:40]!r}")
        return None
    if not data:
        return None
    return _store(data)
