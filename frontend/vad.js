class VAD {
  constructor({ threshold = 0.018, silenceMs = 800, minSpeechMs = 200 } = {}) {
    this._threshold   = threshold;
    this._silenceMs   = silenceMs;
    this._minSpeechMs = minSpeechMs;

    this._stream    = null;
    this._actx      = null;
    this._recorder  = null;
    this._mimeType  = "audio/webm";
    this._chunks    = [];
    this._running   = false;
    this._speaking  = false;
    this._speechAt  = 0;
    this._silTimer  = null;

    this.onSpeech = null; // (blob, mimeType) => void
    this.onStart  = null; // () => void — speech detected, recording began
    this.onEnd    = null; // () => void — silence detected, about to send
  }

  async start() {
    this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._actx   = new AudioContext();

    const src      = this._actx.createMediaStreamSource(this._stream);
    const analyser = this._actx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    src.connect(analyser);

    const buf = new Uint8Array(analyser.frequencyBinCount);
    this._running = true;

    const tick = () => {
      if (!this._running) return;
      analyser.getByteTimeDomainData(buf);
      let s = 0;
      for (const v of buf) { const x = (v - 128) / 128; s += x * x; }
      const rms = Math.sqrt(s / buf.length);

      if (rms >= this._threshold) {
        clearTimeout(this._silTimer);
        this._silTimer = null;

        if (!this._speaking) {
          this._speaking = true;
          this._speechAt = Date.now();
          this._startRecording();
          this.onStart?.();
        }
      } else if (this._speaking && !this._silTimer) {
        this._silTimer = setTimeout(() => {
          this._silTimer = null;
          if (Date.now() - this._speechAt >= this._minSpeechMs) {
            this.onEnd?.();
            this._stopAndSend();
          } else {
            this._cancelRecording();
          }
          this._speaking = false;
        }, this._silenceMs);
      }

      requestAnimationFrame(tick);
    };
    tick();
  }

  _mimePrefer() {
    return MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
  }

  _startRecording() {
    this._mimeType = this._mimePrefer();
    this._chunks   = [];
    this._recorder = new MediaRecorder(this._stream, { mimeType: this._mimeType });
    this._recorder.ondataavailable = (e) => { if (e.data.size > 0) this._chunks.push(e.data); };
    this._recorder.start(100);
  }

  _stopAndSend() {
    if (!this._recorder || this._recorder.state === "inactive") return;
    this._recorder.onstop = () => {
      const blob = new Blob(this._chunks, { type: this._mimeType });
      this._chunks = [];
      this.onSpeech?.(blob, this._mimeType);
    };
    this._recorder.stop();
  }

  _cancelRecording() {
    if (this._recorder && this._recorder.state !== "inactive") {
      this._recorder.ondataavailable = null;
      this._recorder.onstop = null;
      this._recorder.stop();
    }
    this._chunks = [];
  }

  stop() {
    this._running = false;
    clearTimeout(this._silTimer);
    this._cancelRecording();
    this._stream?.getTracks().forEach((t) => t.stop());
    this._actx?.close().catch(() => {});
    this._stream = null;
    this._actx   = null;
    this._speaking = false;
  }
}

window.VAD = VAD;
