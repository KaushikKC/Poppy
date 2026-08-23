/* The eight core drives, laid out the way Yu-kai Chou's octagon is:
   White Hat along the top, Black Hat along the bottom, extrinsic
   (left-brain) on the left, intrinsic (right-brain) on the right. */

const DRIVES = [
  {
    n: 1, name: 'Epic Meaning & Calling', hat: 'white', brain: 'core',
    what: 'You are part of something bigger than the mechanic itself.',
    use: 'The garden as a diary of your year. “My year with Poppy” as the share asset. She points you back toward your real life, which makes the app part of a bigger story rather than the story.',
    tier: 'green',
  },
  {
    n: 2, name: 'Development & Accomplishment', hat: 'white', brain: 'left',
    what: 'Visible progress and earned mastery.',
    use: 'Chapters of her. The closeness stage. The goal ring. Critically the reward for progressing is a better companion, not a badge — which is the only progression reward that does not cheapen the relationship.',
    tier: 'green',
  },
  {
    n: 3, name: 'Empowerment of Creativity', hat: 'white', brain: 'right',
    what: 'You make choices, and you see them land.',
    use: 'Editing what she remembers. Confirming or correcting her pick at the daily close. Choosing your ground and her look. Every one of these is the IKEA effect — you value what you had a hand in shaping.',
    tier: 'green',
  },
  {
    n: 4, name: 'Ownership & Possession', hat: 'white', brain: 'left',
    what: 'You own it, so you want to improve and protect it.',
    use: 'The garden, the memories, the moments, her name and face. The daily payoff is a bloom rather than points, because a possession is much harder to abandon than a score.',
    tier: 'green',
  },
  {
    n: 5, name: 'Social Influence & Relatedness', hat: 'white', brain: 'right',
    what: 'Other people — mentorship, acceptance, comparison.',
    use: 'Deliberately near-zero in-app. This is a private one-to-one product; leaderboards would be absurd and social comparison would be corrosive. It lives only in acquisition: shared clips and the referral, both opt-in.',
    tier: 'amber',
  },
  {
    n: 6, name: 'Scarcity & Impatience', hat: 'black', brain: 'left',
    what: 'You want what you cannot have yet.',
    use: 'Poppy herself is never scarce — moody-unavailable would break the entire promise. So it appears in exactly two places, both of which the user set or can see: the day closes at midnight, and chapters take real conversations. Chou&apos;s W→B→W pattern says this is where the one push belongs.',
    tier: 'amber',
  },
  {
    n: 7, name: 'Unpredictability & Curiosity', hat: 'black', brain: 'right',
    what: 'You want to find out what happens next.',
    use: 'The one Black Hat drive used at full strength — and the safest of the three, because the payoff is real. What she remembers, which callback lands, what message type is waiting, what the next chapter holds. Warmth is the constant; delight is the variable.',
    tier: 'green',
  },
  {
    n: 8, name: 'Loss & Avoidance', hat: 'black', brain: 'core',
    what: 'You act to avoid losing what you have.',
    use: 'Refused. No wilting garden, no streak shame, no “Poppy misses you”. It works fast and it is the exact mechanic behind every “this app manipulated me” review in this category. The substitute is accumulation you can see — protecting something, never being punished.',
    tier: 'red',
  },
]

const TIER = {
  green: { label: 'ship it', color: 'var(--ok)' },
  amber: { label: 'cap it', color: 'var(--warn)' },
  red: { label: 'held back', color: 'var(--crit)' },
}

