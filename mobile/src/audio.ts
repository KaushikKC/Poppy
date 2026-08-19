import { AudioContext, AudioManager, AudioRecorder } from 'react-native-audio-api';
import { Vad, type VadConfig } from './core/vad';

const TARGET_RATE = 16000; // whisper.cpp wants 16 kHz mono float PCM

/** Linear-resample mono float PCM to 16 kHz. Good enough for STT (spike-grade). */
function resampleTo16k(input: Float32Array, inRate: number): Float32Array {
  if (inRate === TARGET_RATE || input.length === 0) return input;
  const ratio = inRate / TARGET_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Float samples in -1..1 to signed 16-bit PCM.
 *
 * whisper.rn's `transcribeData` takes an ArrayBuffer straight to `decodePcm16`
 * on the native side, which reads it as int16 and divides by 32767. Its
 * TypeScript comment says "float32 PCM data or ArrayBuffer", which reads as
 * though floats are fine; they are not, for the ArrayBuffer path.
 *
 * Handing it float32 meant every four bytes of one sample were read as two
 * bogus int16s. That is not silence and not noise: it is a low rumble, and
 * Whisper dutifully transcribed it as "(engine revving)" no matter what was
 * actually said.
 */
export function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Mic capture that yields **16 kHz mono float PCM** — exactly what whisper.cpp
 * needs — by streaming raw buffers via `onAudioReady` and resampling on stop.
 * (Recording at the hardware rate and resampling avoids depending on the OS
 * honouring a requested 16 kHz, which it often won't.)
 */
export class MicRecorder {
  private recorder: AudioRecorder | null = null;
  private chunks: Float32Array[] = [];
  private inRate = 48000;
  private startedAt = 0;

  /** Filled in on stop(): what the API claimed, and what the audio actually was. */
  static lastDiagnostic = '';

  async start(): Promise<void> {
    // iOS: a play-and-record session so we can capture the mic and later speak.
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
    });
    await AudioManager.setAudioSessionActivity(true);

    this.chunks = [];
    this.startedAt = Date.now();
    const r = new AudioRecorder();
    r.onAudioReady({ sampleRate: TARGET_RATE, bufferLength: 1600, channelCount: 1 }, (e) => {
      this.inRate = e.buffer.sampleRate; // actual rate the OS gave us
      // Copy channel 0 — the native buffer is reused across callbacks.
      this.chunks.push(Float32Array.from(e.buffer.getChannelData(0)));
    });
    await r.start();
    this.recorder = r;
  }

  /** Stop and return the utterance as 16 kHz mono float PCM (or null if empty). */
  async stop(): Promise<Float32Array | null> {
    if (!this.recorder) return null;
    await this.recorder.stop();
    this.recorder.clearOnAudioReady();
    this.recorder = null;

    if (this.chunks.length === 0) return null;
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of this.chunks) {
      merged.set(c, off);
      off += c.length;
    }
    this.chunks = [];

    // Do not trust the reported rate. The recorder is *asked* for 16 kHz, and
    // some builds echo the request back as e.buffer.sampleRate while iOS
    // actually hands over hardware-rate audio. When that happens the resample
    // below is skipped, Whisper is fed audio running three times too fast, and
    // it returns confident nonsense that barely changes with what was said.
    //
    // Samples divided by how long the mic was actually open gives the true rate
    // regardless of what the API claims. Wall clock is crude, but the answer
    // only has to be good enough to tell 16000 from 48000, and it snaps to the
    // nearest standard rate rather than resampling by a noisy ratio.
    const elapsedS = (Date.now() - this.startedAt) / 1000;
    const measured = elapsedS > 0.3 ? total / elapsedS : this.inRate;
    const standard = [8000, 16000, 22050, 24000, 44100, 48000];
    const snapped = standard.reduce((best, r) =>
      Math.abs(r - measured) < Math.abs(best - measured) ? r : best,
    );
    // Only override when the two genuinely disagree, so a correct report wins.
    const disagrees = Math.abs(snapped - this.inRate) / this.inRate > 0.15;
    const useRate = disagrees ? snapped : this.inRate;

    MicRecorder.lastDiagnostic =
      `reported ${this.inRate}Hz, measured ${Math.round(measured)}Hz ` +
      `(~${snapped}), used ${useRate}Hz, ${total} samples over ${elapsedS.toFixed(1)}s` +
      (disagrees ? '  <-- REPORTED RATE IS WRONG' : '');
    console.log('[mic]', MicRecorder.lastDiagnostic);

    return resampleTo16k(merged, useRate);
  }
}

