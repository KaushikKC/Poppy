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

# Packaged default backend is OS-specific and must be set before config/preflight
# are imported: macOS runs the LLM in-process on Apple-Silicon Metal via MLX-LM;
# Windows (and any non-Apple machine) runs it via llama.cpp on a GGUF model
# (CPU-first, optional GPU offload). Either way there's nothing else to install.
os.environ.setdefault(
    "LLM_BACKEND", "mlx" if sys.platform == "darwin" else "llamacpp"
)

import html
import logging
import subprocess
import threading
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Bundled-asset root: sys._MEIPASS in the packaged app (its backend/ is a symlink to
# the real files under Contents/Resources), the repo root in dev. Getting this wrong
# is why a frozen build can't find backend/ (FileNotFoundError on Contents/backend).
if getattr(sys, "frozen", False):
    ROOT = Path(sys._MEIPASS)
    BACKEND = ROOT / "backend"
else:
    ROOT = Path(__file__).resolve().parent.parent
    BACKEND = ROOT / "backend"
    # In dev the modules aren't on the path yet; frozen builds bundle them already.
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


def _log_dir() -> Path:
    """Per-OS log location (W1): %LOCALAPPDATA%\\Poppys\\Logs on Windows,
    ~/Library/Logs/Poppys on macOS."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / "Poppys" / "Logs"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Logs" / "Poppys"
    return Path.home() / ".local" / "state" / "Poppys"  # Linux/other


LOG_DIR = _log_dir()


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
# The setup screen shows before the server is up, so it can't fetch anything from
# it — every asset is inlined. It's styled to match the app's brand (open-sky
# backdrop, cream glass, poppy accent, Instrument Serif display) so first launch
# already feels like Poppys, not a plain loader.
import base64


def _asset_uri(relpath: str, mime: str) -> str:
    """Inline a bundled frontend asset as a data: URI (empty string if missing)."""
    try:
        data = (ROOT / "frontend" / relpath).read_bytes()
        return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"
    except Exception:
        return ""


_LOGO_URI = _asset_uri("poppys-logo-sm.png", "image/png")
_SERIF_URI = _asset_uri("vendor/fonts/instrument-serif-latin.woff2", "font/woff2")
_LOGO_TAG = (f"<img class='logo' src='{_LOGO_URI}' alt='Poppys'>"
             if _LOGO_URI else "<div class='logo logo--txt'>P</div>")

_CSS = """
  @font-face{font-family:'Instrument Serif';src:url(__SERIF__) format('woff2');
    font-weight:400;font-display:swap}
  :root{--sky:#97c4e8;--poppy:#e92832;--poppy-dark:#98101a;--leaf:#143c16;
    --meadow:#5f9a52;--cream:#fff8ea;--ink:#071207;
    --serif:'Instrument Serif',Georgia,serif;
    --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    --mono:ui-monospace,SFMono-Regular,Menlo,monospace}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);color:var(--ink);height:100vh;overflow:hidden;
    -webkit-font-smoothing:antialiased;display:flex;align-items:center;
    justify-content:center;padding:32px;
    background:radial-gradient(70% 42% at 50% 112%,rgba(116,173,95,.5),transparent 66%),
      radial-gradient(55% 40% at 50% 22%,rgba(255,248,234,.5),transparent 70%),
      linear-gradient(180deg,#7ab5e4 0%,#97c4e8 36%,#c8e2f6 74%,#dcecfb 100%)}
  /* drifting cream clouds */
  .sky{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
  .sky .cloud{position:absolute;width:52vmax;height:52vmax;border-radius:50%;
    filter:blur(64px);opacity:.6;will-change:transform}
  .sky .cloud:nth-child(1){left:-16vmax;top:-24vmax;
    background:radial-gradient(circle at 40% 40%,rgba(255,248,234,.7),transparent 62%);
    animation:d1 30s ease-in-out infinite alternate}
  .sky .cloud:nth-child(2){right:-18vmax;top:-8vmax;
    background:radial-gradient(circle at 55% 45%,rgba(255,255,255,.55),transparent 60%);
    animation:d2 38s ease-in-out infinite alternate}
  .sky .cloud:nth-child(3){left:18vmax;bottom:-30vmax;
    background:radial-gradient(circle at 50% 40%,rgba(140,199,122,.4),transparent 60%);
    animation:d3 34s ease-in-out infinite alternate}
  @keyframes d1{to{transform:translate3d(10vmax,5vmax,0) scale(1.12)}}
  @keyframes d2{to{transform:translate3d(-9vmax,7vmax,0) scale(.94)}}
  @keyframes d3{to{transform:translate3d(7vmax,-6vmax,0) scale(1.16)}}
  /* cream glass card */
  .card{position:relative;z-index:1;width:100%;max-width:456px;text-align:center;
    padding:40px 44px 30px;border-radius:24px;
    background:linear-gradient(180deg,rgba(255,248,234,.94),rgba(255,248,234,.86));
    border:1px solid rgba(255,255,255,.7);
    box-shadow:0 24px 70px rgba(5,7,6,.20),inset 0 1px 0 rgba(255,255,255,.9);
    -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
    animation:rise .5s cubic-bezier(.2,.9,.3,1) both}
  .card--wide{max-width:520px;text-align:left}
  @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  .logo{width:64px;height:64px;border-radius:16px;object-fit:cover;
    box-shadow:0 8px 22px rgba(152,16,26,.22);margin:0 auto 18px;display:block}
  .card--wide .logo{margin-left:0}
  .logo--txt{display:flex;align-items:center;justify-content:center;
    background:var(--poppy);color:var(--cream);font-family:var(--serif);font-size:34px}
  .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.2em;
    text-transform:uppercase;color:var(--meadow);font-weight:600;margin-bottom:10px}
  .eyebrow--warn{color:var(--poppy-dark)}
  h1{font-family:var(--serif);font-weight:400;font-size:34px;line-height:1.08;
    color:var(--ink);letter-spacing:.2px}
  .sub{font-size:14.5px;line-height:1.55;color:rgba(7,18,7,.66);margin:12px 0 24px}
  /* progress bar */
  .bar{height:9px;border-radius:99px;background:rgba(7,18,7,.09);overflow:hidden;
    box-shadow:inset 0 1px 2px rgba(7,18,7,.10)}
  .fill{display:block;height:100%;width:34%;border-radius:99px;
    background:linear-gradient(90deg,#f0505a,var(--poppy) 60%,var(--poppy-dark));
    box-shadow:0 0 12px rgba(233,40,50,.5);
    animation:sweep 1.5s cubic-bezier(.55,0,.45,1) infinite}
  @keyframes sweep{0%{margin-left:-38%}100%{margin-left:100%}}
  body.has-pct .fill{animation:none;margin-left:0;width:6%;
    transition:width .5s cubic-bezier(.2,.9,.3,1)}
  .stageline{display:flex;align-items:center;gap:9px;margin-top:16px;
    font-size:13.5px;color:var(--ink);text-align:left}
  .pulse{flex:none;width:8px;height:8px;border-radius:50%;background:var(--poppy);
    box-shadow:0 0 0 0 rgba(233,40,50,.5);animation:pulse 1.6s ease-out infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(233,40,50,.5)}
    100%{box-shadow:0 0 0 10px rgba(233,40,50,0)}}
  #stage{flex:1}
  .pct{font-family:var(--mono);font-size:12px;color:var(--poppy-dark);font-weight:600}
  .log{margin-top:16px;max-height:88px;overflow-y:auto;text-align:left;
    font-family:var(--mono);font-size:10.5px;line-height:1.5;color:rgba(7,18,7,.4);
    border-top:1px solid rgba(7,18,7,.08);padding-top:10px}
  .log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .foot{margin-top:20px;font-size:12px;color:rgba(7,18,7,.52);letter-spacing:.1px}
  /* setup checklist */
  .checks{list-style:none;margin:22px 0 6px}
  .check{display:flex;gap:12px;padding:14px 0;border-top:1px solid rgba(7,18,7,.08)}
  .check:first-child{border-top:none}
  .c-ico{flex:none;font-size:16px;line-height:1.4}
  .check b{font-size:15px;color:var(--ink)}
  .c-detail{font-size:13px;color:rgba(7,18,7,.62);margin-top:3px;line-height:1.45}
  .c-fix{font-family:var(--mono);font-size:12px;color:var(--poppy-dark);margin-top:6px;
    background:rgba(233,40,50,.08);padding:6px 9px;border-radius:7px;display:inline-block}
  .pathpill{font-family:var(--mono);font-size:12px;color:var(--ink);
    background:rgba(7,18,7,.06);border:1px solid rgba(7,18,7,.1);
    padding:10px 12px;border-radius:9px;margin-top:6px;word-break:break-all;text-align:left}
""".replace("__SERIF__", _SERIF_URI)


def _page(body: str) -> str:
    return ("<!doctype html><html><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width, initial-scale=1'>"
            "<style>" + _CSS + "</style></head><body>"
            "<div class='sky' aria-hidden='true'>"
            "<i class='cloud'></i><i class='cloud'></i><i class='cloud'></i></div>"
            + body + "</body></html>")


_PROGRESS_JS = r"""
  function setStage(t){var e=document.getElementById('stage');if(e)e.textContent=t;}
  function setPct(p){document.body.classList.add('has-pct');
    var f=document.getElementById('fill');if(f)f.style.width=Math.max(6,Math.min(100,p))+'%';
    var e=document.getElementById('pct');if(e)e.textContent=p+'%';}
  function appendLog(m){var el=document.getElementById('log');if(!el)return;
    var d=document.createElement('div');d.textContent=m;el.appendChild(d);
    while(el.children.length>60)el.removeChild(el.firstChild);el.scrollTop=el.scrollHeight;}
  function setupLog(m){m=''+m;appendLog(m);
    var mm=m.match(/(\d{1,3})%/);if(mm){var p=parseInt(mm[1],10);if(p>=0&&p<=100)setPct(p);}
    if(!/[|]|it\/s|B\/s|\d+%\|/.test(m)&&m.length<96)setStage(m);}
"""

_PROGRESS_HTML = _page(
    "<main class='card'>" + _LOGO_TAG +
    "<div class='eyebrow'>Private · on-device</div>"
    "<h1>Getting Poppys&nbsp;ready</h1>"
    "<p class='sub'>Setting up the AI that runs entirely on your Mac. This is a "
    "one-time download. After it, Poppys works fully offline, and nothing "
    "you say ever leaves this device.</p>"
    "<div class='bar'><span id='fill' class='fill'></span></div>"
    "<div class='stageline'><span class='pulse'></span>"
    "<span id='stage'>Checking what&rsquo;s already set up&hellip;</span>"
    "<span id='pct' class='pct'></span></div>"
    "<div id='log' class='log' aria-hidden='true'></div>"
    "<div class='foot'>&#128274;&nbsp; Everything stays on this Mac. Nothing is uploaded.</div>"
    "</main><script>" + _PROGRESS_JS + "</script>"
)


def _report_html(rep: preflight.Report) -> str:
    items = ""
    for c in rep.checks:
        icon = "✅" if c.ok else ("⛔" if c.critical else "⚠️")
        detail = f"<div class='c-detail'>{html.escape(c.detail)}</div>" if c.detail else ""
        fix = f"<div class='c-fix'>{html.escape(c.fix)}</div>" if (not c.ok and c.fix) else ""
        items += (f"<li class='check'><span class='c-ico'>{icon}</span>"
                  f"<div><b>{html.escape(c.name)}</b>{detail}{fix}</div></li>")
    return _page(
        "<main class='card card--wide'>" + _LOGO_TAG +
        "<div class='eyebrow'>Setup</div>"
        "<h1>Almost there</h1>"
        "<p class='sub'>A couple of things need attention before Poppys can start. "
        "Sort these out, then quit and reopen.</p>"
        "<ul class='checks'>" + items + "</ul></main>"
    )


_ERROR_HTML = _page(
    "<main class='card'>" + _LOGO_TAG +
    "<div class='eyebrow eyebrow--warn'>Setup hiccup</div>"
    "<h1>Poppys couldn&rsquo;t start</h1>"
    "<p class='sub'>The AI engine didn&rsquo;t come up this time. The full details are "
    "saved in the log below. Sharing it makes this quick to fix.</p>"
    "<div class='pathpill'>" + html.escape(str(LOG_DIR / "poppys.log")) + "</div></main>"
)


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
                _push(window, "Downloading models. This is a one-time setup…")
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

        _push(window, "Starting Poppys (loading the AI, about 15s the first time)…")
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
