/**
 * One conversational turn — the port of the chat path in backend/ws_handler.py.
 *
 * Her reply answers in kind. Speak to her and she speaks back; type and she types
 * back. The app already knows which way the message arrived, so nobody has to choose:
 *
 *   spoken — nothing reaches the page while she generates, then the finished reply is
 *            rendered as one recording and played start to finish. Unless it turns out
 *            too slight to be worth the wait, in which case it simply arrives as text
 *            (see reply_shape.ts).
 *   typed  — tokens stream as they arrive, and nothing is synthesised at all.
 *
 * Never both at once. A reply that can be read while it is being spoken is read, and
 * the voice becomes something to sit through rather than something to listen to.
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

import { awaitEngines, MAX_TOKENS_SPOKEN, MAX_TOKENS_TEXT } from './engines';
import { playback } from './playback';
import { isGreeting, speakIt, wantsVoice } from './reply_shape';

export type TurnEvents = {
  /** A config frame, before any audio: the UI initialises its player from this. */
  onConfig?: (sampleRate: number) => void;
  onToken?: (text: string) => void;
  /** Synthesis is starting: there will be a recording, and it will take a moment. */
  onRecording?: () => void;
  /**
   * The finished recording: how long it runs, and what it says.
   *
   * The text is not streamed and not shown by default — that would make it a subtitle
   * rather than a voice note — but it travels with the frame so the page can offer it
   * behind a tap, which is what makes the message readable when sound is not an option.
   */
  onVoice?: (durationMs: number, text: string) => void;
  /** First phrase handed to the speaker, for the page's playback-started hook. */
  onAudio?: () => void;
  /** First phrase handed over — the latency number that matters. */
  onFirstAudio?: () => void;
  onDone?: (reply: string) => void;
  onError?: (message: string) => void;
};

