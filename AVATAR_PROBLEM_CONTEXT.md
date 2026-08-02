# Poppy — Avatar Problem: Context & Research Brief

*A self-contained brief for researching the one open problem in our product: the
talking avatar. Everything else (speech-to-text, the LLM, text-to-speech / voice) is
built and works. Written for people/agents with no prior context.*

---

## 1. What we are building

**Poppy** is an AI voice **companion** — you pick a character and have a real-time
voice **call** with them: they speak first, listen, answer out loud in their own
voice, remember you (with consent), and feel like someone who's glad you called. It
runs as a desktop app today (web frontend + local Python backend), mobile later.

There are **6 characters** (3 female, 3 male), each with a name, personality, a
distinct voice, and a portrait. The user chooses one and that becomes their companion.

The per-reply pipeline:
```
mic → speech-to-text → LLM (personality + memory) → text reply
     → text-to-speech (that character's voice) → AUDIO
     → [AVATAR: that character's face, lip-synced to the audio] → what the user sees/hears
```

## 2. What is already solved (and is easily swappable)

These are done and **model-agnostic** — each sits behind a dispatcher/flag, so
swapping the underlying model is a config change, not a rewrite:

- **Speech-to-text (STT):** Whisper (local). Swappable.
- **LLM / brain:** Llama 3.2 locally (Ollama / MLX / llama.cpp), pluggable via a
  backend flag. Could point at any model/API (e.g. a hosted Llama, Kimi, etc.) trivially.
- **Text-to-speech (TTS) / voice:** pluggable `TTS_BACKEND` dispatcher already supports
  Kokoro (fast/local), Chatterbox (realistic voice-clone), and a "cloud" backend that
  calls our own GPU server. Adding another engine (e.g. a cloud TTS) is a drop-in module.
  Per-character voices work by pointing each character at a ~10s reference clip.

**Bottom line: voice and everything upstream of the face is finished and flexible.**
We can change any of these models with minimal effort.

## 3. The problem: the avatar

We need a **realistic talking face** for each character that:

1. **Looks like the character the user picked** — the face on screen must be the *same*
   identity as the portrait they chose (no "pick a human, talk to a cartoon" mismatch).
2. **Lip-syncs to arbitrary generated audio** — the TTS output is dynamic every reply,
   so the mouth must match whatever the voice says.
3. **Feels alive** — ideally some natural head motion / expression, not a frozen face
   with only a moving mouth.
4. **Is fast enough** — at minimum **turn-based** (a few seconds to render a reply clip);
   ideally **real-time / streaming** for a live call feel.
5. **Runs on a GPU we control** (a single mid-tier cloud GPU, e.g. NVIDIA T4 / A10G),
   not an expensive per-minute third-party SaaS. Open-source preferred.
6. **Scales to 6 characters** — one identity asset (image or rig) per character.

### Why this is genuinely hard for us
- Our current **character art is painterly/illustrated** (stylized portraits), not
  photographs. Most realistic 2D "talking head" models are trained on **real human
  faces** and their face detectors can fail or look wrong on illustrations.
- A **single still image** driven by lip-sync gives a **static head, mouth-only** motion
  — which reads as stiff/uncanny.
- **Real-time** talking-head generation is compute-heavy; quality vs latency vs cost is a
  real trade-off on a single GPU.
- **Consistency**: the animated face must stay stable (no flicker/identity drift) across a
  whole reply.

### What we've already ruled in/out (learnings, not conclusions)
- **3D avatar (our original approach: a rigged 3D head lip-synced in the browser)** —
  works and is fast, but reviewers felt it looked like a **cartoon / not the human you
  picked** ("bait-and-switch"). This is the core complaint we're trying to fix.
- **2D neural lip-sync on a still image** — can produce a realistic talking face *from a
  photo*, but (a) struggles on our painterly art, (b) static-head stiffness, (c) free
  hosted demos run on CPU and are very slow (minutes per clip); a real GPU is far faster
  but self-hosting has a heavy/fragile dependency stack.
- **3D game engines (Unreal MetaHuman / Blender)** — highest-effort path; MetaHuman is the
  strongest real-time 3D digital human but is AAA-level to build (rig + audio-to-face +
  pixel-streaming) and still reads as CG, not a real person. Blender is an offline
  renderer, not a live avatar engine.

