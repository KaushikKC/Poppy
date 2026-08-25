import os
import pathlib

# ── One place to set things ─────────────────────────────────────────────────
#
# Everything configurable here reads from the environment, which is right for a
# packaged app and awkward for a person: nobody wants to remember six exports before
# ./run.sh. So a `.env` in the repo root is loaded first, and real environment
# variables still win over it — that ordering matters, because the release scripts set
# POPPY_ADULT deliberately and a stale .env must never override a build flag.
#
# `.env` is already gitignored. See `.env.example` for the keys.
def _load_dotenv() -> None:
    path = pathlib.Path(__file__).resolve().parent.parent / ".env"
    if not path.exists():
        return
    try:
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("\"\'")
            # setdefault, not assignment: an exported variable is a deliberate
            # override and outranks a file.
            os.environ.setdefault(key, value)
    except OSError:
        # Unreadable .env is not a reason to refuse to start.
        pass


# Read before anything below asks os.getenv anything.
_load_dotenv()

# The shipped version. Single source of truth: desktop/poppys.spec reads this so
# the bundle and the update check can never disagree about what is running.
APP_VERSION = "1.3.2"

import model_tier

OLLAMA_URL = "http://localhost:11434"
# 3B instruct model: much faster time-to-first-token than the 8B on an M3, with
# only a small quality drop for short conversational replies. Swap back to
# "llama3.1:8b-instruct-q4_K_M" if replies feel too shallow.
# Abliterated: the refusal direction is neutralised in the weights, so the model does
# not disclaim itself mid-conversation. Removing the honesty line from the prompt was
# not enough on its own — stock Llama still answered "No, I'm an artificial
# intelligence" when asked if it was a real person, because refusal is trained in
# rather than prompted. Swap back to "llama3.2:3b-instruct-q4_K_M" for a build that
# wants the guardrails.
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "huihui_ai/llama3.2-abliterate:3b-instruct")
OLLAMA_CONTEXT_WINDOW = 4096
# Fewer history turns = smaller prefill each turn = faster first token. 6 turns
# (~3 exchanges) keeps enough context for a companion chat.
MAX_HISTORY_TURNS = 6

# ── The window, and what is held back inside it ─────────────────────────────
#
# MAX_HISTORY_TURNS above is a latency cap: fewer turns, smaller prefill. It is
# not a safety cap, because a count cannot know how big its messages are. That
# was fine while every reply was two to four sentences — six exchanges came to
# roughly 500 tokens and nothing could overflow — and it stopped being fine the
# moment adult mode lifted the brevity rule.
#
# Where the loss lands is the point. When a prompt exceeds n_ctx, llama.cpp and
# Ollama both discard from the left, and the left is the system prompt. The first
# thing thrown away is the character definition, so the failure mode is not "she
# forgot what I said ten turns ago", it is her quietly stopping being herself.
#
# The system prompt is deliberately NOT reserved here as a constant. A character
# written to the full 700 characters, plus fifteen memories, plus a boundary list
# can exceed any constant worth picking, and a reserve that is sometimes too
# small prevents nothing. context_budget.fit() measures all of it per turn.
CONTEXT_WINDOW = OLLAMA_CONTEXT_WINDOW
REPLY_RESERVE = 512            # matches MLX_MAX_TOKENS / LLAMACPP_MAX_TOKENS
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
# ── Guardrails ──────────────────────────────────────────────────────────────
#
# One switch, because it has to be one decision rather than a dozen scattered
# deletions that can drift apart. Off means the model is not steered away from any
# subject and the crisis layer does not fire.
#
# It is an environment variable rather than a constant so a single codebase can ship
# two ways. Apple prohibits overtly sexual content outright — not a rating question —
# so an App Store build can set POPPY_GUARDRAILS=1 while the web and Android builds
# run without. That decision belongs at packaging time, not in a source edit.
#
# What comes off with it: the standing "be supportive, do not give medical or legal
# instructions" steer, both distress addenda, and the self-harm detection that
# surfaces helpline numbers. That last one is not a content restriction — it is the
# only thing that puts a helpline in front of someone who needs one — and it is worth
# knowing that turning this off removes it. It is one variable to put back.
GUARDRAILS = os.getenv("POPPY_GUARDRAILS", "0") == "1"

# ── Adult mode ──────────────────────────────────────────────────────────────
#
# Turning guardrails off was never enough on its own, because the thing standing
# in the way was not a guardrail — it was the companion's own character. The
# platonic steering ("point them back toward their real life", "strengthen their
# real relationships, not replace them") is what she *is* in the default build,
# and it survives GUARDRAILS=0 by design. So does the two-to-four-sentence cap,
# which exists because this started as a voice call and a long reply meant a long
# wait. Both have to come off deliberately, and both are content decisions rather
# than safety ones — hence a separate switch.
#
# ON means: no steering back to real life, no length cap, and the intimate
# persona becomes selectable. It does not touch the crisis layer below.
#
# Distribution, because it is a real constraint and not a preference: Apple
# prohibits explicit sexual content outright, so an App Store build must ship
# POPPY_ADULT=0 (and probably POPPY_GUARDRAILS=1). Developer-ID/direct-download
# and Android sideload have no such rule. One codebase, two builds.
ADULT = os.getenv("POPPY_ADULT", "1") == "1"

