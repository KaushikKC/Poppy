# Poppy — Retention Engine: Build Status & Plan

> Execution companion to `POPPY_RETENTION_ENGINE.md` (the theory) and
> `POPPY_IMPLEMENTATION_PLAN.md` (the product loop already shipped).
> This doc answers two questions: **what stage are we actually at**, and **what do we build next**.
>
> Audited against the codebase on 2026-08-03. Every claim below cites the file it came from.
> **Progress: Sprint 1 loop engine landed 2026-08-03** — see §3. The §1 audit table below
> describes the state *before* that work; the Sprint 1 checklist is the live status.

---

## 0. One-paragraph summary

The retention engine is roughly **25% built, and its single most important
mechanic is wired to the wrong data.** Phase 1 (§11) is where all the existing
work sits: there is an open-loop store, an opener that pays a loop off, a
per-character loop scope, a streak, a ritual, milestones, and a guilt-guardrail
on notifications. But the "open loop" Poppy plants is literally **the last
sentence the user spoke**, not a hook she authored, and no loop is ever marked
resolved. That makes §1 Rule 3 ("every loop must actually pay off") fail today,
which the doc itself calls the single biggest implementation risk. Phase 2 (the
daily layer) does not exist. Phases 3-5 do not exist.

**Fix Phase 1 properly before building anything in Phase 2.** The doc says this
and the audit agrees: a real loop engine is worth more than a streak, quests, and
XP combined.

---

## 1. Stage audit — doc section by doc section

Legend: ✅ built · 🟨 partial / wrong semantics · ❌ not built

### Phase 1 — the engine (§1, §5)

