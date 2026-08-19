/**
 * The real engines. The only file in the core that imports native modules.
 *
 * Everything above this talks to the interfaces in engines.ts, which is why the
 * turn loop can be tested on a Mac. This file is the part that cannot be, so it is
 * kept as thin as possible: load, call, translate. No logic lives here.
 *
 * Model files come from the app's Documents directory (see models.ts), downloaded
 * on first run rather than bundled — the weights are over a gigabyte and the App
 * Store is not the place to ship them.
 */

import { initLlama, type LlamaContext } from 'llama.rn';
import { initWhisper, type WhisperContext } from 'whisper.rn';
import { createTTS, type TtsEngine } from 'react-native-sherpa-onnx/tts';
import { getCoreMlSupport } from 'react-native-sherpa-onnx';

import { KOKORO_DIR, WHISPER_PATH } from '../models';
import { DocumentDirectoryPath } from '@dr.pogodin/react-native-fs';
import { llmPath } from './model_tier';
import * as companion from './companion';
import { setEngines, type Engines, type Llm, type Speech, type Stt } from './engines';
import { floatToPcm16 } from '../audio';
import { ttsDiagnostic } from './tts_info';

/** Kokoro's output rate. The UI is told this before a reply starts. */
const KOKORO_SAMPLE_RATE = 24000;

/**
 * Voice name to sherpa speaker id, for kokoro-multi-lang-v1_0's 53 voices.
 *
 * The profile carries a Kokoro voice *name* because desktop's pipeline takes names;
 * sherpa takes an index into voices.bin. Passing sid 0 for everyone, which is what this
 * did first, gives af_alloy — a blend, and the flattest voice in the set. That is the
 * "robotic" voice reported from the phone: not a synthesis problem, the wrong speaker.
 *
 * Only the six the characters use are listed. An unknown name falls back to af_heart
 * rather than to 0, so a new character with an unmapped voice still sounds like someone.
 */
const VOICE_SID: Record<string, number> = {
  af_heart: 3, // Poppy
  af_bella: 2, // Zoe
  af_nicole: 6, // Luna
  am_adam: 11, // Leo
  am_fenrir: 14, // Kai
  am_michael: 16, // Ravi
};

const DEFAULT_SID = VOICE_SID.af_heart;

/**
 * Back to natural pace, the same as desktop.
 *
 * These were 0.9 and 1.15, slowing her down because she was reported as far too fast.
 * That was treating a symptom: the real cause was 24 kHz audio being played through a
 * 48 kHz context, so every phrase ran at double speed and double pitch. With the pitch
 * fixed in PcmPlayer, a slowdown here would just make her sluggish.
 */
const SPEECH_SPEED = 1.0;
const SPEECH_LENGTH_SCALE = 1.0;

/**
 * Kokoro's compute, and why it is not simply "more".
 *
 * Four threads was tried and it was worse, not better. Kokoro got faster in isolation
 * and llama.cpp collapsed alongside it: prompt eval fell from 364 to 100 tokens a
 * second and generation from 23 to 3.3, because the two were taking the same cores
 * from each other. Measured on the phone — a 99-character phrase took 14.76s to
 * render while the model's whole turn took 14.50s, the two sitting exactly on top of
 * one another, each starving the other.
 *
 * The model is on the critical path to her *first* word, so losing there costs more
 * than synthesis gains. Threads go back to the library default.
 *
 * The way out is not to divide the CPU differently, it is to stop sharing it. CoreML
 * runs Kokoro on the Neural Engine, which is a separate unit that is sitting idle
 * while llama has the GPU and Whisper has the CPU. It falls back to CPU on its own if
 * the model will not convert, so the worst case is where we already are.
 */
const TTS_THREADS = 2;
const TTS_PROVIDER = 'coreml';

// Filled in at load; declared in core/tts_info.ts so readers do not import this file.
export { ttsDiagnostic } from './tts_info';

/**
 * Context and reply length, both cut for heat rather than for memory.
 *
 * 2048 rather than 4096: the KV cache is half the size and every prefill does half the
 * work. Replies here are two to four spoken sentences with at most six turns of
 * history, so the larger window was never being filled — it was just costing compute on
 * every single turn.
 *
 * 90 tokens rather than 120 for the same reason: a spoken reply that runs past ~90
 * tokens is too long to listen to anyway, so this caps the worst case rather than the
 * normal one.
 */
const N_CTX = 2048;
const MAX_TOKENS = 90;

export type Loaded = {
  whisper: WhisperContext;
  llama: LlamaContext;
  tts: TtsEngine;
};

let loaded: Loaded | null = null;
// The load in flight, if there is one. `loaded` is only set at the very end, so a
// second caller arriving mid-load would otherwise start a whole second load — a
// gigabyte of weights read twice, on a device that cannot spare the memory.
let loading: Promise<void> | null = null;

