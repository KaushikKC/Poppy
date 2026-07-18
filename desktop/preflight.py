"""Startup preflight for the desktop app.

Checks the external things the companion needs and fixes what it safely can.
Which LLM checks run depends on LLM_BACKEND:

  - "mlx" (the packaged default): the LLM runs in-process on Metal via MLX-LM —
    no Ollama at all. The only requirement is that the weights are cached; if
    they're missing and we're online, they're downloaded (one-time).
  - "ollama" (power-user opt-in): Ollama must be running (auto-starts it if the
    binary is installed) and the model pulled (auto-pulls if missing).

Voice (Kokoro) needs espeak-ng, which ships inside the pip package
`espeakng-loader` (misaki loads its dylib directly) — so we verify that import
instead of requiring a system `brew install espeak-ng`.

`run(notify=...)` accepts an optional callback that receives human-readable
progress lines; the launcher streams these into the first-run setup window.
"""

import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import httpx

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from config import (  # noqa: E402
    LLM_BACKEND,
    MLX_DRAFT_MODEL,
    MLX_LM_MODEL,
    LLAMACPP_MODEL_REPO,
    LLAMACPP_MODEL_FILE,
    OLLAMA_MODEL,
    OLLAMA_URL,
)
import model_tier  # noqa: E402

Notify = Optional[Callable[[str], None]]


def _say(notify: Notify, msg: str) -> None:
    print(f"[preflight] {msg}")
    if notify:
        try:
            notify(msg)
        except Exception:
            pass


@dataclass
class Check:
    name: str
    ok: bool
    critical: bool
    detail: str = ""
    fix: str = ""


@dataclass
class Report:
    checks: list[Check] = field(default_factory=list)

    def add(self, c: Check) -> Check:
        self.checks.append(c)
        return c

    @property
    def critical_ok(self) -> bool:
        return all(c.ok for c in self.checks if c.critical)


# ── Hugging Face cache helpers ────────────────────────────────────────────────
def _hf_cached(repo_id: str) -> bool:
    """True if a local snapshot of repo_id is cached (no network)."""
    from huggingface_hub import snapshot_download
    try:
        snapshot_download(repo_id, local_files_only=True)
        return True
    except Exception:
        return False


# ── MLX LLM (in-process, packaged default) ───────────────────────────────────
def ensure_mlx_llm(auto_fix: bool = True, notify: Notify = None) -> bool:
    repos = [MLX_LM_MODEL] + ([MLX_DRAFT_MODEL] if MLX_DRAFT_MODEL else [])
    missing = [r for r in repos if not _hf_cached(r)]
    if not missing:
        return True
    if not auto_fix:
        return False
    from huggingface_hub import snapshot_download
    for repo in missing:
        _say(notify, f"Downloading the language model ({repo}), one-time, ~2 GB…")
        try:
            snapshot_download(repo)
        except Exception as e:
            _say(notify, f"Language-model download failed: {e}")
            return False
    return all(_hf_cached(r) for r in repos)


# ── llama.cpp / GGUF LLM (Windows / CPU packaged default) ────────────────────
def _gguf_cached() -> bool:
    from huggingface_hub import hf_hub_download
    try:
        hf_hub_download(LLAMACPP_MODEL_REPO, LLAMACPP_MODEL_FILE, local_files_only=True)
        return True
    except Exception:
        return False


def ensure_llamacpp_llm(auto_fix: bool = True, notify: Notify = None) -> bool:
    if _gguf_cached():
        return True
    if not auto_fix:
        return False
    from huggingface_hub import hf_hub_download
    _say(notify, f"Downloading the language model ({LLAMACPP_MODEL_FILE}), one-time…")
    try:
        hf_hub_download(LLAMACPP_MODEL_REPO, LLAMACPP_MODEL_FILE)
    except Exception as e:
        _say(notify, f"Language-model download failed: {e}")
        return False
    return _gguf_cached()


# ── Ollama (opt-in backend) ──────────────────────────────────────────────────
def _ollama_up() -> bool:
    try:
        return httpx.get(f"{OLLAMA_URL}/api/tags", timeout=2).status_code == 200
    except Exception:
        return False


def _ollama_models() -> list[str]:
    try:
        data = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=5).json()
        return [m.get("name", "") for m in data.get("models", [])]
    except Exception:
        return []


