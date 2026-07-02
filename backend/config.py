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
    "reply short, caring, and human. Never provide any means or methods of self-harm."
)

# STT backend. "mlx" runs Whisper on the Apple-Silicon GPU (Metal) via mlx-whisper
# — much faster than CPU on an M-series Mac. "faster" is the CPU CTranslate2 path
# (faster-whisper), kept as a portable fallback and used automatically if MLX fails.
WHISPER_BACKEND = "mlx"
WHISPER_MLX_REPO = "mlx-community/whisper-small-mlx"  # Metal-optimized weights
WHISPER_MODEL = "small"   # faster-whisper (CPU fallback) model size
WHISPER_DEVICE = "cpu"
WHISPER_COMPUTE = "int8"

# Multi-accent TTS (Kokoro). The companion replies in the speaker's detected
# accent; voices are selected in accent.py and synthesized in tts.py.
KOKORO_REPO_ID = "hexgrad/Kokoro-82M"
KOKORO_SAMPLE_RATE = 24000

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
# still being typed, instead of waiting for a full sentence/paragraph.
TTS_FIRST_CHUNK_MIN_CHARS = 6
TTS_FIRST_SOFT_MIN_CHARS = 8
TTS_FIRST_CHUNK_MAX_CHARS = 20
