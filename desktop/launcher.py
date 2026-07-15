"""Desktop launcher for Poppys (Private Companion).

Opens a native macOS window immediately with a live setup/progress screen, runs
preflight in the background (downloading models on first run, with streamed
status), starts the local FastAPI server, then navigates the same window to the
app — so first launch never looks hung and it feels like an app, not a browser
tab, while staying 100% local.

    python3 desktop/launcher.py

Packaged default is the in-process MLX LLM (no Ollama needed). Power users can
still run against their own Ollama:  LLM_BACKEND=ollama python3 desktop/launcher.py
"""

import os
import sys

# Packaged default: run the LLM in-process on Apple-Silicon Metal via MLX-LM —
# nothing else to install. Must be set before config/preflight are imported.
os.environ.setdefault("LLM_BACKEND", "mlx")

import html
import logging
import subprocess
import threading
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(Path(__file__).resolve().parent))  # for `import preflight`

# Re-invocation entry: `launcher.py --download-models` runs the model download in
# a FRESH process and exits. First-run setup shells out to this so downloads run
# with clean (online) Hugging Face env — the parent process may already have
# imported huggingface_hub with offline flags baked in. Works the same frozen
# (the app binary re-invokes itself) and in dev.
if "--download-models" in sys.argv:
    os.environ["HF_HUB_OFFLINE"] = "0"
    os.environ["TRANSFORMERS_OFFLINE"] = "0"
    import download_models
    raise SystemExit(download_models.main())

import httpx
import webview

import preflight

HOST, PORT = "127.0.0.1", 8000
APP_URL = f"http://{HOST}:{PORT}"
LOG_DIR = Path.home() / "Library" / "Logs" / "Poppys"


