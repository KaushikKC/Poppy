// Voice activity detection with a pre-roll buffer.
//
// The bug this exists to fix: the old version started a MediaRecorder only once
// the level had already crossed the speech threshold. By then the first phoneme
// was gone. Whisper is a language model over audio, so handed a clipped onset it
// does not return a partial word, it returns a confident wrong one: "remember"
// for "September", "eight" for "wait". That is the "it hears different words"
// report, and no amount of threshold tuning fixes it, because the audio that
// would disambiguate the word was never recorded.
//
// So audio is now captured continuously into a small ring buffer and the
// utterance is seeded with the PRE_ROLL milliseconds that came *before*
// detection. The model sees the whole word, including the part that convinced us
// someone was talking.
//
// Two consequences of capturing raw PCM rather than driving MediaRecorder:
//
//   * Detection and capture see identical samples. Level was previously measured
//     off an AnalyserNode (8-bit, smoothed) while audio came from a separate
//     recorder, so the two could disagree about when speech began.
//   * Level is measured in the audio callback instead of requestAnimationFrame.
//     rAF is throttled hard when the window is not frontmost, which on a desktop
//     app means speech detection degrades the moment the user looks elsewhere.
//
// Output is 16-bit WAV. The backend decodes with PyAV, which handles it natively.

class VAD {
  // minSpeechMs: 200ms above the threshold is a cough, a key press or a door.
  // 300 still catches a real short answer like "yeah". Callers should not lower
  // this; mic.js used to pass 200 and quietly undid it.
  // threshold is a floor, not a fixed value. A single hard-coded number is tuned
  // to one microphone in one room: on a machine whose input runs quieter it
  // fails to trigger, and on a noisier one it triggers on the room. That is the
  // "works on mine, not on his" report. The real trigger level tracks the
  // measured noise floor and never drops below this floor.
  constructor({ threshold = 0.018, silenceMs = 1000, minSpeechMs = 300,
                preRollMs = 400, maxUtteranceMs = 30000,
                floorMultiple = 4, releaseRatio = 0.55 } = {}) {
    this._threshold   = threshold;
    this._silenceMs   = silenceMs;
    this._minSpeechMs = minSpeechMs;
    this._preRollMs   = preRollMs;
    this._maxUttMs    = maxUtteranceMs;
    this._floorMult   = floorMultiple;
    this._releaseRto  = releaseRatio;
    this._noiseFloor  = null;   // learned from the room, not assumed

    this._stream    = null;
    this._actx      = null;
    this._node      = null;
    this._sink      = null;
    this._running   = false;
    this._speaking  = false;
    this._speechAt  = 0;
    this._silTimer  = null;

    this._rate      = 16000;  // replaced with the real rate on start()
    this._ring      = [];     // recent pre-speech audio, trimmed to _preRollMs
    this._ringLen   = 0;
    this._utt       = [];     // the utterance being collected

    this.onSpeech = null; // (blob, mimeType, durationMs) => void
    this.onStart  = null; // () => void — speech detected, recording began
    this.onEnd    = null; // () => void — silence detected, about to send
  }

  async start() {
    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this._actx = new AudioContext();
    this._rate = this._actx.sampleRate;

    const src = this._actx.createMediaStreamSource(this._stream);
    // 2048 frames is ~43ms at 48kHz: fine enough to catch an onset, coarse
    // enough not to burn CPU on a laptop that is also running the model.
    this._node = this._actx.createScriptProcessor(2048, 1, 1);
    this._node.onaudioprocess = (e) => this._onAudio(e.inputBuffer.getChannelData(0));

    // Some browsers only run onaudioprocess when the node reaches the
    // destination, so it goes through a silent gain rather than to the speakers.
    this._sink = this._actx.createGain();
    this._sink.gain.value = 0;
    src.connect(this._node);
    this._node.connect(this._sink);
    this._sink.connect(this._actx.destination);

    this._running = true;
  }

