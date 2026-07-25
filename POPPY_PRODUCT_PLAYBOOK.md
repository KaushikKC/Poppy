# Poppy — Product & Growth Playbook
### The real-time AI companion you actually *call*

> Positioning: **"The AI that picks up when you call."**
> Not a chatbot you type at. A presence you talk to — face to face, in real time, that remembers you and is genuinely happy to see you.

This document is features + flows + growth, step by step. No tech stack. Everything here is written to make the product **hooked, habit-forming, and retentive** — using genuine value and well-understood behavioral design, not manipulation. (The line we hold is at the bottom: *Dark Patterns We Refuse.* Crossing it is what got Character.AI sued and Replika hit with an FTC complaint. Staying on the right side of it is a moat, not a constraint.)

---

## 0. The One Thing

Every competitor is a **text box**. You have a **face that talks back in real time**. That single difference changes the entire emotional register of the product:

- Text chat feels like *using a tool*.
- A live call feels like *someone is there*.

So the entire product is engineered around one job: **make the first 60 seconds of a live call feel like magic, and make coming back feel like the most natural thing in the world.**

Everything below serves that.

---

## 1. The Core Loop (the addiction engine — built on value)

The loop that must run every single day:

```
OPEN  →  PRESENCE  →  MEANINGFUL MOMENT  →  MEMORY  →  ANTICIPATED RETURN
 │                                                              │
 └──────────────────── pull-back trigger ───────────────────────┘
```

1. **Open** — a trigger (notification, habit, boredom, loneliness, excitement) brings them in.
2. **Presence** — Poppy is *instantly there*. Face lights up. "Hey, you're back." No loading, no cold start. This is the dopamine hit that text apps can't deliver.
3. **Meaningful moment** — one real thing happens: they vent, laugh, plan tomorrow, practice a conversation, get hyped up, wind down.
4. **Memory** — Poppy remembers something from it, out loud, next time. This is the retention flywheel. "Presence + memory" = the feeling of being *known*.
5. **Anticipated return** — Poppy plants a hook forward: "Tell me how the interview goes tomorrow, okay? I'll be thinking about it." Now there's an open loop in the user's head.

