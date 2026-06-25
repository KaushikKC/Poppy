OLLAMA_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3.1:8b-instruct-q4_K_M"
OLLAMA_CONTEXT_WINDOW = 4096
MAX_HISTORY_TURNS = 10

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

WHISPER_MODEL = "small"
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
ACCENT_HISTORY = 5             # rolling window for majority vote
ACCENT_MIN_SECONDS = 0.4       # clips shorter than this are too short to trust

# Emotion detection from the user's voice (emotion_detect.py). Unlike accent
# (a stable identity), emotion is momentary — detected per utterance, no
# smoothing — and shapes the reply's tone via the system prompt.
EMOTION_MODEL_REPO = "superb/wav2vec2-base-superb-er"  # labels: neu/hap/ang/sad
EMOTION_MIN_CONFIDENCE = 0.50  # below this, treat as neutral
EMOTION_MIN_SECONDS = 0.6      # clips shorter than this are too short to trust

TTS_CHUNK_MIN_CHARS = 15
TTS_SENTENCE_BREAKS = frozenset(".!?")
TTS_SOFT_BREAKS = frozenset(",;:")
TTS_SOFT_BREAK_MIN_CHARS = 60
