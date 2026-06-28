// VideoAvatar — a full-page "real person" presence built from pre-rendered
// video loops (generate them once with Veo / Google Vids / any tool).
//
// Two stacked, muted, looping <video> layers share the same framing/background:
//   * #video-idle  — sitting, breathing, blinking (plays whenever not speaking)
//   * #video-talk  — speaking with natural mouth movement + gestures
// While the assistant's voice plays we crossfade the talking layer in, then
// back to idle. The lips don't match the exact words (that needs a GPU/cloud
// model) but it reads as a genuine human presence and runs 100% locally.
//
// Drop-in for the old canvas avatar: same setState / setColors / setIdentity /
// setAnalyser API (only setState matters here; the rest are no-ops). Until the
// clips exist it falls back to the static poster, so it never looks broken.
//
// Add clips:  frontend/avatar/idle.mp4 (or .webm)  +  frontend/avatar/talk.mp4
// See frontend/avatar/README.md for the Veo prompts and seamless-loop tips.

class VideoAvatar {
  constructor() {
    this._idle   = document.getElementById("video-idle");
    this._talk   = document.getElementById("video-talk");
    this._stage  = document.getElementById("stage");
    this._state  = "idle";
    this._ready  = false;
    this._talkOk = false;
    this._init();
  }

  // public API (parity with the old avatar; only setState is meaningful)
  setState(s)    { this._state = s; this._apply(); }
  setColors()    {}   // the video carries the look
  setIdentity()  {}   // identity is baked into the chosen clips
  setAnalyser()  {}   // no audio-reactive drawing needed

  async _init() {
    if (!this._idle || !this._talk) return;
    for (const v of [this._idle, this._talk]) {
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
    }

    const idleOk = await this._canPlay(this._idle);
    if (!idleOk) {
      // no clips yet → keep the static poster, hide the empty video layers
      this._stage?.classList.add("poster-only");
      console.info("[VideoAvatar] no idle clip found — showing static poster. Add frontend/avatar/idle.mp4 to bring it to life.");
      return;
    }

    this._talkOk = await this._canPlay(this._talk);
    this._idle.play().catch(() => {});
    if (this._talkOk) this._talk.play().catch(() => {});
    else console.info("[VideoAvatar] no talk clip — using a subtle speaking cue on the idle loop. Add frontend/avatar/talk.mp4 for a real talking loop.");

    // hand the canvas from the static poster to the live video layers
    this._stage?.classList.remove("poster-only");
    this._stage?.classList.add("video-live");
    this._ready = true;
    this._apply();
  }

  // resolves true once the video has a decodable frame, false on load error
  _canPlay(video) {
    return new Promise((resolve) => {
      if (video.readyState >= 2) return resolve(true);
      const ok = () => { cleanup(); resolve(true); };
      const no = () => { cleanup(); resolve(false); };
      const cleanup = () => {
        video.removeEventListener("loadeddata", ok);
        video.removeEventListener("error", no);
        for (const s of video.querySelectorAll("source")) s.removeEventListener("error", no);
      };
      video.addEventListener("loadeddata", ok, { once: true });
      video.addEventListener("error", no, { once: true });
      // <source> elements swallow their own errors; the <video> only errors once
      // every source has failed, so also watch the last source as a safety net.
      const sources = video.querySelectorAll("source");
      if (sources.length) sources[sources.length - 1].addEventListener("error", no, { once: true });
    });
  }

  _apply() {
    if (!this._ready) return;
    const speaking = this._state === "speaking";
    if (this._talkOk) {
      this._talk.classList.toggle("show", speaking);
      // keep the talking loop near the idle phase so the crossfade isn't jarring
      if (speaking && this._talk.paused) this._talk.play().catch(() => {});
    } else {
      this._idle.classList.toggle("speaking-cue", speaking);
    }
  }
}

window.VideoAvatar = VideoAvatar;
