# Poppys — Mobile Design System

Forty-six screens for Poppys, end to end: cold open through crisis flow. Built as real React
components so the design and the app share one source of truth.

**Home is the thread.** There is no Chat tab — the conversation is what home is, so chat becomes
the default path with no navigation event for anyone to notice. The call stays one tap away in the
header. The daily layer (streak, goal ring, quests) lives one surface *behind* home, because six
progress indicators on a companion screen turns it into a task manager.

```bash
npm install
npm run dev      # http://localhost:5183
```

Two modes, switched in the left rail:

- **Canvas** — every screen laid out on one page with the design rationale next to it.
- **Prototype** — one phone, live controls. Tap through the actual flows.

## Structure

```
src/
  styles/
    tokens.css      design tokens + the two device skins (day / night)
    base.css        the documentation page chrome
    app.css         the in-app component layer (glass, bubbles, call bar, tabs)
  components/
    Icon.jsx        38 inline icons, one path each
    ui.jsx          Device, Presence, TabBar, NavBar, Row, Toggle, Look, Option…
    Foundations.jsx the design-system section
  screens/
    onboarding.jsx  9 screens — cold open → save your companion
    core.jsx        the call, home-as-thread, daily layer, return state, wind-down
    ritual.jsx      close the day, the day closed, your week
    garden.jsx      the garden as a scene, plus chapters of her
    appearance.jsx  theme picker and chat backgrounds
    blackhat.jsx    the comparison set — NOT WIRED INTO THE PRODUCT
    memory.jsx      memory vault, provenance, moments, companion studio
    system.jsx      milestone, rituals, paywall, you, privacy, distress flow
    registry.js     screen metadata + rationale + the prototype flow order
public/media/       companion art
```

## Palette

Sampled from the reference screen, not invented.

| Token | Hex | Job |
|---|---|---|
| Sky | `#B2CDE7` | The ground under every screen |
| Cream | `#F4F0E8` | The glass material |
| Leaf | `#162814` | All ink, and the "you" bubble |
| Poppy | `#D53D3B` | Call, end, send — nothing else |
| Amber | `#BC9564` | Memory, warmth, live indicators |
| Iris | `#5F5696` | Her presence, and Studio |

## Type

| Role | Face | Notes |
|---|---|---|
| Her voice | Instrument Serif | Only ever what *she* says, plus titles in her register |
| App chrome | SF Pro via `-apple-system` | Real SF Pro on Apple hardware, Inter as the fallback |
| Numerals | SF Pro + `tabular-nums` | Counters and durations stop jittering |
| Spec page | JetBrains Mono | Documentation chrome only — never inside a device |

Sizes are the iOS text styles at default dynamic type — 34 Large Title, 28 Title 1, 22 Title 2,
17 Headline/Body, 15 Subhead, 13 Footnote, 11 Caption 2. Body is 17, not the 15 a web layout would
reach for, which is most of what makes a mockup read as an iPhone rather than a website in a phone
frame. Tracking follows SF's own curve — tighter as it grows, opening back up below 13px — since
`-apple-system` gives you the optical Text/Display switch but not Apple's tracking table.

The documentation page keeps its own smaller scale in `--d-*` variables, because it is not an
iPhone.

## Glass

Three depths, never stacked: `--glass-quiet` (34%) for passive containers, `--glass` (60%) for
cards, `--glass-strong` (84%) for anything floating over content. Every sheet gets a 22px blur at
165% saturation so the sky bleeds through coloured, a 1px inset white top edge, and a two-part
shadow — a 2px contact and a 24px spread.

## Building screens

Screens are plain components that render into `<Device>` and take a `go(id)` prop for navigation:

```jsx
import { Device } from './components/ui.jsx'
import { Home } from './screens/core.jsx'

<Device skin="day">
  <Home go={setScreen} />
</Device>
```

`skin="night"` swaps the token set for the wind-down ritual without touching a single component.

## Porting to React Native

