/**
 * Recordings the page can ask to hear again.
 *
 * On desktop the page owns the audio: her reply arrives as WAV bytes over the socket
 * and the user's own message is a MediaRecorder blob, so replaying either is a matter
 * of keeping the bytes around. Here the page owns none of it — capture and playback
 * are both native, because a WKWebView at a file:// origin could be trusted with
 * neither — so the page cannot replay what it never had.
 *
 * So the samples stay on this side and the page gets a handle: an id, a length, and
 * three verbs. `voice_note.js` drives it exactly as it drives an <audio> element.
 *
 * Two clips are kept, which is all that is ever wanted: the last thing she said and
 * the last thing the user recorded. Keeping a history would mean holding every reply
 * of a long conversation in memory as raw float samples, on the device least able to
 * spare it, for a scrollback nobody asked for.
 */

export type Clip = {
  id: string;
  samples: Float32Array | number[];
  sampleRate: number;
  durationMs: number;
};

const clips = new Map<string, Clip>();

/** Only ever these two, replaced in place. See the note above on why. */
export type Slot = 'reply' | 'mine';

let seq = 0;

/**
 * Keep a recording and return its id.
 *
 * The id changes every time even though the slot does not, because the page holds it
 * in a bubble that stays on screen: an id that was reused would let an old bubble
 * replay a newer recording, which is the kind of bug that looks like the app lying.
 */
export function keep(slot: Slot, samples: Float32Array | number[], sampleRate: number): Clip {
  seq += 1;
  const id = `${slot}-${seq}`;
  const clip: Clip = {
    id,
    samples,
    sampleRate,
    durationMs: (samples.length / sampleRate) * 1000,
  };
  for (const [key, held] of clips) {
    if (held.id.startsWith(`${slot}-`)) clips.delete(key);
  }
  clips.set(id, clip);
  return clip;
}

export function get(id: string): Clip | null {
  return clips.get(id) ?? null;
}

/**
 * The tail of a clip, from a fraction of the way through.
 *
 * This is how pause and resume work at all: the speaker plays a buffer and has no
 * notion of a position inside it, so resuming is playing a shorter buffer that starts
 * where the last one was interrupted.
 */
export function from(clip: Clip, fraction: number): number[] {
  const f = Math.min(1, Math.max(0, fraction || 0));
  const all = Array.isArray(clip.samples) ? clip.samples : Array.from(clip.samples);
  return f === 0 ? all : all.slice(Math.floor(all.length * f));
}

/** For tests, and for a fresh start when the conversation is cleared. */
export function clear(): void {
  clips.clear();
}
