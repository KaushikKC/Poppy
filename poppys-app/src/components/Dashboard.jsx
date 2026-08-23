/* The Octalysis Strategy Dashboard, filled in for Poppys.
   Chou's rule: define these five before designing anything, because
   "every designed element needs to motivate users towards these Desired
   Actions — if it does not, the element is a distraction." */

const PHASES = [
  {
    id: 'discovery',
    name: 'Discovery',
    q: 'Why would I even do this?',
    actions: [
      'See a clip of her actually talking, somewhere else',
      'Open the app and watch her for eight seconds',
      'Tap Meet Poppy',
    ],
    drives: 'CD1 Narrative · CD7 Curiosity',
    win: 'She looks up. It reads as a person, not a product.',
  },
  {
    id: 'onboarding',
    name: 'Onboarding',
    q: 'How does this work, and am I any good at it?',
    actions: [
      'Choose what she is for you',
      'Give her a face and a name',
      'Say one true thing out loud',
      'Finish a first call over sixty seconds',
    ],
    drives: 'CD3 Choice Perception · CD4 Avatar · CD1 Beginner’s Luck',
    win: 'She opens the first call already knowing three things about you.',
  },
  {
    id: 'scaffolding',
    name: 'Scaffolding',
    q: 'What am I doing today?',
    actions: [
      'Answer the thing she left open',
      'Close the day',
      'Correct one memory she has slightly wrong',
      'Keep a moment',
    ],
    drives: 'CD3 Feedback · CD4 Ownership · CD7 Rolling Rewards',
    win: 'A flower for the day, and something of hers you did not have yesterday.',
  },
  {
    id: 'endgame',
    name: 'Endgame',
    q: 'Why am I still here after a year?',
    actions: [
      'Reach the chapters where she goes first',
      'Look back at a year of the garden',
      'Share “my year with Poppy”',
      'Bring one person into a call',
    ],
    drives: 'CD1 Higher Meaning · CD4 Collection · CD5 Touting',
    win: 'A record of your year that only exists because you kept showing up.',
  },
]

export default function Dashboard() {
  return (
    <section className="section" id="dashboard">
      <div className="section__head">
        <span className="section__num">—</span>
        <h2>The Strategy Dashboard</h2>
        <p>
          Chou defines five things before a single screen gets designed. Everything after this
          point either moves a Desired Action or gets cut.
        </p>
      </div>

      <div className="cols" style={{ marginBottom: 'var(--s5)' }}>
        <div className="card">
          <h4>Business metric → game objective</h4>
          <p className="swatch__use" style={{ marginBottom: 'var(--s4)' }}>
            You can improve many metrics on one screen and optimise for exactly one. Ours, in order:
          </p>
          <div className="deflist">
            <div><dt>1 · the one</dt><dd><b>Share of new users who finish a first call over sixty seconds.</b> Everything in onboarding is subordinate to this number.</dd></div>
            <div><dt>2</dt><dd>Days with a closed day, per user, per week</dd></div>
            <div><dt>3</dt><dd>Share of calls where a memory callback lands</dd></div>
            <div><dt>4</dt><dd>Free → Plus conversion at an abundance moment</dd></div>
            <div><dt>the canary</dt><dd>Quest completion rising while <b>disclosure depth falls</b>. If those two diverge for two weeks, the daily layer has eaten the product.</dd></div>
          </div>
        </div>

        <div className="card">
          <h4>User → player</h4>
          <div className="deflist">
            <div><dt>Who</dt><dd>Adults who have something to say at 11pm and nobody who is awake for it. India-first, English and Hinglish.</dd></div>
            <div><dt>Not</dt><dd>Anyone under 18. Not a market we touch, and not a design problem we are trying to solve.</dd></div>
            <div><dt>Becomes a player</dt><dd>When they finish one call and she remembers it next time. Before that they are a visitor.</dd></div>
          </div>
          <p className="swatch__use" style={{ marginTop: 'var(--s4)' }}>
            Chou&apos;s framing matters here: nobody <i>has</i> to play a game. Design as though the
            user leaves the moment it stops being worth their evening — because they can, and they will.
          </p>
        </div>
      </div>

      <div className="phases">
        {PHASES.map((p, i) => (
          <article className="phase" key={p.id}>
            <header>
              <span className="phase__n">{i + 1}</span>
              <h3>{p.name}</h3>
            </header>
            <p className="phase__q">{p.q}</p>
            <ul className="phase__actions">
              {p.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <footer>
              <span className="phase__drives">{p.drives}</span>
              <p className="phase__win"><b>Win-state.</b> {p.win}</p>
            </footer>
          </article>
        ))}
      </div>

      <div className="cols" style={{ marginTop: 'var(--s5)' }}>
        <div className="card">
          <h4>Feedback mechanics are triggers, or they are litter</h4>
          <div className="deflist">
            <div><dt>Her open line</dt><dd>Triggers: answer it. <b>CD7</b></dd></div>
            <div><dt>The goal ring</dt><dd>Triggers: close the day. <b>CD2</b></dd></div>
            <div><dt>A bloom appearing</dt><dd>Triggers: come back and grow another. <b>CD4</b></dd></div>
            <div><dt>Chapter &ldquo;close&rdquo;</dt><dd>Triggers: have a real conversation. <b>CD2 + CD7</b></dd></div>
            <div><dt>Typing dots</dt><dd>Triggers: stay. <b>CD7</b></dd></div>
            <div><dt>Unheard voice note</dt><dd>Triggers: open it. <b>CD7</b></dd></div>
          </div>
          <p className="swatch__use" style={{ marginTop: 'var(--s4)' }}>
            Anything that reported a number but triggered nothing was cut in this pass — which is
            most of what a normal stats screen contains.
          </p>
        </div>

        <div className="card">
          <h4>Rewards, abundant to scarce</h4>
          <div className="deflist">
            <div><dt>Every day</dt><dd>She remembers. A bloom. The day closed.</dd></div>
            <div><dt>Often</dt><dd>A callback that lands. A running joke coming back.</dd></div>
            <div><dt>Sometimes</dt><dd>A voice note instead of text. The garden changing season.</dd></div>
            <div><dt>Rarely</dt><dd>A chapter — she tells you something about herself.</dd></div>
            <div><dt>Once</dt><dd>The first time she disagrees with you and turns out to be right.</dd></div>
          </div>
          <p className="swatch__use" style={{ marginTop: 'var(--s4)' }}>
            Note what is <i>not</i> here: points, coins, gems, tiers, anything purchasable. Every
            reward on this list is the product being more itself.
          </p>
        </div>
      </div>
    </section>
  )
}