  _onAudio(input) {
    if (!this._running) return;

    // The callback reuses its buffer, so this has to be a copy.
    const frame = new Float32Array(input);

    let s = 0;
    for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
    const rms = Math.sqrt(s / frame.length);

    if (this._speaking) {
      this._utt.push(frame);
      if (this._uttMs() >= this._maxUttMs) { this._send(); return; }
    } else {
      // Learn the room while nobody is talking. Rises slowly and falls quickly,
      // so a passing noise lifts the bar only briefly, and a room going quiet is
      // noticed almost at once.
      this._noiseFloor = this._noiseFloor === null
        ? rms
        : (rms > this._noiseFloor ? this._noiseFloor * 0.98 + rms * 0.02
                                  : this._noiseFloor * 0.80 + rms * 0.20);

      this._ring.push(frame);
      this._ringLen += frame.length;
      // Drop whole frames from the front while the rest still covers the
      // pre-roll. The length guard matters: with a small preRollMs the ring can
      // empty completely, and reading _ring[0] then throws inside the audio
      // callback, which kills capture for the whole session.
      const cap = Math.floor((this._preRollMs / 1000) * this._rate);
      while (this._ring.length > 1 && this._ringLen - this._ring[0].length >= cap) {
        this._ringLen -= this._ring.shift().length;
      }
    }

    // Two levels, not one. Speech has to be clearly above the room to *start* a
    // turn, but only has to stay above a lower line to *continue* it. With a
    // single threshold a dip inside a word, or a voice trailing off at the end
    // of a sentence, starts the silence timer and can cut the turn short. That
    // is a large part of why auto-listen felt worse than holding the button,
    // where the speaker decides when they are finished.
    const enter = this.enterLevel();
    const exit = enter * this._releaseRto;

    if (rms >= (this._speaking ? exit : enter)) {
      clearTimeout(this._silTimer);
      this._silTimer = null;

      if (!this._speaking) {
        this._speaking = true;
        this._speechAt = Date.now();
        // Seed with what was already said before the level crossed. This is the
        // whole point of the class.
        this._utt = this._ring.slice();
        this._ring = [];
        this._ringLen = 0;
        this.onStart?.();
      }
    } else if (this._speaking && !this._silTimer) {
      this._silTimer = setTimeout(() => {
        this._silTimer = null;
        if (Date.now() - this._speechAt >= this._minSpeechMs) {
          this.onEnd?.();
          this._send();
        } else {
          this._discard();
        }
      }, this._silenceMs);
    }
  }

  // The level speech must reach to start a turn: whichever is higher, the
  // configured floor or a clear margin above the room. In a quiet room this is
  // just the floor and nothing changes; in a noisy one the bar rises so the room
  // itself stops opening turns.
  enterLevel() {
    if (this._noiseFloor === null) return this._threshold;
    return Math.max(this._threshold, this._noiseFloor * this._floorMult);
  }

  _uttMs() {
    let n = 0;
    for (const c of this._utt) n += c.length;
    return (n / this._rate) * 1000;
  }

  _send() {
    const chunks = this._utt;
    // Measured before the buffer is dropped: the bubble is drawn from this, and the
    // clip's own length is the one number the page cannot work out for itself.
    const ms = this._uttMs();
    this._discard();
    if (!chunks.length) return;
    this.onSpeech?.(this._toWav(chunks), "audio/wav", ms);
  }

  _discard() {
    this._speaking = false;
    this._utt = [];
    this._ring = [];
    this._ringLen = 0;
    clearTimeout(this._silTimer);
    this._silTimer = null;
  }

  _toWav(chunks) {
    let n = 0;
    for (const c of chunks) n += c.length;

    const buf  = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buf);
    const str  = (off, t) => { for (let i = 0; i < t.length; i++) view.setUint8(off + i, t.charCodeAt(i)); };

    str(0, "RIFF");
    view.setUint32(4, 36 + n * 2, true);
    str(8, "WAVEfmt ");
    view.setUint32(16, 16, true);           // PCM header size
    view.setUint16(20, 1, true);            // PCM
    view.setUint16(22, 1, true);            // mono
    view.setUint32(24, this._rate, true);
    view.setUint32(28, this._rate * 2, true); // byte rate
    view.setUint16(32, 2, true);            // block align
    view.setUint16(34, 16, true);           // bits per sample
    str(36, "data");
    view.setUint32(40, n * 2, true);

    let off = 44;
    for (const c of chunks) {
      for (let i = 0; i < c.length; i++) {
        const x = Math.max(-1, Math.min(1, c[i]));
        view.setInt16(off, x < 0 ? x * 0x8000 : x * 0x7fff, true);
        off += 2;
      }
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  stop() {
    this._running = false;
    this._discard();
    if (this._node) this._node.onaudioprocess = null;
    try { this._node?.disconnect(); this._sink?.disconnect(); } catch {}
    this._stream?.getTracks().forEach((t) => t.stop());
    this._actx?.close().catch(() => {});
    this._stream = null;
    this._actx   = null;
    this._node   = null;
    this._sink   = null;
  }
}

window.VAD = VAD;
