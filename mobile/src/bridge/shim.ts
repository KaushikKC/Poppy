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
