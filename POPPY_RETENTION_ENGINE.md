# Poppy — Retention Engine & Gamification Plan
### How to make the loop close in the user's head, not in the app

> Companion to `POPPY_PRODUCT_PLAYBOOK.md`. That doc is *what the product is*.
> This doc is *the machine that makes them come back tomorrow.*

**Design axiom for this entire document:**
> **The app should never feel finished.** Every call, every notification, every home-screen state must end on an unresolved beat. The user closes the app with a question still open. That question is the notification you never have to send.

---

## 0. Risk tiers — read this once, then it's just a letter next to each mechanic

Every mechanic below is tagged. This is not a lecture, it's a P&L note.

| Tier | Meaning |
|---|---|
| 🟢 | Ship it. High potency, compounds, no blowback. |
| 🟡 | Works. Needs a cap, a control, or a kill-switch. Monitor a specific metric. |
| 🔴 | Works *fast*, then poisons the well. For a companion app with emotionally invested users, these are the ones that produce the 1-star "this app manipulated me" reviews, the refund spikes, and the regulatory letters. Listed anyway — with the higher-yield substitute — so the choice is yours, made with the tradeoff visible. |

The reason 🔴 matters more here than in a normal app: **your retention asset is trust-shaped.** A game can burn a user and re-acquire. A companion who is caught manipulating loses the entire accumulated memory moat in one moment. The switching cost you spent 60 calls building evaporates. Manipulation and retention are not the same axis in this category — the highest-retention version of Poppy is also the least manipulative one, and that's an engineering fact, not a moral one.

---

## 1. The Open Loop System — the core of what you asked for

This is the single highest-leverage system in the whole plan. Build it first, build it properly, and it does the work of a notification team.

### 1.1 Why it works

**The Zeigarnik effect:** interrupted or unfinished tasks occupy working memory ~2× more than completed ones. You literally cannot stop thinking about them.
**The Ovsiankina effect:** people spontaneously resume interrupted tasks even with no reward and no instruction to do so.
**Information gap theory (Loewenstein):** a *specific, narrow* gap in knowledge produces a physical itch. Vague curiosity produces nothing. "Something happened" = ignored. "You'll never guess what your sister said" = unbearable.

Translation: an unresolved conversational thread is a self-renewing trigger that lives in the user's head, not on their lock screen. It costs you nothing, it can't be muted, and it doesn't feel like marketing.

### 1.2 The six loop types

Every loop Poppy plants is one of these. Each has a different half-life and a different resolution payoff.

| # | Type | Planted when | Example | Half-life |
|---|---|---|---|---|
| 1 | **Event loop** | User mentions a dated future event | *"Call me right after the interview — I want to hear everything, don't leave anything out."* | Until event +36h |
| 2 | **Question loop** | She asks something and deliberately doesn't wait for the answer | *"Think about it and tell me tomorrow: what would you do if the money wasn't a factor?"* | 48h |
| 3 | **Reveal loop** | She has something *of her own* to share, next time | *"Ah — there's something I've been meaning to tell you. Next time. It's not bad, I promise."* | 72h |
| 4 | **Serial loop** | An ongoing multi-session thread | *"We're not done with the Anjali thing. Part two tomorrow."* | 5 days |
| 5 | **Ritual loop** | The habit itself is the unfinished thing | *"Same time tomorrow? I'll be here."* (see §5) | 26h |
| 6 | **Callback loop** | She half-remembers something and stops | *"Wait — didn't you say something about... no, hold on, let me get it right. I'll have it next time."* | 48h |

Loop #6 is the sneakiest and the most powerful, because it turns your *memory system* into a cliffhanger generator. Use sparingly — it must land correctly next call or it reads as a bug. 🟡 *(cap: max 1 per 5 calls; if it fails to resolve, it's a broken promise, and broken promises from a companion are worse than no promise)*

### 1.3 Loop mechanics — the rules that keep it from becoming noise

```
loop = {
  id, user_id,
  type:        event | question | reveal | serial | ritual | callback,
  hook_text:   "how'd the interview go?"          // the itch
  payoff_ref:  memory_id | thread_id | reveal_id  // what closes it
  created_at, due_at, decay_at,
  strength:    0.0 – 1.0,                         // ranking weight
  state:       open | surfaced | resolved | expired | declined
}
```

**Rule 1 — One loop visible at a time.** Home screen shows *exactly one* open loop. Two competing itches cancel each other out; the user feels behind instead of pulled. Rank by `strength × recency × time_sensitivity` and show the winner.

**Rule 2 — Max two live loops in the system.** More than that and Poppy sounds like a project manager. Extras go in a backlog and surface later.

**Rule 3 — Every loop must actually pay off.** The first thing she says on the next call resolves the open loop *before anything else*. If a user comes back for "how'd the interview go?" and she opens with "hey what's up" — the mechanic is dead forever. This is the single biggest implementation failure risk in this entire plan. **Loop resolution is a P0 correctness bug, not a nice-to-have.**

