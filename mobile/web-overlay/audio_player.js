// The iOS replacement for frontend/audio_player.js.
//
// On desktop this class decodes WAV frames from the server and plays them through Web
// Audio, and its AnalyserNode is what animates the orb and the equalizer.
//
// Inside a WKWebView that path produced no sound: the chunk decoded, playback was
// scheduled, the status changed to "speaking", and nothing was audible. Resuming the
// AudioContext from a real touch and setting the audio session both failed to fix it.
// The M0 spike had already proved that native playback is audible on the same phone, so
// the audio moved there.
//
// This keeps the exact interface the page uses — enqueueWav, setSampleRate,
// getAnalyser, isPlaying, stop, onPlaybackStart, onPlaybackEnd — so chat.js, ui.js and
// orb_avatar.js are untouched. That list is not documentation, it is a contract:
// tests/test_overlay_contract.js fails when the desktop player grows a method this file
// does not have. It grew onPlaybackEnd, this file did not, and because chat.js calls it
// while wiring up the socket, every turn on the phone died with a TypeError before the
// message was ever sent. The status sat on "thinking" forever and the model never ran. What it plays is nothing: the native side already spoke. What it
// provides is a synthetic analyser, fed by the loudness envelope the native side sends,
// so the mouth still moves with her voice.
//
// The honest limitation: the envelope is precomputed per phrase, so the orb follows the
// shape of the speech rather than the live signal. Slightly less faithful, and audible
// speech is worth more than a perfectly synced mouth over silence.

class AudioPlayer {
  constructor() {
    this._playing = false;
    this._onStart = null;
    this._onEnd = null;
    this._sampleRate = 24000;

    // Enough bins to look like a real analyser to ui.js and orb_avatar.js, which read
    // frequencyBinCount and fill a Uint8Array from getByteFrequencyData.
    this._bins = 128;
    this._freq = new Uint8Array(this._bins);

    this._envelope = [];
    this._startedAt = 0;
    this._durationMs = 0;

    const self = this;
    this._analyser = {
      frequencyBinCount: this._bins,
      getByteFrequencyData(target) {
        const level = self._levelNow();
        // Speech energy sits low in the spectrum, so the shape falls away across the
        // bins rather than being flat. ui.js samples the lower half and averages, and a
        // flat block would read as a buzz rather than a voice.
        for (let i = 0; i < target.length; i++) {
          const fallOff = 1 - i / target.length;
          target[i] = Math.max(0, Math.min(255, level * 255 * fallOff * fallOff));
        }
      },
    };

    // The native side reports each phrase before it plays, and when the reply ends.
    window.__poppysAudio = (msg) => {
      if (msg.t === 'audio:chunk') {
        this._envelope = msg.envelope || [];
        this._durationMs = msg.durationMs || 0;
        this._startedAt = Date.now();
        if (!this._playing) {
          this._playing = true;
          if (this._onStart) this._onStart();
        }
      } else if (msg.t === 'audio:end') {
        this._playing = false;
        this._envelope = [];
        // Only a reply that actually finished. Desktop's stop() does not fire this
        // either, and firing it on barge-in would set the turn idle underneath the
        // recording the user just started.
        if (!msg.bargeIn && this._onEnd) this._onEnd();
      }
    };
  }

  /** Where in the current phrase's envelope we are, 0..1. */
  _levelNow() {
    if (!this._playing || !this._envelope.length || !this._durationMs) return 0;
    const elapsed = Date.now() - this._startedAt;
    if (elapsed > this._durationMs) return 0;
    const idx = Math.floor((elapsed / this._durationMs) * this._envelope.length);
    return this._envelope[Math.max(0, Math.min(this._envelope.length - 1, idx))] || 0;
  }

  getAnalyser() {
    return this._analyser;
  }

  setSampleRate(rate) {
    if (rate > 0) this._sampleRate = rate;
  }

  /**
   * Never called on iOS: the socket sends no binary frames, because the native side
   * already spoke the phrase. Kept so the page's code path is unchanged, and it says so
   * rather than failing silently if that ever changes.
   */
  async enqueueWav() {
    console.log('[audio] enqueueWav ignored on iOS; playback is native');
  }

  isPlaying() {
    return this._playing;
  }

  onPlaybackStart(cb) {
    this._onStart = cb;
  }

  /**
   * Fired when her recording has played out. This is what returns the turn to idle:
   * a spoken reply carries no text, so no reveal loop runs and nothing else in the
   * page would ever end the turn. The native side reports the ending, because the
   * native side is what played the sound.
   */
  onPlaybackEnd(cb) {
    this._onEnd = cb;
  }

  /**
   * Teardown. There is no AudioContext to close on this side, so this is stop() plus
   * dropping the callbacks. Nothing in the page calls it today; it exists because the
   * desktop player has it, and "nothing calls it today" is exactly how the last gap in
   * this interface went unnoticed.
   */
  close() {
    this.stop();
    this._onStart = null;
    this._onEnd = null;
  }

  /** Barge-in. The native side owns the sound, so it is told to stop. */
  stop() {
    this._playing = false;
    this._envelope = [];
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'audio:stop' }));
    }
  }
}

window.AudioPlayer = AudioPlayer;
