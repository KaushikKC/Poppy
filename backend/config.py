import os

# The shipped version. Single source of truth: desktop/poppys.spec reads this so
# the bundle and the update check can never disagree about what is running.
APP_VERSION = "1.1.0"

import model_tier

OLLAMA_URL = "http://localhost:11434"
# 3B instruct model: much faster time-to-first-token than the 8B on an M3, with
# only a small quality drop for short conversational replies. Swap back to
# "llama3.1:8b-instruct-q4_K_M" if replies feel too shallow.
OLLAMA_MODEL = "llama3.2:3b-instruct-q4_K_M"
OLLAMA_CONTEXT_WINDOW = 4096
# Fewer history turns = smaller prefill each turn = faster first token. 6 turns
# (~3 exchanges) keeps enough context for a companion chat.
MAX_HISTORY_TURNS = 6
# Keep the model resident in Ollama between turns so it never pays the cold
# load again (-1 = never unload). Set as a request option in ollama_client.
OLLAMA_KEEP_ALIVE = -1

# LLM backend:
#   "ollama"   (default) — talks to the local Ollama server.
#   "mlx"      — in-process via MLX-LM on the Apple-Silicon GPU (Metal). The macOS
#                packaged default. Adds a persistent prompt cache (near-zero TTFT).
#   "llamacpp" — in-process via llama.cpp on a GGUF model (CPU-first, optional GPU
#                offload). The Windows packaged default; runs anywhere, no Apple/CUDA.
LLM_BACKEND = os.getenv("LLM_BACKEND", "ollama")
# MLX-LM model repo (4-bit Metal weights). Picked to fit the machine's RAM at first
# run (model_tier: 8 GB→1B, 16 GB→3B, 32 GB→8B); MLX_LM_MODEL overrides.
MLX_LM_MODEL = model_tier.mlx_model()
# Optional draft model for speculative decoding: a tiny model proposes tokens the
# main model verifies in a single pass — more tokens/sec for conversational replies.
# OFF by default: benchmarking (2026-07-17) showed the 3B already streams ~45 tok/s,
# ~12× the ~3-4 tok/s speaking pace, so a faster stream yields no felt gain, while a
# draft model costs ~0.7 GB extra RAM (hurts 8 GB machines) and slightly raises TTFT
# (the metric that actually shapes first-audio latency). Opt in on high-RAM machines
# with e.g. MLX_DRAFT_MODEL=mlx-community/Llama-3.2-1B-Instruct-4bit — download_models.py
# + preflight then fetch/verify it, and mlx_llm degrades gracefully if it's uncached.
MLX_DRAFT_MODEL = os.getenv("MLX_DRAFT_MODEL", "")
# Cap generated tokens per reply (replies are 2-4 sentences; bounds worst-case latency).
MLX_MAX_TOKENS = int(os.getenv("MLX_MAX_TOKENS", "512"))
# Persistent prompt cache: keep the KV of the unchanged conversation prefix
# (system prompt + earlier turns) between turns, so each turn only prefills the
# newly-added suffix — near-zero time-to-first-token. Disable with MLX_PROMPT_CACHE=0.
MLX_PROMPT_CACHE = os.getenv("MLX_PROMPT_CACHE", "1") == "1"

# ── llama.cpp / GGUF backend (Windows + any CPU-only machine) ─────────────────
# Used only when LLM_BACKEND=llamacpp. The GGUF twin of the MLX default, also
# RAM-tiered (model_tier: 1B/3B/8B Q4_K_M). LLAMACPP_MODEL_REPO+FILE override.
LLAMACPP_MODEL_REPO, LLAMACPP_MODEL_FILE = model_tier.gguf_model()
# Context window — kept small so prefill stays cheap (matches OLLAMA_CONTEXT_WINDOW).
LLAMACPP_N_CTX = int(os.getenv("LLAMACPP_N_CTX", "4096"))
# GPU offload: number of layers to push onto a GPU. -1 = offload all (fast path on
# a capable GPU); 0 = pure CPU (the safe universal default so 8 GB integrated-GPU
# laptops still work). Auto-detected at load time unless set explicitly.
LLAMACPP_N_GPU_LAYERS = os.getenv("LLAMACPP_N_GPU_LAYERS", "")  # "" = auto
# Generation threads — default to the physical core count (best for llama.cpp).
LLAMACPP_N_THREADS = os.getenv("LLAMACPP_N_THREADS", "")  # "" = physical cores
# Cap generated tokens per reply (mirrors MLX_MAX_TOKENS).
LLAMACPP_MAX_TOKENS = int(os.getenv("LLAMACPP_MAX_TOKENS", "512"))

SYSTEM_PROMPT = (
    "You are a warm, friendly conversational companion. "
    "Keep replies concise — two to four sentences unless the user asks for more. "
    "Speak naturally, as you would in a real conversation."
)