## 4. The real decision underneath the problem

The avatar approach forks on **two axes** that need to be decided first, because they
determine which tools even apply:

- **Art style:** photoreal faces vs stylized/illustrated faces.
  - Photoreal → unlocks 2D neural talking-head models (they need real faces).
  - Illustrated → needs rigged 2D (Live2D/VTuber-style) or 3D, since neural face models
    don't handle illustrations well.
- **Latency target:** turn-based (render a clip per reply) vs real-time streaming (live
  call).

Our product goal is "a **realistic human** you call," which points toward **photoreal +
2D neural**, but that means changing our character art from painterly to photographic.
That's the key open question to validate.

## 5. Candidate solution directions (to research — no single favorite)

Research should compare these on: realism, handles-our-art (or requires photoreal),
head motion, latency on one GPU, quality, licensing/cost, integration effort.

1. **Photoreal portrait + 2D neural talking-head.** A family of open-source models that
   animate a single face image (or a short base video) from audio. Examples to evaluate:
   **SadTalker, LivePortrait, Sonic, Hallo/Hallo2, EMO-style, Wav2Lip (older), MuseTalk**
   (image/video lip-sync). Trade-offs differ: some add head motion from a still image,
   some only move the mouth, some need a driving video. Requires **photoreal** character
   portraits.
2. **Base idle-video + lip-sync (hybrid).** Pre-render a few seconds of subtle head
   motion per character *once*, then lip-sync that video per reply. Fixes the "static
   head" stiffness while keeping per-reply cost low. Works with several of the models above.
3. **Rigged 2D (Live2D / VTuber-style).** Keep stylized/illustrated characters, drive
   mouth shapes + blinks + head sway from audio visemes. Charming, cheap, real-time — but
   stylized, not a "real human."
4. **3D digital human (Unreal MetaHuman + audio-to-face, e.g. NVIDIA Audio2Face).** Highest
   fidelity real-time 3D, but heavy to build and still CG-looking; needs pixel-streaming to
   the app.
5. **Commercial real-time avatar APIs** (HeyGen, Tavus, Simli, D-ID, etc.). Fast and
   turnkey, "bring your own voice," but paid per-minute SaaS (against our cost/control
   preference) — useful as a quality benchmark or fallback.

Also worth researching: best approach for **generating consistent photoreal portraits**
for each of the 6 characters if we go the photoreal route (character-consistent image
generation), and whether a **real-time streaming** talking-head is realistically
achievable on a single T4/A10G or needs a bigger GPU.

## 6. Constraints & integration notes (so proposals fit our app)

- **Input contract the avatar must accept:** a character identity asset (image / rig /
  model) + an audio clip (arbitrary TTS output, any length) → output a talking-face
  **video** (turn-based) or a **WebRTC stream** (real-time).
- **Deployment:** a single cloud GPU we control (currently targeting an NVIDIA T4/A10G;
  self-hosted, open-source preferred; no expensive per-minute SaaS for the core path).
- **App shape:** desktop (web frontend + local FastAPI backend). We already built a
  pluggable avatar path: a flag selects the avatar backend, and the app can consume either
  a 3D in-browser avatar (offline fallback) or a per-reply video clip from a GPU server.
  A real-time streaming mode would be an added path.
- **Per-character:** the solution must scale to 6 identities (and be easy to add more).
- **Offline fallback:** if the GPU/avatar is unavailable, the app should still work (voice
  only / lightweight avatar).

## 7. The question we want answered

> **What is the best way to give each character a realistic, lip-synced, ideally
> real-time talking face — deciding photoreal-2D vs illustrated-rig vs 3D — that runs on
> a single mid-tier GPU we control, and works with our dynamic per-reply TTS audio?**

Deliverables that would help: a recommended direction with justification, the specific
model(s) to use, realistic latency/quality expectations on one GPU, whether we must
switch to photoreal art, and the rough integration effort.

---

### Appendix: not the problem
- **AWS GPU quota** is a temporary procurement blocker (approval pending); it does not
  change the technical decision. Any single NVIDIA GPU (AWS, RunPod, Lambda, etc.) works
  for evaluating these options.
- **Voice / STT / LLM** are solved and swappable — please don't spend research effort
  there.