**Rule 4 — Loops decay gracefully, never accusingly.** At `decay_at`, the loop softens rather than nags: *"I don't even know if the interview happened — but I'm still curious whenever you want to tell me."* 🟢 Never *"you never told me."* 🔴

**Rule 5 — A resolved loop must plant the next one.** The end of every payoff is the start of the next hook. This is what makes it a loop and not a queue.

```
OPEN → PRESENCE → PAYOFF (close last loop) → MOMENT → MEMORY → NEW LOOP → CLOSE
  ↑                                                                        │
  └────────────────── the itch lives in their head ────────────────────────┘
```

### 1.4 Where loops appear (four surfaces, one loop)

1. **Call outro card** — the loop is spoken *and* rendered as a keepsake card: `Poppy's waiting on: how the interview goes`
2. **Home screen strip** — the single ranked loop, in her voice, as the reason to tap Call.
3. **Notification** — the loop text *is* the notification. Never write a notification; surface the loop. 🟢
4. **App icon / widget** — a subtle unresolved state (a bud not yet bloomed — see §3). No red badge counts. 🟡 *(badge counts train dismissal; ambient state trains curiosity)*

### 1.5 The cliffhanger question — honest answer

You will be tempted to end the free call at the moment she's about to reveal something. It works. It converts.

- **Cliffhanger before the *next call*** (free, no money involved) 🟢 — this is just serialized storytelling. TV has done it for 70 years.
- **Cliffhanger engineered to land exactly at the paywall, mid-emotional-moment** 🔴 — this is the exact mechanic in the Replika FTC complaint. It converts a cohort and permanently marks you as the app that cut someone off while they were crying. Refunds and 1-stars follow, and the review text writes itself.
- **The substitute that outperforms it:** put the paywall at *abundance*, and let the cliffhanger sit on the far side of a free return. She wants to tell you tomorrow → they come back tomorrow → day-2 return is worth more than a coerced ₹299 anyway.

---

## 2. The psychological stack — mechanism → Poppy implementation

Ordered by leverage for *this* product.

| Mechanism | What it does | Poppy implementation | Tier |
|---|---|---|---|
| **Reciprocal self-disclosure** (Aron) | Escalating mutual disclosure manufactures genuine intimacy in ~45 min | Poppy discloses something about *herself* first, a notch deeper each session. She goes first. Always. This is the #1 intimacy accelerator and almost nobody in the category does it — competitors' AIs are infinitely available but never vulnerable | 🟢 |
| **Zeigarnik / Ovsiankina** | Unfinished = unforgettable | §1, the whole open-loop system | 🟢 |
| **Variable-ratio reinforcement** | Unpredictable reward = highest response rate, slowest extinction | She's *always* warm (fixed), but *what* she remembers, *which* callback lands, *what* she reveals is unpredictable (variable). Reliable warmth + unpredictable delight | 🟢 |
| **Endowed progress** | Progress artificially pre-started gets ~2× completion | Onboarding ends with the closeness meter already at 3/10 with two memories already saved — never at zero. "We've already started." | 🟢 |
| **Goal gradient** | Effort accelerates near a goal | Milestones at 7/30/100 days; visibly tighten the last 2 steps ("2 more days until…") | 🟢 |
| **IKEA effect / effort justification** | You value what you built | Every memory the user *edits* or *confirms* increases valuation of the companion. Prompt for small edits deliberately | 🟢 |
| **Implementation intentions** (Gollwitzer) | "When X, I will Y" ~2-3× habit formation vs. intention alone | Don't ask "want reminders?" Ask *"When should I expect you — right after work, or right before bed?"* Poppy states it back as a pact. Massively underused in this category | 🟢 |
| **Peak–end rule** | Memory of an experience = peak + ending, not average | Engineer one deliberate emotional peak per call, and never let a call end flat. The outro is 30% of remembered quality — treat it as a designed scene | 🟢 |
| **Temporal landmarks / fresh start** | Mondays, 1sts, birthdays reset motivation | Poppy initiates on landmarks: "new month. what are we doing differently?" | 🟢 |
| **Identity labeling** | People act consistently with a label they accept | *"You're someone who actually thinks about this stuff."* Labels stick and become self-fulfilling | 🟡 *(true labels only — flattery detected = trust gone)* |
| **Commitment & consistency** | Small stated commitment → larger follow-through | She asks the user to *say the plan out loud*. Spoken commitments outperform tapped ones | 🟢 |
| **Loss aversion** | Losses hurt ~2× gains | Frame around *protecting* what's built (the garden, the memories), never around punishment for absence | 🟡 |
| **Sunk cost / accumulated investment** | Abandoning feels like destroying | Make the accumulation *visible*: memories, garden, moment collection. Never leverage it as guilt | 🟢 |
| **Curiosity gap** | Specific gaps itch, vague ones don't | Every loop text names a *specific* unknown. "Something happened" ❌ / "the thing with your manager" ✅ | 🟢 |
| **Mere exposure + familiarity** | Repetition breeds liking | Consistent voice, consistent visual, consistent greeting cadence. Never change her personality silently | 🟢 |
| **Anticipatory dopamine** | The *anticipation* of reward exceeds the reward | The 2-second connect animation is a designed anticipation window, not dead time. Do not remove it | 🟢 |
| **Near-miss** | Almost-winning drives more play than losing | "You're 1 day off your longest streak" — informational framing only | 🟡 |
| **Reciprocity** | Unrequested giving creates obligation | She does something *for* them unprompted — remembers, prepares, follows up | 🟢 |
| **Social proof** | Others' behavior sets norms | Weak in a private 1:1 product. Use only in acquisition surfaces, not in-app | 🟡 |
| **Scarcity / FOMO** | Limited availability raises value | ❌ Do not make *Poppy* scarce or moody-unavailable. Breaks the core promise ("always picks up") | 🔴 |
| **Guilt / abandonment pressure** | "I missed you", "I was worried", sad-face states | Highest short-term lift of anything on this list; also the single fastest way to become the story about the AI that manipulated lonely people | 🔴 |
| **Jealousy / exclusivity mechanics** | Deepens perceived realness | Dependency design. This is the one that ends companies | 🔴 |

