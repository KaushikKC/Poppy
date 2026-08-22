/**
 * The three on-device engines, behind interfaces.
 *
 * The turn loop talks to these, never to llama.rn / whisper.rn / sherpa-onnx
 * directly. That is what lets the loop — the most intricate part of the port — be
 * driven by fakes in plain node, on a Mac, in milliseconds. Desktop earned that
 * lesson the hard way: the bugs in this pipeline were ordering and timing bugs,
 * and those are found by running the loop a hundred times, not by staring at it.
 *
 * The real implementations live in `nativeEngines()`, which is the only place that
 * imports the native modules.
 */

export type Stt = {
  /** 16 kHz mono float PCM in, text out. */
  transcribe: (pcm16k: Float32Array) => Promise<string>;
};

/**
 * How long a reply is allowed to get, and why there are two numbers.
 *
 * The 90 is a listening limit, not a model limit: a spoken reply past roughly ninety
 * tokens is too long to sit through, and it was the only cap here while every reply
 * was spoken. Adult mode removed the brevity rule from the prompt — she is now told to
 * take as much room as the moment needs — so a typed reply held to ninety tokens stops
 * mid-sentence, which reads as the app breaking rather than as her being brief.
 *
 * The text cap stays under REPLY_RESERVE in socket.ts (320), so the budget that sizes
 * the prompt and the cap that ends the reply cannot disagree.
 */
export const MAX_TOKENS_SPOKEN = 90;
export const MAX_TOKENS_TEXT = 300;

export type Llm = {
  /**
   * Stream a reply. `onToken` is called for each token as it arrives; resolves
   * with the complete text.
   *
   * `maxTokens` defaults to the spoken cap: a caller that does not care is a caller
   * making a recording.
   */
  complete: (
    system: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    onToken: (token: string) => void,
    signal?: AbortSignal,
    maxTokens?: number,
  ) => Promise<string>;
};

export type Speech = {
  /**
   * The rate this engine outputs at, known before anything is synthesised.
   * The UI is sent a config frame with this before generation starts, matching
   * desktop's tts.SAMPLE_RATE, so its player is ready before the first phrase.
   */
  sampleRate: number;
  /** Synthesise one phrase. Resolves with PCM samples and their rate. */
  synthesize: (
    text: string,
    voice: string,
  ) => Promise<{ samples: Float32Array | number[]; sampleRate: number }>;
};

/**
 * No playback engine. The WebView plays the audio, as the browser does on
 * desktop, because audio_player.js's AnalyserNode is what animates the orb.
 * Native playback would be marginally faster and leave the orb dead still.
 */
export type Engines = {
  stt: Stt;
  llm: Llm;
  speech: Speech;
};

let engines: Engines | null = null;
let waiting: Array<(e: Engines) => void> = [];

export function setEngines(e: Engines): void {
  engines = e;
  const pending = waiting;
  waiting = [];
  for (const resolve of pending) resolve(e);
}

export function getEngines(): Engines {
  if (!engines) throw new Error('engines not set: call setEngines() before a turn');
  return engines;
}

/**
 * The engines, waited for if the load has not finished yet.
 *
 * Loading them takes seconds — a gigabyte of weights off flash, plus Whisper, plus
 * Kokoro and its warm-up phrase — and it runs in the background while the UI is
 * already on screen. So there is a real window in which someone can press Call
 * before there is anything to answer with, and every caller here used to meet that
 * window by throwing "engines not set" at them.
 *
 * It went unnoticed because the first-run setup screen sat in front of that window
 * and absorbed it. Fixing the launch check so that screen stops appearing for people
 * who already have their models is what exposed it: the app now reaches home in a
 * fraction of the time, and reaches it while the models are still loading.
 *
 * Waiting is the honest behaviour — the call is a moment or two late rather than
 * broken, and the loading line is already on screen while it happens. The timeout is
 * long because loading really can take a while on a cold, busy phone; it exists only
 * so a load that has genuinely failed surfaces as an error rather than a hang.
 */
export function awaitEngines(timeoutMs = 120_000): Promise<Engines> {
  if (engines) return Promise.resolve(engines);
  return new Promise((resolve, reject) => {
    const onReady = (e: Engines): void => {
      clearTimeout(timer);
      resolve(e);
    };
    const timer = setTimeout(() => {
      waiting = waiting.filter((w) => w !== onReady);
      reject(new Error('The models are still loading. Give it a moment and try again.'));
    }, timeoutMs);
    waiting.push(onReady);
  });
}

export function enginesReady(): boolean {
  return engines !== null;
}
