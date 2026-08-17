/**
 * PCM samples to a WAV byte stream, and on to base64 for the bridge.
 *
 * The UI plays audio itself, exactly as it does on desktop: `chat.js` sets
 * `binaryType = "arraybuffer"` and hands each frame to `audio_player.js`, whose
 * AnalyserNode is what makes the orb move (`orb_avatar.js` reads it). Playing the
 * audio natively instead would leave the orb dead still, so the speech engine's
 * output is wrapped as WAV here and sent to the page as a binary frame — the same
 * shape the Python server sends.
 */

/** 16-bit mono WAV around float samples in -1..1. */
export function encodeWav(samples: Float32Array | number[], sampleRate: number): Uint8Array {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  str(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  str(36, 'data');
  view.setUint32(40, n * 2, true);

  let off = 44;
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    off += 2;
  }
  return new Uint8Array(buf);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 without Buffer or btoa, neither of which is reliably present in a React
 * Native runtime. Hot path (once per spoken phrase), so it writes into a
 * preallocated array rather than concatenating strings.
 */
export function toBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  const out = new Array<string>(Math.ceil(len / 3));
  let oi = 0;
  let i = 0;
  for (; i + 2 < len; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out[oi++] = B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < len) {
    const rem = len - i;
    if (rem === 1) {
      const n = bytes[i] << 16;
      out[oi++] = B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
    } else {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out[oi++] = B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
    }
  }
  return out.join('');
}

export function wavBase64(samples: Float32Array | number[], sampleRate: number): string {
  return toBase64(encodeWav(samples, sampleRate));
}
