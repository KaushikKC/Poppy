/**
 * One conversational turn — the port of the chat path in backend/ws_handler.py.
 *
 * text in -> LLM streams -> chunker -> speech -> playback, all overlapped, with
 * tokens going to the UI as they arrive so the words appear while she talks.
 *
 * Two desktop lessons are built in rather than rediscovered:
 *
 * **One synthesis at a time.** Every phrase used to get its own task, so a long
 * reply fired eight or ten synthesis calls at once. They thrash, each then exceeds
 * its timeout and gets dropped, and it is heard as her going silent while the text
 * keeps appearing. It also played back scrambled, because concurrent tasks
 * finished out of order. A single worker fixes both and still streams: the first
 * phrase synthesises while the model is generating the rest.
 *
 * **A failed phrase must not kill the turn.** If one phrase cannot be synthesised
 * the rest of the reply still plays; the failure is logged with the phrase so it
 * can be recognised in a user's log.
 *
 * Audio is *emitted*, not played. The WebView plays it, exactly as the browser
 * does on desktop, because `audio_player.js`'s AnalyserNode is what drives the
 * orb; playing natively would leave the orb motionless. So this hands WAV bytes
 * up to the socket layer, which sends them as binary frames like the Python
 * server does, and playback ordering is the page's job.
 */

import { PhraseChunker } from './chunker';
import { getEngines } from './engines';
import { wavBase64 } from './wav';

export type TurnEvents = {
  /** A config frame, before any audio: the UI initialises its player from this. */
  onConfig?: (sampleRate: number) => void;
  onToken?: (text: string) => void;
  /** One spoken phrase as base64 WAV, in order, for the page to play. */
  onAudio?: (wavBase64: string) => void;
  /** First phrase handed over — the latency number that matters. */
  onFirstAudio?: () => void;
  onDone?: (reply: string) => void;
  onError?: (message: string) => void;
};

export type TurnOptions = {
  system: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  voice: string;
  signal?: AbortSignal;
};

/**
 * Serialises synthesis and playback while letting the caller keep pushing
 * phrases. `close()` resolves once everything queued has been spoken.
 */
class SpeechStream {
  private queue: string[] = [];
  private running = false;
  private closed = false;
  private idle: Promise<void> = Promise.resolve();
  private resolveIdle: (() => void) | null = null;
  private firstAudioSent = false;

  constructor(
    private voice: string,
    private events: TurnEvents,
    private signal?: AbortSignal,
  ) {}

  push(phrase: string): void {
    if (!phrase || this.closed) return;
    this.queue.push(phrase);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    if (!this.resolveIdle) {
      this.idle = new Promise((r) => {
        this.resolveIdle = r;
      });
    }

    const { speech } = getEngines();
    while (this.queue.length) {
      // On barge-in the queue is emptied, not merely abandoned. Leaving phrases
      // behind meant close() saw work outstanding with no worker running, started
      // one, which aborted immediately, and the two spun forever.
      if (this.signal?.aborted) {
        this.queue.length = 0;
        break;
      }
      const phrase = this.queue.shift() as string;
      try {
        const out = await speech.synthesize(phrase, this.voice);
        if (this.signal?.aborted) {
          this.queue.length = 0;
          break;
        }
        if (!this.firstAudioSent) {
          this.firstAudioSent = true;
          this.events.onFirstAudio?.();
        }
        this.events.onAudio?.(wavBase64(out.samples, out.sampleRate));
      } catch (err) {
        // One bad phrase must not silence the rest of the reply.
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[tts] dropped phrase (${msg}): ${JSON.stringify(phrase.slice(0, 40))}`);
      }
    }

    this.running = false;
    this.resolveIdle?.();
    this.resolveIdle = null;
  }

  /** Wait for everything queued to finish speaking. */
  async close(): Promise<void> {
    this.closed = true;
    if (this.signal?.aborted) {
      this.queue.length = 0;
      return;
    }
    // A phrase may have been queued between the last pump and here.
    while (this.queue.length || this.running) {
      await this.idle;
      if (this.signal?.aborted) {
        this.queue.length = 0;
        return;
      }
      if (this.queue.length && !this.running) void this.pump();
    }
  }
}

/** Transcribe captured audio. Separate from runTurn so the UI can show it first. */
export async function transcribe(pcm16k: Float32Array): Promise<string> {
  return getEngines().stt.transcribe(pcm16k);
}

export async function runTurn(
  text: string,
  opts: TurnOptions,
  events: TurnEvents = {},
): Promise<string> {
  const { llm, speech: engine } = getEngines();
  const chunker = new PhraseChunker();
  const speech = new SpeechStream(opts.voice, events, opts.signal);

  // Before any token, like desktop: the UI initialises its player from this and
  // treats it as the signal that a reply has begun.
  events.onConfig?.(engine.sampleRate);

  let reply = '';
  try {
    reply = await llm.complete(
      opts.system,
      [...(opts.history ?? []), { role: 'user', content: text }],
      (token) => {
        reply += token;
        events.onToken?.(token);
        const phrase = chunker.push(token);
        if (phrase) speech.push(phrase);
      },
      opts.signal,
    );

    const tail = chunker.flush();
    if (tail) speech.push(tail);

    await speech.close();

    // Barge-in can land after generation finished, while queued phrases were
    // still being synthesised. That path throws nothing, so it is checked here too
    // or the turn would report done for a reply the user cut off. Cutting the
    // audio itself is the page's job: it owns the player.
    if (opts.signal?.aborted) return reply.trim();

    events.onDone?.(reply.trim());
    return reply.trim();
  } catch (err) {
    if (opts.signal?.aborted) {
      // Barge-in, not a failure: leave quietly.
      return reply.trim();
    }
    const msg = err instanceof Error ? err.message : String(err);
    events.onError?.(msg);
    throw err;
  }
}
