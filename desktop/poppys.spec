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

from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata

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
    "language_tags",     # misaki dep; ships JSON data (data/json/index.json) it reads at import
    # language_tags validates the subtag registry via jsonschema → rfc3987_syntax →
    # lark, each of which ships data files (schemas, .lark grammar) that must ride along.
    "jsonschema",
    "jsonschema_specifications",
    "rfc3987_syntax",
    "lark",
    "num2words",         # misaki[en] number-to-words (locale data)
    # misaki[en]'s G2P runs a spaCy pipeline (spacy.load("en_core_web_sm")). If the
    # model isn't bundled it tries to DOWNLOAD it at runtime (misaki/en.py:500) and
    # then fails to load it in the frozen app → spaCy E050. Bundle spaCy, its Cython
    # backend (thinc/blis), and the English model package itself.
    "spacy",
    "thinc",
    "blis",
    "en_core_web_sm",
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

# transformers loads model classes lazily (a custom _LazyModule), which PyInstaller's
# static scan can't follow — so the model families we actually use must be named
# explicitly or they're missing at runtime (e.g. "Could not import module 'AlbertModel'").
#   albert   → Kokoro's text encoder (TTS)
#   wav2vec2 → the accent + emotion classifiers
for _model in ("albert", "wav2vec2"):
    hiddenimports += collect_submodules(f"transformers.models.{_model}")

# transformers' audio_utils reads importlib.metadata.version("torchcodec") at import
# time (guarded by is_torchcodec_available(), which passes because the torchcodec
# module rides along as a torch dep). If its dist-info metadata isn't bundled that
# lookup raises PackageNotFoundError, which cascades and gets masked as
# "Could not import module 'AlbertModel'". Ship the metadata. try/except so a build
# machine without torchcodec (e.g. Windows/CPU) simply skips it.
try:
    datas += copy_metadata("torchcodec")
except Exception:
    pass

# spaCy decides "is this model installed?" via importlib.metadata.distribution(name)
# (spacy.util.is_package), and it wires up pipeline factories/architectures through
# entry points read from dist metadata. PyInstaller drops that metadata by default,
# so without this spaCy re-downloads en_core_web_sm on every run and can't load it.
# Ship the dist-info for the model and the packages that register spaCy entry points.
for _dist in ("en_core_web_sm", "spacy", "thinc", "spacy-legacy"):
    try:
        datas += copy_metadata(_dist)
    except Exception:
        pass

a = Analysis(
    [os.path.join(SPECPATH, "launcher.py")],
    pathex=[os.path.join(ROOT, "backend"), SPECPATH],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "matplotlib", "IPython", "jupyter", "pytest"],
    noarchive=False,
    # transformers 5.x discovers its model classes (AlbertModel, Wav2Vec2…) by
    # SCANNING its own source files at runtime (define_import_structure reads
    # __file__'s directory). Collect it as real .py on disk — not bytecode in the
    # archive — so that self-scan works in the frozen app. Without this it finds
    # zero models: "Could not import module 'AlbertModel'".
    module_collection_mode={"transformers": "py"},
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
