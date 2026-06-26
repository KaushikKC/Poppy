"""Prefetch the speech models so the app can run fully offline.

Run once while online:

    python3 backend/download_models.py

This downloads (into the Hugging Face cache) everything the runtime needs:
  - Kokoro-82M           — multi-accent TTS (model + all voice files)
  - accent classifier    — ACCENT_MODEL_REPO
  - emotion classifier   — EMOTION_MODEL_REPO
  - faster-whisper       — WHISPER_MODEL

Already-cached models are skipped, so it's safe to re-run. Pass --check to only
verify (offline) that everything is present — this is what run.sh calls before
starting, so the app never has to reach the network at runtime.

(The LLM is served separately by Ollama and is not handled here.)
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import (
    ACCENT_MODEL_REPO,
    EMOTION_MODEL_REPO,
    KOKORO_REPO_ID,
    WHISPER_MODEL,
)

# faster-whisper pulls standard model names from this HF org.
WHISPER_REPO_ID = f"Systran/faster-whisper-{WHISPER_MODEL}"

# (label, hugging-face repo id) for presence checks.
REPOS = [
    ("Kokoro TTS", KOKORO_REPO_ID),
    ("Accent classifier", ACCENT_MODEL_REPO),
    ("Emotion classifier", EMOTION_MODEL_REPO),
    ("Whisper STT", WHISPER_REPO_ID),
]

OK = "\033[32mOK\033[0m"
MISS = "\033[31mMISSING\033[0m"


def _present(repo_id: str) -> bool:
    """True if a local snapshot of repo_id is cached (no network)."""
    from huggingface_hub import snapshot_download
    try:
        snapshot_download(repo_id, local_files_only=True)
        return True
    except Exception:
        return False


def check() -> bool:
    """Verify every model is cached for offline use. Returns True if all present."""
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    all_ok = True
    for label, repo in REPOS:
        ok = _present(repo)
        all_ok = all_ok and ok
        print(f"  [{OK if ok else MISS}] {label}  ({repo})")
    return all_ok


def download() -> bool:
    """Download anything not already cached. Returns True if all succeeded."""
    os.environ["HF_HUB_OFFLINE"] = "0"
    os.environ["TRANSFORMERS_OFFLINE"] = "0"
    ok = True

    # Accent + emotion: let transformers fetch exactly what it loads at runtime.
    try:
        from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
        for label, repo in (("accent", ACCENT_MODEL_REPO), ("emotion", EMOTION_MODEL_REPO)):
            print(f"→ {label} classifier ({repo}) …")
            AutoFeatureExtractor.from_pretrained(repo)
            AutoModelForAudioClassification.from_pretrained(repo)
    except Exception as e:
        print(f"  ! failed: {e}")
        ok = False

    # Kokoro: pull the whole repo so every voice file is available offline.
    try:
        from huggingface_hub import snapshot_download
        print(f"→ Kokoro TTS ({KOKORO_REPO_ID}) …")
        snapshot_download(KOKORO_REPO_ID)
    except Exception as e:
        print(f"  ! failed: {e}")
        ok = False

    # Whisper (faster-whisper handles its own cache layout).
    try:
        from faster_whisper import download_model
        print(f"→ Whisper STT ({WHISPER_MODEL}) …")
        download_model(WHISPER_MODEL)
    except Exception as e:
        print(f"  ! failed: {e}")
        ok = False

    return ok


def main() -> int:
    if "--check" in sys.argv[1:]:
        print("Checking cached models (offline):")
        return 0 if check() else 1

    print("Downloading speech models (this needs network the first time)…")
    if not download():
        print("\nSome downloads failed — see errors above.")
        return 1
    print("\nVerifying everything is cached for offline use:")
    return 0 if check() else 1


if __name__ == "__main__":
    raise SystemExit(main())
