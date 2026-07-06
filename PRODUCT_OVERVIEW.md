# Poppys — Product Overview

*A shareable brief for content, marketing & distribution. Everything here describes what the product is, who it's for, what makes it different, and how it works — written so it can be turned into landing copy, ads, social posts, decks, and press.*

---

## 1. The one-liner

**Poppys — your bloom companion.**

A calm, private AI companion for daily check-ins, gentle reminders, voice notes, and small moments of emotional steadiness. It talks with you in a natural voice, shows a warm on-screen presence, remembers what matters to you — and it runs **entirely on your own device**. Nothing you say ever leaves your machine.

**Elevator pitch (30 sec):**
> Most AI assistants send everything you say to the cloud. Poppys doesn't. It's a voice companion that lives entirely on your computer — you speak, it listens, thinks, and answers out loud with a friendly face, all offline. It adapts to how *you* talk, remembers what matters to you (encrypted, on your device), and is built for calm daily check-ins rather than productivity pressure. Private by design, present when you need it.

---

## 2. The problem we're solving

- **AI is powerful but not private.** Every mainstream voice assistant (Siri, Alexa, ChatGPT voice, Gemini) streams your voice and conversations to company servers. For something as personal as daily emotional check-ins, that's a hard sell.
- **People want a companion, not a tool.** There's real, growing demand for gentle, emotionally-aware AI — for reflection, routine, loneliness, steadiness — but the market is dominated by either clinical apps or engagement-maximizing chatbots.
- **"Private AI" usually means "no AI."** Truly local AI has historically been slow, clunky, and technical. Poppys proves you can have a fast, natural, real-time voice companion that never touches the internet.

**Poppys' answer:** a genuinely private, genuinely warm companion that feels real-time and needs no account, no subscription server, and no data sharing.

---

## 3. Who it's for

- **Privacy-conscious individuals** who won't put personal conversations on a corporate cloud.
- **People wanting daily emotional steadiness** — check-ins, journaling by voice, gentle nudges, a calm presence.
- **Neurodivergent / routine-driven users** who benefit from soft reminders (water, walks, medicine, calls, journaling).
- **Mac owners with Apple Silicon** (M-series) — the first target platform, where the app runs fast and fully local.
- **The "quantified self" / local-AI enthusiast crowd** who value owning their own AI stack.

---

## 4. What it does — core features

### Voice-first conversation
- **Talk or type.** Speak naturally with push-to-talk, or hands-free auto-listen (voice-activity detection). You can also just type.
- **Real-time feel.** Replies stream out phrase-by-phrase, so it starts speaking within about **one second** — no awkward "thinking" pause.
- **Barge-in.** Start talking mid-reply and it stops and listens, like a real conversation.

### An on-screen presence
- A warm character/face gives Poppys a **presence**, not just a chat box — idle when listening, animated when speaking. The interface uses voice, expression, color, and motion so check-ins feel light, not clinical.

### It adapts to *you* — all from your voice, offline
- **Accent-aware** — it hears your accent (British / American / Indian) and replies in a matching voice.
- **Voice-matched** — it estimates a matching voice so the reply feels natural to you.
- **Emotion-aware** — it senses happy / sad / angry / neutral in your voice and shades its tone to match.
- **Persona suggestion** — after a few turns it may gently suggest the personality that fits your style.

### Companion modes (tone control)
Pick the presence you need right now:
- **Calm** — slow support, softer replies, fewer prompts.
- **Bright** — lighter language, quicker nudges, more momentum.
- **Deep** — reflective questions, room for heavier thoughts.

Plus conversational **personas** — *Friendly, Professional, Playful* — that change tone and accent color.

### Memory that stays close (and private)
- **Encrypted long-term memory.** It remembers useful context — routines, preferences, small promises, the tone you like — stored **encrypted on your device**.
- **Visible controls.** A one-tap view of everything it remembers, and a one-tap "forget everything."
- **Full history.** Every conversation is saved locally and can be exported.

### Gentle care built in
- **Kind nudges** — soft reminders for water, walks, medicine, calls, journaling.
- **Crisis signposting** — if a message signals serious distress, it surfaces support resources and shifts to a supportive tone. (A care feature, not a medical device.)

---

## 5. The headline differentiator: **100% local & private**

This is the whole story, and the marketing spine:

- **Nothing leaves your device.** No cloud, no servers, no accounts, no telemetry.
- **Works fully offline.** After a one-time setup download, you can put the machine in airplane mode and have a complete spoken conversation.
- **Encrypted at rest.** Personal memory is encrypted on disk with a private key that stays on your machine.
- **No public profile, muted by default, clear delete controls.** Consent-first, calm defaults, visible controls.

> **Positioning line:** *"The companion that's actually private — because it never leaves your computer."*

---

## 6. How it works (plain-English tech)

Poppys chains four AI systems into one smooth loop, all running locally:

```
You speak → it transcribes → understands & replies → speaks back → face reacts
   🎙️            (STT)            (local LLM)            (TTS)        (avatar)
```

