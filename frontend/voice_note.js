/**
 * Voice messages you can actually play again.
 *
 * A voice note used to be a picture of one: a play mark that was not a button, and a
 * waveform driven by a timer started when the audio did. It looked right, it filled in
 * time with her voice, and when it finished there was no way to hear it a second time.
 * Every messaging app people already use lets them, so its absence reads as breakage
 * rather than as restraint.
 *
 * This turns the same markup into a real player: play, pause, resume, replay, and a
 * scrub bar that follows the audio rather than the clock.
 *
 * ## Handles
 *
 * The page never owns the audio in the same way twice. On desktop the reply arrives as
 * WAV bytes over the socket and the user's own recording is a MediaRecorder blob, so
 * both can be played by the page. On iOS the audio is captured and played natively and
 * the page never sees a byte of it, by design (WKWebView at a file:// origin cannot be
 * trusted with either end).
 *
 * So playback sits behind a handle and this file does not care which it was given:
 *
 *   play() pause() stop() seek(fraction) position() -> 0..1 playing() -> bool
 *   onEnded(cb)
 *
 * blobHandle() covers the desktop cases with an <audio> element. nativeHandle() asks
 * the native side, which is holding the samples anyway because it played them.
 */
(function () {
  const fmt = (ms) => {
    const secs = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  };

  /**
   * Desktop: an <audio> element over an object URL.
   *
   * Not Web Audio, deliberately. The live path already uses Web Audio because it needs
   * an AnalyserNode to move the orb; a replay needs seeking, pausing and a duration,
   * which an <audio> element has for free and a buffer source does not.
   */
  function blobHandle(blob) {
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    el.preload = "metadata";
    let ended = null;
    el.addEventListener("ended", () => ended && ended());
    return {
      play: () => el.play().catch(() => {}),
      pause: () => el.pause(),
      stop: () => {
        el.pause();
        el.currentTime = 0;
      },
      seek: (f) => {
        if (el.duration && isFinite(el.duration)) el.currentTime = el.duration * f;
      },
      position: () => (el.duration && isFinite(el.duration) ? el.currentTime / el.duration : 0),
      playing: () => !el.paused && !el.ended,
      onEnded: (cb) => {
        ended = cb;
      },
      release: () => {
        el.pause();
        URL.revokeObjectURL(url);
      },
    };
  }

  /**
   * iOS: the native side kept the samples, so it is the one that can replay them.
   *
   * Position is interpolated from the clip's known length rather than reported back
   * frame by frame. A progress bar redrawn from a bridge message sixty times a second
   * is a lot of postMessage traffic to make a bar smoother than the eye can tell.
   */
  function nativeHandle(clipId, durationMs) {
    let startedAt = 0;
    let offset = 0; // fraction already played when paused
    let isPlaying = false;
    let ended = null;

    const post = (t, extra) => {
      try {
        window.ReactNativeWebView?.postMessage(JSON.stringify({ t, id: clipId, ...extra }));
      } catch {
        /* not in the WebView: the handle is inert, which is correct on desktop */
      }
    };

    const handle = {
      play: () => {
        startedAt = Date.now();
        isPlaying = true;
        post("clip:play", { fromFraction: offset });
      },
      pause: () => {
        if (isPlaying) offset = handle.position();
        isPlaying = false;
        post("clip:pause");
      },
      stop: () => {
        offset = 0;
        isPlaying = false;
        post("clip:stop");
      },
      seek: (f) => {
        offset = f;
        if (isPlaying) {
          startedAt = Date.now();
          post("clip:play", { fromFraction: f });
        }
      },
      position: () => {
        if (!isPlaying) return offset;
        return Math.min(1, offset + (Date.now() - startedAt) / durationMs);
      },
      playing: () => isPlaying,
      onEnded: (cb) => {
        ended = cb;
      },
      release: () => {},
      /**
       * The sound is already coming out of the phone.
       *
       * Her reply plays natively the moment it is synthesised, and the bubble used to
       * be a picture of a player until that finished — so the first pass, the one you
       * are actually listening to, was the one you could not pause. This lets the
       * handle adopt a playback it did not start, so the controls are live from the
       * first second.
       */
      assumePlaying: () => {
        startedAt = Date.now();
        offset = 0;
        isPlaying = true;
      },
      /** The native side reports the real ending, which is what actually ends it. */
      _finished: () => {
        isPlaying = false;
        offset = 0;
        if (ended) ended();
      },
    };

    clips.set(clipId, handle);
    return handle;
  }

  // Live native handles, so `window.__poppysClip` can find the one that just ended.
  const clips = new Map();
  window.__poppysClip = (msg) => {
    const h = clips.get(msg && msg.id);
    if (h && msg.t === "clip:ended") h._finished();
  };

  /**
   * Draw a voice note into a bubble.
   *
   * `handle` is optional: without one this renders the old read-only note, which is
   * still the right thing for a reply whose audio the page was never given.
   */
  function render(bubble, opts) {
    const {
      durationMs = 0, transcript = "", handle = null, autoplay = false,
      // Rendered over a playback that has already started elsewhere. See
      // assumePlaying() on the native handle.
      playing = false,
    } = opts || {};
    const secs = Math.max(1, Math.round(durationMs / 1000));

    bubble.classList.remove("recording", "streaming");
    bubble.classList.add("voice-note");
    bubble.textContent = "";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vn-mark";
    // A play mark that is not a button is the bug this file exists to fix, so it is a
    // real one even when there is nothing to replay — in that case it says so.
    btn.setAttribute("aria-label", handle ? "Play voice message" : "Voice message");
    if (!handle) btn.disabled = true;

    const wave = document.createElement("span");
    wave.className = "vn-wave";
    const bars = Math.min(34, Math.max(12, Math.round(durationMs / 220)));
    for (let i = 0; i < bars; i += 1) {
      const b = document.createElement("i");
      // Seeded from the duration, so a given note always looks the same rather than
      // reshuffling its own waveform every time it is redrawn.
      const n = Math.abs(Math.sin((i + 1) * (durationMs % 97) * 0.37));
      b.style.height = `${28 + n * 72}%`;
      wave.appendChild(b);
    }

    const time = document.createElement("span");
    time.className = "vn-time";
    time.textContent = fmt(durationMs);

    const row = document.createElement("span");
    row.className = "vn-row";
    row.append(btn, wave, time);
    bubble.append(row);
    bubble.setAttribute("aria-label", `Voice message, ${secs} seconds`);

    // The transcript of the user's own message, behind a tap. Shown on request rather
    // than always: a voice message that arrives with its text already under it is a
    // text message with an audio attachment, and nobody would have recorded it.
    if (transcript) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "vn-transcript";
      toggle.textContent = "Transcript";
      toggle.setAttribute("aria-expanded", "false");

      const text = document.createElement("span");
      text.className = "vn-text hidden";
      text.textContent = transcript;

      toggle.addEventListener("click", () => {
        const shown = !text.classList.toggle("hidden");
        toggle.setAttribute("aria-expanded", String(shown));
        toggle.textContent = shown ? "Hide transcript" : "Transcript";
      });
      bubble.append(toggle, text);
    }

    let raf = 0;
    const paint = () => {
      const f = Math.min(1, Math.max(0, handle ? handle.position() : 0));
      wave.style.setProperty("--played", `${(f * 100).toFixed(1)}%`);
      time.textContent = fmt(durationMs * (f > 0 && f < 1 ? 1 - f : 1));
      if (handle && handle.playing() && bubble.isConnected) raf = requestAnimationFrame(paint);
    };

    function setPlaying(on) {
      bubble.classList.toggle("vn-playing", on);
      btn.setAttribute("aria-label", on ? "Pause voice message" : "Play voice message");
      if (on) raf = requestAnimationFrame(paint);
      else cancelAnimationFrame(raf);
    }

    if (handle) {
      handle.onEnded(() => {
        setPlaying(false);
        bubble.classList.add("played");
        // Back to the start, so the next tap replays rather than doing nothing. This
        // is the whole feature: a note that has been heard is not a note that is spent.
        wave.style.setProperty("--played", "0%");
        time.textContent = fmt(durationMs);
      });

      btn.addEventListener("click", () => {
        if (handle.playing()) {
          handle.pause();
          setPlaying(false);
        } else {
          handle.play();
          setPlaying(true);
        }
      });

      // Tap along the waveform to scrub, the way every other voice note works.
      wave.addEventListener("click", (e) => {
        const box = wave.getBoundingClientRect();
        if (!box.width) return;
        handle.seek(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
        paint();
      });

      if (autoplay) {
        handle.play();
        setPlaying(true);
      } else if (playing) {
        handle.assumePlaying?.();
        setPlaying(true);
      }
    }

    return {
      /** Attach playback after the fact: the bytes often arrive after the frame does. */
      attach(newHandle) {
        return render(bubble, { ...opts, handle: newHandle });
      },
    };
  }

  window.VoiceNote = { render, blobHandle, nativeHandle };
})();
