/**
 * One conversational turn — the port of the chat path in backend/ws_handler.py.
 *
 * Her replies arrive one way or the other, never both:
 *
 *   voice — nothing reaches the page while she generates, then the finished reply is
 *           rendered as a single recording and played start to finish.
 *   text  — tokens stream to the page as they arrive, and nothing is synthesised.
 *
 * The exclusivity is the point. A reply that can be read while it is being spoken is
 * read, and the voice becomes something to sit through rather than something to
 * listen to.
 *
 * ## Why the reply is rendered whole
 *
 * It used to be spoken phrase by phrase, overlapped with generation, so the first
 * words arrived before the model had finished. That is the right design when
 * synthesis outruns speech. Measured on device it does not: about six seconds of
 * audio take ten to render, and every phrase boundary costs a further 0.9s of
 * per-call overhead. Starting early therefore only means running out early, and the
 * result was a sentence, then five or six seconds of silence, then another sentence.
 *
 * Rendered whole there is one call and no next phrase to wait for, so the wait is
 * paid once, up front, where a voice note's wait belongs.
 *
 * Audio is played natively, not sent to the page. That was the other way round first,
 * to match the desktop server and to keep the orb fed from the page's own analyser, and
 * on device it produced a reply in text with no sound at all. See core/playback.ts for
 * what settled it. The orb is driven from a loudness envelope instead.
 */

import { awaitEngines } from './engines';
import { playback } from './playback';

export type TurnEvents = {
  /** A config frame, before any audio: the UI initialises its player from this. */
  onConfig?: (sampleRate: number) => void;
  onToken?: (text: string) => void;
  /** Voice mode: the finished recording, its length known before a sound is made. */
  onVoice?: (durationMs: number) => void;
  /** First phrase handed to the speaker, for the page's playback-started hook. */
  onAudio?: () => void;
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
  /**
   * How the reply is delivered, and the two are exclusive.
   *
   * 'text' streams tokens and synthesises nothing. It is the fastest the app can be
   * and the coolest it can run, because synthesis is most of both.
   *
   * 'voice' streams nothing to the page and speaks the reply as one recording. The
   * phrase-by-phrase pipeline exists to start speaking before the model has finished,
   * which is right when synthesis outruns speech. It does not here — roughly six
   * seconds of audio take ten to render — so starting early only means running out
   * early, and every phrase boundary costs another 0.9s of per-call overhead on top.
   * Rendered whole there is one call, and no gap to run into.
   */
  deliver?: 'voice' | 'text';
};

/** Transcribe captured audio. Separate from runTurn so the UI can show it first. */
export async function transcribe(pcm16k: Float32Array): Promise<string> {
  return (await awaitEngines()).stt.transcribe(pcm16k);
}

/**
 * Render a finished reply as one recording, and hand it over whole.
 *
 * Nothing is spoken until all of it exists, which is the point: it plays start to
 * finish with no gap, because there is no next phrase to wait for. The length is
 * known before playback starts, so the page can show a voice note with a real
 * duration rather than a spinner of unknown size.
 */
async function speakWhole(
  reply: string,
  opts: TurnOptions,
  events: TurnEvents,
  engine: { synthesize: (t: string, v: string) => Promise<{ samples: Float32Array | number[]; sampleRate: number }> },
): Promise<void> {
  const line = reply.trim();
  if (!line || opts.signal?.aborted) return;
  try {
    const out = await engine.synthesize(line, opts.voice);
    if (opts.signal?.aborted) return;
    const durationMs = (out.samples.length / out.sampleRate) * 1000;
    events.onFirstAudio?.();
    events.onVoice?.(durationMs);
    playback.push(out.samples, out.sampleRate);
    events.onAudio?.();
  } catch (err) {
    // A reply that cannot be spoken is still a reply; the page is told rather than
    // left waiting on a recording that will never arrive.
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[tts] the recording failed (${msg})`);
    events.onError?.(msg);
  }
}

export async function runTurn(
  text: string,
  opts: TurnOptions,
  events: TurnEvents = {},
): Promise<string> {
  const { llm, speech: engine } = await awaitEngines();
  const deliver = opts.deliver ?? 'voice';

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
        // Voice mode sends nothing at all while it generates. A reply that can be
        // read while it is being recorded is read, and then the recording is only
        // something to sit through. Text mode is the mirror of that: tokens, and
        // never a sound.
        if (deliver === 'text') events.onToken?.(token);
      },
      opts.signal,
    );

    if (deliver === 'voice') await speakWhole(reply, opts, events, engine);

    // Barge-in can land after generation finished, while queued phrases were
    // still being synthesised. That path throws nothing, so it is checked here too
    // or the turn would report done for a reply the user cut off. Cutting the
    // audio itself is the page's job: it owns the player.
    if (opts.signal?.aborted) {
      playback.stop();
      return reply.trim();
    }

    events.onDone?.(reply.trim());
    return reply.trim();
  } catch (err) {
    if (opts.signal?.aborted) {
      // Barge-in, not a failure: cut the voice and leave quietly.
      playback.stop();
      return reply.trim();
    }
    const msg = err instanceof Error ? err.message : String(err);
    events.onError?.(msg);
    throw err;
  }
}