/**
 * Whisper's own annotations for sound that is not speech: "(engine revving)",
 * "[BLANK_AUDIO]", "(music playing)", a bare musical note. It emits these when it is
 * handed audio with nothing intelligible in it — silence, noise, or, in the bug this
 * app has hit twice now, speech at the wrong sample rate.
 *
 * They have to be thrown away rather than passed on. The model does not know it is
 * reading a stage direction: it answers "(engine revving)" perfectly earnestly, which
 * is what a user sees instead of being told their microphone produced nothing usable.
 *
 * Only the annotation goes. Real words either side of one are kept, because Whisper
 * does interleave them with genuine speech.
 */
const ANNOTATION = /\([^)]*\)|\[[^\]]*\]|\u266a/g;

function spokenWords(raw: string): string {
  const left = raw.replace(ANNOTATION, ' ').replace(/\s+/g, ' ').trim();
  // Punctuation left behind by a stripped annotation is not something anyone said.
  return /[\p{L}\p{N}]/u.test(left) ? left : '';
}

/**
 * One call at a time into each native context.
 *
 * llama.cpp, whisper.cpp and sherpa each hold a single context with its own KV cache
 * and scratch buffers, and none of them is re-entrant. Nothing above here enforced
 * that. The socket starts a full turn on every frame it receives, with no check for
 * one already running, and auto-listen only stands down while she is *speaking* — so
 * anything said while she is still thinking fires a second utterance straight into a
 * second turn.
 *
 * Two completions decoding into one KV cache is not a queue, it is corruption: output
 * that drifts into nonsense, decode that never terminates, and both of them burning
 * the GPU at once. That is the whole reported cluster — replies getting slower every
 * turn, then hanging, then hallucinating, with the phone getting hot.
 *
 * Serialising at this boundary rather than higher up is deliberate. It is the last
 * place before the native call, so it holds no matter which path above it is at
 * fault, and it changes no behaviour at all when calls do not overlap.
 */
