/**
 * Voice activity detection for auto-listen — the port of frontend/vad.js.
 *
 * Hands-free conversation: she hears you start, waits for you to finish, and replies
 * without a button. Every hard-won property of the desktop version is carried across,
 * because each one was a bug report:
 *
 *  - **Pre-roll.** Detection happens *after* speech has begun, so the audio before it
 *    has to already be in hand. Without it Whisper receives a clipped onset and
 *    returns a confident wrong word: "people showed up" for "Fifteen people showed
 *    up". Measured, not theorised.
 *  - **An adaptive trigger.** A fixed threshold is tuned to one microphone in one
 *    room. On a quieter input it never fires; in a noisier room it fires constantly.
 *    The bar tracks the measured noise floor and treats the configured value as a
 *    minimum.
 *  - **Two levels, not one.** Starting a turn needs a clear margin above the room;
 *    continuing one only needs to stay above a lower line. With a single threshold a
 *    dip inside a word, or a voice trailing off, cuts the turn short.
 *  - **300ms minimum.** 200ms above the threshold is a cough or a door, and those were
 *    being transcribed as words.
 */

export type VadConfig = {
  threshold?: number;
  silenceMs?: number;
  minSpeechMs?: number;
  preRollMs?: number;
  maxUtteranceMs?: number;
  floorMultiple?: number;
  releaseRatio?: number;
};

export type VadEvents = {
  /** Speech started: cut her off if she is talking. */
  onStart?: () => void;
  /** A finished utterance, 16 kHz mono float, pre-roll included. */
  onUtterance?: (pcm: Float32Array) => void;
};

export class Vad {
  private threshold: number;
  private silenceMs: number;
  private minSpeechMs: number;
  private preRollMs: number;
  private maxUttMs: number;
  private floorMult: number;
  private releaseRatio: number;

  private rate: number;
  private noiseFloor: number | null = null;
  private ring: Float32Array[] = [];
  private ringLen = 0;
  private utt: Float32Array[] = [];
  private speaking = false;
  private speechAt = 0;
  private silenceSince: number | null = null;
  private events: VadEvents;

  constructor(rate: number, events: VadEvents, cfg: VadConfig = {}) {
    this.rate = rate;
    this.events = events;
    this.threshold = cfg.threshold ?? 0.018;
    this.silenceMs = cfg.silenceMs ?? 1000;
    this.minSpeechMs = cfg.minSpeechMs ?? 300;
    this.preRollMs = cfg.preRollMs ?? 400;
    this.maxUttMs = cfg.maxUtteranceMs ?? 30000;
    this.floorMult = cfg.floorMultiple ?? 4;
    this.releaseRatio = cfg.releaseRatio ?? 0.55;
  }

  /**
   * The level speech must reach to start a turn: the configured floor, or a clear
   * margin above the room, whichever is higher. A quiet room behaves exactly as a
   * fixed threshold would; a noisy one stops opening turns by itself.
   */
  enterLevel(): number {
    if (this.noiseFloor === null) return this.threshold;
    return Math.max(this.threshold, this.noiseFloor * this.floorMult);
  }

  /** Feed one buffer of mono float samples. */
  push(frame: Float32Array): void {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    const now = Date.now();

    if (this.speaking) {
      this.utt.push(frame);
      if (this.uttMs() >= this.maxUttMs) {
        this.finish();
        return;
      }
    } else {
      // Learn the room. Rises slowly and falls quickly, so a passing noise lifts the
      // bar only briefly while a room going quiet is noticed almost at once.
      this.noiseFloor =
        this.noiseFloor === null
          ? rms
          : rms > this.noiseFloor
          ? this.noiseFloor * 0.98 + rms * 0.02
          : this.noiseFloor * 0.8 + rms * 0.2;

      this.ring.push(frame);
      this.ringLen += frame.length;
      const cap = Math.floor((this.preRollMs / 1000) * this.rate);
      while (this.ring.length > 1 && this.ringLen - this.ring[0].length >= cap) {
        this.ringLen -= (this.ring.shift() as Float32Array).length;
      }
    }

    const enter = this.enterLevel();
    const exit = enter * this.releaseRatio;

    if (rms >= (this.speaking ? exit : enter)) {
      this.silenceSince = null;
      if (!this.speaking) {
        this.speaking = true;
        this.speechAt = now;
        // Seeded with what was already said before the level crossed: the whole
        // point of the ring buffer.
        this.utt = this.ring.slice();
        this.ring = [];
        this.ringLen = 0;
        this.events.onStart?.();
      }
    } else if (this.speaking) {
      if (this.silenceSince === null) this.silenceSince = now;
      else if (now - this.silenceSince >= this.silenceMs) {
        if (now - this.speechAt >= this.minSpeechMs) this.finish();
        else this.discard();
      }
    }
  }

  private uttMs(): number {
    let n = 0;
    for (const c of this.utt) n += c.length;
    return (n / this.rate) * 1000;
  }

  private merged(): Float32Array {
    let n = 0;
    for (const c of this.utt) n += c.length;
    const out = new Float32Array(n);
    let off = 0;
    for (const c of this.utt) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  private finish(): void {
    const pcm = this.merged();
    this.discard();
    if (pcm.length) this.events.onUtterance?.(pcm);
  }

  private discard(): void {
    this.speaking = false;
    this.utt = [];
    this.ring = [];
    this.ringLen = 0;
    this.silenceSince = null;
  }

  reset(): void {
    this.discard();
    this.noiseFloor = null;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }
}
