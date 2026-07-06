"""Startup preflight for the desktop app.

Checks the external things the companion needs and fixes what it safely can:
  - Ollama running        → auto-starts `ollama serve` if the binary is installed
  - the LLM model pulled  → auto-pulls if missing (one-time download)
  - espeak-ng installed   → Kokoro's phonemizer; can't auto-install, so it reports
  - speech models cached  → downloads them if online and missing

It returns a Report the launcher uses to decide whether to open the app or a
setup screen. Ollama + the model are treated as *critical* (no chat without
them); espeak-ng and the speech-model cache are warnings (the app still opens,
but voice/STT won't work until fixed).
"""

import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from config import OLLAMA_URL, OLLAMA_MODEL  # noqa: E402


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


# ── Ollama ───────────────────────────────────────────────────────────────────
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


def ensure_ollama(auto_fix: bool = True) -> bool:
    if _ollama_up():
        return True
    exe = shutil.which("ollama")
    if not (auto_fix and exe):
        return False
    print("[preflight] starting Ollama…")
    try:
        subprocess.Popen([exe, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        return False
    for _ in range(24):  # up to ~12s for the daemon to come up
        time.sleep(0.5)
        if _ollama_up():
            return True
    return False


def ensure_model(auto_fix: bool = True) -> bool:
    if OLLAMA_MODEL in _ollama_models():
        return True
    exe = shutil.which("ollama")
    if not (auto_fix and exe):
        return False
    print(f"[preflight] pulling {OLLAMA_MODEL} (one-time first-run download)…")
    try:
        subprocess.run([exe, "pull", OLLAMA_MODEL], check=True)
    except Exception:
        return False
    return OLLAMA_MODEL in _ollama_models()


# ── Speech models (Whisper / Kokoro / classifiers) ───────────────────────────
def ensure_speech_models(auto_fix: bool = True) -> bool:
    try:
        import download_models
    except Exception:
        return False
    if download_models.check():
        return True
    if not auto_fix:
        return False
    print("[preflight] downloading speech models (one-time first-run)…")
    try:
        return download_models.download() and download_models.check()
    except Exception:
        return False


def run(auto_fix: bool = True) -> Report:
    rep = Report()

    ok_ollama = ensure_ollama(auto_fix)
    rep.add(Check(
        "Ollama running", ok_ollama, critical=True,
        detail="" if ok_ollama else "Could not reach or start the Ollama service.",
        fix="Install Ollama from https://ollama.com, then open it.",
    ))

    ok_model = ok_ollama and ensure_model(auto_fix)
    rep.add(Check(
        f"LLM model ({OLLAMA_MODEL})", ok_model, critical=True,
        detail="" if ok_model else "The language model isn't available yet.",
        fix=f"Run in a terminal:  ollama pull {OLLAMA_MODEL}",
    ))

    ok_espeak = shutil.which("espeak-ng") is not None
    rep.add(Check(
        "espeak-ng (voice)", ok_espeak, critical=False,
        detail="" if ok_espeak else "Voice synthesis (Kokoro) needs espeak-ng.",
        fix="brew install espeak-ng",
    ))

    ok_speech = ensure_speech_models(auto_fix)
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
