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
  /**
   * A reply written by code rather than generated, used for the two kinds of turn
   * that must never be wrong: hello, and someone saying they have no one. Set by the
   * caller, which is where the decision belongs: this function's job is to turn text
   * into a reply, spoken or typed, and it does not care whether the text came from a
   * model. See greeting.ts and warmth.ts.
   */
  greeting?: string;
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
 * Two sentences, then she stops.
 *
 * Measured on v7a on a phone: every reply ran 11 to 13 seconds as a voice note, and
 * the length was where it went wrong. Past the second sentence the 0.6B stops
 * answering and starts inventing — "laundromat this morning" on a Monday afternoon,
 * "flower orders before lunch" repeated word for word at dinner, a plan for tonight
 * quietly moved to tomorrow. Less room is less of that, and a friend's text is one or
 * two sentences anyway.
 *
 * Code rather than the prompt, because the 3B already showed a small model follows one
 * structural instruction per turn and the slot is taken.
 *
 * A boundary is a full stop, ! or ? followed by the capital that starts the next
 * sentence. "everything... what's new" carries on in lowercase and is one sentence.
 * While streaming, the next capital is what confirms the boundary, so `final` decides
 * whether the end of the text counts as one.
 */
const MAX_SENTENCES = 2;
const BOUNDARY = /[.!?…]+["'”’)\]]*(?=\s+["'“‘(]?[A-Z])/g;

/**
 * The sentences in a partial reply that are known to be finished.
 *
 * Finished means the next one has started (BOUNDARY), or, when `final`, the text has
 * ended. The unfinished tail is left out: it is not yet anything to check or show.
 */
export function finishedSentences(text: string, final: boolean): string[] {
  const out: string[] = [];
  BOUNDARY.lastIndex = 0;
  let from = 0;
  let m: RegExpExecArray | null;
  while ((m = BOUNDARY.exec(text))) {
    const end = m.index + m[0].length;
    out.push(text.slice(from, end).trim());
    from = end;
  }
  const tail = text.slice(from).trim();
  if (final && tail) out.push(tail);
  return out.filter(Boolean);
}

/**
 * Has she said this already?
 *
 * Six words running, matched against her own earlier replies in this conversation.
 * "Just got back from my morning swim in the ocean" came back word for word in the
 * same conversation on a phone; "How's your day been?" is four words and is allowed to
 * come back, because a friend asks that twice.
 *
 * ── Why this is code and not the sampler ─────────────────────────────────────
 *
 * penalty_repeat over the last 512 tokens was meant to stop exactly this, and on the
 * phone it never could: llama.rn feeds only the tokens it generates into the sampler,
 * never the prompt (rn-completion.cpp), so the penalty saw the reply being written and
 * nothing she had said before it. llama-server feeds the whole prompt in, which is why
 * the same weights repeated in 2% of turns on the Mac and constantly on the phone. DRY
 * has the same blind spot, and iOS ships llama.rn prebuilt, so it cannot be patched.
 */
const REPEAT_RUN = 6;

function words(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

export function runsOf(texts: string[]): Set<string> {
  const runs = new Set<string>();
  for (const t of texts) {
    const w = words(t);
    for (let i = 0; i + REPEAT_RUN <= w.length; i++) runs.add(w.slice(i, i + REPEAT_RUN).join(' '));
  }
  return runs;
}

export function repeats(sentence: string, earlier: Set<string>): boolean {
  if (!earlier.size) return false;
  const w = words(sentence);
  for (let i = 0; i + REPEAT_RUN <= w.length; i++) {
    if (earlier.has(w.slice(i, i + REPEAT_RUN).join(' '))) return true;
  }
  return false;
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
  // than an empty turn that looks like she ignored them — but raw with the markers
  // taken out, not raw as it came.
  //
  // This is how "<think>" ended up on screen three times in one conversation, and read
  // out loud in a voice note. The model opened with the tag and then simply answered,
  // never closing it: the second replace deletes an unclosed block to the end, which
  // took the whole reply, and the fallback handed back the original — tag and all.
  //
  // v4 did not do this and the longer-trained model does, which is the base showing
  // through: Qwen3 has a thinking mode, and more training on top of it surfaced the
  // habit rather than removing it.
  return left || reply.replace(/<\/?think>/gi, '').trim();
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
  // What has reached the screen so far, sentence by sentence, on a typed turn.
  let shown = 0;
  const show = (sentence: string): void => {
    if (spoken) return;
    events.onToken?.(shown++ === 0 ? sentence : ` ${sentence}`);
  };
  try {
    // Hello does not go to the model. See greeting.ts for the three attempts that came
    // before this and what each one came back with. Everything that is not an exact
    // greeting falls straight through to generation, unchanged.
    const canned = opts.greeting;
    if (canned) {
      reply = canned;
      events.onToken?.(canned);
    } else {
      // Her earlier replies in this conversation, as six-word runs. See repeats().
      const earlier = runsOf((opts.history ?? []).filter((m) => m.role === 'assistant').map((m) => m.content));

      // One generation. Sentences are checked as they finish and only then shown, so
      // a repeat is caught before it reaches the screen rather than after. A typed
      // reply therefore arrives a sentence at a time instead of a token at a time,
      // which at two sentences is barely different and reads like texting anyway.
      const generate = async (): Promise<{ kept: string[]; first: string }> => {
        let raw = '';
        let done = 0;
        let stop = false;
        const kept: string[] = [];
        let first = '';
        // Returns true when generation should end here.
        const take = (sentences: string[]): boolean => {
          for (; done < sentences.length && !stop; done++) {
            const s = sentences[done];
            if (!first) first = s;
            // Said before: end the reply where it is, and never show it.
            if (repeats(s, earlier)) {
              stop = true;
              break;
            }
            kept.push(s);
            show(s);
            // Two sentences, then she stops. See MAX_SENTENCES.
            if (kept.length >= MAX_SENTENCES) stop = true;
          }
          return stop;
        };
        await llm.complete(
          opts.system,
          // ── /no_think ─────────────────────────────────────────────────────
          //
          // Qwen3 is a thinking model and the fine-tune sits on top of that, so it
          // reasons before answering whether or not anyone wants it to. Stripping the
          // <think> markers afterwards cleans up the tags and leaves the reasoning,
          // which is written *about* the user rather than to them: "I think I should
          // tell him about the movie… His name is Kaushik, and he's feeling a bit
          // bored today." Her own notes, read out in a voice note, in the third person.
          //
          // The flag is what the Qwen3 chat template reads to skip thinking entirely,
          // and it goes on the user turn because that is where the template looks for
          // it. Appended here and nowhere else, so the text stored in history, shown
          // on screen and spoken aloud never contains it.
          [...(opts.history ?? []), { role: 'user', content: `${text} /no_think` }],
          // visibleSoFar() keeps a reasoning trace off the screen even for an instant.
          (token) => {
            raw += token;
            return take(finishedSentences(visibleSoFar(raw), false));
          },
          opts.signal,
          // A reply that will be read can be longer than one that will be listened to.
          // A greeting gets a greeting, not a biography. See isGreeting() for why the
          // cap does this and the prompt cannot.
          isGreeting(text) ? 40 : spoken ? MAX_TOKENS_SPOKEN : MAX_TOKENS_TEXT,
        );
        if (!stop) {
          // The last sentence ends with the text rather than with a next one. If the
          // token cap cut it mid-phrase it is dropped ("There's something so satisfying
          // about bringing color" was a whole voice note once),
          // unless it is all there is.
          const all = finishedSentences(withoutReasoning(raw), true);
          const tail = all[all.length - 1] ?? '';
          const cut = done === all.length - 1 && !/[.!?…"'”’)\]]$/.test(tail) && kept.length > 0;
          take(cut ? all.slice(0, -1) : all);
        }
        return { kept, first };
      };

      let out = await generate();
      // The very first sentence was a repeat, so nothing was said. Sampling is random,
      // so a second try is a different reply; if that one opens with a repeat too,
      // it is said anyway, because a repeat is better than silence.
      if (!out.kept.length && !opts.signal?.aborted) {
        const retry = await generate();
        out = retry.kept.length ? retry : { kept: [retry.first || out.first], first: '' };
        if (!retry.kept.length && out.kept[0]) show(out.kept[0]);
      }
      reply = out.kept.join(' ');
    }

    // A written line (hello, warmth) is exactly as long as it was written to be: the
    // warm ones are three sentences, and none of them is checked for repeats.
    reply = fixVocative(canned ? withoutReasoning(reply) : reply, opts.userName);

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
