OLLAMA_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3.1:8b-instruct-q4_K_M"
OLLAMA_CONTEXT_WINDOW = 4096
MAX_HISTORY_TURNS = 10

SYSTEM_PROMPT = (
    "You are a warm, friendly conversational companion. "
    "Keep replies concise — two to four sentences unless the user asks for more. "
    "Speak naturally, as you would in a real conversation."
)

WHISPER_MODEL = "small"
WHISPER_DEVICE = "cpu"
WHISPER_COMPUTE = "int8"

PIPER_MODEL_PATH = "../models/piper/en_US-lessac-medium.onnx"
PIPER_SAMPLE_RATE = 22050

TTS_CHUNK_MIN_CHARS = 30
TTS_SENTENCE_BREAKS = frozenset(".!?")
TTS_SOFT_BREAKS = frozenset(",;:")
TTS_SOFT_BREAK_MIN_CHARS = 60
