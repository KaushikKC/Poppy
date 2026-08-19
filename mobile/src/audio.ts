import { AudioContext, AudioManager, AudioRecorder } from 'react-native-audio-api';
import { Vad, type VadConfig } from './core/vad';

const TARGET_RATE = 16000; // whisper.cpp wants 16 kHz mono float PCM

/**
 * The audio session, in one place, because it is set from three.
 *
 * ## Why headphones killed both directions
 *
 * Reported from a tester's phone: with headphones on, her voice was inaudible and
 * nothing they said was transcribed. Unplug them and everything worked.
 *
 * playAndRecord with allowBluetoothHFP and nothing else forces a connected Bluetooth
 * headset onto HFP — the hands-free *telephone* profile. That is mono, narrowband, and
 * it takes over the output route as well as the input, so her voice arrives over a
 * link built for phone calls in 1998, at a hardware rate that is no longer the one
 * anything here was configured against.
 *
 * allowBluetoothA2DP lets output stay on the high-quality stereo route, and
 * bluetoothHighQualityRecording asks for input that is not narrowband. defaultToSpeaker
 * stays for the case with no accessory at all, where it is what keeps her out of the
 * earpiece; an attached headset outranks it.
 */
export const SESSION_OPTIONS = {
  iosCategory: 'playAndRecord' as const,
  iosOptions: [
    'defaultToSpeaker' as const,
    'allowBluetoothHFP' as const,
    'allowBluetoothA2DP' as const,
    'bluetoothHighQualityRecording' as const,
  ],
};

/** Claim the session with our options. Safe to call again; routes change under us. */
export async function activateSession(): Promise<void> {
  AudioManager.setAudioSessionOptions(SESSION_OPTIONS);
  await AudioManager.setAudioSessionActivity(true);
}

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

/** The rates a phone's microphone actually runs at. */
const STANDARD_RATES = [8000, 16000, 22050, 24000, 44100, 48000];

/**
 * The true capture rate, worked out from how much audio arrived in how long.
 *
 * The recorder is *asked* for 16 kHz, and some builds echo that request back as
 * `e.buffer.sampleRate` while iOS actually hands over hardware-rate audio. When that
 * happens nothing resamples, Whisper is fed audio running three times too fast, and it
 * answers with a confident non-speech annotation — "(engine revving)" — that barely
 * changes with what was said.
 *
 * Samples divided by how long the mic was open gives the truth regardless of what the
 * API claims. Wall clock is crude, but this only has to tell 16000 from 48000, so it
 * snaps to the nearest real rate rather than resampling by a noisy ratio, and only
 * overrides when the two genuinely disagree, so a correct report always wins.
 */
export function measuredRate(
  samples: number,
  elapsedMs: number,
  reported: number,
): { rate: number; disagrees: boolean; measured: number; snapped: number } {
  const elapsedS = elapsedMs / 1000;
  if (elapsedS <= 0.3) {
    return { rate: reported, disagrees: false, measured: reported, snapped: reported };
  }
  const measured = samples / elapsedS;
  const snapped = STANDARD_RATES.reduce((best, r) =>
    Math.abs(r - measured) < Math.abs(best - measured) ? r : best,
  );
  const disagrees = Math.abs(snapped - reported) / reported > 0.15;
  return { rate: disagrees ? snapped : reported, disagrees, measured, snapped };
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
    await activateSession();

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

    const elapsedMs = Date.now() - this.startedAt;
    const r = measuredRate(total, elapsedMs, this.inRate);

    MicRecorder.lastDiagnostic =
      `reported ${this.inRate}Hz, measured ${Math.round(r.measured)}Hz ` +
      `(~${r.snapped}), used ${r.rate}Hz, ${total} samples over ` +
      `${(elapsedMs / 1000).toFixed(1)}s` +
      (r.disagrees ? '  <-- REPORTED RATE IS WRONG' : '');
    console.log('[mic]', MicRecorder.lastDiagnostic);

    return resampleTo16k(merged, r.rate);
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

  constructor(private preferredRate = 24000) {
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

  /**
   * Rebuild the context against whatever the route is now.
   *
   * A context is created once, at startup, against whatever was plugged in then. Put
   * headphones on afterwards and the hardware graph moves while this one keeps its old
   * rate and its old destination — which is silence, and silence with nothing logged.
   */
  reset(): void {
    const old = this.ctx;
    this.ctx = new AudioContext({ sampleRate: this.preferredRate });
    this.logged = false;
    try {
      old.close();
    } catch {
      // Already gone with the route it belonged to; nothing to reclaim.
    }
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
  // Auto-listen took e.buffer.sampleRate at its word, while push-to-talk had stopped
  // trusting it a while ago. So the same wrong-rate bug that produced "(engine
  // revving)" was still live on this path, and worse here: the VAD's own frame maths
  // is built from this rate too, so a wrong one mis-cuts every utterance before
  // Whisper even sees it.
  private samples = 0;
  private startedAt = 0;
  private rateChecked = false;

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
    await activateSession();

    this.samples = 0;
    this.startedAt = Date.now();
    this.rateChecked = false;

    const buildVad = (): void => {
      this.vad = new Vad(this.inRate, {
        onStart: () => this.onStart?.(),
        // Read at call time, not captured: a rate corrected mid-stream has to reach
        // the resampler, or every utterance after the correction is still wrong.
        onUtterance: (pcm) => this.onUtterance(resampleTo16k(pcm, this.inRate)),
      }, cfg);
    };

    const r = new AudioRecorder();
    r.onAudioReady({ sampleRate: TARGET_RATE, bufferLength: 1600, channelCount: 1 }, (e) => {
      const frame = Float32Array.from(e.buffer.getChannelData(0));
      this.inRate = e.buffer.sampleRate;
      this.samples += frame.length;

      if (!this.vad) {
        // Built on the first buffer, because the real rate is only known then and the
        // pre-roll length depends on it.
        buildVad();
      }

      // A second of audio is enough to tell 16 kHz from 48 kHz. Checked once: if the
      // reported rate was a lie, correct it and rebuild the VAD around the truth.
      // Deliberately not done before the first buffer — waiting a second to start
      // listening would lose the beginning of whatever was being said.
      if (!this.rateChecked) {
        const elapsedMs = Date.now() - this.startedAt;
        if (elapsedMs > 1000) {
          this.rateChecked = true;
          const check = measuredRate(this.samples, elapsedMs, this.inRate);
          MicRecorder.lastDiagnostic =
            `auto-listen: reported ${this.inRate}Hz, measured ` +
            `${Math.round(check.measured)}Hz (~${check.snapped})` +
            (check.disagrees ? '  <-- REPORTED RATE IS WRONG' : '');
          console.log('[mic]', MicRecorder.lastDiagnostic);
          if (check.disagrees) {
            this.inRate = check.rate;
            buildVad();
          }
        }
      }

      if (this.shouldListen && !this.shouldListen()) return;
      this.vad?.push(frame);
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
