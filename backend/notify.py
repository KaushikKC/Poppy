"""
Native OS notifications for ritual reminders (POPPY_PRODUCT_PLAYBOOK §6).

The in-app banner only works while the app window is focused — WKWebview suspends
JS timers when it's backgrounded — so the *reliable* reminder is fired from the
backend, which runs continuously regardless of the window. On macOS that's a
native notification via osascript (no extra dependency). Best-effort and silent on
failure or on platforms without a supported channel (Windows support comes later).
"""

import json
import subprocess
import sys


def send(title: str, body: str) -> bool:
    """Show a native notification. Returns True if the channel accepted it."""
    if sys.platform == "darwin":
        # json.dumps yields a correctly-escaped double-quoted literal that
        # AppleScript accepts, so titles/bodies with quotes can't break the script.
        script = (
            f"display notification {json.dumps(body)} "
            f"with title {json.dumps(title)} sound name \"Glass\""
        )
        try:
            subprocess.run(["osascript", "-e", script], timeout=5, check=False)
            return True
        except Exception as e:
            print(f"[notify] osascript failed: {e}")
            return False
    return False
