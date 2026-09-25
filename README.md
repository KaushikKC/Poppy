# Poppys

A private AI voice companion that runs entirely on your own device. Speak or
type, and it answers out loud in about a second. Nothing you say leaves the
machine: no account needed to talk, no server, no cloud model.

Ships as a macOS app, an iOS app, and an Android app, from one Python backend
and one shared web UI.

## Pipeline

```
mic ─▶ Whisper (STT) ─┬─▶ accent + gender + emotion detection
                      │
                      └─▶ local LLM ─▶ Kokoro (TTS) ─▶ audio out
                                              │
                          audio-reactive orb  ◀┘
```

Every stage is local. The LLM streams tokens, and the voice starts speaking the
first clause while the rest is still generating, which is what keeps time to
first audio near a second.

The engines differ per platform, deliberately: MLX (Metal) on Apple Silicon,
llama.cpp/GGUF and sherpa-onnx on phones, Ollama for desktop development. Swap
with `LLM_BACKEND` and `TTS_BACKEND`. See `CROSS_PLATFORM_PLAN.md`.

## What it does

**The conversation**
- Push-to-talk or hands-free auto-listen (voice-activity detection), or type.
- Barge-in: start talking mid-reply and it stops and listens.
- Replies stream phrase-by-phrase so speech begins before the reply is finished.
- Short replies arrive as text; ones worth hearing are spoken (`reply_shape.py`).

**It adapts from your voice, offline**
- Accent (British / American / Indian), gender, and emotion are read from the
  audio by small local classifiers, and shade the voice and tone of the reply.

**Who she is**
- **Characters** — a cast with their own name, voice, look, and personality,
  plus custom characters you write yourself.
- **Vibes** — a stance for right now: a friend who listens, a hype voice, a calm
  one.
- **Traits** — the layer underneath, which persists across every vibe.
- **Boundaries** — subjects she should never raise, and ones to always ask about.

**The daily loop**
- **Open loops** — she leaves an unresolved thread at the end of a call, and
  picks it up at the start of the next one.
- **Rituals** — a standing time to talk, reminded by a real OS notification.
- **Streaks, daily quests, and a daily goal** — the reason to open it today.
- **Bloom Points and levels** — all of the counting lives here, on purpose, and
  none of it is attached to the relationship itself.
- **The garden** — the long game: meaningful calls grow something you arrange
  and label.
- **Nudges** — earned return triggers in her voice, tied to your own life.
- **Openers** — the first line is composed from the time of day, how long it has
  been, and the hook she left last time.

**Memory, safety, history**
- Facts about you are extracted, confirmed by you, and stored **encrypted at
  rest** (Fernet). You can suppress or delete any of them, or forget everything.
- Crisis signposting: a resources card when a message signals real distress.
  A separate switch from the content guardrails, and on by default.
- Every conversation is saved to SQLite and can be exported as JSON and text.

**Money**
- Free is the whole app. A one-time purchase removes the ads. No feature gates,
  no call limits. See `POPPY_RELEASE_PLAN.md`.

## Build switches

Three separate switches, because they are three different decisions:

| Variable | Default | What it does |
|---|---|---|
| `POPPY_ADULT` | `1` | Lifts the brevity and content restraint in the prompt |
| `POPPY_GUARDRAILS` | `0` | Adds the safety addendum (App Store builds set this) |
| `POPPY_CRISIS_LAYER` | `1` | Crisis and distress handling. Independent of the above |

Set them in `.env` (see `.env.example`). A real environment variable always wins
over the file, so a release script can never be overridden by a stale `.env`.

## Running the desktop app

**Prerequisites:** macOS on Apple Silicon, Python 3.11+, `brew install espeak-ng`
(Kokoro's phonemizer), and [Ollama](https://ollama.com) unless you run
`LLM_BACKEND=mlx`.

```sh
pip install -r backend/requirements.txt
python3 backend/download_models.py    # once, online: caches every model
./run.sh                               # then open http://localhost:8000
```

`run.sh` checks the models are cached and runs with network access disabled
(`HF_HUB_OFFLINE`). Chrome needs `http://localhost`, not `file://`, for the mic.

The model is chosen by how much RAM the machine has (`model_tier.py`): 1B, 3B, or
8B. Override with `OLLAMA_MODEL`, `MLX_LM_MODEL`, or `LLAMACPP_MODEL_REPO`.

## Layout

| Path | What lives there |
|---|---|
| `backend/` | FastAPI app: the API, the voice loop, and every product module |
| `frontend/` | The web UI, served by the backend and reused by both phone apps |
| `mobile/` | React Native app (iOS + Android), wrapping the UI in a WebView |
| `desktop/` | macOS and Windows packaging, signing, and notarization |
| `poppys-app/` | The design system: `src/styles/tokens.css` is the source of truth |
| `training/` | Fine-tuning the small on-device model |
| `landing-page/`, `poppy-website/` | The public site |

**A trap worth knowing:** `mobile/web-overlay/` shadows files in `frontend/`. A
change made only in `frontend/` will silently miss the phone builds.

## Endpoints

`GET /health` and about fifty others. The ones that matter:

| Method | Path | Purpose |
|---|---|---|
| WS | `/ws/chat` | The voice loop: streamed tokens and audio |
| POST | `/stt` | Audio → transcript, accent, gender, emotion |
| GET | `/home` | Everything the home screen needs, in one call |
| POST | `/call/open`, `/call/close` | Call lifecycle: openers, loops, streaks, bloom |
| GET | `/characters`, `/personas` | The cast and the vibes |
| GET/POST | `/memory`, `/memory/extract`, `/memory/confirm` | Remembered facts |
| GET | `/garden`, `/streak`, `/quests`, `/bloom` | The daily loop |
| GET | `/entitlement` | Plan, and whether ads may be shown |

## Tests and validation

```sh
./tests/run_all.sh                 # every offline suite, no server needed
cd mobile && npm test              # shared TS core
python3 backend/validate.py        # latency, stability, memory, with the app running
```

### Offline check

The app makes no external calls at runtime. To prove it: cache the models
(`python3 backend/download_models.py --check`), start the app, turn on airplane
mode, and have a full spoken conversation.

## Data and privacy

- Conversations are in `companion.db` (SQLite, gitignored).
- Long-term memory is encrypted at rest per character
  (`companion_memory_*.enc`); the key is `companion.key`, chmod 600, gitignored.
- An account, when signed in, is a name and an email. Never a password.
- Nothing is sent off-device. `PRIVACY_POLICY.md` is the public version.

## The plans

The `.md` files in the root are the working documents, and most of the reasoning
lives there rather than here. Start with `PRODUCT_OVERVIEW.md` for what the
product is, `POPPY_PRODUCT_PLAYBOOK.md` and `POPPY_RETENTION_ENGINE.md` for why
the daily loop is shaped this way, and `POPPY_RELEASE_PLAN.md` for shipping.
