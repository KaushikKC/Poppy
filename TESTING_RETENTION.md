# Testing the retention engine by hand

Everything built in Sprints 1-4, in the order you'd naturally hit it.

Automated suites (no server, no LLM): `./tests/run_all.sh`
This document is the **frontend** pass.

---

## 0. Setup

Run against a throwaway data directory so your real companion data is untouched:

```sh
export POPPY_DATA_DIR=/tmp/poppy-qa
mkdir -p $POPPY_DATA_DIR
./run.sh                     # or: LLM_BACKEND=mlx ./run.sh
```

Open **http://127.0.0.1:8000** in Chrome.

**State lives in `$POPPY_DATA_DIR/`:**

| file | what |
|---|---|
| `companion_profile.json` | streak, ritual, goal, points, garden, quests |
| `companion_loops.json` | the open loops |
| `companion.db` | analytics events + transcripts |
| `companion_memory_*.enc` | encrypted memories |

Nothing is cached in memory, so you can **edit `companion_profile.json` while the
app is running** and just refresh the page. That's how you time-travel below.

To start completely fresh: `rm -rf $POPPY_DATA_DIR/*` and reload.

---

## 1. Onboarding never ends at zero  (Sprint 1, §2)

1. Fresh data dir → reload → onboarding appears.
2. Step through, pick a character.
3. At **"what's one thing on your mind today?"** type:
   `the interview on thursday`
4. Tap through to the call screen, then hang up immediately.

**Expect on home:**
- A strip **in her voice**: *"when we first talked you mentioned the interview on
  thursday, how's that been going?"*
- A chip reading **"Getting to know you"** (not "New", not a zero).

**Fails if:** home is blank, or the chip says New.

---

## 2. She goes first  (Sprint 1, §2)

Start a call and say something ordinary: *"work was rough today"*.

**Expect:** her reply opens with something **of her own** before it asks you
anything — what struck her, what she's curious about. Not "I'm so sorry to hear
that" (that's sympathy, which the code specifically excludes).

Deepens with call count: opinions from call 3, uncertainty from call 7.

---

## 3. The loop is authored, not your own sentence  (Sprint 1, the P0)

1. In a call, say: *"I've got that interview on Thursday and I'm dreading it"*
2. Let her reply, then **End call**.

**Expect on the outro card:** *"She'll remember"* + a hook **in her voice**, e.g.
*"tell me what happened with the thursday interview, I want the whole thing."*

**Fails if:** the card repeats your own sentence back at you. That was the bug.

---

## 4. Act 1 pays the loop off  (Sprint 1, §7)

1. Go back to home — the same hook is the strip.
2. Start another call.

**Expect:** she opens **with that hook**, before anything else.

3. Answer it. End the call.
4. Check `http://127.0.0.1:8000/metrics` → `loop_close_rate` should be `1.0`, and
   a **new, different** hook is on the outro card.

---

## 5. The ritual pact, out loud  (Sprint 2, §5)

Needs `total_calls >= 2`, so do this on your **third** call.

1. Start a call and talk for **two or more turns** (she asks on turn 2+).
2. **Expect:** she asks something like *"what time would you like me to check in
   each day? after work, or right before bed?"*
3. Answer out loud: *"before bed, around 10pm"*
4. **Expect:** she says it back as a plan.
5. End the call → outro card shows *"It's a plan. Nights at 10pm."*
6. Home now shows *"Night check-in at 10:00 PM"*.

**Not asked?** She skips it on a distress turn by design. Check
`ritual_pact_asks` in the profile; it stops after 3 tries and after any decline.

---

## 6. The streak floor  (Sprint 3, the P0)

1. Start a call and hang up after **~5 seconds**.
   **Expect:** no streak anywhere. Opening the app is not a day.
2. Start another and stay **over 60 seconds**.
   **Expect:** the day is credited.

Check `http://127.0.0.1:8000/streak` → `current: 1`, `state: "safe"`,
`met_today: true`.

> The home chip only shows a streak once it's **more than 1** day — below that it
> shows the closeness stage instead, because §4.7 allows only one number there.

---

## 7. Time-travel: freezes, repair, at-risk

