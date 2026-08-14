// BACKEND and sendBtn are declared in chat.js — not redeclared here

const micBtn    = document.getElementById("mic-btn");
const vadBtn    = document.getElementById("vad-btn");
const userInput = document.getElementById("user-input");

let mediaRecorder = null;
let audioChunks   = [];
let isRecording   = false;

let vadInstance   = null;
let vadActive     = false;

// ── Push-to-talk helpers ──────────────────────────────────────────────────────

function setMicState(state) {
  micBtn.className = state === "idle" ? "" : state;
  micBtn.title = {
    idle:         "Click to record",
    recording:    "Recording… click to stop",
    transcribing: "Transcribing…",
  }[state] ?? "";
}

async function startRecording() {
  // Push-to-talk also barges in: if the assistant is replying, cut it off.
  window.interruptReply?.();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    console.error("getUserMedia error:", err);
    alert("Microphone access denied. Please allow mic access in Chrome and try again.");
    return;
  }

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  audioChunks   = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    // Release the microphone first and unconditionally. If anything below throws,
    // the device must not stay held: a mic still open is why a retry then failed
    // too, and why only a full page reload recovered it.
    releaseStream(stream);
    try {
      const blob = new Blob(audioChunks, { type: mimeType });
      await transcribeAndSend(blob, mimeType);
    } catch (err) {
      // transcribeAndSend handles its own STT errors; this catches anything
      // after it, such as the send failing on a closed socket. Without it the
      // rejection escaped and the UI sat on "transcribing" forever.
      console.error("mic: turn failed after recording", err);
    } finally {
      isRecording = false;
      setMicState("idle");
    }
  };

  mediaRecorder.start(250);
  isRecording = true;
  setMicState("recording");
}

function releaseStream(stream) {
  try { stream?.getTracks?.().forEach((t) => t.stop()); } catch {}
}

function stopRecording() {
  if (!mediaRecorder || !isRecording) return;
  isRecording = false;
  setMicState("transcribing");
  try {
    mediaRecorder.stop();
  } catch (err) {
    // The recorder was already inactive, so onstop will never fire and nothing
    // would ever put the UI back. Recover here instead of stranding it.
    console.error("mic: stop failed", err);
    releaseStream(mediaRecorder.stream);
    setMicState("idle");
  }
}

micBtn.addEventListener("click", () => {
  if (vadActive) return;
  if (isRecording) {
    stopRecording();
    return;
  }
  // If a previous turn left the mic mid-flight, clicking should recover it
  // rather than silently do nothing, which is what forced a page reload.
  if (mediaRecorder && mediaRecorder.state === "recording") {
    console.warn("mic: recorder was left running, resetting");
    try { mediaRecorder.stop(); } catch {}
    releaseStream(mediaRecorder.stream);
    mediaRecorder = null;
    setMicState("idle");
    return;
  }
  startRecording();
});

// ── VAD toggle ────────────────────────────────────────────────────────────────

if (vadBtn) {
  vadBtn.addEventListener("click", async () => {
    if (!vadActive) {
      // No minSpeechMs here on purpose. This used to pass 200, which silently
      // overrode the 300ms default and let coughs and key presses through to be
      // transcribed as words. The class owns that number.
      vadInstance = new VAD({ threshold: 0.018, silenceMs: 800 });

      vadInstance.onStart = () => {
        // Barge-in: speaking while the assistant talks cuts it off immediately.
        window.interruptReply?.();
        vadBtn.classList.add("active");
        vadBtn.title = "Listening… speak now";
      };

      vadInstance.onEnd = () => {
        vadBtn.classList.remove("active");
        vadBtn.title = "Processing…";
      };

      vadInstance.onSpeech = async (blob, mimeType) => {
        await transcribeAndSend(blob, mimeType);
        vadBtn.title = "Auto-listening — click to stop";
      };

      try {
        await vadInstance.start();
        vadActive = true;
        vadBtn.classList.add("on");
        vadBtn.title = "Auto-listening — click to stop";
        micBtn.disabled = true;
      } catch (err) {
        console.error("VAD start error:", err);
        alert("Could not start auto-listen. Check mic permissions.");
        vadInstance = null;
      }
    } else {
      vadInstance?.stop();
      vadInstance = null;
      vadActive   = false;
      vadBtn.classList.remove("on", "active");
      vadBtn.title = "Auto-listen";
      micBtn.disabled = false;
    }
  });
}

// ── Shared transcribe + send ──────────────────────────────────────────────────

async function transcribeAndSend(blob, mimeType) {
  window._turnStart = Date.now(); // latency timer starts here

  const detectOn = window.detectionEnabled?.() ?? false;
  const ext      = mimeType.split(";")[0].split("/")[1] || "webm";
  const formData = new FormData();
  formData.append("audio", blob, `recording.${ext}`);
  formData.append("persona", PersonaPicker.current());
  // Only ask the backend to run the (slower) accent/voice/mood classifiers when
  // the user has turned voice adaptation on; off by default keeps /stt fast.
  formData.append("detect", detectOn ? "true" : "false");

  setMicState("transcribing");
  let transcript = "";
  try {
    const res = await fetch(`${BACKEND}/stt`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`STT HTTP ${res.status}`);
    const data = await res.json();
    transcript = data.transcript?.trim() ?? "";
    if (data.suggestion && window.showPersonaSuggestion) {
      window.showPersonaSuggestion(data.suggestion);
    }
    if (detectOn) {
      if (data.accent) window.setAccent?.(data.accent);  // identity, sticky
      if (data.gender) window.setGender?.(data.gender);  // identity, sticky
      window.setEmotion?.(data.emotion || "neutral");    // momentary, this clip
    }
  } catch (err) {
    console.error("STT error:", err);
    setMicState("idle");
    return;
  }

  setMicState("idle");
  if (!transcript) return;

  userInput.value = "";
  sendMessage(transcript);
}
