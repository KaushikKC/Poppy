from config import (
    TTS_CHUNK_MIN_CHARS,
    TTS_SENTENCE_BREAKS,
    TTS_SOFT_BREAKS,
    TTS_SOFT_BREAK_MIN_CHARS,
    TTS_CHUNK_MAX_CHARS,
    TTS_FIRST_CHUNK_MIN_CHARS,
    TTS_FIRST_SOFT_MIN_CHARS,
    TTS_FIRST_CHUNK_MAX_CHARS,
)


class PhraseChunker:
    """Breaks a streamed token sequence into speakable phrases.

    The first phrase is emitted aggressively (short) so the voice starts almost
    immediately, while the text is still being typed. Later phrases use larger
    thresholds for smoother prosody. A hard max length guarantees a phrase is
    never held back waiting for punctuation that may only arrive at the end.
    """

    def __init__(self):
        self._buf = ""
        self._first = True

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
        n = len(stripped)

        if self._first:
            sentence_min, soft_min, max_chars = (
                TTS_FIRST_CHUNK_MIN_CHARS,
                TTS_FIRST_SOFT_MIN_CHARS,
                TTS_FIRST_CHUNK_MAX_CHARS,
            )
        else:
            sentence_min, soft_min, max_chars = (
                TTS_CHUNK_MIN_CHARS,
                TTS_SOFT_BREAK_MIN_CHARS,
                TTS_CHUNK_MAX_CHARS,
            )

        if last in TTS_SENTENCE_BREAKS and n >= sentence_min:
            return self._take()
        if last in TTS_SOFT_BREAKS and n >= soft_min:
            return self._take()
        if n >= max_chars:
            return self._take_at_word_boundary()
        return None

    def _take(self) -> str:
        text = self._buf.strip()
        self._buf = ""
        self._first = False
        return text

    def _take_at_word_boundary(self) -> str | None:
        """Emit up to the last whitespace so a word isn't cut mid-way; keep the
        trailing partial word in the buffer for the next phrase."""
        idx = self._buf.rstrip().rfind(" ")
        if idx <= 0:
            return self._take()
        phrase = self._buf[:idx].strip()
        self._buf = self._buf[idx:].lstrip()
        self._first = False
        return phrase if phrase else None
