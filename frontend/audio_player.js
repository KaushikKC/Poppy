class AudioPlayer {
  constructor() {
    this._ctx = null;
    this._nextStart = 0;
    this._onStart = null;
    this._onEnd = null;
    this._pending = 0;
  }

  _ensureCtx(sampleRate) {
    if (!this._ctx || this._ctx.state === "closed") {
      this._ctx      = new AudioContext({ sampleRate });
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.8;
      this._analyser.connect(this._ctx.destination);
      this._nextStart = 0;
    }
  }

  getAnalyser() { return this._analyser || null; }

  // true while any audio is queued or playing (used to keep the avatar speaking
  // until the spoken reply actually finishes, not just when the text is done)
  isPlaying() { return this._pending > 0; }

  setSampleRate(sampleRate) {
    this._ensureCtx(sampleRate);
  }

  onPlaybackStart(fn) { this._onStart = fn; }
  onPlaybackEnd(fn)   { this._onEnd   = fn; }

  async enqueueWav(arrayBuffer) {
    if (!this._ctx) return;

    let audioBuffer;
    try {
      audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
    } catch {
      return;
    }

    if (this._pending === 0 && this._onStart) this._onStart();
    this._pending++;

    const source = this._ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this._analyser);

    // Start the very first chunk a bit later to build a small playout buffer, so
    // a later chunk that synthesizes slightly slow doesn't leave an audible gap
    // (the voice stuttering "in between"). Subsequent chunks chain gaplessly off
    // _nextStart; if synthesis falls behind, they start ~immediately.
    // The first-chunk cushion directly pads mic-stop → first-audio latency, so it
    // is kept as small as playback stays smooth now that STT + TTFT are faster and
    // the first TTS phrase is emitted tiny (see TTS_FIRST_* in config.py).
    const FIRST_CHUNK_CUSHION = 0.15;
    const now = this._ctx.currentTime;
    const cushion = this._nextStart === 0 ? FIRST_CHUNK_CUSHION : 0.02;
    const startAt = Math.max(now + cushion, this._nextStart);
    source.start(startAt);
    this._nextStart = startAt + audioBuffer.duration;

    source.onended = () => {
      this._pending--;
      if (this._pending === 0 && this._onEnd) this._onEnd();
    };
  }

  stop() {
    if (this._ctx) {
      this._ctx.close();
      this._ctx = null;
      this._nextStart = 0;
      this._pending = 0;
    }
  }
}

window.AudioPlayer = AudioPlayer;