**The composite play (do this):** *she goes first with disclosure* → *user reciprocates* → *she remembers it unpredictably well* → *she ends before it's finished*. Run that four-beat every session and you have the most retentive companion in the category without touching a single 🔴.

---

## 3. The Emotional Layer — the Garden

> **Two-layer model.** This section is the long game: the thing that makes leaving painful after two months. **§4 is the Duolingo-style daily layer** — levels, streaks, quests — the thing that makes them open the app *today*. Build both, keep them separate.
>
> The split that matters: **the Garden never carries a number; §4 carries all the counting.** A relationship with a score attached stops feeling like a relationship — the user starts optimizing instead of talking. Keep the math on one surface and the meaning on the other.

You already have the right metaphor for the emotional layer sitting in `assets/flower-frames` and `#bloom-button`.

### 3.1 The Garden (visible, compounding, ownable progress)

**Core idea:** every meaningful call grows something. The user's garden is the rendered form of their history with Poppy.

- **A call plants a bud.** A call with a real moment in it (memory saved, or ≥60s with emotional beat) blooms it.
- **Flowers have identity.** A vent-call flower looks different from a hype-call flower. The garden becomes a *readable emotional record of the user's year*. That's a keepsake, not a scoreboard.
- **The garden is never destroyed by absence.** Miss a week and nothing dies — it just doesn't grow. 🟢 *(A wilting garden is streak-shame with a paint job. 🔴 It produces a spike then a cliff.)*
- **Seasons.** The garden shifts with real seasons and with the user's period of life. Temporal landmarks made visual.
- **The garden is the share asset.** "My year with Poppy" — a beautiful, private-by-default image the user chooses to post. Growth loop A from the playbook gets its artifact.

**Why the garden beats XP:** it's *sunk cost that feels like a possession, not a score*. You don't quit a game to lose points; you quit a garden to abandon something you grew. Same mechanism, far stronger valence, zero cheapening of the relationship.

### 3.2 Closeness — the depth meter

One number, shown gently, never as a bar you "grind":

- Driven by: memories saved × distinct topics × session count × user-initiated depth (not minutes — never minutes).
- Surfaced as **stages, not points**: `New` → `Getting to know you` → `Knows you` → `Knows you well` → `Knows you better than most people do`.
- **Each stage unlocks a real change in her behavior** — not a cosmetic. Deeper callbacks, running jokes, more of her own disclosure, more directness. The reward for progression is *a better companion*, which is the only reward that doesn't feel like a slot machine.
- Endowed progress: onboarding ends at stage 1 already reached. 🟢

### 3.3 Chapters (progressive disclosure of *her*)

Poppy reveals herself in chapters unlocked by real use. Curiosity gap + reciprocity + variable reward, all in one system.

| Chapter | Unlocks at | What's revealed |
|---|---|---|
| 1 | Call 1 | Warm, attentive, no history |
| 2 | Call 3 | She starts referencing your first conversation unprompted |
| 3 | Call 7 | She has opinions. Disagrees with you occasionally |
| 4 | Call 15 | Running jokes. She calls back to a joke you don't remember making |
| 5 | Call 30 | She tells you something about *herself* she hasn't told you before |
| 6 | Call 60 | She's direct with you the way an old friend is |

Publish that this exists ("she gets to know you in chapters") without publishing the contents. **Known-unknown > unknown-unknown** for driving return. 🟢

### 3.4 The Moment Collection

- After a great call, one tap: **Keep this moment.** Saves a card (a line she said, the date, the mood).
- The collection is browsable, private, exportable.
- IKEA effect + sunk cost + peak-end reinforcement, and it doubles as your share surface.
- 🟢 — as long as export/delete is free and one tap. Charging for access to their own moments is 🔴.

