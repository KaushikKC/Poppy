"""Pick the LLM that fits the machine (D1 / Q1).

One model doesn't suit every computer: an 8 GB laptop can't hold an 8B model, and
a 64 GB workstation is wasted on a 1B one. So at first run we read the machine's
RAM and choose a Llama size that fits, per backend:

  * "mlx"       — Apple-Silicon Metal weights (4-bit), used on macOS.
  * "llamacpp"  — GGUF files (Q4_K_M), used on Windows/CPU.

Resolution order for the active model (highest priority first):
  1. An explicit env override (MLX_LM_MODEL / LLAMACPP_MODEL_REPO+FILE) — power users.
  2. A saved user choice (~/.poppys/model.json) — the override a future Settings
     screen writes, so the pick survives restarts and beats auto-detection.
  3. The RAM-based tier below.

The tiers share the same Llama family across backends so tiering is a pure size
swap — nothing else in the prompt/pipeline changes.
"""

import json
import os
from pathlib import Path

# RAM cutoffs (GB) → tier. 16 GB → "3b" (today's default), 8 GB → "1b", 32 GB → "8b".
_TIER_1B_MAX = 12.0   # below this: the 1B
_TIER_3B_MAX = 28.0   # below this: the 3B; at/above: the 8B

# Per-backend model ids by tier. MLX = HF repo of 4-bit Metal weights. GGUF = the
# (repo, file) of a Q4_K_M quant; llama.cpp needs the specific file, not the repo.
_MLX = {
    "1b": "mlx-community/Llama-3.2-1B-Instruct-4bit",
    "3b": "mlx-community/Llama-3.2-3B-Instruct-4bit",
    "8b": "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit",
}
_GGUF = {
    "1b": ("bartowski/Llama-3.2-1B-Instruct-GGUF", "Llama-3.2-1B-Instruct-Q4_K_M.gguf"),
    "3b": ("bartowski/Llama-3.2-3B-Instruct-GGUF", "Llama-3.2-3B-Instruct-Q4_K_M.gguf"),
    "8b": ("bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
           "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf"),
}

_SAVE_PATH = Path.home() / ".poppys" / "model.json"


def total_ram_gb() -> float:
    """Total physical RAM in GB. Falls back to a conservative 8 GB if it can't be
    read, so detection failure picks the safe small tier rather than crashing."""
    try:
        import psutil
        return psutil.virtual_memory().total / 1e9
    except Exception:
        try:  # POSIX fallback without psutil
            return (os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")) / 1e9
        except Exception:
            return 8.0


def tier_for_ram(ram_gb: float) -> str:
    if ram_gb < _TIER_1B_MAX:
        return "1b"
    if ram_gb < _TIER_3B_MAX:
        return "3b"
    return "8b"


def _saved_tier() -> str | None:
    """A tier the user explicitly chose (written by a Settings screen), if any."""
    try:
        data = json.loads(_SAVE_PATH.read_text())
        tier = data.get("tier")
        return tier if tier in _MLX else None
    except Exception:
        return None


def save_tier(tier: str) -> None:
    """Persist a user override so it beats RAM auto-detection on the next launch."""
    if tier not in _MLX:
        raise ValueError(f"unknown tier {tier!r}; expected one of {list(_MLX)}")
    _SAVE_PATH.parent.mkdir(parents=True, exist_ok=True)
    _SAVE_PATH.write_text(json.dumps({"tier": tier}))


def chosen_tier() -> str:
    """The tier to use: a saved user choice if present, else the RAM-based pick."""
    return _saved_tier() or tier_for_ram(total_ram_gb())


def mlx_model() -> str:
    """MLX (macOS) model id: env override wins, else the tiered pick."""
    return os.getenv("MLX_LM_MODEL") or _MLX[chosen_tier()]


def gguf_model() -> tuple[str, str]:
    """GGUF (Windows) (repo, file): env override wins, else the tiered pick."""
    repo = os.getenv("LLAMACPP_MODEL_REPO")
    file = os.getenv("LLAMACPP_MODEL_FILE")
    if repo and file:
        return repo, file
    return _GGUF[chosen_tier()]


def describe() -> str:
    """One-line summary for the first-run screen / logs."""
    ram = total_ram_gb()
    tier = chosen_tier()
    src = "your saved choice" if _saved_tier() else f"detected {ram:.0f} GB RAM"
    return f"Using the {tier.upper()} model ({src})."


if __name__ == "__main__":
    print(describe())
    print("  mlx :", mlx_model())
    print("  gguf:", "/".join(gguf_model()))