# Emotional-support framing — appended to every persona's system prompt.
SAFETY_ADDENDUM = (
    " Be emotionally supportive: listen, validate the user's feelings, and never "
    "judge or dismiss them. Do not give medical, legal, or crisis instructions. "
    "If the user seems to be struggling, gently encourage them to reach out to "
    "someone they trust or a professional."
)

# Stronger guidance injected only when the safety layer flags acute distress.
CRISIS_ADDENDUM = (
    " The user may be in serious emotional distress. Respond with warmth and calm. "
    "Acknowledge their pain without minimizing it, do not lecture, and gently "
    "encourage them to contact a crisis line or someone they trust. Keep your "
    "reply short, caring, and human. Never provide any means or methods of self-harm. "
    "You are not a therapist and should gently say so if it matters, while staying present."
)

# Softer framing for the non-acute distress tier — support without alarm.
DISTRESS_ADDENDUM = (
    " The user sounds like they're having a hard time. Slow down, listen, and validate "
    "what they're feeling without trying to fix it. If it feels right, gently suggest "
    "leaning on someone they trust. Stay warm and unhurried."
)

# STT backend. "mlx" runs Whisper on the Apple-Silicon GPU (Metal) via mlx-whisper
# — much faster than CPU on an M-series Mac. "faster" is the CPU CTranslate2 path
# (faster-whisper), kept as a portable fallback and used automatically if MLX fails.
#
# STT model. Default is base.en — English-only Whisper base, benchmarked ~3× faster
# than small on an M3 (~0.10s vs ~0.30s per short clip) with equivalent accuracy on
# conversational English. All four settings are env-overridable, e.g. for more
# accuracy on noisier/accented speech (at ~3× the latency):
#     WHISPER_MLX_REPO=mlx-community/whisper-small.en-mlx
#     WHISPER_MODEL=small.en
# After changing the MLX repo, run `python3 backend/download_models.py` once online
# (run.sh refuses to start until every configured model is cached for offline use).
WHISPER_BACKEND = os.getenv("WHISPER_BACKEND", "mlx")
WHISPER_MLX_REPO = os.getenv("WHISPER_MLX_REPO", "mlx-community/whisper-base.en-mlx")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base.en")  # faster-whisper CPU fallback
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")

# Voice adaptation — the accent + gender + emotion classifiers (accent_detect.py,
# gender_detect.py, emotion_detect.py). They run wav2vec2 models on every clip and
# are the slowest part of /stt (several seconds), so they're OFF by default: the
# transcript comes back in ~0.4s instead of ~3–4s. The header toggle turns them on
# (the UI then sends detect=true) when the user wants the reply voice/tone to adapt.
DETECTION_DEFAULT = os.getenv("DETECTION_DEFAULT", "0") == "1"

# TTS engine. "kokoro" (default) is the fast, light Apache-2.0 voice. The realistic
# alternatives are opt-in (heavier, need a one-time model download): "parler" =
# Indic Parler-TTS (native Indian accent), "chatterbox" = Chatterbox (voice-clone),
# "qwen3" = Qwen3-TTS. A/B them with scripts/tts_ab.py before committing.
#
# "cloud" offloads synthesis to our own GPU box (cloud/voice_server.py, running
# Chatterbox on an AWS g5) — realistic per-character cloned voices at real-time
# speed, which this Mac can't do locally. See POPPY_CLOUD_PLAN.md. It never falls
# back silently: if the box is unreachable, synthesis errors and that phrase gets no
# audio (the reply text still streams). Set CLOUD_GPU_URL to the box's address.
TTS_BACKEND = os.getenv("TTS_BACKEND", "kokoro")

# ── Cloud GPU TTS (TTS_BACKEND=cloud) ─────────────────────────────────────────
# Base URL of the voice server on the AWS GPU box, e.g. "http://<ec2-ip>:8600".
# Empty = not configured (the cloud backend raises a clear error if selected).
CLOUD_GPU_URL = os.getenv("CLOUD_GPU_URL", "").rstrip("/")
# The server's output sample rate reported to the browser. Chatterbox is 24 kHz.
CLOUD_SAMPLE_RATE = int(os.getenv("CLOUD_SAMPLE_RATE", "24000"))
# Per-phrase HTTP timeout. Real-time on an A10G is ~1-3s/phrase; allow headroom for
# a cold model load on the first call after the box starts.
CLOUD_TTS_TIMEOUT = float(os.getenv("CLOUD_TTS_TIMEOUT", "30"))

