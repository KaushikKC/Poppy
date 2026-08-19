// The iOS replacement for frontend/mic.js.
//
// This is the one UI file that diverges between desktop and mobile, and it has to.
// The desktop version records with MediaRecorder and analyses with AudioContext,
// both of which need getUserMedia. The WebView loads from file://, which is not a
// secure origin, so browser microphone access is not reliably available there.
//
// Everything else about the turn is unchanged: capture and transcription happen
// natively, the transcript is handed to window.sendMessage(), and from that point
// the page behaves exactly as it does on desktop, including playing the reply
// audio itself so the orb keeps moving.
//
// Same DOM contract as the file it replaces: #mic-btn, #vad-btn, #user-input.

(function () {
  const micBtn = document.getElementById('mic-btn');
  const vadBtn = document.getElementById('vad-btn');
  const userInput = document.getElementById('user-input');

  let recording = false;
  let autoListen = false;

  function post(msg) {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  function setMicState(state) {
    if (!micBtn) return;
    micBtn.className = state === 'idle' ? '' : state;
    micBtn.title =
      {
        idle: 'Tap to speak',
        recording: 'Listening… tap to send',
        transcribing: 'Transcribing…',
      }[state] ?? '';
  }

  function startRecording() {
    if (recording) return;
    recording = true;
    setMicState('recording');
    // Barge-in: speaking over her cuts the reply, same rule as desktop.
    window.interruptReply?.();
    post({ t: 'mic:start' });
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    setMicState('transcribing');
    window._turnStart = Date.now(); // the latency timer the UI reports
    post({ t: 'mic:stop' });
  }

  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (recording) stopRecording();
      else startRecording();
    });
  }

  // Auto-listen. The native side owns voice activity detection, because it owns
  // the audio; this button only turns it on and off.
  if (vadBtn) {
    vadBtn.addEventListener('click', () => {
      autoListen = !autoListen;
      vadBtn.classList.toggle('active', autoListen);
      vadBtn.title = autoListen ? 'Auto-listen on' : 'Auto-listen off';
      post({ t: 'vad:set', on: autoListen });
    });
  }

  // ── called by the native side ──────────────────────────────────────────────
  window.__poppysMic = function (msg) {
    if (msg.t === 'mic:state') {
      // Native drives the button while auto-listen is running.
      recording = msg.state === 'recording';
      setMicState(msg.state);
      if (msg.state === 'recording') window.interruptReply?.();
      return;
    }

    if (msg.t === 'mic:transcript') {
      setMicState('idle');
      const text = (msg.text || '').trim();
      if (!text) return;
      if (userInput) userInput.value = '';
      // From here the page takes over exactly as it does on desktop.
      window.sendMessage?.(text);
      return;
    }

    if (msg.t === 'mic:error') {
      setMicState('idle');
      console.error('[mic]', msg.message);
      // On a phone the console is nobody's, so a mic failure that only logs is a
      // button that silently does nothing. The hint line under the transcript is
      // already there to be read, and already talks about the mic.
      var hint = document.getElementById('hint');
      if (hint) {
        hint.textContent = msg.message;
        hint.classList.remove('hidden');
      }
    }
  };

  setMicState('idle');
})();
