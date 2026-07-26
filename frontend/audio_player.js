class AudioPlayer {
  constructor() {
    this._ctx = null;
    this._analyser = null;
    this._nextStart = 0;
    this._onStart = null;
    this._onEnd = null;
    this._pending = 0;
    this._sources = new Set();   // active buffer sources, so stop() can cut them
  }

  _ensureCtx(sampleRate) {
    if (!this._ctx || this._ctx.state === "closed") {
      // ONE context + analyser for the whole session. The analyser drives the
      // avatar's lip-sync (HeadAudio taps it); recreating it would silently break
      // the lips, so we keep it alive and never close it mid-session.
      this._ctx = new AudioContext({ sampleRate });
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.8;
      this._analyser.connect(this._ctx.destination);
      this._nextStart = 0;
    }
    // Browsers start the context suspended until a user gesture; make sure it's
    // running so audio (and therefore the lips) actually play.
    if (this._ctx.state === "suspended") this._ctx.resume();
  }

  getAnalyser() { return this._analyser || null; }

  // true while any audio is queued or playing (used to keep the avatar speaking
  // until the spoken reply actually finishes, not just when the text is done)
  isPlaying() { return this._pending > 0; }

  setSampleRate(sampleRate) {
    this._ensureCtx(sampleRate);
    // New turn: start its playout buffer fresh so the first chunk gets the full
    // cushion (otherwise a slightly-slow first phrase stutters). The context +
    // analyser are kept (lip-sync stays wired); only the schedule resets.
    this._nextStart = 0;
  }

  onPlaybackStart(fn) { this._onStart = fn; }
  onPlaybackEnd(fn)   { this._onEnd   = fn; }

  async enqueueWav(arrayBuffer) {
    if (!this._ctx) return;
    if (this._ctx.state === "suspended") this._ctx.resume();

    let audioBuffer;
    try {
      audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
    } catch {
      return;
    }
    if (!this._ctx || this._ctx.state === "closed") return; // stopped while decoding

    if (this._pending === 0 && this._onStart) this._onStart();
    this._pending++;

    const source = this._ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this._analyser);
    this._sources.add(source);

    // Start the very first chunk a bit later to build a small playout buffer, so
    // a later chunk that synthesizes slightly slow doesn't leave an audible gap
    // (the voice stuttering "in between"). Subsequent chunks chain gaplessly off
    // _nextStart; if synthesis falls behind, they start ~immediately.
    const FIRST_CHUNK_CUSHION = 0.15;
    const now = this._ctx.currentTime;
    const cushion = this._nextStart === 0 ? FIRST_CHUNK_CUSHION : 0.02;
    const startAt = Math.max(now + cushion, this._nextStart);
    source.start(startAt);
    this._nextStart = startAt + audioBuffer.duration;

    source.onended = () => {
      this._sources.delete(source);
      this._pending--;
      if (this._pending === 0 && this._onEnd) this._onEnd();
    };
  }

  // Cut playback (barge-in, end call) WITHOUT tearing down the context/analyser,
  // so the avatar's lip-sync wiring survives and keeps working next turn.
  stop() {
    for (const s of this._sources) {
      try { s.onended = null; s.stop(); } catch {}
      try { s.disconnect(); } catch {}
    }
    this._sources.clear();
    this._nextStart = 0;
    this._pending = 0;
  }

  // Full teardown (not used mid-session).
  close() {
    this.stop();
    if (this._ctx && this._ctx.state !== "closed") { try { this._ctx.close(); } catch {} }
    this._ctx = null;
    this._analyser = null;
  }
}

window.AudioPlayer = AudioPlayer;
