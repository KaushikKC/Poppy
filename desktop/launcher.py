"""Desktop launcher for Private Companion.

Runs preflight, starts the local FastAPI server in a background thread, and opens
a native macOS window (pywebview / system WebView) onto it — so it feels like an
app, not a browser tab, while staying 100% local.

    python3 desktop/launcher.py
"""

import os
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(Path(__file__).resolve().parent))  # for `import preflight`

import httpx
import webview

import preflight

HOST, PORT = "127.0.0.1", 8000
APP_URL = f"http://{HOST}:{PORT}"


def _start_server() -> None:
    """Launch uvicorn in a daemon thread. The backend uses flat imports
    (`from stt import ...`), so it must run with backend/ as the working dir."""
    import uvicorn

    os.chdir(BACKEND)
    config = uvicorn.Config("main:app", host=HOST, port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    threading.Thread(target=server.run, daemon=True).start()


def _wait_health(timeout_s: int = 60) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            if httpx.get(f"{APP_URL}/health", timeout=1).status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def _setup_html(rep: preflight.Report) -> str:
    items = ""
    for c in rep.checks:
        icon = "✅" if c.ok else ("⛔️" if c.critical else "⚠️")
        detail = f"<div class='d'>{c.detail}</div>" if c.detail else ""
        fix = f"<div class='fix'>{c.fix}</div>" if (not c.ok and c.fix) else ""
        items += f"<li>{icon} <b>{c.name}</b>{detail}{fix}</li>"
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
      body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f1115;
           color:#e7e7ea;margin:0;padding:40px;}}
      h1{{font-weight:600;font-size:22px;margin:0 0 6px}}
      p{{color:#a9adb6}} ul{{padding:0;margin:24px 0}}
      li{{list-style:none;margin:16px 0;border-left:2px solid #2a2e37;padding-left:14px}}
      .d{{color:#a9adb6;font-size:13px;margin-top:3px}}
      .fix{{color:#6cc2ff;font-size:13px;margin-top:5px;font-family:ui-monospace,monospace}}
    </style></head><body>
      <h1>Private Companion — setup</h1>
      <p>A couple of things need attention before we can start. Fix these, then quit and reopen.</p>
      <ul>{items}</ul>
    </body></html>"""


def main() -> None:
    print("[launcher] running preflight…")
    rep = preflight.run(auto_fix=True)

    if rep.critical_ok:
        _start_server()
        if _wait_health():
            webview.create_window(
                "Private Companion", url=APP_URL,
                width=1120, height=840, min_size=(860, 640),
            )
        else:
            webview.create_window(
                "Private Companion",
                html="<body style='font-family:sans-serif;padding:40px'>"
                     "<h2>The local server didn't start.</h2>"
                     "<p>See the terminal for details.</p></body>",
            )
    else:
        print("[launcher] preflight found blocking issues — showing setup screen.")
        webview.create_window(
            "Private Companion — setup", html=_setup_html(rep),
            width=700, height=580,
        )

    webview.start()


if __name__ == "__main__":
    main()