1. **Listen** — your microphone audio is transcribed to text on-device (OpenAI Whisper, accelerated on Apple's GPU).
2. **Understand** — a local large language model (via Ollama) generates the reply, streaming word-by-word. No cloud model.
3. **Speak** — a local text-to-speech engine (Kokoro) voices each phrase as it's generated, in your detected accent/voice.
4. **Present** — the on-screen character reacts and "talks" while the voice plays.

At the same time, small on-device classifiers read accent, voice, and emotion from your speech to personalize the response.

**Why it feels fast:** instead of waiting for the whole answer, Poppys speaks the first phrase while it's still thinking of the rest — perceived response time is around a second.

**Under the hood (for technical audiences):**
- Runs as a single local app; the AI pipeline is orchestrated by a Python backend and rendered in a native window.
- Optimized for Apple Silicon (M-series) Macs — GPU-accelerated speech, hot-loaded model for instant responses.
- No external network calls at runtime — verifiable by running it in airplane mode.

---

## 7. Platform & requirements (today)

- **Platform:** macOS on Apple Silicon (M1–M4), designed and tuned on an M3 with 16 GB RAM.
- **Fully offline** after a one-time model download.
- **Being packaged** as a double-click desktop app (no terminal, no setup) — see roadmap.

---

## 8. Status & roadmap (so content matches reality)

**Working today (the product is real and runs end-to-end):**
- Full local voice loop — listen → understand → speak → animated presence.
- Accent / voice / emotion adaptation; personas & tone modes.
- Encrypted memory with user controls; conversation history & export.
- Fast, streaming, offline. Optimized for Apple Silicon.

**In progress / near-term:**
- One-click, signed & notarized Mac **.app** (double-click install, no technical setup).
- Guided first-run setup with download progress.
- Adapting model size to the user's RAM automatically.

**Future direction (aspirational — don't promise as shipping):**
- More companion characters and voices.
- Broader hardware / platform support.
- Deeper wellbeing routines and reminders.

> **Content guidance:** describe the local voice companion, privacy, adaptation, and modes as *real, working* today. Describe polished installer, extra characters, and other platforms as *coming* — don't advertise them as available.

---

## 9. Brand & voice

- **Name:** Poppys
- **Tagline:** *your bloom companion*
- **Metaphor:** the poppy / blooming — growth, gentleness, small daily care. The mark "blooms" on interaction.
- **Tone of voice:** warm, soft, calm, human. Never clinical, never hype, never pushy. It "listens first, remembers softly, and responds with care."
- **Visual mood:** natural and organic — cream, poppy-red, leaf-green, sky-blue against a soft night background. Rounded, tactile, editorial layout; a clay-style companion character.
- **Feel:** *"Not a dashboard. Not a chatbot box. A small presence that meets you where you are."*

**Key phrases to reuse in copy:**
- "A face when you need presence. A voice when you need words. A memory that stays close."
- "Listens first, remembers softly, responds with care."
- "Private by design."
- "Start small: one honest sentence, one kind response, one next step."

---

## 10. Marketing angles & content hooks

Ready-made directions for promo, ads, and social:

1. **Privacy-first AI** — "Your AI conversations should be yours. Poppys never sends a word to the cloud." (Ride the growing distrust of big-tech data practices.)
2. **Offline demo** — a short video: put the Mac in airplane mode, have a full spoken conversation. Visually proves the claim; very shareable.
3. **Emotional wellbeing, not productivity** — position against hustle-culture AI. "A companion for how you feel, not just what you have to do."
4. **It sounds like you** — show it adapting to different accents/voices. Novel, demo-friendly, personal.
5. **Own your AI** — for the local-AI / self-hosting crowd: no subscription server, no account, it's *your* companion running on *your* machine.
6. **Calm-tech aesthetic** — lean into the gentle brand: soft, blooming, human. Stands out in a sea of neon-cyber AI branding.
7. **The "one honest sentence" ritual** — daily check-in framing as a habit / self-care micro-ritual.

**Suggested content formats:** short offline-proof demo clips, accent-adaptation demos, "a day with Poppys" routine reels, privacy-explainer carousels, founder/behind-the-scenes on why local matters, calm-tech aesthetic stills of the character.

---

## 11. Positioning at a glance

| | Big-tech voice AI (Siri, Alexa, ChatGPT voice) | Companion chat apps | **Poppys** |
|---|---|---|---|
| Runs locally / offline | ❌ | ❌ | ✅ |
| Data stays on device | ❌ | ❌ | ✅ |
| Real-time voice + presence | ✅ | partial | ✅ |
| Adapts to your voice/accent/emotion | ❌ | rare | ✅ |
| Emotional-steadiness focus | ❌ | ✅ | ✅ |
| No account / no subscription server | ❌ | ❌ | ✅ |

**In one sentence:** *Poppys is the private, offline voice companion — the warmth of a companion app with the privacy of software that never touches the internet.*

---

## 12. Important honesty notes (please keep in any external content)

- Poppys is a **wellbeing companion, not a medical or therapy product**. It can signpost crisis resources but is not a substitute for professional care. Avoid clinical or treatment claims.
- Keep privacy claims accurate: **"runs locally and makes no external network calls at runtime; data stays on your device."** That's the defensible, true version.
- Current platform is **Apple Silicon Mac**; the polished one-click installer and additional platforms are **in progress**, not yet shipped.

---

*Questions or want a shorter/press version, a pitch deck outline, or ad-copy variants pulled from this? Happy to generate them from this same source.*
