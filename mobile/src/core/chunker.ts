/**
 * The phrase chunker — a direct port of backend/phrase_chunker.py.
 *
 * It decides when enough text has arrived to start speaking. The first chunk is
 * emitted aggressively so the voice begins while the model is still generating;
 * later chunks are larger so the speech is not chopped into fragments.
 *
 * The constants are the desktop ones, and they are not arbitrary. Measured on an
 * iPhone 15, waiting for a full sentence meant Kokoro had 110 characters to render
 * before making a sound, and first-audio landed at 4.65s instead of ~1.5s. The
 * cheap first chunk is what buys that back.
 *
 * Ported by transcription rather than reinvention: same order of checks, same
 * word-boundary fallback, so the behaviour tracks the version that was tuned
 * against real speech.
 */

const SENTENCE_BREAKS = new Set(['.', '!', '?']);
const SOFT_BREAKS = new Set([',', ';', ':', '—']);

export const CHUNK_MIN_CHARS = 15;
export const SOFT_BREAK_MIN_CHARS = 35;
export const CHUNK_MAX_CHARS = 110;
export const FIRST_CHUNK_MIN_CHARS = 6;
export const FIRST_SOFT_MIN_CHARS = 4;
export const FIRST_CHUNK_MAX_CHARS = 18;

export class PhraseChunker {
  private buf = '';
  private first = true;

  /** Feed a token. Returns a phrase to speak, or null to keep buffering. */
  push(token: string): string | null {
    this.buf += token;
    return this.flushIfReady();
  }

  /** Whatever is left at the end of generation. */
  flush(): string | null {
    const text = this.buf.trim();
    this.buf = '';
    if (!text) return null;
    this.first = false;
    return text;
  }

  private flushIfReady(): string | null {
    const stripped = this.buf.replace(/\s+$/, '');
    if (!stripped) return null;

    const last = stripped[stripped.length - 1];
    const n = stripped.length;

    const [sentenceMin, softMin, maxChars] = this.first
      ? [FIRST_CHUNK_MIN_CHARS, FIRST_SOFT_MIN_CHARS, FIRST_CHUNK_MAX_CHARS]
      : [CHUNK_MIN_CHARS, SOFT_BREAK_MIN_CHARS, CHUNK_MAX_CHARS];

    if (SENTENCE_BREAKS.has(last) && n >= sentenceMin) return this.take();
    if (SOFT_BREAKS.has(last) && n >= softMin) return this.take();
    if (n >= maxChars) return this.takeAtWordBoundary();
    return null;
  }

  private take(): string {
    const text = this.buf.trim();
    this.buf = '';
    this.first = false;
    return text;
  }

  /**
   * Emit up to the last space so a word is not cut in half; the trailing partial
   * word stays buffered for the next phrase.
   */
  private takeAtWordBoundary(): string | null {
    const idx = this.buf.replace(/\s+$/, '').lastIndexOf(' ');
    if (idx <= 0) return this.take();
    const phrase = this.buf.slice(0, idx).trim();
    this.buf = this.buf.slice(idx).replace(/^\s+/, '');
    this.first = false;
    return phrase || null;
  }

  /** True until the first phrase has been emitted. */
  get isFirst(): boolean {
    return this.first;
  }
}