/**
 * Plays raw float PCM through the speaker, at the right pitch.
 *
 * ## The bird voice
 *
 * Kokoro outputs 24 kHz. iOS runs its audio graph at the hardware rate, normally 48 kHz.
 * Handing a 24 kHz buffer to a 48 kHz context and trusting it to resample is what made
 * her sound robotic, far too fast and, in the report that finally identified it, "like a
 * bird": every sample played twice as quickly and an octave high. It also flattened the
 * differences between characters, because a large enough pitch shift makes any two
 * voices sound like the same synthesiser.
 *
 * Two defences, because either alone can be defeated by the platform. The context is
 * *asked* for Kokoro's rate, and whatever rate it actually reports, the samples are
 * resampled to match before they are handed over. The rates are logged once so a future
 * mismatch is visible rather than merely audible.
 */
export class PcmPlayer {
  private ctx: AudioContext;
  private logged = false;

  constructor(preferredRate = 24000) {
    // iOS may refuse and give the hardware rate anyway; the resample below covers that.
    this.ctx = new AudioContext({ sampleRate: preferredRate });
  }

  play(samples: number[], sampleRate: number): Promise<void> {
    const target = this.ctx.sampleRate || sampleRate;

    if (!this.logged) {
      this.logged = true;
      console.log(
        `[audio] context ${target}Hz, source ${sampleRate}Hz` +
        (target === sampleRate ? '' : ' -> resampling to keep the pitch right'),
      );
    }

    const data = target === sampleRate ? samples : resampleTo(samples, sampleRate, target);
    const buf = this.ctx.createBuffer(1, data.length, target);
    buf.getChannelData(0).set(Float32Array.from(data));
    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    source.connect(this.ctx.destination);
    return new Promise<void>((resolve) => {
      source.onEnded = () => resolve();
      source.start();
    });
  }

  close() {
    this.ctx.close();
  }
}

/** Linear resample between arbitrary rates. Good enough for speech playback. */
function resampleTo(input: number[], from: number, to: number): number[] {
  if (from === to || input.length === 0) return input;
  const ratio = from / to;
  const outLen = Math.floor(input.length / ratio);
  const out = new Array<number>(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Continuous listening: the mic stays open and each finished utterance is handed
 * over, so a conversation needs no button.
 *
 * Frames go straight to the VAD, which owns the pre-roll, so nothing is buffered
 * twice. Resampling happens per utterance rather than per frame: a mic open for ten
 * minutes must not accumulate anything.
 */
export class ContinuousMic {
  private recorder: AudioRecorder | null = null;
  private vad: Vad | null = null;
  private inRate = 48000;

  constructor(
    private onUtterance: (pcm16k: Float32Array) => void,
    private onStart?: () => void,
    /**
     * Whether to process this buffer at all. Used to stand down while she is
     * speaking: running voice detection on her own voice coming out of the
     * loudspeaker is both wasted work on every buffer and a way to interrupt
     * herself.
     */
    private shouldListen?: () => boolean,
  ) {}

  async start(cfg?: VadConfig): Promise<void> {
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
    });
    await AudioManager.setAudioSessionActivity(true);

    const r = new AudioRecorder();
    r.onAudioReady({ sampleRate: TARGET_RATE, bufferLength: 1600, channelCount: 1 }, (e) => {
      this.inRate = e.buffer.sampleRate;
      if (!this.vad) {
        // Built on the first buffer, because the real rate is only known then and the
        // pre-roll length depends on it.
        this.vad = new Vad(this.inRate, {
          onStart: () => this.onStart?.(),
          onUtterance: (pcm) => this.onUtterance(resampleTo16k(pcm, this.inRate)),
        }, cfg);
      }
      if (this.shouldListen && !this.shouldListen()) return;
      this.vad.push(Float32Array.from(e.buffer.getChannelData(0)));
    });
    await r.start();
    this.recorder = r;
  }

  async stop(): Promise<void> {
    if (!this.recorder) return;
    await this.recorder.stop();
    this.recorder.clearOnAudioReady();
    this.recorder = null;
    this.vad?.reset();
    this.vad = null;
  }

  get running(): boolean {
    return this.recorder !== null;
  }
}
