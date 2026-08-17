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

export type Audio = {
  /** Play PCM, resolving when it has finished. Calls are serialised by the caller. */
  play: (samples: Float32Array | number[], sampleRate: number) => Promise<void>;
  /** Drop anything queued or playing, for barge-in. */
  stop: () => void;
};

export type Engines = {
  stt: Stt;
  llm: Llm;
  speech: Speech;
  audio: Audio;
};

let engines: Engines | null = null;

export function setEngines(e: Engines): void {
  engines = e;
}

export function getEngines(): Engines {
  if (!engines) throw new Error('engines not set: call setEngines() before a turn');
  return engines;
}

export function enginesReady(): boolean {
  return engines !== null;
}
