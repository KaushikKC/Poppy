# Chat-first Poppy — the plan

The product stops being a call you join and becomes a conversation you keep. A call
is synchronous, and synchronous is exactly what this hardware is worst at: measured on
device, Kokoro renders about six seconds of audio in ten, so anything that tries to
speak *while* thinking falls further behind with every sentence. A message thread has
no such promise to break. It is allowed to take four seconds, the same way a person
taking a voice note is allowed to take four seconds.

Everything below is ordered so each phase is testable on its own.

---

## Phase 0 — make the website the test bench

**Why first:** the phone loop is Xcode → clean → archive → install, several minutes per
try. The web loop is a browser refresh. Every phase after this is faster if this one
is done.

`frontend/` is already shared: the iOS build copies it into the bundle verbatim (the
"Copy Poppys web UI" build phase). **UI work is done once and lands on both.**

The problem is underneath. The core logic exists **twice**:

| | desktop | mobile |
|---|---|---|
| turn loop | `backend/ws_handler.py` | `mobile/src/core/socket.ts` + `turn.ts` |
| profile | `backend/companion.py` | `mobile/src/core/companion.ts` |

And they have already drifted. The voice-note work landed on mobile only, so
`frontend/chat.js` now handles `recording` and `voice` frames that `ws_handler.py`
never sends. **On the website today, voice mode silently does nothing.**

**Work:** port the modality protocol into `ws_handler.py` — the `recording` frame
before generation, whole-reply synthesis, the `voice` frame carrying `durationMs`.
Roughly a 40-line mirror of what `turn.ts` already does.

**Done when:** `./run.sh`, open `localhost:8000`, speak, and get a voice note back with
a real duration.

**Standing rule from here on:** every core change is written twice, in the same commit.
The drift above is what happens otherwise.

---

## Phase 1 — chat is the front door

Home's **Call** button becomes **Chat**, and the thing it opens is a message thread
rather than a call screen.

**Work:**
- `frontend/index.html` — the `#home-call` label, and `.call-stage` / `.call-rail`
  become a single-column thread.
- `frontend/style.css` — `body[data-view="call"]` currently splits the screen between
  a stage and a 32vw rail. The thread takes the screen; the orb becomes a small
  presence in the header rather than the hero.
- `mobile/src/bridge/shim.ts` — the mobile overrides that cap `.call-rail` at 38vh and
  push `#avatar3d` up all exist to keep the orb visible above a small transcript. Most
  of them stop being needed and should be deleted, not adjusted.

**Watch for:** the dock (Talk / Auto / End / Memory) is a call's vocabulary. In a chat
it is a mic button and a text field. "End" becomes "Back".

**Done when:** the app opens into a thread that reads as a conversation with history,
not a call in progress.

---

## Phase 2 — the reply answers in kind

Delete the voice/text preference added on the home screen. The modality is not a
setting; it is decided per message by **how the message was sent**.

- spoke it → she replies with a voice note
- typed it → she replies in text

**Work:**
- `frontend/chat.js` — `window.sendMessage(text)` is called from two places: the mic
  path (`web-overlay/mic.js`, `mic.js`) and the form submit. Add the origin as an
  argument, and put it on the chat frame: `{type:"chat", text, spoken:true|false}`.
- `socket.ts` / `ws_handler.py` — read `spoken` and set the delivery for that turn.
  Replaces `profile.reply_mode`.
- `mobile/src/core/companion.ts` — drop `reply_mode` and its route.
- `frontend/flow.js`, `index.html`, `style.css` — remove `#reply-mode`.

**Why this is better than the toggle:** it needs no explanation and no decision. It is
also the honest mapping — someone typing on a bus does not want a voice note, and the
app already knows they typed.

**Done when:** the same conversation can carry both, and neither was chosen in a menu.

---

## Phase 3 — routing: when voice is worth waiting for

Phase 2's mirror is the default. This is the refinement: a spoken "hi how are you"
does not need a four-second recording. A real question does.

**Rule:** spoken input replies with voice **unless** the reply is trivially short —
under ~60 characters, or a greeting or acknowledgement. Those come back as text
immediately.