export type TurnOptions = {
  system: string;
  /** The user's own name, if known. See fixVocative() for what it is used for. */
  userName?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  voice: string;
  signal?: AbortSignal;
  /**
   * Whether this turn arrived as speech.
   *
   * It sets the default shape of the answer: speak to her and she speaks back, type
   * and she types back. Nobody chooses this in a menu — the app already knows which
   * way the message came in, and mirroring it is what a person would do.
   *
   * A typed message is answered in text, always: tokens stream and nothing is
   * synthesised, which is the fastest the app can be and the coolest it can run.
   *
   * A spoken one is answered with a recording *unless* the finished reply turns out
   * too slight to be worth the wait — see reply_shape.ts.
   */
  spoken?: boolean;
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
/**
 * Cut a reply back to its last finished sentence.
 *
 * The token cap ends generation wherever it lands, and where it landed was
 * "There's something so satisfying about bringing color" — a voice note that simply
 * stops. Text has the same problem and hides it better.
 *
 * Only trims when there is a real sentence to keep: a short reply with no full stop
 * is left alone, because half of nothing is worse than an unfinished sentence.
 */
function toLastSentence(reply: string): string {
  const text = reply.trim();
  if (!text) return text;
  // Already ends properly.
  if (/[.!?…"'\)]$/.test(text)) return text;
  const cut = Math.max(text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? '));
  // Keep it only if a sentence survives that is worth hearing on its own.
  if (cut < 40) return text;
  return text.slice(0, cut + 1);
}

/**
 * Drop a reasoning trace, if the model emitted one.
 *
 * Qwen3 — the base the fine-tune is built on — has a thinking mode that wraps its
 * working in `<think>…</think>` before the actual answer. Generation asks for it to be
 * off, but "asks" is the operative word: a fine-tuned 0.6B can produce the tag anyway,
 * and one that slipped through would be shown on screen and then read out loud in a
 * voice note, in her voice, as if it were something she said.
 *
 * Handled here rather than at the socket because this is the point where the finished
 * reply exists and has not yet been split between what is displayed and what is spoken.
 * An unclosed tag means the trace ran to the end of the reply, so everything from the
 * tag onward goes.
 */
/**
 * She is only ever talking to one person, so any name used to address them is theirs.
 *
 * Measured on the fine-tuned 0.6B: told "my school friend is called Sam", it opened its
 * reply "Sam, you know that story, right?" in 6 of 8 samples — reading the nearest name
 * in the conversation as the name of the person it was speaking to. Training against it
 * barely moved the number (7 of 8 before the who-is-who slice, 6 of 8 after), which is
 * about what a model this size can be taught not to do.
 *
 * It does not need to be taught. A vocative is only ever the user, so a vocative that
 * is not the user's name is wrong by construction and can simply be corrected. Only the
 * form of address is touched — "Sam sounds like good company" is about Sam and is left
 * exactly as it is.
 */
export function fixVocative(reply: string, userName?: string): string {
  const name = (userName || '').trim();
  if (!name) return reply;
  const other = String.raw`[A-Z][a-z]{2,}`;
  return reply
    // "Sam, ..." at the very start.
    .replace(new RegExp(String.raw`^(${other})(?=\s*[,!])`), (m) => (m === name ? m : name))
    // "..., Sam?" at the end of a sentence.
    .replace(new RegExp(String.raw`(,\s*)(${other})(?=\s*[.?!])`, 'g'),
             (m, comma, who) => (who === name ? m : `${comma}${name}`));
}

const THINK_OPEN = '<think>';

/**
 * How much of a partial reply is safe to show, while tokens are still arriving.
 *
 * A typed turn streams to the screen token by token, so the finished-reply strip below
 * runs far too late — it cleans what is spoken and what is returned, while the page has
 * already painted "<think></think>". That is exactly what shipped: voice notes were
 * clean and typed replies opened with the raw tags.
 *
 * Three things have to be held back rather than emitted: a complete think block, an
 * unclosed one (the trace is still being written), and a partial opening tag at the
 * very end — "<thi" is not yet known to be anything, and printing it means printing
 * something that has to be un-printed a token later.
 */
function visibleSoFar(acc: string): string {
  let out = acc.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const open = out.search(/<think>/i);
  if (open !== -1) return out.slice(0, open);
  for (let n = THINK_OPEN.length - 1; n > 0; n--) {
    if (out.slice(-n).toLowerCase() === THINK_OPEN.slice(0, n)) return out.slice(0, -n);
  }
  return out;
}

function withoutReasoning(reply: string): string {
  const left = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').trim();
  // A reply that was nothing but reasoning leaves nothing to say. Better the raw text
  // than an empty turn that looks like she ignored them.
  return left || reply.trim();
}

/**
 * Take the stage directions out before anything is spoken.
 *
 * Small models narrate: "*sigh*", "*pauses, looking at Biscuit*", "(laughs)". On
 * screen that is a convention people read past. Spoken, the engine reads it — the
 * voice note says the word "sigh" — and there is already a note in native_engines.ts
 * about the mirror of this on the way in, where Whisper's own annotations had to be
 * thrown away for the same reason.
 *
 * Stripped from the words that are spoken *and* from the transcript that goes with
 * them, so the two say the same thing.
 */
const STAGE_DIRECTION = /\*[^*]*\*|\([^)]{0,80}\)/g;

function spoken(reply: string): string {
  const left = reply.replace(STAGE_DIRECTION, ' ').replace(/\s{2,}/g, ' ').trim();
  // If it was nothing but narration there is nothing to say, so keep the original
  // rather than synthesising silence.
  return /[\p{L}\p{N}]/u.test(left) ? left : reply.trim();
}

async function speakWhole(
  reply: string,
  opts: TurnOptions,
  events: TurnEvents,
  engine: { synthesize: (t: string, v: string) => Promise<{ samples: Float32Array | number[]; sampleRate: number }> },
): Promise<void> {
  const line = spoken(reply);
  if (!line || opts.signal?.aborted) return;
  events.onRecording?.();
  try {
    const out = await engine.synthesize(line, opts.voice);
    if (opts.signal?.aborted) return;
    const durationMs = (out.samples.length / out.sampleRate) * 1000;
    events.onFirstAudio?.();
    // Handed over BEFORE the page is told about it, and the order is load-bearing.
    // push() is what keeps the replayable copy (core/clips.ts), and the `voice` frame
    // onVoice sends carries that copy's id. Announcing first meant the frame quoted
    // whatever id existed a moment earlier — the previous reply's, or none at all on
    // the first turn — so the bubble was handed nothing to replay and her voice note
    // could be heard exactly once. Which is the bug this was all supposed to fix.
    playback.push(out.samples, out.sampleRate);
    events.onVoice?.(durationMs, line);
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
  // …unless they asked. Arrival is the default, not the rule: someone typing at
  // their desk can still want to hear the answer, and saying so in the message is
  // the obvious way to ask for it.
  const askedForVoice = wantsVoice(text);
  const spoken = askedForVoice || opts.spoken !== false;

  // Before any token, like desktop: the UI initialises its player from this and
  // treats it as the signal that a reply has begun.
  events.onConfig?.(engine.sampleRate);

  let reply = '';
  let streamed = '';
  try {
    reply = await llm.complete(
      opts.system,
      [...(opts.history ?? []), { role: 'user', content: text }],
      (token) => {
        reply += token;
        // A spoken turn sends nothing at all while it generates. A reply that can be
        // read while it is being recorded is read, and then the recording is only
        // something to sit through. A typed turn is the mirror: tokens, never a sound.
        //
        // Emitted as the difference between what is now safe to show and what has
        // already been shown, rather than as the raw token, so a reasoning trace never
        // reaches the screen even for an instant.
        if (spoken) return;
        const visible = visibleSoFar(reply);
        if (visible.length > streamed.length) {
          const delta = visible.slice(streamed.length);
          streamed = visible;
          // Leading blank lines are what the stripped block left behind.
          events.onToken?.(streamed.length === delta.length ? delta.replace(/^\s+/, '') : delta);
        }
      },
      opts.signal,
      // A reply that will be read can be longer than one that will be listened to.
      // A greeting gets a greeting, not a biography. See isGreeting() for why the cap
      // does this and the prompt cannot.
      isGreeting(text) ? 40 : spoken ? MAX_TOKENS_SPOKEN : MAX_TOKENS_TEXT,
    );

    // Ending mid-phrase is the cap's doing, not hers.
    reply = fixVocative(toLastSentence(withoutReasoning(reply)), opts.userName);

    // Decided here, on the finished reply, because that is the only point at which
    // the length is known — and it is known for free, before a sound is made.
    // An explicit request skips the length floor as well: "yes, obviously" is under
    // sixty characters and would normally be read, but they asked to hear it.
    if (spoken && (askedForVoice || speakIt(reply))) {
      await speakWhole(reply, opts, events, engine);
    } else if (spoken) {
      // Spoken to, but the answer is a line rather than a message: it arrives whole
      // and instantly instead of costing four seconds to say out loud.
      events.onToken?.(reply.trim());
    }

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