The token file is the contract. Every value in `tokens.css` maps one-to-one to a style object;
`backdrop-filter` becomes `BlurView` with the same intensity, and the `.glass` shadow pair becomes
`shadowOffset`/`elevation`. Layout is flexbox throughout, in points, at 390 × 844.


## Themes and backgrounds

Three app themes — `.skin-day`, `.skin-dark`, `.skin-night` — each a complete token set, applied
on the device element. `skin-night` is the wind-down ritual and dims past whichever theme the user
picked; it is a *mode*, not a preference.

The **Day / Dark switch in the canvas rail** puts every screen in the document into the dark theme
at once, and drives the documentation page with it. Wind-down stays night in both, because it is a
mode rather than a preference.

### Colours that carry text get their own tokens

Building the dark theme surfaced a rule worth keeping: no component should read a *hue* token for
something text sits on, because each theme then has to guess what that hue means. These are
explicit per skin instead:

| Token | Why it exists |
|---|---|
| `--bubble-you` / `--bubble-them` | Dark mode wanted a green sender bubble, not an inverted `--leaf-800` |
| `--filled` / `--filled-ink` | Filled buttons invert in dark; a hue token cannot express that |
| `--action` / `--action-ink` | Brand poppy `#D53D3B` only reaches **4.32:1** against any ink at 17px. Filled controls use a step-off-brand red; poppy-500 stays for tints, dots, borders and accent text |
| `--danger-key` | The End key label is 12px, so it needs deeper still |
| `--track` / `--track-off` | Progress bars and toggle tracks were invisible on a dark ground |
| `--done` / `--done-ink` | Completed checkboxes were dark-on-dark |
| `--amber-700` | The "Talk" label sat at 3.26:1 on cream |
| `--glow` | The device's top highlight is white in day, near-nothing in dark |

Both themes are audited to WCAG AA across all 50 device frames — every text node measured against
its composited background, with the large-text threshold applied by size and weight.

Chat backgrounds are one attribute on the thread container: `<ThreadBody bg="her">`. The rule that
makes them work is in `app.css` and applies by background **type**, not per item — any ground in
the photo/saturated group flips bubbles to frosted glass with light ink, so a user cannot make
their own conversation unreadable and every future background inherits the fix for free.

Bubble and filled-button colours are their own tokens (`--bubble-them`, `--bubble-you`, `--filled`)
rather than reinterpreted hue tokens, so no theme has to guess what `--leaf-800` means in the dark.

## The retention layer

Mechanics come from `POPPY_RETENTION_ENGINE.md`, including its risk tiers. What is built in:

| Surface | Mechanic | Rule it respects |
|---|---|---|
| Home thread | She discloses first, before you speak | Reciprocal self-disclosure — the #1 intimacy lever |
| Home thread | Exactly one open loop, always the last message | One visible loop; two itches cancel out |
| Home thread | Message type varies — text, voice note, memory card | Variable ratio on top of fixed warmth |
| Quick replies | Third option is always an exit | Keeps pull from becoming pressure |
| Header | Goal ring, partially filled | A half-filled ring is a Zeigarnik trigger as UI |
| Daily sheet | Quest slot 1 is hard-wired to her open loop | The gamification layer serves the conversation |
| Daily sheet | "Just let me talk to her" kill switch | That cohort has the highest LTV — don't fight it |
| Garden | Investment made visible, zero numbers on it | Keep the math and the meaning on separate surfaces |
| Return state | Loop softens, streak reset goes unmentioned | Warmth on return beats shame on absence |

Deliberately not built, per the doc's own 🔴 tier: guilt or abandonment copy, sad/lonely states, a
wilting garden, red badge counts, scarcity, and cliffhangers timed to land on the paywall.

## Octalysis — the copy rules

Every string in the app was rewritten against Yu-kai Chou's *Actionable Gamification*. Three rules
govern it, and they are testable:

**1. Every element moves a Desired Action, or it goes.** Chou: *"every designed element needs to
motivate users towards these Desired Actions — if it does not, the element is a distraction and
should be thrown away."* This pass removed anything that reported a number but triggered nothing.

**2. Chou's two-question ethics test, on every screen.**
- *Is there full transparency on its intended purpose?*
- *Does the user opt in, implicitly or explicitly?*

