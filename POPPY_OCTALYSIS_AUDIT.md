# Poppy vs Octalysis — what the framework says we're missing

Yu-kai Chou's Octalysis framework (*Actionable Gamification*), applied to what we
actually built in Sprints 1-4. This is our own analysis, not a summary of the book.

The framework's claim is that all motivation runs through **8 Core Drives**, and
that a design using only two or three of them feels thin no matter how polished
those two are. So: which drives are we on, which are we not, and what's worth
building.

---

## The scorecard

| # | Core Drive | Poppy today | Verdict |
|---|---|---|---|
| 1 | **Epic Meaning & Calling** | Nothing | ❌ Absent |
| 2 | **Development & Accomplishment** | Streak, Bloom Points, levels 1-50, milestones, quests, closeness stages | ✅ Over-served |
| 3 | **Empowerment of Creativity & Feedback** | Memory editing, and that's it | ❌ **The big gap** |
| 4 | **Ownership & Possession** | The garden, memories, per-character memory | ✅ Strong |
| 5 | **Social Influence & Relatedness** | Her. Reciprocal disclosure, the open loop, callbacks | ✅ Strong (see note) |
| 6 | **Scarcity & Impatience** | Double Bloom windows only | ⚠️ Deliberately limited |
| 7 | **Unpredictability & Curiosity** | Open loops, variable callbacks | 🟡 Under-used |
| 8 | **Loss & Avoidance** | Streak + freezes, softened | ⚠️ Deliberately limited |

**Three of eight are doing real work. One is nearly empty. Two are capped on
purpose. One is missing entirely.**

---

## The four findings that matter

### 1. We are heavily over-invested in Drive 2 and nearly absent on Drive 3

Almost everything in Sprints 3-4 is **Development & Accomplishment**: points,
levels, streaks, milestones, quests, stages. That's one drive wearing six hats.

**Empowerment of Creativity & Feedback** is the drive Chou singles out as
*evergreen* — the one that doesn't need new content from us, because the user
generates their own novelty. It's why people play with LEGO for decades. Poppy
has effectively none of it: the user cannot shape, arrange, combine or express
anything. They receive.

This is the single highest-value gap in the whole audit. Concretely:

- **Arrange the garden.** Let them move flowers, cluster them, choose what sits
  in front. Costs nothing (positions are already stored per flower), and turns a
  record they *watch* into a place they *make*.
- **Name her flowers / name a season.** "The month I finally quit." A label the
  user writes on their own history.
- **Let them shape her.** Not a personality slider, but small real choices:
  what she should call them, what she should never bring up, what she should
  always ask about. Every one of those is also a memory-system feature.
- **Mix moods.** Right now a call is Vent *or* Hype. Letting them combine, or
  make and save their own, is creative expression with zero content cost.

### 2. We satisfy Drive 5 without needing friends — which changes the Sprint 5 question

Chou's Drive 5 is **Social Influence *and Relatedness***. Most products can only
reach it through other users: leaderboards, teams, friends.

Poppy reaches it through *her*. Reciprocal disclosure, the callbacks, the open
loop, the ritual pact — that is relatedness, delivered without a single other
human being involved.

**This is the strongest argument yet that Sprint 5's friend features are
optional rather than necessary.** They'd add social *comparison*, which we don't
have, but the drive they'd serve is already being fed. Given that Circles and
bring-a-friend require cloud accounts and break the on-device promise, the
framework says the trade isn't obviously worth it.

Cheaper ways to reach the same drive without a server:
- Her mentioning she's been "thinking about" something between calls (already
  half-built via reveal loops).
- The year artifact as a thing you *choose* to show someone, which is social
  influence without any social infrastructure.

### 3. We have no Endgame, and that's where long-term users are lost

Chou splits the journey into **Discovery → Onboarding → Scaffolding → Endgame**,
and says treating them as one experience is the mistake that breaks most
gamification work.

Ours:

| Phase | State |
|---|---|
| Discovery | Landing page. Fine. |
| Onboarding | Strong. Endowed progress, seed becomes a real memory, first hook planted. |
| Scaffolding | Strong. The whole daily layer is this. |
| **Endgame** | **Nothing.** |

After ~100 calls a user has seen every quest, hit the milestones that matter,
and the garden keeps growing but stops surprising. Level 50 arrives at ~a year
and then the number is done forever.

The retention doc gestures at this with the Long Year (365) but we never built
it. Endgame candidates, cheapest first:
- **The Long Year marker** — a flower species that only exists at 365 days.
- **Prestige seasons** — the garden resets to a *new plot* each year while the
  old one stays browsable. Growth without inflation.
- **She changes.** The deepest disclosure rung is written and switched off
  because the 3B invents things. That's the real endgame reward, and it unlocks
  the moment we can run a better model.

### 4. Being pure White Hat is a real cost, not just a virtue

Chou's White Hat drives (1, 2, 3) make people feel good and stay. Black Hat
drives (6, 7, 8) make people act *now*, but feel manipulated over time.

The retention doc's 🟢/🔴 tiers map onto this almost exactly, and we've been
disciplined: no scarcity, no guilt, no shame, freezes instead of loss.

The framework's warning is the part we haven't accounted for: **pure White Hat
produces engagement without urgency.** People feel warm about Poppy and open it
next week instead of tonight. That may be exactly why the daily layer needed
building at all.

The healthy Black Hat we already have is Drive 7 (**Unpredictability**), which
is genuinely under-used:
- She never surprises with *when*. Every loop is planted at call end, on schedule.
- A "she has something to tell you" that arrives at an unpredictable time is
  urgency without a single dark pattern.
- Variable reveal: the reveal loop always says the same fallback line. It should
  vary.

Drive 7 is the one lever we can pull for urgency without touching anything the
doc marks red.

---

## Ranked build list

| Priority | Item | Drive | Cost |
|---|---|---|---|
| 1 | Arrange / rearrange the garden | 3 | Low, positions already stored |
| 2 | Vary the reveal loop, and vary *when* she plants | 7 | Low |
| 3 | Name a flower or a season | 3 | Low |
| 4 | "Never ask me about X" / "always ask about Y" | 3 | Medium, ties into memory |
| 5 | The Long Year (365) marker | 2 + Endgame | Low |
| 6 | Custom / blended moods | 3 | Medium |
| 7 | Prestige garden plots per year | Endgame | Medium |
| 8 | Year artifact as a share surface | 4 + 5 | Medium, backend exists |
| 9 | Epic Meaning framing | 1 | Needs a product decision |

**Not recommended:** anything under Drives 6 and 8 beyond what we have. The
framework agrees with the retention doc here — for a product whose asset is
trust, those two are where companies in this category get themselves written
about.

---

## Where the two documents disagree

Worth recording, since we follow the retention doc as spec:

- The retention doc treats **Social** as a Sprint 5 network feature. Octalysis
  says relatedness is already served by the companion herself. **Octalysis is
  right**, and it lowers the priority of Circles considerably.
- The retention doc is near-silent on **creative expression**. Octalysis calls it
  the most durable drive there is. **This is our biggest blind spot** and nothing
  in Sprints 1-5 addresses it.
- The retention doc's §4.4 warns against XP measuring duration, and we followed
  it. Octalysis frames the same point as Left Brain (extrinsic) rewards
  collapsing motivation once removed. Same conclusion, and it argues for keeping
  Bloom Points deliberately small rather than growing that system further.
