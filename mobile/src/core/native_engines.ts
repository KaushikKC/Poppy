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

import { KOKORO_DIR, LLM_PATH, WHISPER_PATH } from '../models';
import { setEngines, type Engines, type Llm, type Speech, type Stt } from './engines';
import { floatToPcm16 } from '../audio';

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
 * Slightly under 1.0 because 1.0 was reported as too fast to listen to. Desktop's
 * pipeline and sherpa's do not pace identically at the same nominal speed, so this is
 * tuned by ear against the phone rather than copied from the other platform.
 */
const SPEECH_SPEED = 0.9;

/** Small context keeps prefill, and so first-token latency, small. */
const N_CTX = 4096;
const MAX_TOKENS = 120;

export type Loaded = {
  whisper: WhisperContext;
  llama: LlamaContext;
  tts: TtsEngine;
};

let loaded: Loaded | null = null;

export async function loadNativeEngines(
  onProgress: (msg: string) => void = () => {},
): Promise<void> {
  if (loaded) return;

  onProgress('Loading speech recognition…');
  const whisper = await initWhisper({ filePath: WHISPER_PATH });

  onProgress('Loading the language model…');
  const llama = await initLlama({
    model: LLM_PATH,
    n_ctx: N_CTX,
    n_gpu_layers: 99, // Metal where available; llama.cpp falls back to CPU
  });

  onProgress('Loading the voice…');
  const tts = await createTTS({
    modelPath: { type: 'file', path: KOKORO_DIR },
    modelType: 'kokoro',
  });

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
    async transcribe(pcm16k) {
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
      return (res.result ?? '').trim();
    },
  };

  const llm: Llm = {
    async complete(system, messages, onToken, signal) {
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
    },
  };

  const speech: Speech = {
    sampleRate: KOKORO_SAMPLE_RATE,
    async synthesize(text, voice) {
      const sid = VOICE_SID[voice] ?? DEFAULT_SID;
      const out = await tts.generateSpeech(text, { sid, speed: SPEECH_SPEED });
      return { samples: out.samples, sampleRate: out.sampleRate ?? KOKORO_SAMPLE_RATE };
    },
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
