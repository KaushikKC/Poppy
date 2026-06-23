# Private Companion — MVP Build Checklist

## Step 0 — Environment Setup ✅
- [x] Install Homebrew, Python 3.11+, Node.js 20+
- [x] Install Ollama (v0.30.8)
- [x] Pull LLM model: `llama3.1:8b-instruct-q4_K_M` (4.9 GB)
- [x] Install Python deps: fastapi 0.115, uvicorn 0.41, websockets 15, faster-whisper 1.2.1, piper-tts 1.4.2
- [x] Download Piper voice model: `en_US-lessac-medium` → `models/piper/`
- [x] Download Whisper `small` model (cached via faster-whisper)
- [x] Project structure created: `backend/`, `frontend/`, `models/piper/`

## Step 1 — Prove the LLM Alone ✅
- [x] `llama3.1:8b-instruct-q4_K_M` warm speed: **17.5 tok/s** — GO (target ≥10)
- [x] Clean instruct responses, no CoT/thinking tokens
- [x] Piper TTS synthesis: working at 22050 Hz
- [x] Note: `deepseek-r1:7b` also present but unsuitable (CoT model, think tokens)

## Step 2 — Text Chat Backend ✅
- [x] Create project structure: `backend/`, `frontend/`
- [x] `backend/config.py` — model paths, system prompt, tuning constants
- [x] `backend/ollama_client.py` — async streaming client via httpx
- [x] `backend/main.py` — FastAPI: `POST /chat` streams tokens, `GET /health`, `DELETE /history`
- [x] `frontend/index.html` — chat UI shell
- [x] `frontend/style.css` — dark theme, chat bubbles, status dot animations
- [x] `frontend/chat.js` — streaming fetch, live bubble rendering, status states
- [x] Tested: `POST /chat` streams cleanly, first reply in ~1s

## Step 3 — Speech-to-Text ✅
- [x] `backend/stt.py` — lazy-loaded Whisper small, transcribes any ffmpeg-decodeable audio
- [x] `POST /stt` endpoint — accepts multipart audio upload, returns `{"transcript": "..."}`
- [x] `frontend/mic.js` — click-to-toggle recording via MediaRecorder (WebM/Opus), posts to /stt, auto-sends result
- [x] Mic button added to HTML with recording/transcribing visual states in CSS
- [x] `window.sendMessage` exposed so mic.js can trigger chat after transcription
- [x] `backend/tts.py` — correct Piper 1.4.2 API (AudioChunk generator → PCM bytes) ready for Step 4
- [x] Tested: macOS say → WAV → /stt → correct transcript returned

## Step 4 — Text-to-Speech (Streaming) ✅
- [x] `backend/phrase_chunker.py` — PhraseChunker breaks token stream on sentence/soft-break rules
- [x] `backend/ws_handler.py` — WebSocket loop: streams tokens + fires Piper synthesis concurrently per phrase
- [x] `backend/main.py` — `/ws/chat` WebSocket route wired; history clear unified across HTTP + WS
- [x] `frontend/audio_player.js` — AudioPlayer queues WAV chunks, schedules gapless playback via Web Audio API
- [x] `frontend/chat.js` — replaced fetch with WebSocket; integrates AudioPlayer; status dot tracks thinking/speaking/idle
- [x] Tested end-to-end: config → tokens → WAV audio chunks → done (28 KB audio chunk for "Hello!")

## Step 5 — Avatar ✅
- [x] `frontend/avatar.js` — canvas Avatar class: blinking eyes (random 2.5–6.5s), mouth driven by live audio amplitude via AnalyserNode, purple glow ring while speaking
- [x] `frontend/audio_player.js` — AnalyserNode inserted into signal chain (source→analyser→destination), exposed via `getAnalyser()`
- [x] `frontend/chat.js` — avatar created at page load, `setAnalyser()` called on first config message, state toggled speaking/idle on audio playback start/end
- [x] `frontend/index.html` — 220×220 canvas added above transcript, avatar.js loaded before chat.js
- [x] `frontend/style.css` — avatar centered, 180px display size, circular crop
- [x] Backend unchanged — pure frontend addition as planned

## Step 6 — Latency Polish & QoL ✅
- [x] Latency measured in `chat.js`: `window._turnStart` set on mic-stop or send, `showLatency()` displays green badge in header on first audio (fades after 3s)
- [x] Context window already 4096 in config ✓ — model at 17.5 tok/s, no bottleneck
- [x] History already capped at MAX_HISTORY_TURNS=10 in ws_handler ✓
- [x] `backend/db.py` — SQLite (companion.db) saves every session + turn; `*.db` gitignored
- [x] `backend/ws_handler.py` — UUID session_id per WS connection, turns saved async; `done` message carries sessionId
- [x] `backend/main.py` — `GET /sessions` lists all sessions; `GET /export/{id}` returns turns as JSON + plain text
- [x] `frontend/vad.js` — VAD class: amplitude threshold 0.018, 800ms silence, 200ms min speech, onSpeech callback
- [x] `frontend/mic.js` — VAD toggle button; push-to-talk and auto-listen coexist; latency timer set in `transcribeAndSend`
- [x] `frontend/style.css` — green latency badge (top-right header), VAD button with on/active pulse states

## Validation Gates (before calling MVP done)
- [ ] Full offline: airplane mode → app still works end-to-end
- [ ] Memory check: `Activity Monitor` shows total < 11 GB during conversation
- [ ] Latency: first reply audio starts within ~1.5s of finishing speaking
- [ ] No crashes after 10+ consecutive exchanges

---

## Post-MVP Milestones (do NOT start until above is done)
- [ ] **M1** — Persona selection: user picks voice + avatar style + system-prompt style
- [ ] **M2** — Accent detection: streaming classifier proposes persona automatically
- [ ] **M3** — Emotional-support framing: safety layer, crisis signposting, encrypted local memory
- [ ] **M4** — Realistic face (opt-in, capable machines only)
