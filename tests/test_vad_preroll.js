// The pre-roll buffer, driven through the real vad.js.
//
// The bug: recording started only after the level crossed the threshold, so the
// first phoneme was never captured and Whisper returned a confident wrong word.
// Measured against the real model, losing 120ms of onset turned "Fifteen people
// showed up" into "people showed up" and "Wait, I forgot" into "I forgot".
//
// This drives the shipped class with synthetic frames and asserts the emitted
// WAV actually contains the audio from *before* detection.

const fs = require("fs");
const path = require("path");

let ok = true;
function check(label, cond, extra = "") {
  console.log((cond ? "  PASS  " : "  FAIL  ") + label + (extra ? `  ${extra}` : ""));
  if (!cond) ok = false;
}

// ── minimal Web Audio stand-ins ──────────────────────────────────────────────
const RATE = 48000;
const FRAME = 2048;
let node = null;

global.window = {};
global.navigator = { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } };
global.Blob = class {
  constructor(parts) { this.parts = parts; this._buf = Buffer.from(parts[0]); this.size = this._buf.length; }
};
global.AudioContext = class {
  constructor() { this.sampleRate = RATE; this.destination = {}; }
  createMediaStreamSource() { return { connect() {} }; }
  createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
  createScriptProcessor() {
    node = { onaudioprocess: null, connect() {}, disconnect() {} };
    return node;
  }
  close() { return Promise.resolve(); }
};

eval(fs.readFileSync(path.join(__dirname, "..", "frontend", "vad.js"), "utf8"));
const VAD = global.window.VAD;

// ── drive it ─────────────────────────────────────────────────────────────────
function frame(amp) {
  const f = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) f[i] = amp * Math.sin((2 * Math.PI * 220 * i) / RATE);
  return f;
}
const silence = () => frame(0.0005);   // below threshold
const speech  = () => frame(0.25);     // well above

function pcmFromWav(blob) {
  const b = blob._buf;
  const n = b.readUInt32LE(40) / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = b.readInt16LE(44 + i * 2) / 32768;
  return out;
}

async function run(preRollMs) {
  const vad = new VAD({ silenceMs: 100, minSpeechMs: 100, preRollMs });
  let got = null;
  vad.onSpeech = (blob) => { got = blob; };
  await vad.start();

  // 20 frames of room tone, then speech. The frame where the level crosses is
  // the one the old code would have started recording at.
  for (let i = 0; i < 20; i++) node.onaudioprocess({ inputBuffer: { getChannelData: () => silence() } });
  for (let i = 0; i < 10; i++) node.onaudioprocess({ inputBuffer: { getChannelData: () => speech() } });
  // silence long enough to close the utterance
  for (let i = 0; i < 5; i++) node.onaudioprocess({ inputBuffer: { getChannelData: () => silence() } });
  await new Promise((r) => setTimeout(r, 200));
  vad.stop();
  return got;
}

(async () => {
  console.log("\n== the utterance carries audio from before detection ==");
  const blob = await run(400);
  check("something was emitted", blob !== null);

  const pcm = pcmFromWav(blob);
  // Pre-roll is measured as the quiet run before the loud part actually starts.
  // Deriving it by subtracting the speech frames was wrong: the utterance also
  // keeps the trailing silence that closes it, and that was being counted as
  // pre-roll, which made the first run of this test report 597ms for a 400ms
  // buffer and look like a bug in the code rather than in the assertion.
  let firstLoud = pcm.length;
  for (let i = 0; i < pcm.length; i++) {
    if (Math.abs(pcm[i]) > 0.1) { firstLoud = i; break; }
  }
  const preRollSamples = firstLoud;
  const preRollMs = (preRollSamples / RATE) * 1000;

  check("it is a WAV", blob._buf.slice(0, 4).toString() === "RIFF");
  check("sample rate is written correctly", blob._buf.readUInt32LE(24) === RATE, String(blob._buf.readUInt32LE(24)));
  check("16-bit mono", blob._buf.readUInt16LE(34) === 16 && blob._buf.readUInt16LE(22) === 1);

  console.log(`   captured ${(pcm.length / RATE * 1000).toFixed(0)}ms total, ${preRollMs.toFixed(0)}ms of it before the loud part`);
  check("pre-roll is present at all", preRollSamples > 0, `${preRollSamples} samples`);
  check("pre-roll is roughly the requested 400ms", preRollMs > 250 && preRollMs <= 460, `${preRollMs.toFixed(0)}ms`);

  // The old behaviour, for contrast: no pre-roll at all. This also exercises the
  // empty-ring path, which used to throw inside the audio callback.
  console.log("\n== with pre-roll disabled, the onset is gone (the old bug) ==");
  const none = await run(0);
  check("still emits without a pre-roll buffer", none !== null);
  const nonePcm = pcmFromWav(none);
  let firstLoudNone = nonePcm.length;
  for (let i = 0; i < nonePcm.length; i++) {
    if (Math.abs(nonePcm[i]) > 0.1) { firstLoudNone = i; break; }
  }
  console.log(`   captured ${(nonePcm.length / RATE * 1000).toFixed(0)}ms, ${((firstLoudNone / RATE) * 1000).toFixed(0)}ms before the loud part`);
  check("no pre-roll means the clip starts at detection",
        firstLoudNone <= FRAME, `${firstLoudNone} samples`);
  check("and that is measurably less audio than with pre-roll",
        firstLoudNone < preRollSamples);

  console.log("\n== the ring buffer does not grow without bound ==");
  const vad = new VAD({ preRollMs: 200 });
  await vad.start();
  for (let i = 0; i < 500; i++) node.onaudioprocess({ inputBuffer: { getChannelData: () => silence() } });
  const cap = Math.floor((200 / 1000) * RATE);
  check("ring stays near its cap while idle", vad._ringLen <= cap + FRAME, `${vad._ringLen} samples, cap ${cap}`);
  vad.stop();

  console.log("\n" + (ok ? "ALL PASS" : "FAILURES ABOVE"));
  process.exit(ok ? 0 : 1);
})();
