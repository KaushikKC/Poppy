"""Filesystem locations that differ between dev and the packaged (frozen) app.

Two kinds of paths break when the app is bundled into a .app/.exe:

  * **Bundled read-only assets** (frontend/, backend/) — in dev they sit next to the
    source; when frozen PyInstaller puts them under ``sys._MEIPASS``. Use
    :func:`bundle_root`.
  * **Writable app data** (SQLite DB, encrypted memory, key) — in dev it's fine to
    keep these in the repo root, but the frozen bundle is read-only (and signed), so
    data must go to a per-user writable dir. Use :func:`user_data_dir`.
"""

import os
import sys
from pathlib import Path

_FROZEN = getattr(sys, "frozen", False)


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def bundle_root() -> Path:
    """Root of the bundled read-only assets — ``sys._MEIPASS`` when frozen, else the
    repo root. ``bundle_root() / 'frontend'`` and ``/ 'backend'`` resolve in both."""
    if _FROZEN:
        return Path(sys._MEIPASS)
    return _repo_root()


def user_data_dir() -> Path:
    """Per-user writable dir for app data. In dev this is the repo root (so the
    existing companion.db / .key / .enc keep working); in the packaged app it's the
    OS's per-user data location. Created if missing."""
    if _FROZEN:
        if sys.platform == "darwin":
            base = Path.home() / "Library" / "Application Support" / "Poppys"
        elif sys.platform == "win32":
            local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
            base = Path(local) / "Poppys"
        else:
            base = Path.home() / ".local" / "share" / "Poppys"
    else:
        base = _repo_root()
    base.mkdir(parents=True, exist_ok=True)
    return base
