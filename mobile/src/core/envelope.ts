/**
 * A coarse loudness envelope for driving the orb.
 *
 * Its own module with no native imports, so it can be exercised in plain node. It lived
 * in playback.ts first, which imports the native audio module, and that made a pure
 * function untestable for no reason.
 */

/** Roughly 30 values a second: enough for a mouth, small enough to send as JSON. */
export const ENVELOPE_HZ = 30;

/**
 * A coarse loudness envelope, 0..1, for driving the orb. Computed here because the
 * samples are already in hand and the page no longer has them.
 */
export function envelopeOf(samples: Float32Array | number[], sampleRate: number): number[] {
  const per = Math.max(1, Math.floor(sampleRate / ENVELOPE_HZ));
  const out: number[] = [];
  for (let i = 0; i < samples.length; i += per) {
    let sum = 0;
    let n = 0;
    for (let j = i; j < i + per && j < samples.length; j++) {
      const v = samples[j];
      sum += v * v;
      n++;
    }
    const rms = n ? Math.sqrt(sum / n) : 0;
    // Speech peaks well below 1.0; scale so a normal voice uses most of the range.
    out.push(Math.min(1, rms * 3));
  }
  return out;
}