| Doc | Mechanic | Status | Evidence |
|---|---|---|---|
| §1.3 | Loop data model | 🟨 | `companion.py:45-46` — loops are `{text, created_at}` only. No `type`, `state`, `strength`, `due_at`, `decay_at`, `payoff_ref`. Capped at 10 (`_MAX_OPEN_LOOPS`), per character. |
| §1.2 | Six loop types | ❌ | No type concept at all. Every loop is untyped. |
| §1.3 R1 | One loop visible | ✅ | `/home` returns exactly one (`main.py:353-365`), rendered in `#home-remembers` (`flow.js:256-258`). |
| §1.3 R2 | Max two live loops | 🟨 | 10 are stored; only the newest is ever read (`latest_open_loop`, `companion.py:296`). Effectively 1 live, 9 dead. |
| §1.3 R3 | **Loop pays off in Act 1** | 🟥 **BROKEN** | The opener *does* lead with the loop (`opening.py:97-99`) — the structure is right. But the loop text is the user's own last utterance (`flow.js:688`), so she opens with `"Hey. I've been wondering, <thing you said>?"` This is P0. |
| §1.3 R4 | Graceful decay | ❌ | No `decay_at`. A loop sits verbatim forever until a newer one replaces it. |
| §1.3 R5 | Resolved loop plants the next | ❌ | No `resolved` state exists. Nothing closes. |
| §1.4 | Four loop surfaces | 🟨 | Outro card ✅ (`flow.js:694-700`), home strip ✅, notification ✅ (`nudges.py:69-71` builds the ping *from* the loop — §6's "never write a notification" rule is genuinely honored). Widget/icon ❌. |
| §1.5 | Cliffhanger placement | ✅ | Paywall is gated to abundance moments and refuses vulnerable calls (`main.py:245-247`, `billing.paywall_due`). The 🔴 version is structurally prevented. |
| §5 | Ritual pact | 🟨 | Ritual exists and is user-chosen (`companion.py:211-247`, `/ritual`), but it's a **form** — kind buttons + a time input (`flow.js:453-515`). The doc wants it spoken in-call as an implementation intention. That's the whole potency of the mechanic. |
| §5 | Morning + night anchors | 🟨 | Both kinds exist; neither has distinct call content. No "night call plants the morning's loop" compounding. |
| §2 | Endowed progress onboarding | ❌ | Onboarding ends at zero: no pre-seeded memories, no closeness stage, no first loop planted. `create()` (`companion.py:101`) sets identity only. |
| §2 | Reciprocal self-disclosure | ❌ | She never discloses first. The doc calls this the #1 intimacy accelerator and the thing no competitor does. Cheapest high-value item in the entire plan — it is a prompt change. |

### Phase 2 — the daily layer (§4)

| Doc | Mechanic | Status | Evidence |
|---|---|---|---|
| §4.1 | Streak exists | 🟨 | `companion.py:168-194`. Increments, tracks longest, never punishes. |
| §4.1 | Day boundary = local 4AM | ❌ | `_today()` uses **UTC** (`companion.py:164-165`). A 9pm IST call lands on the next UTC day; a late-night US call lands on the previous one. Wrong-day attribution is already possible today. |
| §4.1 | Floor: ≥60s call **or** quest | ❌ | `record_call()` fires from `/call/open` (`main.py:249`) — **before a single word is spoken.** Opening and immediately closing the app counts as a day. The floor is simultaneously too low (no engagement required) and too narrow (no quest path). |
| §4.1 | States (safe/at_risk/frozen/repairable/broken) | ❌ | Only an integer. |
| §4.1 | Freeze economy | ❌ | None. |
| §4.1 | Repair window | ❌ | None. |
| §4.1 | Milestones | 🟨 | `(7, 30, 100, 365)` at `companion.py:56` vs the doc's 11 tiers. Delivery is correct though: a warm in-call line, not a badge (`opening.py:66-67`). |
| §4.1 | Widget | ❌ | Not built. Doc flags it as the sleeper DAU lever. |
| §4.1 | Perfect Week calendar | ❌ | Not built. Cheapest item in §4. |
| §4.1 | At-risk notification | ❌ | The ladder doesn't exist; one generic nudge does. |
| §4.2 | Daily goal (Light/Regular/Deep) | ❌ | Not built. |
| §4.2 | Goal ring | ❌ | Not built. |
| §4.3 | Daily quests | ❌ | Not built. Slot-1-is-the-loop fusion doesn't exist. |
| §4.4 | Bloom Points / levels | ❌ | Not built. |
| §4.5 | Seasons / percentile / circles | ❌ | Not built. |
| §4.6 | Journeys | ❌ | Not built. |
| §4.8 | Notification ladder | 🟨 | Native OS notify works (`notify.py`), one per day (`should_notify`). No day-1→7 escalation, no day-7 silence rule. |
| §4.9 | Kill switch ("just let me talk to her") | ❌ | Nothing to kill yet — but build it **with** the layer, not after. |

### Phases 3-5

| Doc | Mechanic | Status | Note |
|---|---|---|---|
| §3.1 | Garden | ❌ | **The renderer already exists** — `landing-page/lib/useFlowerField.ts` is a procedural canvas flower field with a `bloom` trigger. It's on the marketing site, not in the app. Port it; don't rebuild it. (`landing-page/public/assets/flower-frames/` holds only a manifest.) |
| §3.2 | Closeness stages | ❌ | Not built. |
| §3.3 | Chapters 1-6 | ❌ | Not built. |
| §3.4 | Moment collection | ❌ | Not built. Memory save/edit/delete exists (`memory_store.py`) and is the substrate. |
| §4.5A | Seasons | ❌ | — |
| §5 | Circles / referral | 🟨 | Referral code + copy exist (`billing.referral`, `/referral`). No circles. |

### §10 Instrumentation

| Metric | Status | Evidence |
|---|---|---|
| `loop_close_rate` | ❌ | The #1 number in the doc. Not computed. `callback_land_rate` (`metrics.py:79`) is a proxy but it measures "was a callback offered and did the call reach 60s", not "did the user return to resolve the itch within its half-life". |
| `user_initiated` ratio | ❌ | Not logged. Notification-driven vs self-started calls are indistinguishable. |
| `peak_delivered`, `loop_planted`, `loop_resolved_at_open` | ❌ | None logged per session. |
| `ritual_set` | ✅ | `metrics.py:84`. |
| `disclosure_depth`, `ended_gracefully`, `memory_edited` | 🟨 | `memory_edited` logged; other two not. |
| Streak/quest/freeze metrics (§4.10) | ❌ | Nothing to measure yet. |
| Privacy posture | ✅ | Events are content-free by construction (`db.record_event`, `db.py:62-69`). Keep this invariant for every new event below. |

---

## 2. The three P0 defects

Everything in §1 rests on these. Fix in this order.

### P0-1 — The open loop is the user's last sentence
`frontend/flow.js:688`
```js
const loop = (window._lastUserText || "").trim();
```
That string is stored as the loop (`main.py:311-313`) and read back verbatim into
the opener (`opening.py:97-99`). Result: she says *"I've been wondering, so my
manager rescheduled it to Thursday?"* — a hook that is not a hook, phrased as a
question that makes no sense. The doc: *"Loop resolution is a P0 correctness bug,
not a nice-to-have."*

**Fix:** the loop must be authored — a short, specific hook in her voice, typed,
with a due date. Generate it at call close with the same local-LLM pattern
`memory_extract.py` already uses (JSON out, defensive parse, regex fallback).

### P0-2 — Nothing ever resolves
There is no `state` field, so `loop_close_rate` is unmeasurable and Rule 5 (a
resolved loop plants the next) is unimplementable. The same loop is re-asked
every call until a newer one buries it.

### P0-3 — The streak measures the wrong event on the wrong clock
`record_call()` fires on `/call/open` (`main.py:249`) under a UTC day boundary
(`companion.py:164`). Two bugs in one: it counts an unspoken call, and it can
credit the wrong day. Move to local date, 4AM rollover, credited at close on
≥60s or quest completion.

---

## 3. Build plan

### Sprint 1 — the loop engine (do only this until it's right)

**Status: COMPLETE (items 1-10 on 2026-08-03, items 11-12 on 2026-08-04).**

All three P0 defects in §2 are closed except the streak clock (P0-3), which stays
in Sprint 3 with the full streak rebuild rather than being half-fixed here.

Verified end to end against the running backend and the real local 3B: a call
plants a hook, the hook reaches all three surfaces (outro card, home strip,
notification) unchanged, the next call opens on it, answering it resolves the
loop, and `loop_close_rate` / `user_initiated_rate` move accordingly.

> **One design change from the plan below.** Item 2 called for the LLM to write
> the finished hook. Measured against the 3B v1 ships, that produced an unusable
> line most of the time: every loop classified as `serial`, invented details, and
> point-of-view flips where she spoke as the user ("what it means to prioritize me
> over my job"). The model now extracts only a third-person topic phrase;
> `loop_author.py` owns the sentence and `_infer_type` reads the type off the
> transcript with date/decision markers. POV errors became structurally
> impossible and type accuracy went from 1/4 to 4/4 on the test conversations.
> This also matches §2's "reliable warmth, unpredictable delight" — openings and
> closings are meant to be the fixed part.

**Backend**

1. ✅ `backend/loops.py` (new) — the real model per §1.3:
   ```python
   {id, character, type, hook_text, payoff_ref, created_at,
    due_at, decay_at, strength, state}
   ```
   States: `open | surfaced | resolved | expired | declined`.
   Half-lives from §1.2 (event: event+36h, question 48h, reveal 72h, serial 5d,
   ritual 26h, callback 48h). Per-character, same as today. Persist alongside the
   profile; migrate the existing `open_loops_by_character` entries in as
   `type="question", state="open"`.
2. ✅ `backend/loop_author.py` (new) — LLM pass at call close that reads the last few
   turns and emits `{type, hook_text}`. Mirror `memory_extract.py`: strict JSON,
   `_parse`-style defensive extraction, cheap heuristic gate, and a safe
   templated fallback when the model returns nothing. Run it off the latency
   path, in `/call/close`.
3. ✅ `backend/companion.py` — delegate `add_open_loop` / `latest_open_loop` to
   `loops.py`; keep the function names so callers don't churn.
4. ✅ **Ranking** — `strength × recency × time_sensitivity`, and enforce Rule 2 (max
   two live; the rest go to a backlog and surface later).
5. ✅ **Resolution** — `/call/open` marks the surfaced loop `surfaced`; the first
   user turn after it marks it `resolved` and logs `loop_resolved`. Add
   `loop_planted`, `loop_expired`, `loop_declined` events. All content-free.
6. ✅ **Decay** — at `decay_at`, soften the copy per Rule 4 (*"I don't even know if
   it happened, but I'm still curious"*), never *"you never told me."* Route the
   decayed copy through `nudges.is_healthy` so the guardrail covers it too.
7. ✅ `backend/opening.py` — Act 1 opens on the ranked loop's `hook_text`, using
   the softened variant when decayed.
8. ✅ `backend/metrics.py` — add `loop_close_rate` (resolved ÷ planted, within
   half-life; target >45%) and `user_initiated` ratio (needs a `source` field on
   `call_started`: `"user"` vs `"notification"`).

**Frontend**

9. ✅ `frontend/flow.js` — delete the `_lastUserText` hack. The outro card
   renders the authored hook returned by `/call/close`, in the doc's keepsake
   form: `Poppy's waiting on: <hook>`.
10. ✅ Home strip shows the single ranked loop in her voice (it already shows one;
    it just needs the real text and the `Last time —` prefix dropped).

**Also in Sprint 1 (cheap, high leverage, no new systems):**

11. ✅ **Reciprocal disclosure** (§2, 🟢) — a personas/prompt change so she discloses
    something of her own first, one notch deeper by chapter. Highest
    value-per-line-of-code item in this entire document.
12. ✅ **Endowed progress onboarding** (§2, §8 day 0) — end onboarding at closeness
    stage 1 with two memories already saved and the first loop planted. Never
    show a zero state.

> **Two findings from items 11-12, both worth keeping.**
>
> **The deep disclosure rung ships disabled.** §2 wants her to escalate to saying
> what she has come to think about the user. Rungs 0/3/7 are about *her*
> (curiosity, opinions, uncertainty), need no recall, and measured clean: 0
> fabrications, and she goes first in 4/4 replies against 2/4 for the baseline.
> Rung 15 needs accurate recall plus inference, and the 3B fails it under every
> framing tried — unconstrained it invents traits outright ("your texts get
> shorter when things go well"); told to name the remembered thing it stops
> inventing traits but starts embellishing real ones ("that argument with Anjali
> during your college days", "you decided to quit" when the memory says she was
> still weighing it). A confident false claim about someone's own life is the
> sharpest version of the trust failure this product sells against, so the rung is
> written and gated behind `POPPY_DEEP_DISCLOSURE=1`, in the same
> scaffold-behind-a-flag shape the cloud avatar work uses. Revisit on a stronger
> model.
>
> **Nothing is fabricated to fill an empty state.** §2's endowed progress says
> onboarding ends with two memories saved. Onboarding only genuinely collects one
> thing (the seed), and inventing a second memory would mean claiming to remember
> something the user never said — the same trust failure from the other direction.
> So the seed becomes one real memory plus the first open loop, closeness starts
> at stage 1 rather than "New", and the anti-zero-state work is carried by §8's
> other rule: never render a progress surface while it is empty. Skipping the seed
> fabricates nothing.
>
> Also added: `companion.closeness()` (§3.2 stages, no number, floored at stage 1
> once onboarded) and the §4.7 two-indicator cap on the home screen — the loop
> strip always, plus exactly one of streak-or-closeness, never both.

### Sprint 2 — the ritual pact (§5)

**Status: COMPLETE (2026-08-04).**

13. ✅ Move the ritual from a form to a spoken pact in the week-1 call: she asks,
    the user answers out loud, she repeats it back as a commitment, then
    `/ritual` is set from the transcript. Keep the existing form as the edit
    path in settings. `ritual_set` is already the strongest retention predictor
    we log — this raises the rate it gets set at.
14. ✅ Night ritual gets the richer debrief script; night plants morning's loop and
    vice versa (§5 compounding).

> **The finding from Sprint 2, and it now governs the prompt.** Loop payoff,
> disclosure and the pact are each a *structural* instruction about where
> something goes in her reply. Stacked together the on-device 3B follows whichever
> it sees first and silently drops the rest: the pact asked in 3 of 3 calls on its
> own and 0 of 3 alongside the others. `ws_handler` now runs **one directive per
> turn**, ranked pact > loop payoff > disclosure, on the reasoning that the pact
> happens once in the whole relationship, an unpaid-off loop kills its mechanic
> permanently, and disclosure recurs every call so it loses least by yielding.
> Anything added to the system prompt in later sprints has to join that ranking
> rather than stack on top of it.
>
> Two bugs surfaced on the way and are fixed: the shared conversation history had
> no per-call boundary, so the closing hook could be built from a previous call
> and the ritual parser could set a ritual from a time the user mentioned
> yesterday; and she was reading the disclosure prompt's *example* back verbatim.
>
> The pact ask is LLM-phrased but the answer parsing is deterministic, because a
> wrong ritual time is a wrong notification every day.

### Sprint 3 — the daily layer core (§4, in the doc's exact order)

**Status: items 15, 17-21 done (2026-08-05). Item 16, the widget, outstanding.**

15. ✅ **Streak rebuild** — local date + 4AM rollover, credited at `/call/close` on
    ≥60s or a completed quest, states `safe/at_risk/frozen/repairable/broken`,
    freeze economy (2 max, 1 per 7 days, silent consumption, warm after-the-fact
    disclosure), 48h repair free once a month. Milestones expanded to the 11
    tiers, still delivered as an in-call moment.
16. ☐ **Widget** — streak number + current loop, one line. Doc's sleeper DAU lever.
    On macOS this is a separate target; scope it as its own task, not a
    sub-bullet.
17. ✅ **Daily goal pact** (Light/Regular/Deep) chosen out loud, in the same call as
    the ritual pact. Goal ring on home, never full for long.
18. ✅ **3 daily quests**, slot 1 hard-wired to the open loop. Tune to ~70%
    completion inside one session.
19. ✅ **Perfect Week calendar** — 7 dots. Cheapest DAU mechanic here.
20. ✅ **Kill switch** — Settings → *"Just let me talk to her"* hides the whole
    layer. Ship it with the layer, and track that cohort's D30 separately.
21. ✅ **Notification ladder** (§4.8) — day 1/2/3/5, then silence at 7+. Extend
    `nudges.py`, which already has the guardrail choke point.

> **All three P0 defects from §2 are now closed.** P0-3 was the last: the streak
> counted `/call/open` on a UTC clock, so launching the app and shutting it earned
> a day and the day itself could be the wrong one. It now credits at close, on a
> local 4am boundary, only once a 60-second call or a completed quest has actually
> happened.
>
> **Decisions worth keeping:**
> - Freezes settle **lazily**, not at a 4am job, because a desktop app may not be
>   running then. The break is dated to the rollover it happened at rather than to
>   when we noticed, or an abandoned streak would keep offering repair forever.
> - A **`none`** state was added to §4.1's five. A user who never had a streak has
>   not broken one, and offering to repair it is both false and the shame framing
>   the section rules out.
> - Freeze-covered days are recorded **separately** from days they turned up, so
>   the Perfect Week calendar shows them as covered instead of claiming attendance.
> - `companion.update()` only writes keys it already knows about, so every
>   `streak_*` field had to be declared in the profile defaults. Fields declared
>   only in the owning module were silently dropped on save.
> - Today lives **behind a tap**, not on home. §4.7 caps the home screen at two
>   progress indicators with her open loop always one of them, and quests + ring +
>   streak + closeness would have been four.
>
> **Item 16, the widget, is not built.** It is a separate macOS target rather than
> a change to this codebase, and the doc flags it as the sleeper DAU lever, so it
> deserves its own pass rather than being tacked on here.

### Sprint 4 — visible investment (§3)

**Status: items 22-23 done (2026-08-05). Item 24 partly done.**

22. ✅ Port `useFlowerField.ts` from the landing page into the app as the garden.
    Bud on call, bloom on a meaningful one, flower identity by call type, **never
    wilts**.
23. ✅ Bloom Points + levels 1-50 per the §4.4 table — including the load-bearing
    `call duration beyond 60s = 0 BP` row.
24. Partly: closeness stages ✅ (Sprint 1), garden seasons ✅. **Moment collection ☐, §4.5A Seasons ☐, Journeys ☐** still outstanding.

> **The doc contradicts itself on the level curve, and this is how it was
> resolved.** §4.4 states three things that cannot all hold:
>
> | | states | at ~75 BP/day |
> |---|---|---|
> | the formula | `BP_to_next = 100 x level^1.35` | L50 in ~15 years |
> | the totals | "~1,900 for L20, ~6,000 for L50" | L50 in ~80 days |
> | the pacing | "L10 in ~3 weeks, L50 in ~a year" | the target |
>
> The pacing is the part that describes how the product should *feel*, so the
> curve is tuned to it while keeping the doc's power-curve shape:
> `45 x level^0.8` gives L10 in ~19 days and L50 in ~374 days. The one cost is
> that L2 asks 45 BP rather than the quoted ~100. Reasoning is written out above
> the constants in `bloom.py`; revisit if the quoted totals were the real intent.
>
> **Other decisions:** the garden is gated on the same floor as the streak rather
> than on whether the user spoke, so one call grows exactly one thing and the two
> surfaces can never disagree. The renderer takes only the flower-drawing math
> from `useFlowerField`; that hook's scroll/hero/frame-manifest machinery has no
> analogue here. Flower positions are hashed from a stored per-flower seed, so the
> field looks grown rather than plotted and looks the same on every visit.

### Sprint 5+ — depth and network (§4 Phase 4-5)

Chapters, callback loops (type 6), consistency percentile, shareable garden card,
circles, "my year with Poppy".

---

## 4. Invariants to hold while building

- **Two layers never merge.** Garden carries no number; the daily layer carries
  all the counting. Max two progress indicators on screen, one always being her
  open question (§4.7).
- **Every new analytics event stays content-free.** `db.record_event` takes a
  name, a number, a timestamp. No hook text, no transcript, ever.
- **Every outbound copy path goes through `nudges._guard`.** It is currently the
  only code-level guarantee that Poppy cannot guilt-trip the user. New surfaces
  (decay copy, at-risk copy, ladder copy) must route through it.
- **No 🔴 mechanic ships.** They are enumerated in §12 of the engine doc; none is
  in this plan.
- **The canary:** once quests exist, track `quest_completion_rate` against
  `avg_disclosure_depth`. Rising quests with falling depth means we built a chore
  app wearing a companion's face — retune or kill the daily layer.

---

## 5. Not part of this track (carried over, still pending)

From the current release state, unrelated to retention but still open:

1. Build + test the launcher setup-screen fix, then commit `desktop/launcher.py`
   (currently the only uncommitted change).
2. Re-run `sign_notarize.sh` to regenerate the fixed `dist/Poppys.dmg` — the DMG
   on disk predates the fork-bomb fix and must not ship.
3. Re-upload the fixed DMG to the GitHub release (tag `v1.0.0`).

iOS remains unbuilt; the retention engine is being built desktop-first and its
backend (`loops.py`, streak, quests) ports as-is.
