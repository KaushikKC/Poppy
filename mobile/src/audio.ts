import { AudioContext, AudioManager, AudioRecorder } from 'react-native-audio-api';

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
 * Plays raw float PCM samples (what sherpa-onnx Kokoro returns) through the
 * device speaker, resolving when playback finishes so chunks play in order.
 */
export class PcmPlayer {
  private ctx = new AudioContext();

  play(samples: number[], sampleRate: number): Promise<void> {
    const buf = this.ctx.createBuffer(1, samples.length, sampleRate);
    buf.getChannelData(0).set(Float32Array.from(samples));
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
