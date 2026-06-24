# Private Companion

A fully local, offline AI voice companion with a lip-syncing avatar. Speak (or
type), and it replies with streamed speech and an animated face — no data leaves
your machine. Built for an Apple Silicon Mac (M3, 16 GB).

## Pipeline

```
mic → Whisper (STT) → llama3.1 8B via Ollama (LLM) → Piper (TTS) → Web Audio + canvas avatar
```

Everything runs locally: Ollama serves the LLM, faster-whisper does
speech-to-text on CPU, Piper synthesizes speech on CPU, and a single FastAPI
process serves both the API and the web UI.

## Prerequisites

- **macOS** on Apple Silicon (tested on M3 / 16 GB)
- **Python 3.11+**
- **[Ollama](https://ollama.com)** with the model pulled:
  ```sh
  ollama pull llama3.1:8b-instruct-q4_K_M
  ```
- **Piper voice models** in `models/piper/` (one per persona):
  - `en_US-lessac-medium` — Friendly
  - `en_US-ryan-high` — Professional
  - `en_US-amy-medium` — Playful

  Download `.onnx` + `.onnx.json` for each from
  [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US).
- The Whisper `small` model downloads automatically on first use (cached by
  faster-whisper). **Run once while online** so it's cached for offline use.

## Setup

```sh
pip install -r backend/requirements.txt
```

## Run

```sh
./run.sh
```

This checks that Ollama is up, then launches the app. Open
**http://localhost:8000** in Chrome (mic access requires `http://localhost`, not
`file://`).

To start manually:
```sh
cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

## Using it

- **Type** in the box, or click the **mic** to push-to-talk, or the **circle**
  button to auto-listen (voice activity detection).
- **Persona pills** (Friendly / Professional / Playful) switch the voice, avatar
  colors, and conversational tone. Switching clears the current conversation.
- After a couple of spoken turns, the app may **suggest a persona** that matches
  your speaking style — accept or dismiss the chip.
- The **🧠 button** shows what the companion remembers about you (stored
  encrypted on disk) and lets you forget everything.
- If a message signals serious distress, a **crisis-resources card** appears and
  the reply tone shifts to supportive.

## Validation

With Ollama and the app running:
```sh
python3 backend/validate.py
```
Checks latency (≤1.5 s avg first-audio), stability (10 consecutive turns),
and memory (<11 GB). The offline gate below is manual.

### Offline test (the last MVP gate)

The app makes no external network calls — it only talks to local Ollama and
serves local files. To confirm:
1. Make sure you've run online once so the Whisper model is cached.
2. Start Ollama and the app.
3. Turn on **airplane mode** (or disable Wi-Fi/Ethernet).
4. Reload **http://localhost:8000** and have a full spoken conversation.

Everything should work with no network.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness check |
| WS | `/ws/chat` | Full voice loop: tokens + WAV audio chunks |
| POST | `/stt` | Audio upload → transcript (+ persona suggestion) |
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
- Nothing is sent off-device.