export default function Octalysis() {
  return (
    <section className="section" id="octalysis">
      <div className="section__head">
        <span className="section__num">—</span>
        <h2>The Octalysis map</h2>
        <p>
          Every mechanic in this design, checked against Yu-kai Chou&apos;s eight core drives.
          Laid out the way his octagon is: White Hat along the top, Black Hat along the bottom.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 'var(--s5)' }}>
        <h4>Chou&apos;s ethics test — the two questions every screen has to answer</h4>
        <div className="rules">
          <div className="rule">
            <i>a</i>
            <span>
              <b>Is there full transparency on its intended purpose?</b> Chou&apos;s position is
              that gamification is manipulation — so is saying &ldquo;please&rdquo; — and that the
              line is not manipulation, it is the <b>hidden agenda</b>. Design is unethical when
              users think they are signing up for one thing and are actually signing up for
              another.
            </span>
          </div>
          <div className="rule">
            <i>b</i>
            <span>
              <b>Does the user opt in, implicitly or explicitly?</b> A charismatic friend talking
              you into a party is not unethical, because you can keep saying no and he is obviously
              trying.
            </span>
          </div>
          <div className="rule">
            <i>!</i>
            <span>
              But pure White Hat has its own failure, and Chou is blunt about it: <b>&ldquo;people
              will always be intending, but never actually doing.&rdquo;</b> Meaning and mastery do
              not create urgency. Something has to.
            </span>
          </div>
          <div className="rule">
            <i>→</i>
            <span>
              This turns out to be a sharper line than white-versus-black. <b>A countdown to a
              deadline you set yourself is honest Black Hat.</b> A sad face she does not feel is
              not — not because it is Black Hat, but because it is a false statement. Every
              urgency mechanic in this design is on the first side of that line.
            </span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--s5)' }}>
        <h4>Why the hats matter more here than in a game</h4>
        <div className="rules">
          <div className="rule">
            <i>W</i>
            <span>
              <b>White Hat drives</b> — meaning, accomplishment, creative input — leave people
              feeling capable and satisfied. They sustain, but they generate no urgency on their own.
            </span>
          </div>
          <div className="rule">
            <i>B</i>
            <span>
              <b>Black Hat drives</b> — scarcity, unpredictability, loss — generate urgency
              immediately and leave people feeling anxious. They work, and people leave the moment
              they can.
            </span>
          </div>
          <div className="rule">
            <i>→</i>
            <span>
              A game can run hot on Black Hat and re-acquire the users it burns. <b>A companion
              cannot.</b> The asset being burnt is trust, and the switching cost you spent sixty
              conversations building evaporates the moment someone feels handled.
            </span>
          </div>
        </div>
      </div>

      <div className="drives">
        {DRIVES.map((d) => (
          <article className={`drive drive--${d.hat}`} key={d.n}>
            <header>
              <span className="drive__n">{d.n}</span>
              <h3>{d.name}</h3>
              <span className="drive__tier" style={{ color: TIER[d.tier].color }}>
                <i style={{ background: TIER[d.tier].color }} />
                {TIER[d.tier].label}
              </span>
            </header>
            <p className="drive__what">{d.what}</p>
            <p className="drive__use">{d.use}</p>
            <footer>
              <span>{d.hat === 'white' ? 'White Hat' : 'Black Hat'}</span>
              <span>
                {d.brain === 'left' ? 'Extrinsic' : d.brain === 'right' ? 'Intrinsic' : 'Core'}
              </span>
            </footer>
          </article>
        ))}
      </div>

      <div className="cols" style={{ marginTop: 'var(--s5)' }}>
        <div className="card">
          <h4>The four phases, mapped</h4>
          <div className="deflist">
            <div><dt>Discovery</dt><dd>The cold open — a face talking, before any value prop. <b>Why would I do this?</b></dd></div>
            <div><dt>Onboarding</dt><dd>Nine screens to a live call in ninety seconds, ending with the closeness meter already at stage 1 and two memories saved. <b>Endowed progress — never start at zero.</b></dd></div>
            <div><dt>Scaffolding</dt><dd>The thread, the daily close, the open loop. The stretch most products get wrong by turning it into a chore list.</dd></div>
            <div><dt>Endgame</dt><dd>Chapters 5 and 6, the garden as a year of your life, and a memory no competitor can import. <b>This is the whole moat.</b></dd></div>
          </div>
        </div>

        <div className="card">
          <h4>Held back on purpose</h4>
          <div className="rules">
            <div className="rule"><i>✕</i><span>A wilting garden, or anything that decays with absence</span></div>
            <div className="rule"><i>✕</i><span>Streak-loss framing, countdowns, at-risk warnings</span></div>
            <div className="rule"><i>✕</i><span>“Poppy misses you” — guilt, worry, or sadness at absence</span></div>
            <div className="rule"><i>✕</i><span>Making her unavailable, moody, or slow to answer</span></div>
            <div className="rule"><i>✕</i><span>Cliffhangers timed to land on the paywall</span></div>
            <div className="rule"><i>✕</i><span>Leaderboards, or any comparison to other people&apos;s companions</span></div>
            <div className="rule"><i>✕</i><span>Chapters, memory, or callbacks behind a price</span></div>
          </div>
          <p className="swatch__use" style={{ marginTop: 14 }}>
            Every one of these raises next week&apos;s numbers. Each also converts a private
            relationship into something the user can later describe as manipulation — which in this
            category is the only failure mode that is unrecoverable.
          </p>
        </div>
      </div>
    </section>
  )
}