function serialized<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  let tail: Promise<unknown> = Promise.resolve();
  return (...args: A) => {
    // Both settle paths continue the chain: one failed call must not wedge the queue.
    const run = tail.then(() => fn(...args), () => fn(...args));
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export async function loadNativeEngines(
  onProgress: (msg: string) => void = () => {},
): Promise<void> {
  if (loaded) return;
  if (loading) return loading;
  loading = loadOnce(onProgress).finally(() => {
    loading = null;
  });
  return loading;
}

async function loadOnce(onProgress: (msg: string) => void): Promise<void> {
  onProgress('Loading speech recognition…');
  const whisper = await initWhisper({ filePath: WHISPER_PATH });

  onProgress('Loading the language model…');
  // Whichever model the user settled on, which may not be the one their RAM suggests:
  // a smaller one runs cooler, and that is a trade they are allowed to make.
  const tier = ((await companion.profile()).model_tier ?? null) as
    | Parameters<typeof llmPath>[0]
    | null;
  const modelFile = `${DocumentDirectoryPath}/${await llmPath(tier)}`;
  const llama = await initLlama({
    model: modelFile,
    n_ctx: N_CTX,
    n_gpu_layers: 99, // Metal where available; llama.cpp falls back to CPU
  });

  onProgress('Loading the voice…');
  // CoreML falls back to the CPU without saying so, and a silent fallback reads
  // exactly like a provider that changed nothing. Ask first, so the log distinguishes
  // "the Neural Engine did not help" from "the Neural Engine was never used".
  try {
    const coreml = await getCoreMlSupport();
    console.log(`[tts] CoreML support: ${JSON.stringify(coreml)}`);
  } catch (err) {
    console.log(`[tts] could not read CoreML support: ${err}`);
  }
  const tts = await createTTS({
    modelPath: { type: 'file', path: KOKORO_DIR },
    modelType: 'kokoro',
    // See TTS_THREADS: the gaps are a compute-sharing problem, not a thread-count one.
    numThreads: TTS_THREADS,
    provider: TTS_PROVIDER,
    // lengthScale slows speech at the model level. `speed` is a per-call option and it
    // was reported as still too fast, so this is set as well: whichever the engine
    // actually honours, the result is a listenable pace.
    modelOptions: { kokoro: { lengthScale: SPEECH_LENGTH_SCALE } },
  });

  // What the engine actually loaded, recorded because the voice was reported as
  // identical for every character and there was no way to tell why from here. If this
  // says one speaker, voices.bin was not picked up and `sid` cannot do anything — which
  // is a model or config problem, not a lookup problem.
  try {
    ttsDiagnostic.speakers = await tts.getNumSpeakers();
    ttsDiagnostic.sampleRate = await tts.getSampleRate();
    const info = await tts.getModelInfo();
    ttsDiagnostic.modelType = String((info as { modelType?: unknown })?.modelType ?? '?');
    console.log(
      `[tts] loaded ${ttsDiagnostic.modelType}: ${ttsDiagnostic.speakers} speakers, ` +
      `${ttsDiagnostic.sampleRate}Hz, lengthScale=${SPEECH_LENGTH_SCALE}, speed=${SPEECH_SPEED}`,
    );
    if (ttsDiagnostic.speakers <= 1) {
      console.log('[tts] only one speaker: every character will sound identical');
    }
  } catch (err) {
    console.log(`[tts] could not read the voice model's details: ${err}`);
  }

  loaded = { whisper, llama, tts };

  // Speak one short phrase into nothing, so the first real one does not pay Kokoro's
  // lazy setup. Reported from the phone as the text arriving well before the voice: the
  // first synthesis of a session is markedly slower than the rest.
  onProgress('Warming her voice…');
  try {
    await tts.generateSpeech('mm', { sid: DEFAULT_SID, speed: SPEECH_SPEED });
  } catch {
    // A failed warmup costs latency on the first phrase, nothing more.
  }

  const stt: Stt = {
    transcribe: serialized(async (pcm16k: Float32Array) => {
      // int16, not float32. whisper.rn's ArrayBuffer path hands the buffer to
      // decodePcm16 on the native side, which reads it as int16 and divides by
      // 32767, despite a doc comment that reads as though floats are accepted.
      // Passing floats produced a low rumble that Whisper transcribed as
      // "(engine revving)" whatever was actually said.
      const bytes = floatToPcm16(pcm16k);
      const { promise } = whisper.transcribeData(bytes.buffer as ArrayBuffer, {
        language: 'en',
      });
      const res = await promise;
      return spokenWords(res.result ?? '');
    }),
  };

  const llm: Llm = {
    complete: serialized(async (
      system: string,
      messages: Array<{ role: 'user' | 'assistant'; content: string }>,
      onToken: (token: string) => void,
      signal?: AbortSignal,
    ) => {
      let acc = '';
      await llama.completion(
        {
          messages: [{ role: 'system', content: system }, ...messages],
          n_predict: MAX_TOKENS,
          temperature: 0.7,
          stop: ['</s>', '<|eot_id|>'],
        },
        (data: { token: string }) => {
          if (signal?.aborted) return;
          acc += data.token;
          onToken(data.token);
        },
      );
      if (signal?.aborted) throw new Error('aborted');
      return acc;
    }),
  };

  const speech: Speech = {
    sampleRate: KOKORO_SAMPLE_RATE,
    synthesize: serialized(async (text: string, voice: string) => {
      let sid = VOICE_SID[voice] ?? DEFAULT_SID;
      // A sid past the end of the model is not an error, it is silently the wrong
      // voice — v0.19 has 11 speakers, so am_michael's 16 would land nowhere.
      if (ttsDiagnostic.speakers > 0 && sid >= ttsDiagnostic.speakers) {
        console.log(
          `[tts] ${voice} wants sid ${sid} but the model has ${ttsDiagnostic.speakers}; using 0`,
        );
        sid = 0;
      }
      const startedAt = Date.now();
      const out = await tts.generateSpeech(text, { sid, speed: SPEECH_SPEED });
      const rate = out.sampleRate ?? KOKORO_SAMPLE_RATE;

      // The one number that says whether she can keep up with herself. Audio seconds
      // produced per second spent producing them: above 1 the pipeline stays ahead of
      // playback and her sentences run together, below 1 it falls behind a little more
      // with every phrase and the gaps grow. Logged per phrase, because it is the
      // difference between knowing and guessing.
      const tookMs = Date.now() - startedAt;
      const audioMs = (out.samples.length / rate) * 1000;
      console.log(
        `[tts] ${text.length} chars -> ${(audioMs / 1000).toFixed(2)}s audio in ` +
        `${(tookMs / 1000).toFixed(2)}s = ${(audioMs / Math.max(tookMs, 1)).toFixed(2)}x realtime ` +
        `(${TTS_PROVIDER}, ${TTS_THREADS} threads)`,
      );

      return { samples: out.samples, sampleRate: rate };
    }),
  };

  const engines: Engines = { stt, llm, speech };
  setEngines(engines);
}

export async function releaseNativeEngines(): Promise<void> {
  if (!loaded) return;
  await loaded.whisper.release().catch(() => {});
  await loaded.llama.release().catch(() => {});
  await loaded.tts.destroy().catch(() => {});
  loaded = null;
}

export function nativeEnginesLoaded(): boolean {
  return loaded !== null;
}
