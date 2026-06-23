// BACKEND and sendBtn are declared in chat.js — don't redeclare them here

const micBtn    = document.getElementById("mic-btn");
const userInput = document.getElementById("user-input");

let mediaRecorder = null;
let audioChunks   = [];
let isRecording   = false;

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

async function transcribeAndSend(blob, mimeType) {
  const ext      = mimeType.split(";")[0].split("/")[1] || "webm";
  const formData = new FormData();
  formData.append("audio", blob, `recording.${ext}`);

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

micBtn.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});
