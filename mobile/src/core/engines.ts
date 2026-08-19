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

export type Llm = {
  /**
   * Stream a reply. `onToken` is called for each token as it arrives; resolves
   * with the complete text.
   */
  complete: (
    system: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    onToken: (token: string) => void,
    signal?: AbortSignal,
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
