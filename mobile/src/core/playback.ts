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

import * as clips from './clips';
import { envelopeOf } from './envelope';

/**
 * What actually makes sound. Injected rather than imported, for the same reason the
 * engines are: importing the native audio module here would drag it into every module
 * that reaches the turn loop, and the loop would stop being testable in plain node.
 * AppShell supplies the real one at startup.
 */
export type Speaker = {
  play: (samples: number[], sampleRate: number) => Promise<void>;
  /** Cut short whatever is sounding. Pausing a voice note is built on this. */
  stop?: () => void;
};

let speaker: Speaker | null = null;

export function setSpeaker(impl: Speaker): void {
  speaker = impl;
}

export type LevelSink = (msg: {
  t: 'audio:chunk' | 'audio:end';
  /** The replayable copy of what is being played, for the page's voice note. */
  clipId?: string;
  /**
   * Set when the reply was cut off rather than finished. The page's player fires its
   * playback-ended callback only on a real ending, the same as desktop's: barge-in is
   * the end of listening to a reply, not the end of the reply.
   */
  bargeIn?: boolean;
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
  private lastClipId: string | null = null;

  setSink(sink: LevelSink | null): void {
    this.sink = sink;
  }

  push(samples: Float32Array | number[], sampleRate: number): void {
    if (this.stopped) return;
    // Kept as it is played, so the bubble can offer it again afterwards. Desktop gets
    // this for free by holding the bytes the socket delivered; here the samples never
    // leave this side, so this is the only copy there will be.
    this.lastClipId = clips.keep('reply', samples, sampleRate).id;
    this.queue.push({ samples, sampleRate });
    void this.pump();
  }

  /** The recording of the reply now playing, for the `voice` frame the page renders. */
  currentClipId(): string | null {
    return this.lastClipId;
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length && !this.stopped) {
      const chunk = this.queue.shift() as { samples: Float32Array | number[]; sampleRate: number };
      const durationMs = (chunk.samples.length / chunk.sampleRate) * 1000;
      this.sink?.({
        t: 'audio:chunk',
        clipId: this.lastClipId ?? undefined,
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
    this.sink?.({ t: 'audio:end', bargeIn: true });
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

/**
 * Replaying a recording, on its own path.
 *
 * Deliberately not the turn queue above. That queue is the live reply and owns the
 * orb: pushing a replay through it would animate the mouth for a recording she is not
 * saying, and a reply arriving mid-replay would queue behind it instead of playing.
 * A replay is the user reading something back, so it plays and nothing else moves.
 */
export type ClipSink = (msg: { t: 'clip:ended'; id: string }) => void;

class ClipPlayer {
  private sink: ClipSink | null = null;
  private playing: string | null = null;
  /** Set when a play was cut short, so its resolution is not reported as an ending. */
  private interrupted = false;

  setSink(sink: ClipSink | null): void {
    this.sink = sink;
  }

  async play(id: string, fromFraction = 0): Promise<void> {
    const clip = clips.get(id);
    if (!clip || !speaker) return;
    this.halt();
    this.playing = id;
    this.interrupted = false;
    try {
      await speaker.play(clips.from(clip, fromFraction), clip.sampleRate);
    } catch (err) {
      console.log(`[audio] a replay failed: ${err}`);
    }
    if (this.playing === id && !this.interrupted) {
      this.playing = null;
      // Only a clip that reached its end. A paused one is still where the user left
      // it, and telling the page it ended would send the bubble back to the start.
      this.sink?.({ t: 'clip:ended', id });
    }
  }

  /** Stop the sound without claiming the clip finished. */
  private halt(): void {
    if (this.playing) this.interrupted = true;
    speaker?.stop?.();
  }

  pause(): void {
    this.halt();
    this.playing = null;
  }

  stop(): void {
    this.pause();
  }
}

export const clipPlayer = new ClipPlayer();