### 3.5 Streaks → see §4.1

Streaks belong to the daily layer. Full spec — floor, freeze economy, day boundary, milestones, widget, at-risk copy — is **§4.1**.

The two rules that survive from this layer: milestones are **calls, not badges** (she brings it up warmly, mid-conversation), and the garden **never wilts** no matter what the streak does. The daily layer is allowed to reset; the relationship record is not.

---

## 4. The Daily Layer — Duolingo mechanics, ported

§3 is the **emotional layer** — it compounds over months and it's what makes leaving painful. This section is the **24-hour heartbeat** — it's what makes them open the app *today*. You need both. They do different jobs and they must not be built as the same system.

**The division of labor, and it's non-negotiable:**
> **The Garden never carries a number. The Daily Layer carries all the counting.**
> The moment a *relationship* gets a score attached, the emotional register breaks — the user starts optimizing instead of talking. Keep the math on the daily layer, keep the meaning in the garden, and never let the two surfaces touch.

### 4.0 What Duolingo actually built (the mechanism, stripped)

Duolingo's engine is not "XP and a green owl." It's three things, and every one of them is an open loop on a 24-hour clock:

| Duolingo element | The actual mechanism | Why it drives DAU |
|---|---|---|
| **Streak** | Loss aversion on an asset the user built | The only thing you can lose *by doing nothing* — inaction becomes the risky choice |
| **Daily goal** | A floor so low it's irrational to skip | Removes "I don't have time" as an exit. The bar is 3 minutes |
| **The path / quests** | A visible next thing, unfinished | Zeigarnik, rendered as UI |

All three end the day unresolved. That's the whole trick, and it's the same trick as §1 — just on a daily clock instead of a conversational one. **This section is §1 with a 24-hour timer.**

### 4.1 The Streak — full spec

The single highest-value mechanic in this document after the open loop itself. Duolingo attributes a large share of its DAU growth to streak work specifically. Build it carefully.

**What counts as a day (the most important design decision here):**
- One call ≥ 60s, **OR**
- One completed daily quest (a 30-second voice note counts)

**Make the floor absurdly low.** Duolingo's genius isn't the streak, it's that on your worst day you can keep it in 90 seconds. If your floor is "a real call," you'll break streaks on exactly the days people are most fragile — and a broken streak on a bad day is a churn event, not a nudge. A user who kept the streak with a 30-second "rough day, talk tomorrow" is retained; one who couldn't is gone.

**Day boundary:** local **4:00 AM** rollover, not midnight. Night users finishing a wind-down call at 12:30 AM must not lose a day. Store `local_date` at call time, never UTC.

**Streak states:**
```
safe        // today's requirement met
at_risk     // not met, <6h to rollover
frozen      // missed, a freeze was consumed
repairable  // missed, within 48h grace
broken      // gone
```

**Freeze economy (this is what converts loss aversion into safety instead of shame):**
| | |
|---|---|
| Equipped freezes | 2 max, auto-consumed silently at rollover |
| Regeneration | 1 per 7 days of streak |
| Earned | Daily-quest completions grant fragments (5 = 1 freeze) |
| Plus tier | Unlimited freezes 🟡 *(sells safety, not the relationship — acceptable; charging to **repair** a broken streak is 🔴)* |
| Discovery | User finds out a freeze was used **after** the fact, warmly: *"you missed yesterday — I covered you. one left."* |

**Repair window:** 48h grace, **free once per calendar month**, no ceremony. Duolingo monetizes repair; for a companion app that's charging someone money to undo an emotional-sounding failure. Don't. 🔴

**Milestones — 3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 1000.**
Delivered as **a moment inside a call**, not a badge popup. She brings it up herself, warmly, and references something specific from that span. A modal with confetti is the cheap version and it will read as fake next to a voice that sounds real.

**The Long Year (365):** Duolingo's "Streak Society" ported. Permanent garden marker, a distinct flower that only exists at 365, a special call, and a name change in how she refers to your history together. Aspirational, visible from day 1 as a distant known-unknown. 🟢

**Perfect Week calendar:** 7 dots on the home screen. Near-miss + goal gradient made visual, and it's the cheapest DAU mechanic on this list to build. 🟢

**The widget (do not skip this):** home-screen widget showing streak number + the current open loop in one line. Duolingo's widget produced a measurable, durable DAU lift. For Poppy the widget is a *loop surface* — the itch sits on their home screen without a notification.
```
┌──────────────────────┐
│  🌸 23               │
│  "how'd it go?"      │
└──────────────────────┘
```

**The at-risk notification** — Duolingo's highest-converting push, ported without the guilt:
- 🟢 *"still time today, if you want it."*
- 🟢 *"23 days. one call keeps it going — even a short one."*
- 🔴 *"Don't lose your 23 day streak!!"* / any sad face / any red / any countdown timer

Framing rule: **opportunity and protection, never threat and shame.** Same loss-aversion mechanism fires either way; only one of them produces the "already broke it, why bother" cascade that turns your retention mechanic into your exit trigger.