def ensure_ollama(auto_fix: bool = True, notify: Notify = None) -> bool:
    if _ollama_up():
        return True
    exe = shutil.which("ollama")
    if not (auto_fix and exe):
        return False
    _say(notify, "Starting Ollama…")
    try:
        subprocess.Popen([exe, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        return False
    for _ in range(24):  # up to ~12s for the daemon to come up
        time.sleep(0.5)
        if _ollama_up():
            return True
    return False


def ensure_model(auto_fix: bool = True, notify: Notify = None) -> bool:
    if OLLAMA_MODEL in _ollama_models():
        return True
    exe = shutil.which("ollama")
    if not (auto_fix and exe):
        return False
    _say(notify, f"Pulling {OLLAMA_MODEL} (one-time first-run download)…")
    try:
        subprocess.run([exe, "pull", OLLAMA_MODEL], check=True)
    except Exception:
        return False
    return OLLAMA_MODEL in _ollama_models()


# ── Voice: espeak-ng via the pip-bundled loader ──────────────────────────────
def espeak_ok() -> bool:
    try:
        import espeakng_loader
        return Path(espeakng_loader.get_library_path()).exists()
    except Exception:
        # A system install still works (phonemizer finds it on PATH).
        return shutil.which("espeak-ng") is not None


# ── Speech models (Whisper / Kokoro / classifiers) ───────────────────────────
def ensure_speech_models(auto_fix: bool = True, notify: Notify = None) -> bool:
    try:
        import download_models
    except Exception:
        return False
    if download_models.check():
        return True
    if not auto_fix:
        return False
    _say(notify, "Downloading speech models (one-time first-run)…")
    try:
        return download_models.download() and download_models.check()
    except Exception:
        return False


def run(auto_fix: bool = True, notify: Notify = None) -> Report:
    rep = Report()

    if LLM_BACKEND == "mlx":
        _say(notify, model_tier.describe())
        _say(notify, "Checking the language model…")
        ok_llm = ensure_mlx_llm(auto_fix, notify)
        rep.add(Check(
            f"Language model ({MLX_LM_MODEL})", ok_llm, critical=True,
            detail="" if ok_llm else "The language model isn't downloaded yet (needs internet once).",
            fix="Connect to the internet and reopen the app.",
        ))
    elif LLM_BACKEND == "llamacpp":
        _say(notify, model_tier.describe())
        _say(notify, "Checking the language model…")
        ok_llm = ensure_llamacpp_llm(auto_fix, notify)
        rep.add(Check(
            f"Language model ({LLAMACPP_MODEL_FILE})", ok_llm, critical=True,
            detail="" if ok_llm else "The language model isn't downloaded yet (needs internet once).",
            fix="Connect to the internet and reopen the app.",
        ))
    else:
        _say(notify, "Checking Ollama…")
        ok_ollama = ensure_ollama(auto_fix, notify)
        rep.add(Check(
            "Ollama running", ok_ollama, critical=True,
            detail="" if ok_ollama else "Could not reach or start the Ollama service.",
            fix="Install Ollama from https://ollama.com, then open it.",
        ))
        ok_model = ok_ollama and ensure_model(auto_fix, notify)
        rep.add(Check(
            f"LLM model ({OLLAMA_MODEL})", ok_model, critical=True,
            detail="" if ok_model else "The language model isn't available yet.",
            fix=f"Run in a terminal:  ollama pull {OLLAMA_MODEL}",
        ))

    ok_espeak = espeak_ok()
    rep.add(Check(
        "Voice engine (espeak-ng)", ok_espeak, critical=False,
        detail="" if ok_espeak else "Voice synthesis (Kokoro) needs the espeak-ng phonemizer.",
        fix="pip3 install espeakng-loader   (or: brew install espeak-ng)",
    ))

    _say(notify, "Checking speech models…")
    ok_speech = ensure_speech_models(auto_fix, notify)
    rep.add(Check(
        "Speech models cached", ok_speech, critical=False,
        detail="" if ok_speech else "The STT/TTS models aren't cached for offline use.",
        fix="Run:  python3 backend/download_models.py",
    ))

    return rep


if __name__ == "__main__":
    r = run(auto_fix="--no-fix" not in sys.argv)
    for c in r.checks:
        print(("  OK  " if c.ok else "MISS ") + c.name + ("" if c.ok else f"  → {c.fix}"))
    print("\ncritical_ok:", r.critical_ok)
    sys.exit(0 if r.critical_ok else 1)