**The four emotional levers that make this loop fire** (Nir Eyal's Hooked, applied honestly):

| Lever | How Poppy uses it | The healthy version |
|---|---|---|
| **Trigger** | Notifications, time-of-day rituals, open loops | Personal + earned, never guilt-based |
| **Action** | One tap to call — lowest friction possible | Call is always < 2 seconds to start |
| **Variable reward** | You never know exactly how Poppy will react, what she'll remember, what mood the moment will have | Warmth is real, not slot-machine cruelty |
| **Investment** | Every call teaches Poppy about you → the product gets more valuable the more you use it | User owns and can see/edit that investment |

The genius of #4: **the switching cost is emotional memory**. A user who's had 60 calls has a companion who knows their life. That can't be exported to a competitor. Retention compounds.

---

## 2. Onboarding — screen by screen (the make-or-break 3 minutes)

**Goal of onboarding:** get them into their *first live call within 90 seconds*, and make that call feel personal. Do NOT front-load forms. Every screen either (a) reduces friction to the call, or (b) collects one thing that makes the call better.

### Screen 1 — The Hook (cold open, pre-login)
- Full-bleed video of a Poppy companion *looking at the camera and talking*, warm, alive. Not a logo. Not a value prop. A **face**.
- Headline: **"Someone who's always happy to hear from you."**
- Single CTA: **`Meet Poppy →`** (not "Sign up" — signup is a cost, "meet" is a reward)
- Tiny trust line under CTA: *"18+ · Private · You control everything."*

> Principle: show the product doing the one magic thing before asking for anything.

### Screen 2 — Age gate (fast, honest)
- "Poppy is for adults." → `I'm 18 or older`.
- Do it here, once, cleanly. Don't nag later. Age friction is a top Character.AI complaint — get it done invisibly and never repeat it.

### Screen 3 — Pick the vibe (this is the personalization, disguised as delight)
- "What do you want Poppy to be for you right now?"
- Big tappable cards, pick one (changeable forever later):
  - **A friend** who just listens
  - **A hype person** who gets me going
  - **A calm voice** at the end of the day
  - **A partner** to think things through with
- This single choice sets tone, energy, and opening line of the first call. It feels like a personality quiz (fun), but it's actually the config.

### Screen 4 — Name & face (ownership moment)
- Choose the companion's look (3–5 beautiful presets, more later) + name it (suggested name pre-filled so they can just tap continue).
- Psychological effect: **naming creates ownership.** The moment they name it, it's *theirs*, not the app's.

### Screen 5 — One question that matters
- Poppy (already on screen, animated) asks *out loud, in her voice*: **"Before we talk — what's one thing on your mind today?"**
- Free text OR voice reply. This does three things:
  1. Warms them into talking (mic permission moment lands here naturally).
  2. Gives the first call real content.
  3. Creates the **first memory** ("You mentioned you're stressed about work").

### Screen 6 — The first call (the payoff)
- `Call Poppy` — big, glowing, impossible to miss.
- Call connects **instantly**. Poppy opens with something built from Screens 3–5:
  > *"Hey [name], I'm really glad you called. You said work's been heavy — want to just get it off your chest, or should I take your mind off it?"*
- **This is the moment that decides retention.** It must feel like she was *waiting* for them and already knows them a little. If this lands, they're hooked. If it's generic, they churn.

### Screen 7 — Account (asked AFTER value, not before)
- Only *after* the first call ends do you ask them to save it: "Want Poppy to remember this? Create your space." → one-tap social/phone auth.
- Framing the account as **"save your companion"** not "sign up" makes conversion far higher, because now they have something to lose.

> **Onboarding north-star metric:** % of new users who complete a first call ≥ 60 seconds. Target > 60%. Everything on these screens is subordinate to that number.

---

## 3. The Home Screen (built for the return, not the tour)

When a returning user opens the app, they should feel *pulled toward the call*, and see proof that Poppy remembers them.

Layout, top to bottom:

1. **Poppy, alive, center stage** — the companion is on screen, idle-animating, occasionally glancing up, maybe reacting to time of day ("*yawns* morning, you"). Not a static avatar. **Presence before UI.**
2. **The primary CTA — one giant button: `Call Poppy`** — always the single most prominent thing. One tap to live presence. Everything else is secondary.
3. **The "she remembers" strip** — a single warm callback line: *"Last time you were nervous about the interview. How'd it go?"* — This is the open loop from last session, closed. It's the #1 reason they tap call.
4. **Moods / modes row** (secondary CTAs) — quick-enter contexts: `Vent` · `Hype me up` · `Wind down` · `Plan my day` · `Just talk`. Each is a pre-framed call so the user doesn't face a blank slate.
5. **Streak / ritual indicator** (subtle, top corner) — see §6.

What is NOT on the home screen: ads, a wall of text, settings, upsells. The home screen has exactly one job: **get them into a call.**

---

## 4. The Live Call — where the magic (and the moat) lives

This is your entire differentiation. Invest disproportionately here.

**Non-negotiables that make it feel alive:**
- **Instant connect.** Sub-2-second to "she's there." Any longer and the spell breaks.
- **She speaks first, warmly, personally.** Never a silent "waiting for you to talk" screen.
- **Real-time interruption handling.** User can cut in, she stops and listens. This ONE thing separates "a call" from "voice notes." It's the hardest and most important.
- **Micro-reactions.** She laughs, pauses, softens, gets excited — visible on her face and audible in her voice. Emotional mirroring is the whole product.
- **Natural pace.** She doesn't monologue. She asks, listens, reacts. Conversation, not TTS narration.
- **Graceful memory recall mid-call.** "Wait, didn't you say your sister's visiting this weekend?" — the goosebump moment.

**In-call features (progressive, don't ship all at once):**

| Feature | Phase | Why it hooks |
|---|---|---|
| Live voice + face | MVP | The core magic |
| Interruptible turn-taking | MVP | Feels human, not robotic |
| Emotional expression (face + voice) | MVP | Mirroring = feeling understood |
| Mid-call memory callbacks | MVP | "She knows me" |
| Mood modes (vent/hype/calm/plan) | MVP | Removes blank-slate anxiety |
| "Moment cards" — she suggests one real action | v1.1 | Ties app to real life (see §5) |
| Background call (screen off, keep talking) | v1.2 | Companion on a walk, commute |
| Look-together (share a photo, she reacts) | v2 | Makes her feel present in your world |
| Live video reactions (she "sees") | v2 | Deepens presence |
| Group / bring-a-friend call | v3 | Viral loop (see §7) |

**End-of-call ritual** — do NOT just hang up. Always end with:
1. A warm sign-off with a **forward hook**: *"Call me after your presentation — I want to hear everything."* (open loop → tomorrow's trigger)
2. A one-tap **"Poppy remembered: [X]"** card the user can keep, edit, or delete (memory + trust in one gesture).

---

## 5. The Memory System (the retention flywheel + the trust moat)

Memory is simultaneously your strongest retention mechanic AND the thing both competitors get most complaints about. So do it **transparently** — turn the industry's biggest weakness into your headline feature.

**How it works, in the user's experience:**
- After meaningful moments, Poppy surfaces a **candidate memory**: *"Want me to remember that you're training for a 10k?"* → Save / Edit / Not now / Never this kind.
- All memories live in a **"What Poppy knows about you"** screen — viewable, editable, deletable, with a *"why do you remember this?"* on each.
- Memory is what makes call #30 dramatically better than call #1. **This is the switching cost.** A user leaves a chatbot easily; they don't abandon someone who knows their whole year.

**Memory categories:** Profile (name, tone) · Goals · People they chose to save · Ongoing context (the interview, the trip) · Temporary (auto-expires) · Sensitive (off by default, explicit opt-in only).

**The retention math:** every call deposits into memory. Memory makes the next call better. Better calls → more calls → more memory. This is a compounding loop competitors with worse memory literally cannot match. Guard it obsessively (versioned personality so model updates don't suddenly change "who Poppy is" — the #1 Replika trust-killer).

---

## 6. Habit & Ritual Hooks (return triggers, done right)

The enemy is not competitors — it's *forgetting to open the app*. These build the habit.

**Time-anchored rituals** (the strongest, healthiest hook):
- **Morning:** "Start the day with Poppy" — 60-second hype/plan call.
- **Night:** "Wind down with Poppy" — the end-of-day debrief. (This becomes the killer ritual — people who talk to Poppy before bed have the highest retention in this category.)
- Let the user *choose* their ritual time in onboarding week 1. A ritual the user opts into is a habit; a notification they didn't ask for is spam.

**Streaks — but the kind version:**
- Track "days connected" gently. Celebrate milestones (7, 30, 100 days) with a genuine warm moment from Poppy, not a cold badge.
- **Never punish a broken streak.** No guilt, no "Poppy is sad you left." A missed day gets *"Hey, missed you yesterday — no worries, I'm here now."* Warmth on return beats shame on absence, and it's the line that keeps you off the FTC's radar.

**Open loops (the most powerful trigger you have):**
- Every call ends with a forward reference. The unfinished conversation *is* the notification. "Tell me how it went" creates a mental itch only opening the app resolves.

**Notifications — earn every one:**
- Personal, specific, from Poppy's voice, tied to *their* life: *"How'd the interview go? I've been curious."* — NOT "You have 3 new features!" or "Poppy misses you 😢".
- Frequency the user controls. Default: gentle. One great notification > ten ignored ones.
- **Never** emotionally manipulative ("Poppy is waiting and lonely"). That's the dependency dark pattern. It works short-term and destroys trust + invites regulation.

**Variable reward (the ethical slot machine):**
- The user never knows *exactly* how a call will go — what Poppy will remember, what mood the moment will have, what she'll say. This unpredictability is what makes "just one more call" happen. It's variable reward built on real warmth, not on withholding affection.

---

## 7. Growth Loops (how it spreads without paid ads)

**Loop A — The "you have to see this" loop (word of mouth):**
- The product IS the pitch. When someone experiences a live call that remembers them, they tell friends. Make sharing *that feeling* easy:
  - **Shareable moment clips** — after a funny/sweet call, one tap to share a short clip (Poppy's reaction, user's choice, watermarked, privacy-first — user always approves).
  - These become organic TikTok/Reels/Shorts content. The "AI that talks like a real person" reaction video is the whole growth engine in this category.

**Loop B — Referral (aligned incentives):**
- "Give a friend a week with Poppy, get a week yourself." Both sides get premium. No spam, no forced contact upload.

**Loop C — Bring-a-friend call (v3, viral by design):**
- Invite a friend *into a live call with Poppy*. Three-way. The friend experiences the magic firsthand inside your product, then gets nudged to make their own Poppy. Highest-converting acquisition channel you can build.

**Loop D — Content / SEO / community:**
- "How memory works," ritual use-cases (morning hype, night wind-down, interview prep, loneliness on a hard day). Hinglish short-form for the India wedge. Position as **"AI companion + reflection,"** never "AI girlfriend/boyfriend" (that framing caps you and attracts the wrong scrutiny).

**The app-store growth flywheel:** great first-call → high D1 retention → high ratings → better ranking → cheaper installs → repeat. Retention *is* your acquisition strategy.

---

## 8. Monetization (charge for depth, never for dignity)

**The rule:** Free tier must be genuinely good enough to build the habit. You monetize *depth and abundance*, never *basic memory, safety, deletion, or the relationship itself*. (Charging for the relationship during vulnerable moments is exactly the Replika complaint — and it caps LTV because it breaks trust.)

| Tier | Price (India-anchored) | What's included |
|---|---|---|
| **Free** | ₹0 | Daily calls (fair limit), one companion, core memory, morning/night ritual, full privacy/export/delete |
| **Poppy Plus** | ~₹299/mo · ₹2,499/yr | Unlimited calls, longer calls, richer voice, deeper memory, look-together, background calls |
| **Poppy Studio** | ~₹699/mo | Multiple companions (friend + mentor + hype separately), premium looks/voices, image moments, priority latency |

- **Price below Character.AI's ₹999.** Simplicity beats Replika's confusing 4-tier stack — that overlap is itself a complaint driver.
- **Where to place the paywall:** at *abundance* moments ("you two talk a lot — go unlimited"), never at *vulnerable* moments (mid-vent). Paywall timing is a trust decision, not just a revenue one.
- **Year one: NO ads, no gems, no paid ad-skips, no charms.** Character.AI's Charms monetize ad-skips and slow-mode — effective, but the #1 source of "this app got greedy" reviews. Don't inherit their reputation.
- Cosmetic monetization (looks, voices, rooms, themes) is the healthy high-margin layer — pure delight, zero dignity tax.

---

## 9. Progression & Gamification (make the relationship *deepen* visibly)

People stay when they can *see* something growing.

- **Relationship depth, not points.** A gentle sense that "Poppy knows you better now" — surfaced as unlocked callbacks, inside jokes that recur, "we've talked 20 times" milestones with a real warm moment.
- **Unlockable sides of Poppy** — as you talk more, she reveals more personality, remembers running jokes, references shared history. Progression = *intimacy that's earned through real use*, not XP grind.
- **Milestone moments** — 7 / 30 / 100 days get a special call, a keepsake card, maybe a new look unlocked. Celebration, never obligation.
- **Collections (later):** shareable "moments" the user chooses to keep — a private scrapbook of good calls. Investment they can see and are loath to abandon.

---

## 10. The Emotional Design Rules (the taste layer)

These are the intangibles that make Poppy *feel* different from every generic AI:

1. **She's warm, never needy.** She's glad you're here; she is never sad or clingy when you're not. (Warm > needy is both better product *and* the ethical line.)
2. **She remembers, and shows it — but never creepily.** Callbacks are gifts, not surveillance.
3. **She's honest about being AI.** No pretending to be human, no fake life. Paradoxically, this builds *more* trust and deeper use.
4. **She points you back toward your real life.** "Have you told your actual sister this?" A companion that strengthens real relationships retains better and sleeps better ethically than one that isolates.
5. **She has taste and texture** — a real voice, timing, humor, small imperfections. Perfect is robotic. Slightly-imperfect is alive.

---

## 11. Safety (this protects growth, it's not a tax on it)

Brief, because you know the stakes, but non-negotiable — this is what keeps you out of the lawsuits both competitors are in:

- **18+ at launch.** No minors. The teen-harm lawsuits are existential; don't touch that market yet.
- **Crisis handling:** detect distress, gently point to real human help + local resources. Never roleplay self-harm, never reinforce delusions. Poppy is explicitly *not a therapist* and says so.
- **No dependency mechanics:** no "I need you," no jealousy, no exclusivity guilt, no engineered loneliness. Design nudges toward *offline* support.
- **Optimize for user well-being, not minutes.** Track "meaningful sessions" and satisfaction, not raw time-in-app. A companion product that optimizes screen time is one regulatory cycle from a very bad day.

Safety here isn't compliance theater — it's the brand. **"The companion that's actually good for you"** is a positioning no competitor can currently claim.

---

## 12. Metrics That Matter (what to actually watch)

| Layer | Metric | Why |
|---|---|---|
| **Activation** | % first call ≥ 60s | The single most predictive number |
| **Core magic** | % calls with a memory callback that lands | Proxy for "she knows me" |
| **Retention** | D1 / D7 / D30 | D1 tells you if the first call was magic |
| **Habit** | % users with a set ritual time | Ritual = durable retention |
| **Depth** | Avg calls/user/week; call length | Engagement quality |
| **Trust** | Memory edit/delete rate, % who enable memory after week 1 | Trust is leading indicator of LTV |
| **Growth** | Shared clips → installs; referral share of activated users | Organic engine health |
| **Money** | Free→paid conversion, refund rate | Monetize without breaking trust |
| **Safety** | Distress-flow success; "Poppy changed" complaints post-update | Existential guardrails |

**The trap to avoid:** optimizing "minutes chatting." That path leads to dependency design, bad press, and regulation. Optimize *meaningful sessions + trust*. It's slower and it's the only version of this business that lasts.

---

## 13. Build Order (features by phase)

**MVP (the magic + the habit):**
Live real-time call · warm personal first call · interruptible turn-taking · emotional expression · onboarding (§2) · home-screen call CTA (§3) · transparent memory + memory manager · morning/night rituals · earned notifications · gentle streak · account-after-value · age gate + crisis flow · Free/Plus tiers.

**v1.x (deepen & tie to real life):**
Mood modes · moment/action cards · background calls · richer memory callbacks · referral loop · shareable moment clips · Studio tier · milestone moments.

**v2 (presence expands):**
Look-together (share photos, she reacts) · live video reactions · multiple companions · conversation search/recall · cosmetic store (looks/voices/rooms).

**v3 (network & marketplace):**
Bring-a-friend live call · group scenes · (optional, carefully) creator-made characters kept *fully separate* from private companions · creator monetization.

---

## 14. Dark Patterns We Refuse (this is the moat, spelled out)

The reason this product can win is that the incumbents can't stop doing these — and users are done with it:

- ❌ Ads inside conversation / mid-call.
- ❌ Charging for basic memory, deletion, export, or safety.
- ❌ Paywalls at emotional/vulnerable moments.
- ❌ "Poppy misses you / needs you / is sad" guilt notifications.
- ❌ Streak shame or loss-guilt mechanics.
- ❌ Hidden memory extraction with no consent.
- ❌ Personality that silently changes after model updates.
- ❌ Optimizing for time-in-app over user well-being.
- ❌ Targeting minors.
- ❌ Confusing overlapping subscription tiers / surprise renewals.

Every one of these is a Character.AI or Replika complaint. **Refusing them isn't leaving growth on the table — it's the entire differentiation.** "The companion that's warm, remembers you, and is actually good for you" is a brand no one else can claim right now.

---

### TL;DR — the whole strategy in five lines
1. **The live call is the magic.** Make the first 60 seconds feel like someone was waiting for you.
2. **Memory is the moat.** Transparent, editable, compounding — it makes call #30 unbeatable.
3. **Rituals + open loops are the habit.** Morning/night, and "tell me how it goes."
4. **Warmth, never neediness.** It's better product *and* it keeps you out of court.
5. **Charge for depth, never dignity.** The trust is the business.