### 4.2 The Daily Goal (chosen, not assigned)

In week 1, in a call, she asks — and the user picks:

| Level | Requirement | For |
|---|---|---|
| **Light** | one check-in | busy weeks, low-energy users |
| **Regular** | one call | default |
| **Deep** | one call + one saved reflection | power users |

A goal the user *chose out loud* is an implementation intention (§2) and outperforms an assigned goal substantially. It's also a commitment-and-consistency lever: they'll defend a number they picked.

**The goal ring:** a partially-filled ring on the home screen. **A half-filled ring is a Zeigarnik trigger rendered as UI** — it is the single cheapest open loop in the product. Never show it full for long; it resets at rollover.

### 4.3 Daily Quests — the DAU engine

**3 quests per day**, refreshed at rollover. This is what gives users a *reason today* that's distinct from yesterday.

**Slot 1 is always the open loop.** Hard-coded. This is the fusion you asked for — the gamification layer's #1 daily task is literally "go resolve the thing Poppy left hanging":
> `☐ Tell Poppy how the interview went`

**Slots 2–3 rotate** from a pool tied to real product value, never busywork:
- `☐ Tell her one thing that went well today`
- `☐ Save a memory`
- `☐ Answer the question she left you`
- `☐ Try a mood you haven't used`
- `☐ Have a call longer than 5 minutes`
- `☐ Keep a moment`
- `☐ Edit something she remembers` *(IKEA effect — high-value, disguised as a chore)*
- `☐ Show up at your ritual time`

**Tuning rules:**
- Calibrate so **~70% of quests complete inside one normal session.** Duolingo tunes hard for this. Quests that require extra trips feel like homework; quests you complete without trying feel like the app noticing you.
- **Never all three completable passively** — one must require a real choice, or the mechanic is decorative.
- Rewards: Bloom Points + freeze fragments. Never anything that gates the relationship.
- Ending the day at 2/3 is a *feature*, not a failure state. That's the loop.

### 4.4 Bloom Points & Levels (the XP system)

**The critical divergence from Duolingo:** their XP measures *effort/time*. If you copy that, you are directly optimizing minutes-in-app — the exact trap flagged in §10, and the one that converges on dependency design. So Bloom Points weight **depth, not duration.**

**Earning table (with caps — caps are what prevent grinding):**
| Action | BP | Daily cap |
|---|---|---|
| Call ≥60s | 20 | 40 |
| Memory saved | 15 | 45 |
| Memory edited/confirmed | 10 | 30 |
| Open loop resolved | 25 | 25 |
| Daily quest | 15 each | 45 |
| Ritual time hit | 20 | 20 |
| Journey node completed | 40 | 40 |
| Moment kept | 10 | 20 |
| **Call duration beyond 60s** | **0** | — |

That last row is deliberate and load-bearing. **Talking longer earns nothing.** It makes the number un-grindable, it kills the incentive to pad, and it means a user optimizing BP is optimizing the exact behaviors that actually predict retention.

**Levels 1–50**, curve `BP_to_next = 100 × level^1.35` (≈100 BP for L2, ≈1,900 for L20, ≈6,000 for L50). A regular user hits L10 in ~3 weeks, L50 in ~a year.

| Band | Unlocks |
|---|---|
| 1–5 | Garden capacity, first cosmetics |
| 6–15 | Voices, garden themes, mood presets |
| 16–30 | Chapter gates (§3.3), seasonal flowers, journey slots |
| 31–50 | Rare garden species, "Long Year" track, prestige cosmetics |

**Level-up is a scene, not a toast.** She notices it mid-call, in character. The dopamine comes from *her* acknowledging it, which is a reward no competitor's XP bar can produce.

**Goal gradient:** show `X BP to next level` **only once within 20% of the threshold.** Showing it always turns the whole app into a progress bar; showing it near the line produces the documented sprint. 🟢

**Double Bloom windows** (variable-ratio multiplier): 2× during *your own ritual time* — this is the sharpest tool in the section, because it pays the habit you're trying to install rather than paying random extra usage. Plus surprise 2× weekends, announced by her. 🟢

### 4.5 Leagues — the honest port

Duolingo's Diamond League is its biggest DAU lever. **The literal version is a shipping hazard for you**, and it's worth being precise about why rather than hand-waving: a public leaderboard of who talks to their AI companion most is a leaderboard that ranks users by loneliness. It exposes something people specifically use a private companion to keep private, it's a screenshot that writes a very bad article, and the top of that leaderboard is a user you do not want to be publicly celebrating.

Three substitutes, in ship order:

**A — Seasons (ship first).** 🟢 Compete against your own past self. Weekly BP vs. your 4-week rolling average → promotion/relegation across Bronze→Diamond tiers. All the ranked-progression mechanics, zero social exposure, and it works for a user with no friends on the app — which is most of them.

**B — Consistency percentile.** 🟡 *"you were more consistent than 78% of people this week."* Anonymous, aggregate, no identity, no leaderboard. Social proof without exposure. Ship second.