def _setup_logging() -> None:
    """Rotating file logs — in the packaged .app there is no terminal, so this is
    the only place errors go. Keeps stderr output too when a tty is attached."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        LOG_DIR / "poppys.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)-7s %(name)s: %(message)s"
    ))
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)
    if sys.stderr and sys.stderr.isatty():
        root.addHandler(logging.StreamHandler())
    else:
        # Frozen app: stray print()s from the backend land in the log file too.
        log_stream = open(LOG_DIR / "poppys.log", "a", buffering=1, encoding="utf-8")
        sys.stdout = sys.stderr = log_stream

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True


log = logging.getLogger("launcher")


def _start_server() -> None:
    """Launch uvicorn in a daemon thread. The backend uses flat imports
    (`from stt import ...`), so it must run with backend/ as the working dir."""
    import uvicorn

    os.chdir(BACKEND)
    config = uvicorn.Config(
        "main:app", host=HOST, port=PORT, log_level="warning", log_config=None
    )
    server = uvicorn.Server(config)
    threading.Thread(target=server.run, daemon=True).start()


def _wait_health(timeout_s: int = 120) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            if httpx.get(f"{APP_URL}/health", timeout=1).status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


# ── Setup window HTML ─────────────────────────────────────────────────────────
_PAGE_STYLE = """
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f1115;
       color:#e7e7ea;margin:0;padding:40px;}
  h1{font-weight:600;font-size:22px;margin:0 0 6px}
  p{color:#a9adb6} ul{padding:0;margin:24px 0}
  li{list-style:none;margin:16px 0;border-left:2px solid #2a2e37;padding-left:14px}
  .d{color:#a9adb6;font-size:13px;margin-top:3px}
  .fix{color:#6cc2ff;font-size:13px;margin-top:5px;font-family:ui-monospace,monospace}
  #log{margin-top:22px;font-size:13px;color:#a9adb6;font-family:ui-monospace,monospace;
       white-space:pre-wrap;max-height:280px;overflow-y:auto}
  .spinner{display:inline-block;width:14px;height:14px;border:2px solid #2a2e37;
       border-top-color:#6cc2ff;border-radius:50%;animation:s 0.8s linear infinite;
       vertical-align:-2px;margin-right:8px}
  @keyframes s{to{transform:rotate(360deg)}}
"""

_PROGRESS_HTML = f"""<!doctype html><html><head><meta charset="utf-8">
<style>{_PAGE_STYLE}</style></head><body>
  <h1><span class="spinner"></span>Getting Poppys ready…</h1>
  <p id="stage">First launch can take a few minutes while the AI models download.
     After that, everything runs offline on this Mac.</p>
  <div id="log"></div>
  <script>
    function setupLog(msg) {{
      const el = document.getElementById('log');
      el.textContent += msg + "\\n";
      el.scrollTop = el.scrollHeight;
    }}
  </script>
</body></html>"""


def _report_html(rep: preflight.Report) -> str:
    items = ""
    for c in rep.checks:
        icon = "✅" if c.ok else ("⛔️" if c.critical else "⚠️")
        detail = f"<div class='d'>{html.escape(c.detail)}</div>" if c.detail else ""
        fix = f"<div class='fix'>{html.escape(c.fix)}</div>" if (not c.ok and c.fix) else ""
        items += f"<li>{icon} <b>{html.escape(c.name)}</b>{detail}{fix}</li>"
    return f"""<!doctype html><html><head><meta charset="utf-8">
    <style>{_PAGE_STYLE}</style></head><body>
      <h1>Poppys — setup</h1>
      <p>A couple of things need attention before we can start. Fix these, then quit and reopen.</p>
      <ul>{items}</ul>
    </body></html>"""


_ERROR_HTML = f"""<!doctype html><html><head><meta charset="utf-8">
<style>{_PAGE_STYLE}</style></head><body>
  <h1>The local server didn't start.</h1>
  <p>Details are in the log file:</p>
  <p class="fix">{LOG_DIR}/poppys.log</p>
</body></html>"""


# ── First-run bootstrap (runs on a worker thread while the window shows) ─────
def _push(window, msg: str) -> None:
    log.info("[setup] %s", msg)
    try:
        window.evaluate_js(f"setupLog({msg!r})")
    except Exception:
        pass


def _download_models_subprocess(window) -> bool:
    """Run the model download in a fresh process (clean online HF env), streaming
    its output lines into the setup window."""
    if getattr(sys, "frozen", False):
        cmd = [sys.executable, "--download-models"]
    else:
        cmd = [sys.executable, str(Path(__file__).resolve()), "--download-models"]
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, cwd=str(BACKEND),
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.strip()
        if line:
            _push(window, line)
    return proc.wait() == 0


def _bootstrap(window) -> None:
    try:
        _push(window, "Checking what's already set up…")
        rep = preflight.run(auto_fix=False, notify=lambda m: _push(window, m))

        if not all(c.ok for c in rep.checks):
            # Something's missing — try the fixes that need work (downloads etc.),
            # streaming progress, then re-check.
            models_missing = any(
                not c.ok for c in rep.checks
                if "model" in c.name.lower() or "speech" in c.name.lower()
            )
            if models_missing:
                _push(window, "Downloading models — this is a one-time setup…")
                _download_models_subprocess(window)
            rep = preflight.run(auto_fix=True, notify=lambda m: _push(window, m))

        if not rep.critical_ok:
            log.warning("preflight found blocking issues — showing setup screen")
            window.load_html(_report_html(rep))
            return

        # Everything cached → run the rest of this session offline (the app's
        # core promise: after setup, nothing reaches the network).
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"

        _push(window, "Starting Poppys (loading the AI — ~15s the first time)…")
        _start_server()
        if _wait_health():
            window.load_url(APP_URL)
        else:
            log.error("server did not become healthy in time")
            window.load_html(_ERROR_HTML)
    except Exception:
        log.exception("bootstrap failed")
        try:
            window.load_html(_ERROR_HTML)
        except Exception:
            pass


def main() -> None:
    _setup_logging()
    log.info("launcher starting (LLM_BACKEND=%s)", os.environ.get("LLM_BACKEND"))
    window = webview.create_window(
        "Poppys", html=_PROGRESS_HTML,
        width=1120, height=840, min_size=(860, 640),
    )
    webview.start(_bootstrap, window)


if __name__ == "__main__":
    main()