**Work:** one deterministic function next to the chunker. Not another model pass —
this runs on every turn and the model is the thing on the critical path. Follow
`quests.ts`'s `detectGoodThing`: a regex and a length check, tested in plain node.

The decision needs the **finished reply**, which voice mode already has before it
synthesises anything, so this costs nothing extra.

**Tune with real numbers:** at 46ms of render per character, 60 chars is ~3.7s and 150
chars is ~7.8s. The threshold is a latency budget, not a taste call.

**Done when:** short exchanges feel instant and substantial ones arrive as voice.

---

## Phase 4 — the call becomes a future option

The synchronous call keeps its code and loses its entry point. `runTurn` already
carries the phrase-chunking history in git; `PhraseChunker` still exists.

Bring it back when either number changes: synthesis above 1.0× realtime, or a
streaming TTS path that starts playing a phrase before it is fully rendered
(`react-native-sherpa-onnx` exposes `createStreamingTTS`, unexplored).

Until then a "Call" button that stutters is worse than no call button.

---

## Phase 5 — the content question

You asked whether the guardrails can come off for an 18+ local model. Mostly yes, and
the honest answer has three parts.

### What is actually restricting output today

1. **`SAFETY_ADDENDUM`** (`mobile/src/core/prompts.ts`, `backend/config.py`) — appended
   to every persona, every turn. Includes "Do not give medical, legal, or crisis
   instructions."
2. **The persona prompt itself** (`personas.ts`) — "you never pretend to be a person,
   invent a life, or claim feelings you don't have." This is why she answers "I'm just
   a conversational AI" and breaks the illusion.
3. **Llama 3.2 1B's own training.** The big one. Meta's refusal behaviour is baked into
   the weights, not the prompt.
4. **`safety.ts`** — crisis and distress detection.

Items 1 and 2 are yours: delete or rewrite them, it takes minutes, and it is a
`gen_prompts.py` regeneration.

Item 3 is not promptable away. Prompts soften it; they do not remove it. The real fix
is a different GGUF — the "abliterated" and "uncensored" Llama 3.2 fine-tunes on
HuggingFace are drop-in, same size, same `llama.rn` loader, one URL change in
`model_tier.ts`. Worth measuring for quality: refusal-removal fine-tunes often cost
some coherence, which on a 1B is a real risk.

### What I would keep

**Item 4, the crisis layer.** Not because it is a guardrail, but because it is the one
code path where being wrong is unrecoverable. A companion app is exactly where someone
says something serious at 2am, and `safety.ts` is what puts a helpline in front of them
instead of a chat reply. It costs nothing in ordinary conversation — it only fires on
explicit self-harm phrasing.

You can drop everything else and keep this. They are independent.

### The constraint that affects your launch

**Apple prohibits overtly sexual or pornographic content outright** (Guideline 1.1.4).
This is not an age-rating question — a 17+ rating does not unlock it. Your 18+ gate is
necessary but not sufficient.

Practically:

- **App Store build** — has to stay within Apple's line, whatever your model can do.
- **Outside the App Store** — the web version and Android have no such restriction, and
  the desktop app ships via Developer ID, not review.

That may argue for the website being the permissive build and iOS being the tame one,
which is a strategy question, not an engineering one. Worth deciding before you write
prompts, because it determines whether you need one persona set or two.

My knowledge has a cutoff and Apple's guidelines move — check the current text before
committing to a plan that depends on it.

One category is absolute regardless of platform or model: sexual content involving
minors. Whatever else comes off, that stays.

---

## Order

1. **Phase 0** — website can do what the phone does *(unblocks everything)*
2. **Phase 1** — chat as the front door
3. **Phase 2** — reply answers in kind, toggle deleted
4. **Phase 5, items 1 and 2** — prompt-level constraints, cheap, testable in the browser
5. **Phase 3** — routing, tuned against real render times
6. **Phase 5, item 3** — the uncensored model, if 1 and 2 are not enough
7. **Phase 4** — hide the call

Phases 1-3 are the product. Phase 5 is a separate decision that can run in parallel
once Phase 0 lands.