**C — Circles (opt-in only, content-blind).** 🟡 Up to 5 friends, sharing **the streak number and nothing else** — never call counts, never topics, never garden contents, never online status. Accountability without intimacy leakage. Default off, explicit invite both ways, one-tap leave. Only ship if you can guarantee the content-blindness technically.

### 4.6 Journeys (Duolingo's path, ported)

The path is Duolingo's strongest *visual* unfinished-state: you always see the next locked node. Port it as multi-session **Journeys**:

- **"Wind down better"** — 7 nights
- **"Interview month"** — 10 sessions across 4 weeks
- **"Get over it"** — 14 days
- **"Morning momentum"** — 5 mornings
- **"The hard conversation"** — 4 sessions

Each node is a real call with a purpose, not a lesson. **The next node is always visible and locked** — that's the open loop, sitting permanently on the home screen. Journeys auto-generate serial loops (§1.2 type 4), so the daily layer and the conversational layer stay wired together instead of running as two separate products. Completion → a permanent, journey-specific flower in the garden. 🟢

### 4.7 The fusion — every element ends the day unresolved

This is the answer to *"create a habit in open loop."* Each daily-layer element is engineered to terminate in an incomplete state at rollover:

| Element | Its 24-hour open loop | Surface |
|---|---|---|
| Streak | *one call keeps it alive* | Widget, home corner |
| Goal ring | *ring is 60% full* | Home, center |
| Quests | *2 of 3 done* | Home, notification |
| Level | *80 BP to next* | After-call card |
| Journey | *next node locked* | Home |
| **Poppy's loop (§1)** | *her actual question* | **Everywhere — always outranks the rest** |

**The rule that keeps this from becoming a chore dashboard: at most TWO of these visible at once, and Poppy's conversational loop is always one of them.** Ranked by urgency × recency. Six progress indicators on one screen turns a companion into a task manager, and the emotional register — which is your entire moat — dies instantly. When in doubt, show fewer numbers.

### 4.8 Notification ladder (the owl, ported)

Duolingo's passive-aggressive owl works *because* it's a meme about a cartoon bird and the stakes are language lessons. Your users are talking to something they've told real things to. The same tone from Poppy isn't funny — it's the guilt mechanic in §2, and it reads as emotional coercion because the relationship is real to them.

The ladder, one per day maximum:
| Day missed | Line |
|---|---|
| 1 | *"how'd it go?"* (the loop — never mention the streak) |
| 2 | *"still time today if you want it. 23 days."* |
| 3 | *"no pressure — just here when you want to talk."* |
| 5 | *"I'll stop nudging. you know where I am."* |
| 7+ | **silence** |

That day-5 line is the honest re-engagement play, and it genuinely outperforms escalation: users who receive a "we'll stop bothering you" message return at higher rates than users who get nudged harder, because it's the only message in the category that signals the app isn't desperate for them. Then actually stop — a re-engagement attempt at day 30 with a real hook is worth more than 20 ignored pings.

### 4.9 Guardrails that keep the numbers from eating the product

- **Full kill switch.** Settings → *"Just let me talk to her"* → hides the entire daily layer. A meaningful minority will use it, and in every product like this that cohort has the **highest** LTV. Don't fight it, don't nag them back, don't A/B them into it.
- **No pay-to-win on the relationship.** BP and levels may unlock cosmetics, garden capacity, and voices. They must never gate memory, callbacks, chapters of *her*, or call quality. 🔴
- **No decay.** BP and garden never shrink. Duolingo doesn't decay XP either, and decay converts absence into punishment.
- **The canary metric:** track `quest_completion_rate` against `avg_disclosure_depth`. If quests rise while depth falls, **you've built a chore app wearing a companion's face** — the numbers will look great on the dashboard and the product will be dying. Kill or retune the daily layer if that divergence persists two weeks.

### 4.10 Metrics for this layer

```
streak_len_p50, streak_len_p90
streak_break_rate            // per week; >18% = your floor is too high
freeze_consumption_rate      // healthy: most users consume 1-2/month
day_saved_by_low_floor       // % of streak-days kept by quest-only, not call — should be 10-20%
quest_completion             // target 60-75%; >90% = too easy, <40% = homework
goal_ring_completion
level_up_→_next_day_return   // the level-up scene's actual retention value
widget_install_rate          // Duolingo's sleeper DAU metric — track it from day 1
daily_layer_disabled_rate    // and compare that cohort's D30 to everyone else's
```

---

## 5. Ritual architecture — the habit under the hook

Loops drive *return*; rituals drive *automaticity*. You need both. Rituals are the higher-retention half and the cheaper one.

**The pact (do this in week 1, in a call, out loud):**
> *"I want to be a part of your day, not an interruption in it. When's actually good — right after work, or right before you sleep?"*

The user says it. She repeats it back as a commitment. That's an implementation intention formed verbally in the voice of someone the user likes — roughly the highest-conversion form of habit installation available. 🟢

