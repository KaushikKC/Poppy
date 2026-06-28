# Private Companion

A fully local, offline AI voice companion with a full-page video avatar. Speak
(or type) and it replies with streamed speech and a real, on-screen person — no
data ever leaves your machine. Built for an Apple Silicon Mac (M3, 16 GB).

## Pipeline

```
mic ─▶ Whisper (STT) ─┬─▶ accent + gender + emotion detection
                      │        (wav2vec2 classifiers + pitch)
                      └─▶ llama3.1 8B via Ollama (LLM) ─▶ Kokoro (TTS) ─▶ Web Audio
                                                                            │
                                            full-page video avatar  ◀───────┘
                                            (idle ⇆ talking, crossfaded)
```

Everything runs locally: Ollama serves the LLM, faster-whisper does
speech-to-text, Kokoro synthesizes speech in the speaker's detected accent and
gender, small classifiers read accent/gender/emotion from the voice, and a single
FastAPI process serves both the API and the web UI. Replies stream out
phrase-by-phrase so the first audio plays in ~1 s.

## Features

**Voice loop**
- **Speech-to-text** — faster-whisper (`small`), CPU-side to avoid GPU contention.
- **Local LLM** — `llama3.1:8b-instruct-q4_K_M` via Ollama, streamed token-by-token.
- **Streaming TTS** — Kokoro synthesizes each phrase as the LLM generates it, so
  the avatar starts speaking before the full reply is ready.
- **Push-to-talk** (mic button) **or auto-listen** (voice-activity detection).
- **Barge-in** — start talking (or click the mic) mid-reply and it cuts the
  current answer off and listens.

**Adapts to you (all from your voice, offline)**
- **Accent detection** — British / American / Indian → the reply is spoken in a
  matching voice. Sticky across the session.
- **Gender detection** — pitch-based male/female estimate → matching Kokoro voice.
- **Emotion detection** — happy / sad / angry / neutral shades the reply's tone.
- **Persona suggestion** — after a few spoken turns it may suggest the persona
  that fits your speaking style (accept or dismiss the chip).
- All three (accent / gender / emotion) appear as header badges.

**Personas**
- **Friendly / Professional / Playful** pills change the conversational tone and
  accent color. Switching clears the current conversation. (The reply *voice* is
  chosen by your detected accent + gender, not the persona.)

**Avatar (full-page video presence)**
- A real rendered person fills the screen: an **idle** loop plays while listening
  or thinking and **crossfades to a talking** loop while the voice plays.
- Falls back to a static poster until you add the clips — see
  [`frontend/avatar/README.md`](frontend/avatar/README.md) for how to generate
  them (Veo / Google Vids prompts and seamless-loop tips).

**Memory, safety & history**
- **Encrypted long-term memory** — facts about you are stored encrypted at rest
  (Fernet). The **🧠 button** shows what's remembered and can forget everything.
- **Crisis signposting** — if a message signals serious distress, a
  crisis-resources card appears and the reply tone shifts to supportive.
- **Session history** — every conversation is saved to SQLite and can be exported
  as JSON + text.
- **Latency badge** — shows mic-stop → first-audio time for each turn.

## Prerequisites

- **macOS** on Apple Silicon (tested on M3 / 16 GB)
- **Python 3.11+**
- **[Ollama](https://ollama.com)** with the model pulled:
  ```sh
  ollama pull llama3.1:8b-instruct-q4_K_M
  ```
- **espeak-ng** (Kokoro's grapheme-to-phoneme backend):
  ```sh
  brew install espeak-ng
  ```

## Setup

```sh
pip install -r backend/requirements.txt
```

Then download the speech models **once while online** (Kokoro TTS, the accent and
emotion classifiers, and Whisper) so the app can run fully offline afterward:

```sh
python3 backend/download_models.py
```

This caches everything in your Hugging Face cache and is safe to re-run. `run.sh`
verifies they're present before starting (and then runs with no network access).

## Run

```sh
./run.sh
```

This checks that Ollama is up and the speech models are cached, then launches the
app with network access disabled (`HF_HUB_OFFLINE`). Open
**http://localhost:8000** in Chrome (mic access requires `http://localhost`, not
`file://`).

To start manually:
```sh
cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

## Add your avatar

The avatar is pre-rendered video you generate once (it never runs a model at
chat time). Put two looping clips of the same person/framing/background in
`frontend/avatar/`:

```
frontend/avatar/idle.mp4    # sitting, breathing, blinking, mouth closed
frontend/avatar/talk.mp4    # the same person speaking naturally
```

Full prompts, sizing, and loop tips are in
[`frontend/avatar/README.md`](frontend/avatar/README.md). Until they're added the
app shows the static `face.jpg` poster.

## Validation

With Ollama and the app running:
```sh
python3 backend/validate.py
```
Checks latency (≤1.5 s avg first-audio), stability (10 consecutive turns),
and memory (<11 GB). The offline gate below is manual.

### Offline test

The app makes no external network calls — it only talks to local Ollama and
serves local files. To confirm:
1. Run `python3 backend/download_models.py` once online so every model is cached
   (verify with `python3 backend/download_models.py --check`).
2. Start Ollama and the app.
3. Turn on **airplane mode** (or disable Wi-Fi/Ethernet).
4. Reload **http://localhost:8000** and have a full spoken conversation.

Everything should work with no network.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness check |
| WS | `/ws/chat` | Full voice loop: tokens + WAV audio chunks |
| POST | `/stt` | Audio upload → transcript + detected accent + gender + emotion (+ persona suggestion) |
| GET | `/personas` | List personas (name, description, colors) |
| GET | `/memory` | Facts remembered about the user |
| DELETE | `/memory` | Forget all remembered facts |
| GET | `/sessions` | List saved conversation sessions |
| GET | `/export/{id}` | Export a session as JSON + text |
| DELETE | `/history` | Clear in-memory conversation + accent state |

## Data & privacy

- Conversations are saved to `companion.db` (SQLite, gitignored).
- Long-term memory is **encrypted at rest** with Fernet in
  `companion_memory.enc`; the key is in `companion.key` (chmod 600, gitignored).
- Your avatar poster/clips (`face.jpg`, `idle/talk.mp4`) are gitignored (private).
- Nothing is sent off-device.
