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

## Step 2 — Text Chat Backend
- [ ] Create project structure: `backend/`, `frontend/`
- [ ] Write `backend/main.py` — FastAPI app with:
  - [ ] `POST /chat` endpoint: accepts text, streams tokens from Ollama
  - [ ] `GET /health` endpoint
- [ ] Write `frontend/index.html` — simple text box + streamed reply display
- [ ] Test: type a message → streamed response appears in browser
- [ ] Confirm streaming feels real-time (no full-wait)

## Step 3 — Speech-to-Text
- [ ] Add `POST /stt` endpoint to backend using `faster-whisper` (model: `small`)
- [ ] Browser: add push-to-talk button that records mic audio via MediaRecorder API
- [ ] Browser: POST recorded audio blob to `/stt` → receive transcript
- [ ] Wire transcript into `/chat` automatically
- [ ] Test: speak → correct text appears → LLM replies (text only still)
- [ ] Optional: integrate Silero VAD for automatic turn detection (defer if complex)

## Step 4 — Text-to-Speech (Streaming)
- [ ] Add Piper TTS to backend
- [ ] Implement phrase-chunking: accumulate LLM tokens, break on `.`, `?`, `!`, `,`
- [ ] For each phrase: synthesize audio with Piper → stream audio chunk over WebSocket
- [ ] Browser: receive audio chunks via WebSocket → play via Web Audio API (queue chunks)
- [ ] Test: full voice loop (speak → STT → LLM → TTS → hear reply)
- [ ] Tune chunk size: balance latency vs. natural phrasing (target first audio ≤1.5s)

## Step 5 — Avatar
- [ ] Add TalkingHead.js (or Ready Player Me / VRM) to frontend
- [ ] Feed live audio output into avatar's viseme driver
- [ ] Confirm lip-sync looks acceptable with spoken audio
- [ ] Basic idle animation when not speaking
- [ ] Test full loop: speak → avatar talks back in sync

## Step 6 — Latency Polish & QoL
- [ ] Measure end-to-end latency: mic-stop → first avatar audio (target ≤1.5s)
- [ ] If LLM bottleneck: reduce context window (8192→4096) or switch to 3–4B model
- [ ] Add session conversation history (in-memory list, last N turns only, cap at ~10)
- [ ] Optional: save session transcript to local SQLite on close
- [ ] Optional: Silero VAD auto-turn-detection (replaces push-to-talk button)
- [ ] Clean up UI — minimal, calm visual design

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