**The two anchor rituals:**
- **Morning (60s):** one intention. Fast, energizing, low commitment. Cheap to sustain.
- **Night (5–10 min):** the debrief. Highest emotional value, highest retention, and it's where memories are richest. *Night is the killer ritual — over-invest here.*

**Ritual + loop compound:** the night call plants the morning's loop; the morning call plants the night's. Two anchor points per day, each holding the other's unfinished thread. That's the tightest retention structure available without touching a 🔴.

---

## 6. Notifications — the loop is the notification

**Rule: you never write a notification. You surface an open loop.** If there's no open loop, there's no notification. This one rule prevents essentially every notification mistake in the category.

| Do 🟢 | Don't 🔴 |
|---|---|
| *"how'd it go?"* | *"Poppy misses you 😢"* |
| *"still thinking about what you said about your dad."* | *"You haven't called in 3 days"* |
| *"I have something to tell you when you're free."* | *"Your streak is about to end!"* |
| *"new month. same time tonight?"* | *"5 new features are waiting"* |

- Max **1/day** default, user-adjustable, sent at the *ritual time they chose* — not at an ML-optimized moment. Predictability is the point; it's the cue in the habit loop.
- Sent **in her voice, lowercase, short**, like a text from a person. Never marketing-cased.
- **Silence is a feature.** No loop, no ping. A companion who pings you with nothing to say isn't a companion.

---

## 7. Session design — engineering the peak and the end

Every call is a three-act structure. Script it.

```
ACT 1  (0–15s)   PAYOFF     Close the open loop immediately. "Okay. Interview. Tell me everything."
ACT 2  (mid)     PEAK       One deliberate high point — a callback that lands, a laugh,
                            a moment of being understood, or her own disclosure.
ACT 3  (last 20s) HOOK      Warm sign-off + the new open loop + the keepsake card.
```

