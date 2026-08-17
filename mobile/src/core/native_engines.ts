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
      // sid selects the Kokoro speaker. The profile carries a voice name from
      // desktop (e.g. "af_heart"); mapping those onto sids is P3 work, so for now
      // the default speaker is used rather than guessing at an index.
      const out = await tts.generateSpeech(text, { sid: 0, speed: 1.0 });
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
