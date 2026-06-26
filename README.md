# Private Companion

A fully local, offline AI voice companion with a lip-syncing avatar. Speak (or
type), and it replies with streamed speech and an animated face — no data leaves
your machine. Built for an Apple Silicon Mac (M3, 16 GB).

## Pipeline

```
mic → Whisper (STT) ┬→ accent + emotion detection (wav2vec2)
                    └→ llama3.1 8B via Ollama (LLM) → Kokoro (TTS) → Web Audio + canvas avatar
```

Everything runs locally: Ollama serves the LLM, faster-whisper does
speech-to-text, Kokoro synthesizes speech in the speaker's detected accent, two
small wav2vec2 classifiers read accent and emotion from the voice, and a single
FastAPI process serves both the API and the web UI. The detected accent picks
the reply voice; emotion shapes its tone.

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

## Using it

- **Type** in the box, or click the **mic** to push-to-talk, or the **circle**
  button to auto-listen (voice activity detection).
- **Persona pills** (Friendly / Professional / Playful) switch the avatar colors
  and conversational tone. Switching clears the current conversation. (The reply
  *voice* is chosen by your detected accent, not the persona.)
- The companion **detects your accent** (British / American / Indian) from your
  voice and replies in a matching voice; the choice is sticky across the session.
  It also reads your **emotion** to shade the reply's tone. Both show as header
  badges.
- After a couple of spoken turns, the app may **suggest a persona** that matches
  your speaking style — accept or dismiss the chip.
- While the assistant is speaking you can **barge in**: click the mic or just
  start talking (auto-listen) and it cuts off the current reply.
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
| POST | `/stt` | Audio upload → transcript + detected accent + emotion (+ persona suggestion) |
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
