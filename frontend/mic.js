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
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(audioChunks, { type: mimeType });
    await transcribeAndSend(blob, mimeType);
  };

  mediaRecorder.start(250);
  isRecording = true;
  setMicState("recording");
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    setMicState("transcribing");
  }
}

micBtn.addEventListener("click", () => {
  if (vadActive) return;
  if (isRecording) stopRecording();
  else             startRecording();
});

// ── VAD toggle ────────────────────────────────────────────────────────────────

if (vadBtn) {
  vadBtn.addEventListener("click", async () => {
    if (!vadActive) {
      vadInstance = new VAD({ threshold: 0.018, silenceMs: 800, minSpeechMs: 200 });

      vadInstance.onStart = () => {
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

  const ext      = mimeType.split(";")[0].split("/")[1] || "webm";
  const formData = new FormData();
  formData.append("audio", blob, `recording.${ext}`);

  setMicState("transcribing");
  let transcript = "";
  try {
    const res = await fetch(`${BACKEND}/stt`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`STT HTTP ${res.status}`);
    const data = await res.json();
    transcript = data.transcript?.trim() ?? "";
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