Stop nothing; just edit `companion_profile.json` and reload the page.

**A freeze covers a missed day**
```json
"streak_last_date": "<the day before yesterday>",
"current_streak": 5,
"streak_freezes": 2
```
Reload → home shows *"You missed yesterday. I covered you, one left."*
It appears **once**, then clears. `/streak` shows `freezes: 1`.

**A broken run offers repair**
```json
"streak_last_date": "<3 days ago>",
"current_streak": 4,
"streak_freezes": 0
```
Reload → *"Your 4 day run stopped. Want it back?"* + **Pick it back up**.
Tap it → the run returns. There is no price anywhere, by design.
Do it twice in one month → the second time it's simply gone (no offer).

**Never had a streak** → `state` is `"none"`, and no repair is offered. A new user
hasn't broken anything.

---

## 8. Today: quests, ring, week  (Sprint 3, §4.2-§4.3)

On home, tap **"Today · 0 of 3"**.

**Expect:**
- **Slot 1 is always her open loop** — *"Answer her: tell me what happened with…"*
- Two more, at least one needing a deliberate act (save a memory, fix one, try a
  new mood).
- A ring showing progress against your goal.
- Seven dots for the week. A **dashed** dot is a day a freeze covered — it is
  deliberately not shown as a day you turned up.

Complete one (e.g. save a memory when she offers) → the count rises after the
call ends. Ending at 2 of 3 is the intended state, not a failure.

---

## 9. The kill switch  (Sprint 3, §4.9)

In Today, tap **"Just let me talk to her"**.

**Expect:** the Today button disappears from home and stays gone. Nothing asks
you to turn it back on. `/quests` returns `{"off": true}`.

Turn it back on: `curl -X POST localhost:8000/daily-layer -H 'Content-Type: application/json' -d '{"off":false}'`

---

## 10. The notification ladder  (Sprint 3, §4.8)

Set a ritual time a minute or two ahead, then set `last_call_date` back:

| set `last_call_date` to | expect |
|---|---|
| 2 days ago | *"still time today if you want it."* or *"N days. one call keeps it going, even a short one."* |
| 3 days ago | *"no pressure. just here when you want to talk."* |
| 5 days ago | *"I'll stop nudging now. you know where I am."* |
| 7+ days ago | **nothing at all** — no banner, no notification |

The banner is on home; the OS notification fires from the backend at the ritual
time. Silence at day 7 is the feature.

---

## 11. The garden  (Sprint 4, §3.1)

1. Do a couple of calls over 60s, using **different moods** (Vent, Hype, Wind down).
2. Home → **"Your garden"** appears (hidden until something has grown).

**Expect:** a full-screen field. Each qualifying call is one flower; a call with a
saved memory is an open bloom, a bare one is a smaller bud. Different moods have
different petal counts and colours. The caption names the **season**, never a total.

**Check nothing wilts:** set `last_call_date` to 2020 and reload. Every flower is
still there, unchanged.

---

## 12. Bloom Points  (Sprint 4, §4.4)

`http://127.0.0.1:8000/bloom`

- A 90-second call and a 40-minute call award **the same**. Talking longer earns
  nothing — that's the rule that keeps the number un-grindable.
- `to_next` stays `null` until you're inside the last 20% of a level.
- Award caps are per day; repeat the same action and it stops paying.
- Set `ritual_time` to now → `double: true` (2x inside your own ritual window).

A level-up is reported at the **next call open**, so she can mention it herself
rather than a popup interrupting.

---

## Quick reference: useful profile fields

```json
"total_calls":            gates the ritual pact (needs >= 2)
"last_call_date":         drives the notification ladder
"streak_last_date":       the local 4am streak-day of the last qualifying call
"current_streak":         the run
"streak_freezes":         0-2
"streak_broken_at":       ISO timestamp; repair offered within 48h
"ritual_kind" / "ritual_time":  "night" / "22:00"
"daily_goal":             "light" | "regular" | "deep"
"daily_layer_off":        true hides the whole counting layer
"bloom_points":           total BP
"garden":                 the flowers
```

Day boundary is **4am local**, so a call at 00:30 counts for the previous day.
