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

PIPER_MODEL_PATH = "../models/piper/en_US-lessac-medium.onnx"
PIPER_SAMPLE_RATE = 22050

TTS_CHUNK_MIN_CHARS = 15
TTS_SENTENCE_BREAKS = frozenset(".!?")
TTS_SOFT_BREAKS = frozenset(",;:")
TTS_SOFT_BREAK_MIN_CHARS = 60