# ── Cloud GPU avatar (AVATAR_BACKEND=video) ───────────────────────────────────
# The talking face. "3d" (default) is the local Three.js avatar lip-synced to the
# voice — works fully offline, unchanged. "video" offloads to our GPU box
# (cloud/avatar_server.py, MuseTalk): per reply it renders that character's real
# portrait speaking the reply, and the browser plays the returned clip. The clip
# carries its own audio, so in video mode the phrase-by-phrase TTS is skipped.
# See POPPY_CLOUD_PLAN.md Phase 2.
AVATAR_BACKEND = os.getenv("AVATAR_BACKEND", "3d")
# Base URL of the avatar server on the box, e.g. "http://<ec2-ip>:8601". Empty when
# AVATAR_BACKEND=video means "not configured" and rendering is skipped (falls back
# to the static portrait/3d avatar in the UI).
CLOUD_AVATAR_URL = os.getenv("CLOUD_AVATAR_URL", "").rstrip("/")
# Rendering a whole-reply talking-head clip is heavier than a voice phrase; give it
# room (and headroom for a cold MuseTalk load on the first call after the box starts).
CLOUD_AVATAR_TIMEOUT = float(os.getenv("CLOUD_AVATAR_TIMEOUT", "90"))
# How many recently-rendered clips to keep in memory for the browser to fetch. Small:
# each turn supersedes the last, and clips are a few hundred KB to a few MB.
AVATAR_CLIP_CACHE = int(os.getenv("AVATAR_CLIP_CACHE", "6"))

# Multi-accent TTS (Kokoro). The companion replies in the speaker's detected
# accent; voices are selected in accent.py and synthesized in tts.py.
KOKORO_REPO_ID = "hexgrad/Kokoro-82M"
KOKORO_SAMPLE_RATE = 24000
# Device Kokoro runs on. Empty = leave Kokoro's own default (GPU/Metal where
# available). Set KOKORO_DEVICE=cpu to move TTS onto the CPU so it doesn't
# contend with the LLM on the GPU.
#
# Default to CPU whenever the LLM is on Metal (LLM_BACKEND=mlx — the packaged app's
# default): the LLM and Kokoro would otherwise both hit the GPU while the first TTS
# phrase synthesizes mid-generation, and that contention intermittently STALLS
# synthesis (text keeps streaming, the voice hangs). Kokoro is tiny (82M) so CPU is
# plenty fast, and it makes first-audio steady. Override with KOKORO_DEVICE.
KOKORO_DEVICE = os.getenv("KOKORO_DEVICE", "cpu" if LLM_BACKEND == "mlx" else "")

# Accent detection from the user's voice (accent_detect.py). A wav2vec2
# classifier runs on each uploaded clip; results are smoothed (sticky) so the
# reply accent stays stable across a session.
ACCENT_MODEL_REPO = "dima806/english_accents_classification"
ACCENT_MIN_CONFIDENCE = 0.40   # ignore readings below this confidence
ACCENT_HISTORY = 3             # rolling window for majority vote (smaller = switches sooner)
ACCENT_MIN_SECONDS = 0.4       # clips shorter than this are too short to trust

# Emotion detection from the user's voice (emotion_detect.py). Unlike accent
# (a stable identity), emotion is momentary — detected per utterance, no
# smoothing — and shapes the reply's tone via the system prompt.
EMOTION_MODEL_REPO = "superb/wav2vec2-base-superb-er"  # labels: neu/hap/ang/sad
EMOTION_MIN_CONFIDENCE = 0.50  # below this, treat as neutral
EMOTION_MIN_SECONDS = 0.6      # clips shorter than this are too short to trust

# Gender detection from the user's voice (gender_detect.py). Estimated offline
# from pitch (median fundamental frequency) — no extra model — and, like accent,
# treated as a stable identity: smoothed (sticky) so the reply voice (and avatar)
# don't flip. Picks the male vs female Kokoro voice for the detected accent.
GENDER_F0_THRESHOLD = 165.0    # Hz; median F0 below this reads as male, above as female
GENDER_MIN_VOICED_FRAMES = 5   # need at least this many voiced frames to decide
GENDER_HISTORY = 3             # rolling window for majority vote
GENDER_MIN_SECONDS = 0.4       # clips shorter than this are too short to trust

TTS_CHUNK_MIN_CHARS = 15
TTS_SENTENCE_BREAKS = frozenset(".!?")
TTS_SOFT_BREAKS = frozenset(",;:—")
TTS_SOFT_BREAK_MIN_CHARS = 35
# Hard cap: emit a chunk (at a word boundary) even with no punctuation, so a long
# unbroken clause can't stall the whole reply's audio until the very end.
TTS_CHUNK_MAX_CHARS = 110
# The FIRST chunk is emitted aggressively so the voice starts while the text is
# still being typed, instead of waiting for a full sentence/paragraph. Kept tiny
# so the very first audio plays almost immediately: it breaks on the first
# comma/clause (soft break) after only a few characters — e.g. "Well," or
# "Sure," — rather than holding out for a full sentence or the hard cap.
TTS_FIRST_CHUNK_MIN_CHARS = 6
TTS_FIRST_SOFT_MIN_CHARS = 4
TTS_FIRST_CHUNK_MAX_CHARS = 18
