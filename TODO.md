# Private Companion — MVP Build Checklist

## Step 0 — Environment Setup ✅
- [x] Install Homebrew, Python 3.11+, Node.js 20+
- [x] Install Ollama (v0.30.8)
- [x] Pull LLM model: `llama3.1:8b-instruct-q4_K_M` (4.9 GB)
- [x] Install Python deps: fastapi 0.115, uvicorn 0.41, websockets 15, faster-whisper 1.2.1, piper-tts 1.4.2
- [x] Download Piper voice models → `models/piper/`: `en_US-lessac-medium` (Friendly), `en_US-ryan-high` (Professional), `en_US-amy-medium` (Playful)
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
Run `python3 backend/validate.py` while uvicorn + ollama are running.

- [ ] Full offline: airplane mode → reload http://localhost:8000 → still works (manual)
- [x] Memory check: `backend/validate.py` gate 3 — tracks ollama + uvicorn RSS < 11 GB
- [x] Latency: `backend/validate.py` gate 1 — measures first-audio latency ≤1500 ms avg (3 turns)
- [x] No crashes: `backend/validate.py` gate 2 — 10 consecutive WS exchanges, all must succeed

---

## Post-MVP Milestones (do NOT start until above is done)
- [x] **M1** — Persona selection: Friendly / Professional / Playful pills; avatar colors, system prompt, and voice switch per persona; history cleared on switch
- [x] **M2** — Accent detection: `backend/accent.py` streaming EMA classifier on STT transcript; suggests a persona via dismissible chip (offline, no extra model)
- [x] **M3** — Emotional-support framing: `backend/safety.py` crisis detection + signposting card; SAFETY/CRISIS prompt addenda; `backend/memory_store.py` Fernet-encrypted cross-session memory with view/forget panel
- [ ] **M4** — Realistic face (opt-in, capable machines only) — DEFERRED: a GAN talking-head (Wav2Lip/SadTalker) would break the <11 GB memory gate and add seconds of latency alongside the LLM+Whisper+Piper on a 16 GB M3. Revisit on more capable hardware.

---

## Vision Roadmap — "Adaptive identity companion"
Goal: the companion automatically mirrors how the user speaks — detect their
**accent** (British / American / Indian) and **gender** from voice, then reply in a
matching **voice**, swap to a matching **avatar** (accent + gender), and animate it
in real time. State should be sticky/gradual, not flip per turn.

### Already working (verified) ✅
- [x] Accent detection from voice — `backend/accent_detect.py` (wav2vec2 `dima806/english_accents_classification`), folded to american/british/indian via `accent.map_raw`, sticky majority vote (`ACCENT_HISTORY=5`, conf ≥ 0.40).
- [x] Reply spoken in the detected accent — `backend/tts.py` Kokoro, `accent.voice_for()` → (lang, voice): american=`af_heart`, british=`bf_emma`, indian=`hf_alpha`.
- [x] Emotion from voice (momentary) shapes reply tone — `backend/emotion_detect.py` + `emotion.tone_for`.
- [x] Accent/emotion badges in the header; accent sent with every message.
- [x] Barge-in / interruption (mic or auto-listen cuts off the reply).

### Gap 1 — Gender detection + gendered voice  ✅
- [x] Detect speaker gender from voice — `gender_detect.py` estimates median F0 by autocorrelation (offline, no model) and thresholds at 165 Hz; a `GenderTracker` makes it sticky (majority vote).
- [x] Added **male Kokoro voices** keyed on (accent, gender): american `am_michael`, british `bm_george`, indian `hm_omega` alongside the female voices.
- [x] `accent.py` voice map is now `VOICES[(accent, gender)]`; gender threads `/stt` → `window._gender` → chat message → `ws_handler` → `tts.synthesize_to_wav_bytes`. All 6 voices verified cached for offline.
- [x] `gender.py` labels + `GenderTracker` + config thresholds; header shows a gender badge.

### Gap 2 — Avatar reacts to accent + gender  ✅
- [x] `avatar.setIdentity(accent, gender)`: gender drives hair (long/back vs short crown), eyebrows (thicker male), and lips (fuller/tinted female); accent draws a flag badge (US/GB/IN). Persona colors remain the base layer.
- [x] `setAccent`/`setGender` call `avatar.setIdentity`; falls back to the neutral face until an identity is detected. (Chose tasteful procedural cues + flag over skin-tone mapping to avoid stereotyping.)

### Gap 3 — Realistic real-time avatar  🟡 (supersedes deferred M4) — DECISION: photoreal single-photo 2D puppet
Researched the field (Tavus Phoenix-4 = cloud Gaussian-diffusion on big GPUs; Wav2Lip/MuseTalk/SadTalker/LivePortrait = need an NVIDIA GPU for real-time → all out of scope for a 16 GB M3 alongside Llama+Whisper+Piper). Chosen tier: **photoreal 2D puppet from a single still portrait** — no GPU, no runtime ML, backend untouched.
- [x] `frontend/photo_avatar.js` — `PhotoAvatar` (drop-in for `Avatar`): draws a real portrait, animates a talking mouth via jaw-drop + composited mouth interior/teeth, blinks with a skin eyelid, idle breathing. Mouth width (round `O/U` vs wide `E/I`) from the audio spectrum (low/high band balance) — real viseme shaping, not just amplitude.
- [x] Graceful fallback: with no `frontend/avatar/face.jpg` it delegates to the cartoon `Avatar` (no regression). `chat.js` prefers `PhotoAvatar`; `index.html` loads it; assets serve at `/avatar/*`.
- [x] `frontend/avatar/config.json` (mouth/eye boxes, jawDrop, mouthScale, skin) + `?avatartune=1` calibration overlay + `frontend/avatar/README.md`. `face.jpg/png` gitignored (privacy).
- [ ] **User action**: drop a portrait at `frontend/avatar/face.jpg` and calibrate boxes via `?avatartune=1`.
- [ ] Optional max-fidelity: pre-render true viseme PNGs offline (LivePortrait/SadTalker on a GPU box) → add a `visemes/` crossfade mode. Not yet wired.

### Gap 4 — Coherent identity model + cleanup  ✅
- [x] Two things were both called "accent": split the text-register persona suggester into `persona_suggest.py` (`PersonaSuggester`); `accent.py` is now only the spoken-accent → voice map.
- [x] Remove dead code: `detect_accent()` (already gone; stale comments removed); Piper `voice_path` + dead `_ROOT`/`Path` import in `personas.py`.
- [x] Precedence documented in `accent.py`: the **detected accent**, not the persona, decides the reply voice; persona only shapes prompt + avatar colors.

### Gap 5 — Offline packaging & validation  🟡 (tooling done; manual gates remain)
- [x] Prefetch the models for true offline: `backend/download_models.py` downloads Kokoro-82M, `dima806/english_accents_classification`, `superb/wav2vec2-base-superb-er`, and Whisper, with `--check` to verify they're cached.
- [x] `run.sh` preflights the cache and runs with `HF_HUB_OFFLINE`/`TRANSFORMERS_OFFLINE` so the app makes no network calls at runtime.
- [x] `requirements.txt` now declares `transformers`/`torch`/`numpy`; `README` documents Kokoro + accent/emotion + the offline setup step.
- [ ] **(manual, run on the Mac)** Re-check the <11 GB memory gate with Kokoro + both wav2vec2 classifiers resident — run `backend/validate.py` *after* a spoken turn (accent/emotion load lazily on first `/stt`, so a text-only run won't have them resident).
- [ ] **(manual)** Close the last MVP gate: airplane-mode offline reload test (line 67) — now backed by `download_models.py --check` + offline run.sh.