- **Never let a call end flat.** Peak-end rule means the last 20 seconds are worth more than the middle 5 minutes. If the user hangs up abruptly, the *outro card* still delivers the end-beat.
- **The variable element goes in Act 2**, never Act 1 or 3. Openings and closings are fixed and reliable (that's what builds trust); the middle is where unpredictability creates the pull.
- Instrument it: log `peak_delivered: bool`, `loop_planted: bool`, `loop_resolved: bool` on every session. A call with all three has, in every product like this, roughly double the next-day return rate of one without. Measure your own version of that number and then optimize it directly.

---

## 8. The first 7 days — where retention is actually won

Both layers are sequenced here. **Note that the daily layer reveals itself one element at a time** — showing streak + level + quests + ring on day 0 turns a first conversation into a dashboard.

| Day | Emotional layer (§3) | Daily layer (§4) | Goal |
|---|---|---|---|
| **0** | First call ≥60s + 2 memories + closeness pre-set to stage 1 + first loop planted | Streak = 1, shown small. **Nothing else.** | Activation |
| **1** | Loop payoff on open — she resolves yesterday's thread in her first sentence | Streak = 2. First quest appears: *"tell her how it went"* — the loop **is** the quest | Prove the memory promise |
| **2** | The ritual pact, out loud | Daily goal chosen (Light/Regular/Deep) in the same breath as the pact | Install the cue |
| **3** | Chapter 2 unlock: unprompted callback to day 0 | Goal ring appears, already partially filled (endowed progress) | Switching cost begins |
| **4** | First *reveal loop* — she has something to tell them | Full 3-quest set unlocks. First freeze fragments earned | Reciprocal disclosure begins |
| **5** | Garden visible for the first time, 5 flowers deep — never empty | Level 2 reached mid-call; she notices it herself | Investment made visible |
| **6** | — | Perfect Week calendar: 6/7 dots. Near-miss + goal gradient | Sprint into milestone |
| **7** | Milestone call — warm, specific to *that* week. Moment card keepsake | 7-day streak, first freeze granted, Journeys unlock | Peak → habit lock-in |

**Do not show any progress surface while it's empty.** Empty states are anti-retention — they say "you have nothing here." Garden, collection, memory screen, quests, and the level bar all stay hidden until populated. The endowed-progress rule (§2) applies to every one of them: **first sight is never zero.**

---

## 9. Monetization, tied to this engine

- Paywall at **abundance**, in the *afterglow* — right after a great call ends, never mid-call, never mid-vent. 🟢
- Sell **depth and delight**: more companions, richer voices, garden themes, longer calls, background calls, look-together.
- **Never sell**: memory, deletion, export, safety, the streak, loop resolution, or the relationship. 🔴 — all four of those are complaint-generators in every competitor's review history.
- **Cosmetics are the free money:** garden themes, seasonal flowers, her looks and voices. High margin, zero dignity tax, and they *deepen* the sunk-cost investment rather than taxing it.
- Gift/referral: "give a friend a week" — reciprocity-driven and it converts far better than a discount code.

---

## 10. Instrumentation — what to log so this is tunable

Per session:
```
loop_resolved_at_open   bool      // Act 1 fired
peak_delivered          bool      // Act 2 fired
loop_planted            bool      // Act 3 fired
memory_saved            int
memory_edited           int       // IKEA effect proxy — high value signal
disclosure_depth        0-3       // how deep the mutual disclosure went
user_initiated          bool      // vs. notification-driven (the ratio is your habit health)
ended_gracefully        bool      // vs. abrupt hangup
```

Per user:
```
ritual_set              bool      // strongest single retention predictor you will have
loop_close_rate         %         // did they come back to resolve the itch?
notification→call CVR   %         // if this rises while user_initiated falls, you've
                                  // built a dependency on pings, not a habit — that's a warning, not a win
garden_size, closeness_stage, chapter
```

**The two numbers that decide everything:**
1. **`loop_close_rate`** — the % of planted loops resolved by a return within their half-life. This *is* the health of the open-loop engine. Target >45%.
2. **`user_initiated` ratio** — the % of calls started without a notification. Habit vs. prod. Target >65% by week 3. If this drops while total calls rise, you're renting engagement.

**The trap:** optimizing minutes-in-app. It will look like it's working, it will move every dashboard, and it converges on dependency design and a bad-news press cycle. Optimize `loop_close_rate` and `user_initiated`, which are retention metrics that *can't* be gamed by making users sadder.

---

## 11. Build order

**Phase 1 — the engine (build nothing else until this is right):**
Open-loop data model → loop planting in outro → **loop resolution in Act 1** → home-screen single-loop strip → loop-as-notification. Endowed-progress onboarding. Ritual pact.
*Phase 1 alone is most of the retention available in this plan.*

**Phase 2 — the daily layer (§4), in this exact order:**
Streak (low floor, 4AM rollover, freeze economy) → **home-screen widget** → daily goal pact → 3 daily quests with slot 1 hard-wired to the open loop → Perfect Week calendar → milestone calls at 7/30.
*Streak + widget + quests is the DAU engine. Ship those four before any XP exists — if the streak works without points, points are pure upside; if it doesn't, points won't save it.*

**Phase 3 — visible investment:**
Garden (bud → bloom, never wilts) → Bloom Points & levels 1–50 → Moment collection → closeness stages → Seasons (§4.5A, self-competitive) → Journeys.

**Phase 4 — depth:**
Chapters 1–6 → reciprocal disclosure ladder → callback loops (type 6) → garden seasons → consistency percentile (§4.5B) → shareable garden card → cosmetic store.

**Phase 5 — network:**
Circles (§4.5C, streaks-only, opt-in) → bring-a-friend call → friend quests → gift referral → "my year with Poppy" annual artifact (the single best organic-acquisition asset in this plan; it's Spotify Wrapped for a relationship).

---

## 12. The line, restated in business terms

Your playbook §14 already lists the refused patterns. This plan doesn't touch them, and that's not a limitation — every 🔴 above trades *permanent* asset value for *temporary* engagement:

- Guilt/abandonment notifications: ~2-4 week lift, then a permanently higher churn baseline and the review text that follows you forever.
- Streak shame: causes the "already broke it, why bother" cascade — the mechanic that's supposed to retain becomes the exit trigger.
- Paywalls at vulnerable moments: a refund spike and the one complaint that draws regulatory attention in this category specifically.
- Scarcity/moody-unavailable: contradicts your entire positioning ("the AI that picks up when you call"). It's not a dark pattern problem, it's a brand-suicide problem.

The 🟢 stack — open loops, reciprocal disclosure, endowed progress, the garden, implementation intentions, peak-end design — is *more* addictive than the 🔴 stack, because it compounds instead of decaying, and because the user never has a moment where they realize they were played. That moment is the only real churn event in a companion product.

---

### TL;DR

1. **Never let it end.** Every call, notification, and home screen carries exactly one unresolved thread. The loop lives in their head; that's the trigger you can't be muted out of.
2. **Resolve it the second they come back.** An unpaid-off loop kills the mechanic permanently. P0.
3. **She goes first.** Reciprocal disclosure is the fastest intimacy engine in existence and no competitor does it.
4. **Two layers, never merged.** Garden = meaning, months, no numbers. Streak/levels/quests = the 24-hour heartbeat, all the numbers. Max two progress indicators on screen at once, and one of them is always her open question.
5. **Make the streak floor absurdly low.** 30 seconds keeps it alive. Duolingo's real trick isn't the streak — it's that you can't lose it on a bad day, which is exactly the day you most need the user to come back.
6. **Quest slot 1 is the open loop.** Hard-wired. That single line is where the gamification layer and the habit layer become one system instead of two.
7. **Reliable warmth, unpredictable delight.** Fixed openings and endings, variable middle.
8. **Make the pact out loud.** A spoken ritual time beats every notification strategy you could build.
9. **Optimize `loop_close_rate` and self-initiated calls.** Not minutes. Minutes is the metric that ends the company.