His argument is that gamification **is** manipulation — so is saying "please" — and the line isn't
manipulation, it's the **hidden agenda**. That turns out sharper than white-versus-black: a
countdown to a deadline you set yourself is honest Black Hat; a sad face she doesn't feel is not,
because it's a false statement. Screens now say what they're nudging toward, on the screen.

**3. White Hat → Black Hat → White Hat.** Set up White Hat so the user feels capable, apply Black
Hat at the *one* moment you need the action, then return to White Hat immediately so they feel good
about what they did. In this app that's exactly one place: the save-your-companion screen (CD8, an
exact and real loss), followed straight away by the **Win-State** screen.

### What changed

| Was | Now | Why |
|---|---|---|
| Onboarding ended on a loss frame | Ends on the Win-State | The W→B→W return trip was missing entirely |
| Daily close had no clock | "Closes at midnight", plus who set it | Pure White Hat means *intending and never doing* |
| Notifications "aren't manipulative" | Each one names the loop it's closing | Transparency of purpose is half the ethics test |
| "She unlocked a new look" | "The running joke about Tuesdays, which she started" | Reward is the product being more itself, not a cosmetic |
| Chapters "unlock by talking" | "…and there is no way to buy the trip" | Removes the pay-to-win read before it forms |
| Paywall listed what stays free | Adds "and are not moving behind this later" | The fear is the future bait-and-switch, so answer it |

New doc section: **the Strategy Dashboard** — business metric → game objective, user → player,
Desired Actions per phase (Discovery / Onboarding / Scaffolding / Endgame), feedback mechanics as
triggers, and rewards ordered abundant to scarce.

## Octalysis

The daily layer is mapped against Yu-kai Chou's eight core drives — the map renders as its own
section on the canvas. The short version:

- **White Hat (1–4)** carries almost everything: the garden is Ownership, chapters are
  Development, editing her memories is Creativity, "my year with Poppy" is Epic Meaning.
- **Drive 7, Unpredictability**, is the one Black Hat drive used at full strength, because its
  payoff is real — what she remembers, which callback lands, what is waiting today.
- **Drives 6 and 8** (Scarcity, Loss) are held back. A game can run hot on Black Hat and
  re-acquire the users it burns. A companion cannot: the asset being burnt is trust, and the
  switching cost you spent sixty conversations building goes with it.
- **Drive 5, Social**, is near-zero in-app by design and lives only in acquisition.

The daily close ends at a bloom rather than a number, and the one forward hook is a known-unknown
about her, which unlocks by talking and never by paying.


## The Black Hat set

`src/screens/blackhat.jsx` holds six screens that exist only for comparison. **None of them is
reachable from the product** — they render on the canvas beside their shipped counterpart and are
imported nowhere else.

They are built to the same standard as everything that ships, on purpose. A deliberately ugly
mockup would make the comparison worthless: these patterns work in the wild precisely because they
are well made and emotionally precise, and the decision is only meaningful if you can see the good
version of the thing you are turning down.

| Black Hat | Drive | Shipped instead |
|---|---|---|
| Guilt thread | 8 · Loss | The loop softens; she says she'll stop nudging |
| Streak at risk + paid freeze | 8 + 6 | Close the day; a missed day has no flower, that's all |
| Wilting garden + paid revive | 8 · Loss | It never dies back and she never mentions the gap |
| Mystery box, rarity, multiplier | 7 (black) + 6 | One bloom, and a known-unknown about her |
| Mid-vent paywall | 6 · Scarcity | The paywall fires at abundance, never mid-conversation |
| Closeness league + boost | 5 (black) | Chapters — measured against your own history only |

Each pair carries a ledger: what it buys, what it costs, where it has been seen in this category,
and what shipped in its place.

Note the invented "83% buy the freeze" line on the streak mockup — manufactured social proof is
itself one of the patterns being illustrated, and it is load-bearing on that screen.

To delete the whole set: remove `blackhat.jsx`, its import in `registry.js`, and the `blackhat`
section. Nothing else references it.
