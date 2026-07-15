# PyInstaller spec for the Poppys macOS app.
#
# Build with:  ./desktop/build_app.sh   (checks disk space, installs PyInstaller)
# Output:      dist/Poppys.app
#
# Notes:
# - One-dir mode (not one-file): torch/mlx are huge; one-file would unpack
#   gigabytes to a temp dir on every launch.
# - collect_all on the ML libs pulls their data files (espeak dylib + phoneme
#   data, Metal kernels, tokenizer assets). Expect to iterate here — missing
#   data files show up as runtime import/load errors in ~/Library/Logs/Poppys/.
# - The LLM/STT/TTS *weights* are NOT bundled — first launch downloads them
#   with progress (keeps the app ~a few GB smaller; App Store-style hygiene).

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

# ML runtimes whose data files / native libs must ride along.
for pkg in (
    "espeakng_loader",   # bundled espeak-ng dylib + phoneme data (Kokoro's phonemizer)
    "misaki",            # Kokoro G2P (loads espeakng_loader at import)
    "kokoro",
    "mlx",               # Metal kernels (libmlx.dylib + .metallib)
    "mlx_lm",
    "mlx_whisper",
    "faster_whisper",
    "transformers",
    "tokenizers",
    "torch",
    "torchaudio",
    "huggingface_hub",
    "safetensors",
    "webview",
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
    console=False,
    target_arch="arm64",   # MLX is Apple-Silicon only; v1 ships ARM-only
)

coll = COLLECT(exe, a.binaries, a.datas, name="Poppys")

app = BUNDLE(
    coll,
    name="Poppys.app",
    icon=os.path.join(SPECPATH, "icons", "poppys.icns"),
    bundle_identifier="com.poppys.companion",
    version="1.0.0",
    info_plist={
        "CFBundleName": "Poppys",
        "CFBundleDisplayName": "Poppys",
        "CFBundleShortVersionString": "1.0.0",
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "13.0",
        # Voice-first app: without this string macOS silently denies the mic.
        "NSMicrophoneUsageDescription":
            "Poppys listens to your voice so it can talk with you. "
            "Audio never leaves this Mac.",
        "NSHumanReadableCopyright": "© 2026 Poppys",
    },
)
