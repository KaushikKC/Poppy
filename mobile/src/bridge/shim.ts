/**
 * The JavaScript injected into the WebView before the page loads.
 *
 * It replaces `fetch` and `WebSocket` so the desktop frontend's 43 call sites
 * reach the TypeScript core instead of a Python server on localhost, without a
 * single change to the UI code. Nothing in the page knows there is no server.
 *
 * It must be injected *before content loads*: `chat.js` reads `window.BACKEND`
 * at module scope, and the frontend captures `WebSocket` when it opens a call.
 * Injecting after load would leave the real implementations in place, which then
 * fail against a localhost that is not listening.
 *
 * Written as a plain string rather than a module because it is evaluated inside
 * the page, not bundled with the app. Keep it ES5-ish and dependency-free: it
 * runs in whatever WKWebView provides, before any of the app's polyfills.
 */

export const BRIDGE_ORIGIN = 'http://poppys.local';

export const SHIM_JS = String.raw`
(function () {
  if (window.__poppysShim) return;
  window.__poppysShim = true;

  // The frontend reads these at module scope; they must exist before its scripts
  // run. The origin is a marker, not a host: nothing ever connects to it.
  window.BACKEND = '${BRIDGE_ORIGIN}';
  window.WS_BACKEND = 'ws://poppys.local';

  var nextId = 1;
  var pendingFetch = {};   // id -> {resolve, reject}
  var sockets = {};        // id -> shimmed WebSocket instance

  function post(msg) {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  // ── fetch ──────────────────────────────────────────────────────────────────
  var realFetch = window.fetch;

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    init = init || {};

    // Anything not aimed at the core keeps the real implementation: the page
    // still loads its own assets, and audio clips are fetched by URL.
    if (url.indexOf('poppys.local') === -1 && url.indexOf('localhost:8000') === -1) {
      return realFetch.apply(window, arguments);
    }

    var id = nextId++;
    var body = init.body;

    // FormData (the /stt upload) cannot cross postMessage. The turn loop does not
    // go through fetch on mobile at all, so this is a clear failure rather than a
    // silent one that would be debugged as a transcription problem.
    if (body && typeof FormData !== 'undefined' && body instanceof FormData) {
      return Promise.reject(new Error('poppys bridge: FormData is not supported; use the native turn loop'));
    }

    return new Promise(function (resolve, reject) {
      pendingFetch[id] = { resolve: resolve, reject: reject };
      post({
        t: 'fetch',
        id: id,
        method: (init.method || 'GET').toUpperCase(),
        url: url,
        body: typeof body === 'string' ? body : (body == null ? null : String(body)),
      });
    });
  };

  // ── WebSocket ──────────────────────────────────────────────────────────────
  // Only what the frontend actually uses: onopen, onmessage, onclose, onerror,
  // send, close, readyState, binaryType. Not a spec-complete implementation.
  function ShimSocket(url) {
    var self = this;
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.binaryType = 'blob';
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;

    this._id = nextId++;
    sockets[this._id] = this;
    post({ t: 'ws:open', id: this._id, url: url });
  }

  ShimSocket.prototype.send = function (data) {
    if (this.readyState !== 1) return;
    post({ t: 'ws:send', id: this._id, data: String(data) });
  };

  ShimSocket.prototype.close = function () {
    if (this.readyState === 3) return;
    this.readyState = 2; // CLOSING
    post({ t: 'ws:close', id: this._id });
  };

  ShimSocket.prototype.addEventListener = function (type, fn) {
    var prop = 'on' + type;
    var prev = this[prop];
    this[prop] = prev
      ? function (e) { prev.call(this, e); fn.call(this, e); }
      : fn;
  };

  ShimSocket.CONNECTING = 0;
  ShimSocket.OPEN = 1;
  ShimSocket.CLOSING = 2;
  ShimSocket.CLOSED = 3;
  window.WebSocket = ShimSocket;

  // ── animation, at a phone's budget ────────────────────────────────────────
  // The UI runs three unconditional requestAnimationFrame loops at 60fps: the orb
  // redraws every frame even when idle and even when it is not on screen, ui.js ticks
  // every frame, and the garden animates whenever its canvas exists. On a desktop that
  // is free. On a phone it is a continuous GPU and compositing load underneath the
  // model, and it is a large part of why the device gets hot.
  //
  // Throttling here rather than editing three UI files: they stay identical to desktop,
  // and anything added later is covered automatically. 30fps is indistinguishable for a
  // breathing orb and halves the work.
  // Guarded: this shim also carries fetch and the socket, and a missing rAF must not
  // take those down with it.
  var realRaf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : null;
  // A 60Hz display advances in 16.67ms steps, so a gate of exactly 33.33ms lands on
  // the two-frame boundary and the smallest rounding error in the timestamp pushes
  // it out to three frames — 20fps, not the 30 intended. A millisecond of slack
  // keeps it on two, and is still well under a frame on a 120Hz panel.
  var FRAME_MS = 1000 / 30 - 1;
  // The budget is per loop, not one gate shared by all of them.
  //
  // It was a single timestamp, and that starved every loop but one. A browser frame
  // runs all its pending callbacks at the same instant, so the first loop called
  // claimed the slot and set the timestamp, and every other callback in that frame
  // then saw zero elapsed and deferred itself to the next one. Deferring re-queues
  // it *behind* the winner, which had already re-queued itself from inside its own
  // callback — so the same loop won every frame, for good. One animation ran; the
  // rest sat at zero frames per second.
  //
  // That is the blank garden: opening it asks for a single frame to draw the field
  // once its view is on screen, and that request was deferred for ever behind a loop
  // that never gave up the slot. Nothing was ever drawn, so the garden was the empty
  // colour of its own background.
  //
  // Keyed on the callback, so each repeating loop gets its own 30fps and a callback
  // never seen before runs on the very next frame. The map holds its keys weakly, so
  // the one-shot arrows the UI creates every frame are still collectable.
  var lastRun = typeof WeakMap === 'function' ? new WeakMap() : null;

  if (realRaf) window.requestAnimationFrame = function (cb) {
    return realRaf(function (ts) {
      // Nothing is visible when the app is backgrounded, so nothing should be drawn.
      // Callbacks still reschedule themselves, so the loops resume on return.
      if (document.hidden) {
        window.requestAnimationFrame(cb);
        return;
      }
      var now = ts || Date.now();
      if (lastRun && typeof cb === 'function') {
        var prev = lastRun.get(cb);
        if (prev !== undefined && now - prev < FRAME_MS) {
          window.requestAnimationFrame(cb);
          return;
        }
        lastRun.set(cb, now);
      }
      cb(now);
    });
  };

  // ── tracking a real user gesture ──────────────────────────────────────────
  // Both the audio unlock and the keyboard fix below need to know "did a human
  // just touch the screen", so it is tracked once, here, rather than twice.
  var lastGestureAt = 0;
  function noteGesture() { lastGestureAt = Date.now(); }
  function recentGesture(windowMs) { return Date.now() - lastGestureAt < windowMs; }

  // ── a way back to the model picker ────────────────────────────────────────
  // Tapping the version line on the home screen reopens setup, which is where the
  // model is chosen. Done here rather than in flow.js so the desktop build is
  // untouched, and put on an existing element so no new UI has to be invented.
  document.addEventListener('click', function (e) {
    var el = e && e.target;
    if (el && el.id === 'home-version') {
      post({ t: 'setup:open' });
    }
  }, true);

  // ── stopping the keyboard from opening on its own ─────────────────────────
  // Reported from the phone: while she is speaking, scrolling, or between turns,
  // the on-screen keyboard pops up with nobody having touched the input, and while
  // it is open everything visibly lags. chat.js calls input.focus() after every
  // reply finishes (and on error) so a mouse-and-keyboard desktop user can keep
  // typing without a click. Under WKWebView the bridge delivers that call through
  // evaluateJavaScript, which is not treated as page-originated script the way a
  // real DOM event handler is, so the "requires a user gesture" rule Safari
  // normally enforces on focus() does not apply here — the keyboard opens anyway.
  // Opening it mid-reply then resizes the whole viewport (#app uses 100dvh), which
  // is the layout "moving around" and the reflow is the reported lag.
  //
  // Programmatic focus on a text field is now only honoured shortly after a real
  // touch. Tapping the input directly still focuses it exactly as before — that
  // tap IS the gesture — but a focus() called from a websocket handler seconds
  // after the last tap is silently ignored, which is what iOS would have done if
  // the call had gone through the normal restricted path.
  var FOCUS_GESTURE_WINDOW_MS = 600;
  var realFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function () {
    var tag = this && this.tagName;
    if ((tag === 'INPUT' || tag === 'TEXTAREA') && !recentGesture(FOCUS_GESTURE_WINDOW_MS)) {
      return;
    }
    return realFocus.apply(this, arguments);
  };

  document.addEventListener('touchend', noteGesture, true);
  document.addEventListener('click', noteGesture, true);

  // ── unlocking audio ───────────────────────────────────────────────────────
  // iOS starts a WKWebView's AudioContext *suspended* and refuses to resume it
  // outside a user gesture, and the refusal is silent. The symptom is precise: the
  // reply arrives as text, the status goes to "speaking" (so the WAV decoded and was
  // scheduled), nothing is audible, and the turn never finishes because playback
  // never ran.
  //
  // audio_player.js does call resume() when it sees a suspended context, but without
  // a gesture behind it that call is rejected. So it is resumed from a real touch
  // instead. This lives in the shim rather than in an overlaid index.html, because
  // copying that file to add one script tag would leave two copies of every screen to
  // keep in step.
  var audioUnlocked = false;

  function audioCtx() {
    // chat.js sets window._player; the player keeps one context for the session.
    return window._player && window._player._ctx ? window._player._ctx : null;
  }

  function unlockAudio() {
    if (audioUnlocked) return;
    var c = audioCtx();
    if (!c) return; // player not built yet; a later tap will find it
    if (c.state === 'running') { audioUnlocked = true; return; }
    c.resume().then(function () {
      if (c.state === 'running') {
        audioUnlocked = true;
        console.log('[audio] context unlocked');
      }
    }).catch(function (e) {
      console.log('[audio] resume refused, retrying on the next tap: ' + e);
    });
  }

  // Capture phase, so it still runs when a handler stops propagation.
  document.addEventListener('touchend', unlockAudio, true);
  document.addEventListener('click', unlockAudio, true);
  // A context can be suspended again on backgrounding, and returning is not a
  // gesture; often it resumes anyway because the session is still active.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { audioUnlocked = false; unlockAudio(); }
  });

  // ── the handful of things only the phone needs ────────────────────────────
  // Injected rather than written into style.css, so the desktop stylesheet stays
  // exactly as it is and these only ever apply inside the app.
  //
  // This was much larger. Most of it existed to keep a full-page orb visible above
  // a transcript squeezed into the bottom third — capping the rail at 38vh, hiding
  // every bubble but the last two, lifting the dock and the avatar clear of each
  // other. The thread replaced that layout wholesale, so those rules went with it:
  // the scrollback is wanted now, and the header and composer carry their own safe
  // areas in style.css, next to the layout that needs them.
  function addMobileCallStyle() {
    if (document.getElementById('poppys-mobile-call-css')) return;
    var style = document.createElement('style');
    style.id = 'poppys-mobile-call-css';
    // The WebView fills the window, notch and home indicator included (there is no
    // SafeAreaView around it, deliberately: the avatar should reach the edges). So
    // every edge-anchored control has to keep itself off the system bars.
    var TOP = 'env(safe-area-inset-top, 0px)';
    var BOTTOM = 'env(safe-area-inset-bottom, 0px)';
    style.textContent =
      '@media (max-width: 820px) {' +

      // ── clear of the status bar ─────────────────────────────────────────
      // Home's top strip is absolutely positioned against #home's padding box, so
      // padding on #home does not move it — its own top offset has to carry the
      // inset. The thread's own header handles this in style.css, where the layout
      // that needs it lives.
      '.home-streak, #home-update, #home-reminder {' +
      '  top: calc(1.4rem + ' + TOP + ') !important; }' +

      // ── clear of the home indicator ─────────────────────────────────────
      '#home { padding-bottom: calc(1.5rem + ' + BOTTOM + ') !important; }' +
      '.garden-bar { padding-bottom: calc(1rem + ' + BOTTOM + ') !important; }' +

      // ── the thread ──────────────────────────────────────────────────────
      // The bubbles carry the conversation, so on a narrow screen they take the
      // width that was being spent on margin.
      '.rail-scroll .bubble { max-width: 88% !important; }' +

      // ── what she wrote down ─────────────────────────────────────────────
      // Nothing is announced on a phone. Saving is already automatic — the extract
      // call keeps what it finds and this panel was only ever a receipt for it —
      // and on a screen this size a receipt is an interruption, landing in the
      // middle of the exchange during the one activity the app exists for.
      //
      // Only the notice goes. Every memory is still saved, and every one of them
      // stays listed, editable and deletable behind the Memory button.
      '#memory-consent { display: none !important; }' +

      // ── naming a flower ─────────────────────────────────────────────────
      // The garden's bar sits at the bottom edge, which is where the keyboard comes
      // up: opening it to type a name covered the field being typed into. iOS does
      // not shrink the layout viewport for the keyboard, so a bottom-anchored
      // element has nowhere to go — it has to not be at the bottom.
      '#garden .garden-name:not(.hidden) {' +
      '  position: fixed !important; z-index: 75;' +
      '  left: 0.65rem; right: 0.65rem;' +
      '  top: calc(1rem + ' + TOP + ');' +
      '  padding: 0.6rem; border-radius: 12px;' +
      '  background: rgba(7,18,7,0.72);' +
      '  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);' +
      '  box-shadow: 0 18px 44px -14px rgba(7,18,7,0.6); }' +
      '#garden .garden-name-input {' +
      '  flex: 1 1 auto; width: auto !important; font-size: 1rem !important;' +
      '  padding: 0.7rem 0.8rem !important; }' +
      '}';
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addMobileCallStyle);
  } else {
    addMobileCallStyle();
  }

  // ── inbound, called by the native side ─────────────────────────────────────
  window.__poppysBridge = function (msg) {
    if (msg.t === 'fetch:res') {
      var p = pendingFetch[msg.id];
      if (!p) return;
      delete pendingFetch[msg.id];
      var text = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);
      p.resolve({
        ok: msg.status >= 200 && msg.status < 300,
        status: msg.status,
        json: function () { return Promise.resolve(JSON.parse(text)); },
        text: function () { return Promise.resolve(text); },
      });
      return;
    }

    if (msg.t === 'fetch:err') {
      var pe = pendingFetch[msg.id];
      if (!pe) return;
      delete pendingFetch[msg.id];
      pe.reject(new Error(msg.error || 'bridge error'));
      return;
    }

    var s = sockets[msg.id];
    if (!s) return;

    if (msg.t === 'ws:opened') {
      s.readyState = 1;
      if (s.onopen) s.onopen({ type: 'open' });
    } else if (msg.t === 'ws:msg') {
      if (!s.onmessage) return;
      if (msg.b64) {
        // Audio frames arrive base64'd because postMessage carries text only.
        var raw = atob(msg.data);
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        s.onmessage({
          data: s.binaryType === 'arraybuffer' ? bytes.buffer : new Blob([bytes]),
        });
      } else {
        s.onmessage({ data: msg.data });
      }
    } else if (msg.t === 'ws:closed') {
      s.readyState = 3;
      delete sockets[msg.id];
      if (s.onclose) s.onclose({ type: 'close', code: msg.code || 1000 });
    } else if (msg.t === 'ws:err') {
      if (s.onerror) s.onerror({ type: 'error' });
    }
  };
})();
true;
`;
