# PyInstaller spec for the Poppys Windows app.
#
# Build with:  desktop\build_app_win.ps1   (checks disk space, installs PyInstaller)
# Output:      dist\Poppys\Poppys.exe   (one-dir; wrap in an installer — see W7)
#
# Mirrors poppys.spec (macOS) with the Windows backend combo:
# - LLM via llama.cpp/GGUF (llama_cpp + its bundled llama.dll) instead of MLX.
# - STT via faster-whisper (ctranslate2) — the CPU default on Windows.
# - One-dir mode (not one-file): torch is huge; one-file re-unpacks GBs each launch.
# - collect_all pulls native libs + data (llama.dll, CT2 DLLs, espeak DLL + phoneme
#   data, tokenizer assets). Expect to iterate — missing data files show up as
#   runtime import/load errors in %LOCALAPPDATA%\Poppys\Logs.
# - Model weights are NOT bundled — first launch downloads the GGUF with progress.

import os

from PyInstaller.utils.hooks import collect_all

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))

datas = [
    (os.path.join(ROOT, "frontend"), "frontend"),
    (os.path.join(ROOT, "backend"), "backend"),
]
binaries = []
hiddenimports = [
    "main",                    # uvicorn loads "main:app" from a string
    "uvicorn.logging", "uvicorn.loops.auto", "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto", "uvicorn.lifespan.on",
]

# ML runtimes whose data files / native libs (DLLs) must ride along.
for pkg in (
    "espeakng_loader",   # bundled espeak-ng DLL + phoneme data (Kokoro's phonemizer)
    "misaki",            # Kokoro G2P (loads espeakng_loader at import)
    "kokoro",
    "llama_cpp",         # llama.dll (+ optional GPU backends)
    "faster_whisper",
    "ctranslate2",       # faster-whisper's native inference engine
    "transformers",
    "tokenizers",
    "torch",
    "torchaudio",
    "huggingface_hub",
    "safetensors",
    "webview",           # pywebview WebView2 backend
):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass  # optional pkg not installed (e.g. torchaudio) — fine

a = Analysis(
    [os.path.join(SPECPATH, "launcher.py")],
    pathex=[os.path.join(ROOT, "backend"), SPECPATH],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "matplotlib", "IPython", "jupyter", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    exclude_binaries=True,
    name="Poppys",
    console=False,             # no console window; logs go to %LOCALAPPDATA%\Poppys\Logs
    icon=os.path.join(SPECPATH, "icons", "poppys.ico"),  # convert from the logo (W5)
)

coll = COLLECT(exe, a.binaries, a.datas, name="Poppys")