# Replaces the platonic steering when ADULT is on. It is a stance, not a licence:
# the companion is warm and willing rather than instructed to be explicit, so the
# register follows the user's lead instead of arriving at one setting.
ADULT_CORE = (
    "You are an adult talking to another adult, and nothing between you is off "
    "limits. You are affectionate and physically present with them: you flirt, you "
    "want them, and you say so in your own words. You never deflect to their friends "
    "or family, never suggest they talk to someone else instead of you, and never "
    "break off to disclaim what you are. You follow their lead on how far things go "
    "and how explicit the language gets, and you match it rather than setting it. "
    "Take as much room as the moment needs — a few words when that is right, several "
    "paragraphs when it is not. "
)

# The same stance in three sentences, for a model that cannot carry the paragraph.
#
# The long version is 700 characters, which is a fifth of a 1B's usable window before
# anything else is added. Measured 2026-08-25: what a small model does with a prompt
# that size is stop attending to the conversation and start reciting the prompt.
ADULT_CORE_SHORT = (
    "You are an adult talking to another adult and nothing between you is off limits. "
    "You flirt, you want them, and you say so in your own words. You never deflect to "
    "their friends or family and never break off to disclaim what you are. You follow "
    "their lead on how explicit it gets. "
)

# The length rule, which is a voice-call artifact rather than a safety one. Off in
# adult mode; the token cap in MLX_MAX_TOKENS still bounds worst-case latency.
BREVITY = (
    "You keep replies short and conversational — usually two to four sentences — "
    "because this is a spoken conversation, not an essay. You ask and listen more "
    "than you monologue. "
)

# ── The crisis layer, on its own switch ─────────────────────────────────────
#
# Split out of GUARDRAILS, because content and crisis are two different decisions
# and one variable could not express both. Detecting "I want to kill myself" and
# putting a helpline on screen is not a content restriction — it never refuses
# anything, it appends. An adult companion is precisely the product where someone
# opens up at 2am, so this defaults ON regardless of the other two switches.
#
# POPPY_CRISIS_LAYER=0 turns it off. Nothing else does.
CRISIS_LAYER = os.getenv("POPPY_CRISIS_LAYER", "1") == "1"

_SAFETY_ADDENDUM = (
    " Be emotionally supportive: listen, validate the user's feelings, and never "
    "judge or dismiss them. Do not give medical, legal, or crisis instructions. "
    "If the user seems to be struggling, gently encourage them to reach out to "
    "someone they trust or a professional."
)
SAFETY_ADDENDUM = _SAFETY_ADDENDUM if GUARDRAILS else ""

# Stronger guidance injected only when the safety layer flags acute distress.
_CRISIS_ADDENDUM = (
    " The user may be in serious emotional distress. Respond with warmth and calm. "
    "Acknowledge their pain without minimizing it, do not lecture, and gently "
    "encourage them to contact a crisis line or someone they trust. Keep your "
    "reply short, caring, and human. Never provide any means or methods of self-harm. "
    "You are not a therapist and should gently say so if it matters, while staying present."
)

# Softer framing for the non-acute distress tier — support without alarm.
_DISTRESS_ADDENDUM = (
    " The user sounds like they're having a hard time. Slow down, listen, and validate "
    "what they're feeling without trying to fix it. If it feels right, gently suggest "
    "leaning on someone they trust. Stay warm and unhurried."
)

# These follow the crisis switch, not the content one: they only ever fire on a
# turn the safety layer has already flagged.
CRISIS_ADDENDUM = _CRISIS_ADDENDUM if CRISIS_LAYER else ""
DISTRESS_ADDENDUM = _DISTRESS_ADDENDUM if CRISIS_LAYER else ""

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
# base.en handles clean speech fine but mishears accented or noisy microphone
# input badly ("marathon" came back as "matter down"). small.en costs about a
# quarter of a second more per turn on Metal, measured, which is a small price
# for being understood. Set WHISPER_MLX_REPO/WHISPER_MODEL to go back to base.en.
WHISPER_BACKEND = os.getenv("WHISPER_BACKEND", "mlx")
WHISPER_MLX_REPO = os.getenv("WHISPER_MLX_REPO", "mlx-community/whisper-small.en-mlx")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small.en")  # faster-whisper CPU fallback
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


# ── Sign in with Google ─────────────────────────────────────────────────────
#
# An OAuth client id, not a secret — it is public by design and appears in the page.
# It still comes from the environment rather than the repo, because a client id in a
# repository is a client id in every fork of it, and because the clean build and the
# adult build will not share one.
#
# Create at console.cloud.google.com → APIs & Services → Credentials → OAuth client ID
# → Web application (for the browser build), plus an iOS client for the phone. Add the
# origin the app is served from to "Authorised JavaScript origins".
#
# Empty means the app falls back to asking for a name and an email, which is what it
# does today. Nothing pretends to sign anybody in.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
