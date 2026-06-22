from config import TTS_CHUNK_MIN_CHARS, TTS_SENTENCE_BREAKS, TTS_SOFT_BREAKS, TTS_SOFT_BREAK_MIN_CHARS


class PhraseChunker:
    def __init__(self):
        self._buf = ""

    def push(self, token: str) -> str | None:
        self._buf += token
        return self._flush_if_ready()

    def flush(self) -> str | None:
        text = self._buf.strip()
        self._buf = ""
        return text if text else None

    def _flush_if_ready(self) -> str | None:
        stripped = self._buf.rstrip()
        if not stripped:
            return None

        last = stripped[-1]

        if last in TTS_SENTENCE_BREAKS and len(stripped) >= TTS_CHUNK_MIN_CHARS:
            return self._take()

        if last in TTS_SOFT_BREAKS and len(stripped) >= TTS_SOFT_BREAK_MIN_CHARS:
            return self._take()

        return None

    def _take(self) -> str:
        text = self._buf.strip()
        self._buf = ""
        return text
