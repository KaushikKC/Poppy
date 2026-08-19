/**
 * Speaking her replies out loud, natively.
 *
 * ## Why this is native rather than in the WebView
 *
 * The first design sent WAV frames to the page and let `audio_player.js` play them,
 * exactly as the desktop server does, because the orb animates from that player's
 * AnalyserNode. On device it produced text, a status of "speaking", and no sound at
 * all — the chunk decoded and was scheduled, and nothing came out. Resuming the
 * AudioContext from a real touch and fixing the audio session both failed to change
 * it.
 *
 * What settles it is evidence rather than theory: the M0 spike played audio natively on
 * this same phone and it was audible. So playback moves to the path that is known to
 * work, and the orb is fed instead — see `envelopeOf`. The page keeps its analyser
 * interface and does not know the difference.
 *
 * The cost is honest: the orb now animates from a precomputed envelope rather than from
 * the live signal, which is a very slightly less faithful mouth. Sound that works beats
 * a mouth that is perfectly synced to silence.
 */

import { envelopeOf } from './envelope';

/**
 * What actually makes sound. Injected rather than imported, for the same reason the
 * engines are: importing the native audio module here would drag it into every module
 * that reaches the turn loop, and the loop would stop being testable in plain node.
 * AppShell supplies the real one at startup.
 */
export type Speaker = {
  play: (samples: number[], sampleRate: number) => Promise<void>;
};

let speaker: Speaker | null = null;

export function setSpeaker(impl: Speaker): void {
  speaker = impl;
}

export type LevelSink = (msg: {
  t: 'audio:chunk' | 'audio:end';
  envelope?: number[];
  durationMs?: number;
}) => void;

/**
 * Plays phrases strictly in order. One at a time, because two overlapping phrases is
 * the scrambled playback desktop had to fix, and because the page is told when each
 * one starts and ends.
 */
export class Playback {
  private queue: Array<{ samples: Float32Array | number[]; sampleRate: number }> = [];
  private running = false;
  private stopped = false;
  private sink: LevelSink | null = null;

  setSink(sink: LevelSink | null): void {
    this.sink = sink;
  }

  push(samples: Float32Array | number[], sampleRate: number): void {
    if (this.stopped) return;
    this.queue.push({ samples, sampleRate });
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length && !this.stopped) {
      const chunk = this.queue.shift() as { samples: Float32Array | number[]; sampleRate: number };
      const durationMs = (chunk.samples.length / chunk.sampleRate) * 1000;
      this.sink?.({
        t: 'audio:chunk',
        envelope: envelopeOf(chunk.samples, chunk.sampleRate),
        durationMs,
      });
      try {
        if (!speaker) throw new Error('no speaker set');
        await speaker.play(
          Array.isArray(chunk.samples) ? chunk.samples : Array.from(chunk.samples),
          chunk.sampleRate,
        );
      } catch (err) {
        console.log(`[audio] a phrase failed to play: ${err}`);
      }
    }
    this.running = false;
    if (!this.queue.length) this.sink?.({ t: 'audio:end' });
  }

  /** Barge-in: drop whatever is queued. */
  stop(): void {
    this.stopped = true;
    this.queue = [];
    this.sink?.({ t: 'audio:end' });
  }

  /** Ready for another turn. */
  reset(): void {
    this.stopped = false;
    this.queue = [];
  }

  get isPlaying(): boolean {
    return this.running || this.queue.length > 0;
  }
}

/** One player for the app, like the page had one context for the session. */
export const playback = new Playback();
