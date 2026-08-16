import { initLlama, LlamaContext } from 'llama.rn';
import { initWhisper, WhisperContext } from 'whisper.rn';
import { createTTS, TtsEngine } from 'react-native-sherpa-onnx/tts';
import { floatToPcm16, PcmPlayer } from './audio';
import { KOKORO_DIR, LLM_PATH, WHISPER_PATH } from './models';

/**
 * The three on-device engines, loaded once and kept resident while the app is
 * foregrounded (same lifecycle rule as desktop). Loading is the slow part;
 * per-turn work reuses these.
 */
export type Engines = {
  whisper: WhisperContext;
  llama: LlamaContext;
  tts: TtsEngine;
};

export type LoadProgress = (msg: string) => void;

export async function loadEngines(onProgress: LoadProgress): Promise<Engines> {
  onProgress('Loading Whisper (STT)…');
  const whisper = await initWhisper({ filePath: WHISPER_PATH });

  onProgress('Loading LLM (GGUF)…');
  const llama = await initLlama({
    model: LLM_PATH,
    n_ctx: 4096, // small ctx keeps prefill (and TTFT) tiny — the desktop trick
    n_gpu_layers: 99, // use Metal/GPU where available; llama.cpp falls back to CPU
  });

  onProgress('Loading Kokoro (TTS)…');
  const tts = await createTTS({
    modelPath: { type: 'file', path: KOKORO_DIR },
    modelType: 'kokoro',
  });

  return { whisper, llama, tts };
}

export async function releaseEngines(e: Engines | null) {
  if (!e) return;
  await e.whisper.release().catch(() => {});
  await e.llama.release().catch(() => {});
  await e.tts.destroy().catch(() => {});
}

/** The measurement — every number is milliseconds from mic-stop unless noted. */
export type Timing = {
  transcript: string;
  reply: string;
  sttMs: number; // mic-stop -> transcript ready
  llmFirstTokenMs: number; // mic-stop -> first LLM token
  firstChunkReadyMs: number; // mic-stop -> first speakable clause assembled
  firstAudioMs: number; // mic-stop -> first audio sample plays  <-- THE metric
  totalMs: number; // mic-stop -> whole reply finished speaking
};

export type TurnEvents = {
  onTranscript?: (text: string) => void;
  onToken?: (accumulated: string) => void;
  onFirstAudio?: () => void;
};

const SYSTEM_PROMPT =
  'You are Poppys, a warm, calm voice companion. Reply in 2 to 4 short spoken ' +
  'sentences. Be gentle and natural, never clinical.';

// First speakable clause: stop at the first sentence end so the voice can start
// while the model is still generating (the desktop first-chunk latency trick).
const SENTENCE_END = /[.!?](\s|$)/;

function firstClause(text: string): string | null {
  const m = text.match(SENTENCE_END);
  if (!m || m.index === undefined) return null;
  return text.slice(0, m.index + 1).trim();
}

/**
 * One conversational turn: WAV -> STT -> LLM (streamed) -> TTS first clause ->
 * playback, overlapping generation with synthesis so first-audio is as early as
 * possible. Speaks the remainder after, in order.
 */
export async function runTurn(
  e: Engines,
  pcm16k: Float32Array,
  player: PcmPlayer,
  ev: TurnEvents = {},
): Promise<Timing> {
  const t0 = Date.now(); // mic-stop reference
  const mark = () => Date.now() - t0;

  // 1) STT — 16 kHz mono, converted to int16 because that is what the native
  // ArrayBuffer path actually reads (see floatToPcm16). No WAV round-trip.
  const pcmBytes = floatToPcm16(pcm16k);
  const { promise: sttPromise } = e.whisper.transcribeData(
    pcmBytes.buffer as ArrayBuffer,
    { language: 'en' },
  );
  const stt = await sttPromise;
  const transcript = (stt.result ?? '').trim();
  const sttMs = mark();
  ev.onTranscript?.(transcript);

  // 2) LLM stream, capturing the first clause the moment it forms.
  let acc = '';
  let llmFirstTokenMs = -1;
  let firstChunkReadyMs = -1;
  let spokenUpTo = 0;
  let firstClauseText: string | null = null;
  let firstAudioMs = -1;

  // Plays strictly in order, but synthesis starts the moment the text exists
  // rather than waiting its turn in the queue. Chaining both together meant the
  // gap between one clause and the next was the entire synthesis time of the
  // next one, heard as: half a sentence, silence, half a sentence. Now clause
  // N+1 is being synthesised while clause N is still playing.
  let playChain: Promise<void> = Promise.resolve();
  const speak = (text: string) => {
    if (!text) return;
    const synth = e.tts.generateSpeech(text, { sid: 0, speed: 1.0 });
    playChain = playChain.then(async () => {
      const audio = await synth;
      if (firstAudioMs < 0) {
        firstAudioMs = mark();
        ev.onFirstAudio?.();
      }
      await player.play(audio.samples, audio.sampleRate);
    });
  };

  await e.llama.completion(
    {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
      n_predict: 120,
      temperature: 0.7,
      stop: ['</s>', '<|eot_id|>'],
    },
    (data) => {
      if (llmFirstTokenMs < 0) llmFirstTokenMs = mark();
      acc += data.token;
      ev.onToken?.(acc);
      // Hand over every sentence as soon as it is complete, not just the first.
      // Previously only the opening clause was spoken during generation and the
      // entire rest was synthesised in one block afterwards, so the voice always
      // stopped dead after the first sentence while that block was produced.
      for (;;) {
        const pending = acc.slice(spokenUpTo);
        const clause = firstClause(pending);
        if (!clause) break;
        if (!firstClauseText) {
          firstClauseText = clause;
          firstChunkReadyMs = mark();
        }
        spokenUpTo += pending.indexOf(clause) + clause.length;
        speak(clause);
      }
    },
  );

  // 3) Anything the model left without final punctuation.
  const reply = acc.trim();
  const remainder = acc.slice(spokenUpTo).trim();
  if (remainder) speak(remainder);

  await playChain; // wait until the whole reply has finished speaking

  return {
    transcript,
    reply,
    sttMs,
    llmFirstTokenMs,
    firstChunkReadyMs,
    firstAudioMs,
    totalMs: mark(),
  };
}
