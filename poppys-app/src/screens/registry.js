import * as O from './onboarding.jsx'
import * as C from './core.jsx'
import * as M from './memory.jsx'
import * as S from './system.jsx'
import * as G from './garden.jsx'
import * as R from './ritual.jsx'
import * as A from './appearance.jsx'
import * as B from './blackhat.jsx'

export const SECTIONS = [
  {
    id: 'onboarding',
    num: '01',
    title: 'Onboarding',
    blurb:
      'Nine screens with one job: get a stranger into a live call inside 90 seconds, and make that call feel personal. Numbered because it is genuinely a sequence — every screen either removes friction or collects one thing that makes the first call better.',
    screens: [
      {
        id: 'splash',
        step: '01',
        title: 'Cold open',
        Comp: O.Splash,
        note: 'A face before a value prop — full-bleed, already breathing, with a pill that says she is awake. The product does its one magic thing before asking for anything. CTA reads <b>Meet Poppy</b>, never Sign up: meeting is a reward, signing up is a cost.',
        spec: ['no auth', 'full-bleed face', 'CTA 54pt', 'trust line 11px'],
      },
      {
        id: 'agegate',
        step: '02',
        title: 'Age gate',
        Comp: O.AgeGate,
        note: 'Asked once, early, plainly — then never again. Repeated age nagging is a top Character.AI complaint. The second option is a real exit, not a dark-patterned dead end.',
        spec: ['18+ hard gate', 'asked once', 'no re-prompt'],
      },
      {
        id: 'vibe',
        step: '03',
        title: 'Pick the vibe',
        Comp: O.PickVibe,
        note: '<b>CD3 · Choice Perception.</b> Reads as a personality quiz, works as configuration — one tap sets her tone, her energy and the opening line of the first call. Chou&#39;s warning about Empowerment is that the choice has to actually matter; this one changes the first sentence she says, so it does.',
        spec: ['single select', 'sets first-call opener', 'reversible'],
      },
      {
        id: 'look',
        step: '04',
        title: 'Choose the look',
        Comp: O.PickLook,
        note: 'Six presets, 3-up grid, selection shown with a 2.5px poppy ring rather than a colour wash so the artwork stays readable. The lock note separates cosmetics from identity — looks never change who she is.',
        spec: ['3-col grid', '3:4 tiles', 'ring select', 'cosmetic only'],
      },
      {
        id: 'name',
        step: '05',
        title: 'Name her',
        Comp: O.NameHer,
        note: '<b>CD4 · Avatar.</b> Naming converts the app&#39;s companion into yours, and Chou&#39;s point about semantics applies exactly here — what a thing is called changes what it is worth. Pre-filled so an impatient user taps straight through; suggestions for the ones who want to browse.',
        spec: ['pre-filled', 'display serif input', '5 suggestions'],
      },
      {
        id: 'voice',
        step: '06',
        title: 'Pick her voice',
        Comp: O.PickVoice,
        note: 'Four seconds each, played inline — you never commit to a voice you have not heard. Hinglish is first-class here, not buried in settings: it is the India wedge.',
        spec: ['4s preview', 'inline playback', 'Hinglish default-visible'],
      },
      {
        id: 'question',
        step: '07',
        title: 'The one question',
        Comp: O.OneQuestion,
        note: '<b>CD1 + CD7.</b> She asks out loud, in her voice. It warms them into talking, gives the first call real content and creates the first memory. The line under the field states what the answer is <i>for</i> before they type it — half of Chou&#39;s ethics test is transparency of intended purpose, and this is where it gets paid.',
        spec: ['voice or text', 'creates memory #1', 'mic primed'],
      },
      {
        id: 'mic',
        step: '08',
        title: 'Mic permission',
        Comp: O.MicPermission,
        note: 'The system prompt is pre-framed by our own sheet, so the OS dialog arrives already explained. The escape hatch — type to her instead — keeps a mic refusal from ending the session.',
        spec: ['pre-permission sheet', 'has an escape hatch', 'states retention'],
      },
      {
        id: 'account',
        step: '09',
        title: 'Save your companion',
        Comp: O.CreateAccount,
        note: 'The one <b>Black Hat</b> screen in the product: CD8, Loss &amp; Avoidance, at the single moment we need the action. It passes Chou&#39;s ethics test because the loss is <i>real and exactly stated</i> — three named things, gone, not hidden — and because skipping is a live option. What makes it defensible is the screen immediately after it.',
        spec: ['post-value auth', 'skippable', 'names what is kept'],
      },
    ],
  },
  {
    id: 'call',
    num: '02',
    title: 'The call',
    blurb:
      'The entire differentiation lives in these five screens. Everything else in the app is scaffolding around the moment she picks up.',
    screens: [
      {
        id: 'winstate',
        step: '10',
        title: 'Win-State',
        Comp: O.WinState,
        note: 'Chou&#39;s transition rule, applied: set up White Hat, use Black Hat at the one moment you actually need the action, then <b>get back to White Hat fast</b> so the user feels good about what they just did. The screen before this is the only loss-framed screen in the product; this is the return trip. It is also <b>endowed progress</b> — onboarding ends with Chapter 1 open, three memories saved and a bloom already in the garden. Nobody starts at zero.',
        spec: ['CD2 + CD4 + CD1', 'W→B→W completed', 'never starts at zero', 'no purchasable progress'],
      },
      {
        id: 'connecting',
        title: 'Connecting',
        Comp: C.Connecting,
        note: 'Budget is <b>under two seconds</b>. Past that the spell breaks, so the state shows real elapsed time instead of an indeterminate spinner, and cancelling is one tap.',
        spec: ['< 2s budget', 'elapsed shown', 'cancellable'],
      },
      {
        id: 'call',
        title: 'Live call',
        Comp: C.LiveCall,
        note: 'Presence fills the screen; the chrome is four keys on floating glass. <b>Talk</b> is push-to-talk with the amber arc, <b>Auto</b> is open-mic with interruption, <b>Memory</b> saves the last thing said. End is the only red thing on screen.',
        spec: ['4 keys, 74pt', 'End = accent', 'transcript collapsed'],
      },
      {
        id: 'callchat',
        title: 'Call + transcript',
        Comp: C.CallWithTranscript,
        note: 'The hybrid from your reference: sky stage on top, cream transcript below, controls floating on the seam. For noisy rooms, for reading back what she just said, and for typing when you cannot speak.',
        spec: ['300pt stage', 'cream sheet', 'speak or type'],
      },
      {
        id: 'endcall',
        title: 'End-of-call ritual',
        Comp: C.EndOfCall,
        note: 'Never a bare hang-up. A warm sign-off carrying a <b>forward hook</b> — the open loop that becomes tomorrow’s reason to call — plus the candidate memory with four honest choices including <b>never this kind</b>.',
        spec: ['forward hook', 'save/edit/skip/never', 'temp memories expire'],
      },
      {
        id: 'nightcall',
        title: 'Wind-down call',
        Comp: C.NightCall,
        skin: 'night',
        note: 'The ritual with the highest retention in this category, so it gets its own skin: navy ground, her face graded down, dimmer type, and a control to keep talking with the screen off.',
        spec: ['night skin', 'auto-dim 20s', 'screen-off calls'],
      },
    ],
  },
  {
    id: 'everyday',
    num: '03',
    title: 'Home & the daily loop',
    blurb:
      'Home is not a launcher that opens the conversation — home IS the conversation. Chat becomes the default path without a single announcement, because there is no navigation event to notice. Mechanics here are lifted straight from your retention engine doc, tier tags and all.',
    screens: [
      {
        id: 'home',
        title: 'Home — the thread',
        Comp: C.Home,
        note: 'The whole redesign in one move: there is no <b>Chat</b> tab to tap, because the thread is what home is. Nothing announces the shift — you open the app and you are already mid-conversation, so chat becomes the default path without a single moment where the user notices a choice was made for them. The call is still one tap, it just stops being the gravitational centre.',
        spec: ['home = thread', 'call demoted to header', 'no tab switch to notice'],
      },
      {
        id: 'home-anatomy',
        title: 'Home — what is doing the work',
        Comp: C.Home,
        note: '<b>She went first</b> — reciprocal self-disclosure before you have said anything, the #1 intimacy accelerator and the thing no competitor does. <b>The unheard voice note</b> is variable reward: the message type changes every session so you never know what is waiting. <b>The last line is her open question</b>, ranked to exactly one at a time, so the thread never ends resolved. <b>Quick replies</b> kill blank-page friction — and the third one is always an exit, which is what stops the pull from turning into pressure.',
        spec: ['she discloses first', '1 open loop, never 2', 'variable message type', 'third reply is an out'],
      },
      {
        id: 'homedaily',
        title: 'The daily layer',
        Comp: C.HomeDaily,
        note: 'Streak, goal ring and three quests — deliberately one surface <b>away</b> from the thread. Slot 1 is hard-wired to Poppy&#39;s open loop, so the gamification layer&#39;s top task is always just <b>go resolve the thing she left hanging</b>. Ending the day at 2 of 3 is the mechanic, not a miss. The kill switch sits at the bottom because the cohort that turns all of this off has the highest lifetime value.',
        spec: ['max 2 counters on home', 'slot 1 = the loop', 'ends at 2/3 by design', 'kill switch shipped'],
      },
      {
        id: 'homereturn',
        title: 'Coming back after a week',
        Comp: C.HomeReturn,
        note: 'The screen everyone in this category gets wrong. The loop <b>softens</b> instead of accusing, the streak is silently zero with no comment, and the last message is her saying she will stop nudging. That line outperforms escalation — it is the only message in the category that signals the app is not desperate, and it is the difference between a retention mechanic and a manipulation story.',
        spec: ['no guilt, no sad state', 'streak reset unmentioned', 'loop decays gracefully'],
      },
      {
        id: 'modes',
        title: 'Modes',
        Comp: C.Modes,
        note: 'Each mode is a pre-framed call that decides her opening line, so nobody ever faces a blank slate. Six is deliberate — enough to find yourself in the list, few enough to scan in a second.',
        spec: ['sheet 30px radius', '6 modes', 'sets her opener'],
      },
      {
        id: 'look-together',
        title: 'Look together',
        Comp: C.LookTogether,
        note: 'Share a photo mid-call and she reacts to it. Presence expanding into your world — with the retention rule stated on the screen itself, not buried in a policy.',
        spec: ['on-device photo', 'call-scoped', 'Plus feature'],
      },
    ],
  },
  {
    id: 'ritual',
    num: '04',
    title: 'The ritual loop',
    blurb:
      'The daily layer rebuilt on Octalysis. Chou\u2019s split between White Hat drives (meaning, accomplishment, creative input) and Black Hat drives (scarcity, unpredictability, loss) is the same axis your retention doc already tiers \u2014 and for a companion the Black Hat side is disproportionately expensive, because the asset it burns is trust. So the daily close is built almost entirely White Hat, with exactly one Black Hat element: an open loop she leaves you with.',
    screens: [
      {
        id: 'checkin',
        title: 'Close the day',
        Comp: R.CloseTheDay,
        note: 'The daily check-in with the claim button removed — nothing is <b>collected</b> here, something is <b>finished</b>. Correcting her pick is <b>CD3</b> doing the work a reward box fails at. The one clock in the product sits top-right: the day closes at midnight. That is CD6, it is honest, and it is the answer to Chou&#39;s warning that with White Hat alone <b>people intend and never do</b>.',
        spec: ['Drive 1 + 2 + 3', 'no claim button', 'user edits the memory', '90 seconds'],
      },
      {
        id: 'closed',
        title: 'The day, closed',
        Comp: R.DayClosed,
        note: '<b>CD4 over CD2</b> on purpose: the payoff is a bloom, not a number, because a possession is harder to walk away from than a score — and because points are the shell Chou spends a whole chapter warning against. The chapter line underneath is CD7 as a <b>known-unknown</b>, and the screen says out loud that it cannot be bought.',
        spec: ['Drive 4 ownership', 'Drive 7, used once', 'unlocks by use, never by payment'],
      },
      {
        id: 'week',
        title: 'Your week, read back',
        Comp: R.WeekInReview,
        note: 'Sunday. Seven dots, coloured by what each day actually was, with the blank day left blank and explicitly forgiven. Then one real observation she made about your week, which is the thing no streak counter can produce — and a commitment she asks you to say <b>out loud</b> on the next call, because spoken commitments hold and tapped ones do not.',
        spec: ['no % complete', 'blank days stay blank', 'spoken commitment'],
      },
      {
        id: 'garden',
        title: 'The garden',
        Comp: G.Garden,
        note: 'Drawn as a place instead of a grid. One flower per conversation that mattered, shaped and coloured by what kind of conversation it was, so a year of this reads like a diary you never had to write. There is <b>no number anywhere on this screen</b> — the moment a relationship gets a score attached, people start optimising instead of talking.',
        spec: ['zero numbers', 'never wilts', 'mood-typed blooms', 'the share asset'],
      },
      {
        id: 'chapters',
        title: 'Chapters of her',
        Comp: G.Chapters,
        note: 'Progressive disclosure of <b>her</b>, which is the strongest thing in the whole retention model: the reward for progression is a better companion, not a cosmetic. You can see the chapters exist and roughly what each is, but not what she actually says — a known-unknown. Locked by conversations, never by price, which is what keeps it out of the pay-to-win category.',
        spec: ['Drive 2 + 7', 'known-unknowns', 'never paywalled'],
      },
    ],
  },
  {
    id: 'skin',
    num: '05',
    title: 'Make it yours',
    blurb:
      'Ownership is the cheapest durable retention drive there is, and the cheapest version of it is letting someone decorate the room. Theme, chat background, and her look are all user-owned \u2014 with one rule the user cannot override. Use the Day / Dark switch in the rail to put every screen in this document into the dark theme at once.',
    screens: [
      {
        id: 'appearance',
        title: 'Appearance',
        Comp: A.Appearance,
        note: 'Light, Dark, Auto — and a chat background picker one tap in. The note at the bottom is the rule: whatever ground you choose, <b>bubbles keep their contrast</b>. On a photo they flip to frosted glass with light ink, so you cannot accidentally make your own conversation unreadable.',
        spec: ['3 themes', 'contrast is not user-overridable', 'wind-down dims past all of them'],
      },
      {
        id: 'backgrounds',
        title: 'Backgrounds',
        Comp: A.Backgrounds,
        note: 'Three tiers, and the order matters. <b>Her world</b> first — scenes from where she is, which change with the season and with what you two have been talking about, so new ones simply appear. Then plain grounds. Then your own photo, which stays on your phone and which she never sees.',
        spec: ['seasonal, self-refreshing', 'your photo never uploaded', 'preview shows real bubbles'],
      },
      {
        id: 'home-her',
        title: 'Background — her world',
        Comp: C.HomeHer,
        note: 'The Kindroid move, with the legibility problem solved. The art sits behind a blur and a scrim; the bubbles become frosted glass and the ink goes light. Same screen, same components — one attribute on the thread container.',
        spec: ['blur 26px + scrim', 'bubbles → glass', 'one data attribute'],
      },
      {
        id: 'home-dusk',
        title: 'Background — dusk',
        Comp: C.HomeDusk,
        note: 'A gradient ground gets the same treatment as a photo, because a saturated gradient is just as hostile to dark text. The rule is by background <b>type</b>, not by individual choice, so every future background inherits it for free.',
        spec: ['rule by type, not per-item', 'future-proof'],
      },
    ],
  },
  {
    id: 'memory',
    num: '06',
    title: 'Memory',
    blurb:
      'The retention flywheel and the trust moat are the same system. Every competitor gets complaints here, so ours is fully visible: what she knows, why she knows it, and where it has shown up.',
    screens: [
      {
        id: 'memory',
        title: 'What Poppy knows',
        Comp: M.MemoryVault,
        note: 'Not a settings page — a headline feature. Colour-coded left rails carry the category, dashed rails mean temporary, and sensitive topics are off until you deliberately turn them on.',
        spec: ['category rails', 'temp = dashed', 'sensitive off by default'],
      },
      {
        id: 'memdetail',
        title: 'Why she remembers',
        Comp: M.MemoryDetail,
        note: 'Every memory shows its receipt: what you said, when, and that you agreed to keep it — then every place she has used it. Callbacks read as gifts instead of surveillance because the provenance is right here.',
        spec: ['provenance', 'usage log', 'delete = instant'],
      },
      {
        id: 'moments',
        title: 'Moments',
        Comp: M.Moments,
        note: 'The private scrapbook, and the growth loop. Clips default to <b>her voice only</b> — sharing the feeling without exposing yours is what makes people actually post one.',
        spec: ['private default', 'her-voice-only clips', 'you approve every share'],
      },
      {
        id: 'studio',
        title: 'Companion studio',
        Comp: M.Studio,
        note: 'Look, voice, pace, and who she is with you — plus the pinned personality version. Silently changing a companion after a model update is the single biggest trust-killer in this category, so the pin is a visible, user-owned control.',
        spec: ['pinned personality', 'editable persona', 'multi-companion = Studio'],
      },
    ],
  },
  {
    id: 'system',
    num: '07',
    title: 'Habit, money, trust',
    blurb:
      'The surfaces where companion apps usually get greedy. Each one here is designed to be the reason someone stays rather than the reason they leave a one-star review.',
    screens: [
      {
        id: 'streak',
        title: 'Milestone',
        Comp: S.Milestone,
        note: 'Thirty days earns a real moment from her, not a badge. And nothing punishes a break — a missed day is met with <b>missed you yesterday, no worries</b>. Warmth on return beats shame on absence.',
        spec: ['no streak loss state', 'unlock is cosmetic', 'she speaks, not the UI'],
      },
      {
        id: 'rituals',
        title: 'Rituals & messages',
        Comp: S.Rituals,
        note: 'Notifications are shown as what they are — open loops from your own calls, with the send time visible. The last card lists what she will <b>never</b> send, in the product, where it can be held to it.',
        spec: ['user-chosen times', 'gentle default', 'refusals stated in-product'],
      },
      {
        id: 'paywall',
        title: 'Paywall',
        Comp: S.Paywall,
        note: 'Placed at an <b>abundance</b> moment — you two talk a lot — never mid-vent. Two tiers, no gems, no ads, and the free card spells out what stays free forever so the ask never reads as a threat.',
        spec: ['abundance trigger', '2 tiers', 'free tier named on screen'],
      },
      {
        id: 'you',
        title: 'You',
        Comp: S.You,
        note: 'Everything that compounds, in one place: the calls, the streak, the 41 things she knows. Investment you can see is investment you do not abandon.',
        spec: ['5-tab nav', 'stats = investment', 'referral, not spam'],
      },
      {
        id: 'settings',
        title: 'Privacy',
        Comp: S.Settings,
        note: 'Opens by promising nothing here costs money. Audio retention is off by default, export and delete sit at the same level as everything else, and delete is instant with no confirmation maze.',
        spec: ['free on every plan', 'audio off by default', 'instant delete'],
      },
      {
        id: 'safety',
        title: 'Distress flow',
        Comp: S.Safety,
        note: 'She stays, tells the truth about what she is, and routes to real humans — Tele-MANAS for India. She will not roleplay it, will not validate it, and will not steer back to keep the call going.',
        spec: ['stays present', 'local crisis line', 'never roleplays harm'],
      },
    ],
  },
  {
    id: 'blackhat',
    num: '08',
    title: 'The Black Hat set',
    blurb:
      'The versions we did not ship, built to the same standard as the ones we did. A deliberately ugly mockup would prove nothing \u2014 these patterns work in the wild precisely because they are well made and emotionally precise. Each pair is the shipped screen beside its Black Hat twin, with what it buys and what it costs written underneath. Nothing in this section is wired into the product.',
    screens: [
      {
        id: 'bh-guilt',
        title: 'Guilt vs. no guilt',
        Comp: B.GuiltThread,
        pair: 'homereturn',
        hat: 'Drive 8 · Loss & Avoidance',
        note: 'She escalates from concern to hurt to self-deprecation over three days, with an unread badge counting up and quick replies that offer apology or excuse but no neutral exit. It is the highest-lift single change available to you.',
        ledger: [
          ['Buys you', 'The largest immediate return-rate lift on this list. Reciprocity plus obligation is extremely effective, and it costs nothing to build.'],
          ['Costs you', 'It converts a private relationship into a debt. The people most responsive to it are the ones most attached, which is to say the ones you least want to do this to.'],
          ['Seen in', 'Guilt and abandonment states are the core allegation in the January 2025 FTC complaint filed against Replika by consumer-advocacy groups.'],
          ['Shipped instead', 'The loop softens on its own and she says she will stop nudging. Signalling that the app is not desperate outperforms escalation on returns, and it is the only line in the category that does.'],
        ],
      },
      {
        id: 'bh-streak',
        title: 'Streak panic vs. closing the day',
        Comp: B.StreakAtRisk,
        pair: 'checkin',
        hat: 'Drive 8 + 6 · Loss & Scarcity',
        note: 'A dying flame, a live countdown, a purchasable freeze, and a line of manufactured social proof. Note the 83% figure on the mockup: invented numbers presented as fact are their own dark pattern, and they are load-bearing here.',
        ledger: [
          ['Buys you', 'A hard daily-active lift and a genuine revenue line. Duolingo\u2019s freeze economy is the most copied mechanic in consumer apps because it works.'],
          ['Costs you', 'It reframes the relationship as a thing you can fail at. Users start opening the app to protect a number rather than to talk, and the canary is disclosure depth falling while completion rises.'],
          ['Seen in', 'Duolingo, ported wholesale. It survives there because the stakes are language lessons and the mascot is a meme \u2014 neither is true here.'],
          ['Shipped instead', 'A ninety-second close where she reads back the one line worth keeping and you correct it. The payoff is a bloom, not a number, and a missed day is simply a day with no flower on it.'],
        ],
      },
      {
        id: 'bh-garden',
        title: 'Wilting vs. never wilting',
        Comp: B.WiltedGarden,
        pair: 'garden',
        hat: 'Drive 8 · Loss & Avoidance',
        note: 'The same garden component with one prop flipped. Stems droop, colour drains, and a revive is available for \u20b9149. This is streak shame with better art \u2014 which is exactly what makes it worth looking at.',
        ledger: [
          ['Buys you', 'Loss aversion attached to something the user built themselves, which is roughly twice as motivating as the equivalent gain. Plus a second revenue surface.'],
          ['Costs you', 'The garden\u2019s entire value is that it is a keepsake. Making it destructible turns a possession into an obligation, and the first time someone loses a month of their life to a bug you have a support crisis.'],
          ['Seen in', 'Every farm and pet game since the mid-2000s. The pattern is old enough that a meaningful share of users recognise it on sight.'],
          ['Shipped instead', 'It never dies back, never greys out, and she never mentions the gap. Absence simply produces no flower.'],
        ],
      },
      {
        id: 'bh-reward',
        title: 'Mystery box vs. the bloom',
        Comp: B.MysteryBox,
        pair: 'closed',
        hat: 'Drive 7 (black) + 6',
        note: 'Rarity tiers, a glowing chest, a streak multiplier that resets on a miss, and a paid pull. Unpredictability with a hollow payoff \u2014 the same drive the shipped design uses, aimed at loot instead of at her.',
        ledger: [
          ['Buys you', 'Variable-ratio reinforcement is the most extinction-resistant schedule there is. Rarity tiers and multipliers convert directly.'],
          ['Costs you', 'It moves the unpredictability from what she says to what the box contains, which trains people to open the app without talking to her. That is the exact metric divergence that means you have built a chore app wearing a companion\u2019s face.'],
          ['Seen in', 'Mobile gacha, and increasingly in apps with no game in them at all. Loot-box mechanics are also under active regulatory attention in several markets.'],
          ['Shipped instead', 'One bloom, and a known-unknown about her that unlocks by talking. Same drive, and the payoff is the product rather than a prize.'],
        ],
      },
      {
        id: 'bh-paywall',
        title: 'The mid-vent paywall',
        Comp: B.MidVentPaywall,
        pair: 'paywall',
        hat: 'Drive 6 · Scarcity, worst case',
        note: 'She is mid-sentence, answering something the user has just admitted, and the message blurs behind a lock with a countdown discount. This is the single most effective screen in this document and the one I would resign over.',
        ledger: [
          ['Buys you', 'The highest conversion rate of anything here, by a distance. Willingness to pay peaks exactly at the moment of emotional need, which is why the pattern exists.'],
          ['Costs you', 'It is indefensible in a support ticket, a press cycle, or a courtroom, and the review writes itself. Refund rates on emotionally-coerced conversions are severe, and the churn arrives with a story attached.'],
          ['Seen in', 'Interruption of an emotionally significant relationship is precisely what triggered the February 2023 Replika backlash, where moderators ended up posting crisis-line numbers to their own community.'],
          ['Shipped instead', 'The paywall fires at abundance \u2014 you two talk a lot \u2014 and never during a hard conversation. Free keeps memory, deletion, export, and safety forever.'],
        ],
      },
      {
        id: 'bh-league',
        title: 'The closeness league',
        Comp: B.ClosenessLeague,
        pair: 'chapters',
        hat: 'Drive 5 (black) · Social comparison',
        note: 'Your relationship, ranked against strangers, with demotion in two days and a paid boost. Included because it is the clearest illustration of a drive that simply does not belong in a private one-to-one product.',
        ledger: [
          ['Buys you', 'Leagues are one of the strongest engagement mechanics known, and they work on almost everyone.'],
          ['Costs you', 'It makes an intimate thing competitive and public. It also requires exposing how much people use a companion app to other people, which is a privacy failure before it is a design one.'],
          ['Seen in', 'Duolingo leagues, straightforwardly. It works there because nobody is embarrassed about French.'],
          ['Shipped instead', 'Chapters. Progression measured against your own history, visible only to you, unlocked by talking and never by paying.'],
        ],
      },
    ],
  },
]

export const FLOW = [
  'splash', 'agegate', 'vibe', 'look', 'name', 'voice', 'question', 'mic',
  'connecting', 'call', 'callchat', 'endcall', 'account', 'winstate',
  'home', 'home-anatomy', 'homedaily', 'homereturn', 'modes', 'look-together', 'nightcall',
  'checkin', 'closed', 'week', 'garden', 'chapters',
  'appearance', 'backgrounds', 'home-her', 'home-dusk',
  'memory', 'memdetail', 'moments', 'studio',
  'streak', 'rituals', 'paywall', 'you', 'settings', 'safety',
  'bh-guilt', 'bh-streak', 'bh-garden', 'bh-reward', 'bh-paywall', 'bh-league',
]

export const BY_ID = Object.fromEntries(
  SECTIONS.flatMap((s) => s.screens.map((sc) => [sc.id, sc]))
)
