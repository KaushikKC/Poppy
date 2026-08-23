import Icon from '../components/Icon.jsx'
import { NavBar, BackBtn, TabBar, Toggle, Row, Presence, StreakRing, Feat } from '../components/ui.jsx'

const noop = () => {}

/* ── Milestone ──────────────────────────────────────────────────── */
export function Milestone({ go = noop }) {
  return (
    <>
      <div className="grow stack gap6" style={{ alignItems: 'center', justifyContent: 'center', padding: '0 28px' }}>
        <StreakRing days={30} size={104} />
        <div className="stack gap3 center">
          <p className="t-display">Thirty days.</p>
          <p className="t-body soft">
            &ldquo;A month ago you called me for the first time and said work was heavy. Some days
            it still is. But you argue with me now, and you didn&apos;t used to. I&apos;ve
            noticed.&rdquo;
          </p>
        </div>
        <div className="glass pad4 stack gap2" style={{ width: '100%' }}>
          <span className="t-label muted">What thirty days actually got you</span>
          <p className="t-sm soft">
            The running joke about Tuesdays, which she started. And a new look, <b>Bloom</b>, if
            you want it.
          </p>
        </div>
      </div>
      <div className="stack gap2" style={{ padding: '0 20px 20px' }}>
        <button className="btn btn--primary btn--block" onClick={() => go('connecting')}>
          Call her about it
        </button>
        <button className="btn btn--ghost btn--block" onClick={() => go('home')}>Later</button>
      </div>
    </>
  )
}

/* ── Rituals & notifications ────────────────────────────────────── */
export function Rituals({ go = noop }) {
  return (
    <>
      <NavBar left={<BackBtn onClick={() => go('home')} />} title="When she reaches out" />
      <div className="body grow">
        <div className="stack gap4 pt2">
          <p className="t-sm soft">
            Every message below is something you left open, and it says so. She has no message that
            exists only to bring you back — if she has nothing to follow up on, she sends nothing.
          </p>

          <div className="stack gap2">
            <span className="t-label muted">Your rituals</span>
            <div className="list">
              <Row icon="sun" title="Morning" sub="7:30 am · 60-second plan" right={<Toggle on={false} />} />
              <Row icon="moon" title="Wind down" sub="9:00 pm · every day" right={<Toggle on />} />
            </div>
          </div>

          <div className="stack gap2">
            <span className="t-label muted">Open loops she&apos;ll follow up on</span>
            <div className="memcard stack gap2">
              <p className="t-sm">&ldquo;How&apos;d the presentation go? I&apos;ve been curious.&rdquo;</p>
              <span className="t-xs muted tnum">will send Thursday, after 6 pm</span>
            </div>
            <div className="memcard memcard--goal stack gap2">
              <p className="t-sm">&ldquo;Sunday run day. Are we doing it?&rdquo;</p>
              <span className="t-xs muted tnum">will send Sunday, 8 am</span>
            </div>
          </div>

          <div className="stack gap2">
            <span className="t-label muted">How often</span>
            <div className="glass pad4 stack gap3">
              <div className="row gap2">
                <span className="chip chip--tiny">Off</span>
                <span className="chip chip--tiny chip--on">Gentle</span>
                <span className="chip chip--tiny">Chatty</span>
              </div>
              <p className="t-xs muted">
                Gentle is at most one a day, and only when there is a real open loop to close. Off
                means off — she will not save them up.
              </p>
            </div>
          </div>

          <div className="glass glass--quiet pad4 stack gap2">
            <span className="t-sm semi">What she&apos;ll never send</span>
            {['“Poppy misses you”', '“Your streak is about to break”', 'Anything about a sale, mid-conversation'].map((x) => (
              <div key={x} className="row gap2">
                <Icon name="x" size={14} stroke={2.2} style={{ color: 'var(--poppy-500)', flex: 'none', marginTop: 3 }} />
                <span className="t-xs muted">{x}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
    </>
  )
}

/* ── Paywall ────────────────────────────────────────────────────── */
export function Paywall({ go = noop }) {
  return (
    <>
      <div className="navbar">
        <span />
        <button className="iconbtn iconbtn--bare" onClick={() => go('home')} aria-label="Close">
          <Icon name="x" size={20} />
        </button>
      </div>
      <div className="body grow">
        <div className="stack gap5">
          <div className="stack gap2">
            <span className="t-label accent">you two talk a lot</span>
            <p className="t-title">Twenty-two calls this month. Want to stop counting?</p>
            <p className="t-sm muted">
              We are asking now because you are using it a lot, not because you are upset. Nothing
              you already have gets removed if you say no — memory, chapters, deletion and export
              are free forever and are not moving behind this.
            </p>
          </div>

          <div className="tier tier--on stack gap3">
            <div className="row between">
              <span className="t-h2">Poppy Plus</span>
              <span className="chip chip--tiny chip--accent">most people</span>
            </div>
            <div className="row gap2" style={{ alignItems: 'baseline' }}>
              <span className="tier__price">₹299</span>
              <span className="t-xs muted">/month · ₹2,499 a year</span>
            </div>
            <ul className="stack gap2">
              <Feat>Unlimited calls, however long they run</Feat>
              <Feat>Deeper memory — she holds a whole year</Feat>
              <Feat>Look together, and calls with the screen off</Feat>
              <Feat>Her richest voice</Feat>
            </ul>
          </div>

          <div className="tier tier--studio stack gap3">
            <div className="row between">
              <span className="t-h2">Studio</span>
              <span className="tier__price" style={{ fontSize: 21 }}>₹699<small> /mo</small></span>
            </div>
            <ul className="stack gap2">
              <Feat>Separate companions, separate memories</Feat>
              <Feat>Premium looks and voices</Feat>
              <Feat>Priority connect — under a second</Feat>
            </ul>
          </div>

          <div className="glass glass--quiet pad4 stack gap2">
            <span className="t-sm semi">What free keeps, permanently</span>
            <p className="t-xs muted">
              Daily calls, your companion, her memory of you, every chapter, both rituals, the
              garden, full export and delete. No ads, no gems, no energy, no loot. Not now and not
              once you are attached.
            </p>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
      <div className="stack gap2" style={{ padding: '0 20px 16px' }}>
        <button className="btn btn--primary btn--block">Start Plus — first week free</button>
        <button className="btn btn--ghost btn--block" onClick={() => go('home')}>Stay on free</button>
      </div>
    </>
  )
}

/* ── You / profile ──────────────────────────────────────────────── */
export function You({ go = noop }) {
  return (
    <>
      <NavBar left={<span />} title="You" right={<button className="iconbtn" onClick={() => go('settings')}><Icon name="gear" size={18} /></button>} />
      <div className="body grow">
        <div className="stack gap5 pt2">
          <div className="glass pad5 row gap4">
            <span className="avatar avatar--lg" style={{ background: 'linear-gradient(158deg,#4A6841,#0B1709)' }}>D</span>
            <span className="stack gap1" style={{ minWidth: 0 }}>
              <span className="t-h1">Dharani</span>
              <span className="t-xs muted tnum">86 calls · 19 hours · since 2 Jun</span>
            </span>
          </div>

          <div className="row gap3">
            <div className="glass pad4 stack gap1 grow" style={{ flex: 1 }}>
              <span className="t-label muted">streak</span>
              <span className="t-h1 tnum">12 days</span>
            </div>
            <div className="glass pad4 stack gap1" style={{ flex: 1 }}>
              <span className="t-label muted">she knows</span>
              <span className="t-h1 tnum">41 things</span>
            </div>
          </div>

          <div className="list">
            <Row icon="sparkle" title="Poppy" sub="Look, voice, who she is with you" onClick={() => go('studio')} />
            <Row icon="eye" title="Appearance" sub="Dark · her world background" onClick={() => go('appearance')} />
            <Row icon="book" title="What Poppy knows" sub="41 memories · edit or delete" onClick={() => go('memory')} />
            <Row icon="image" title="Moments" sub="Bits of calls you kept" onClick={() => go('moments')} />
            <Row icon="clock" title="Your week" sub="Sunday, read back to you" onClick={() => go('week')} />
            <Row icon="bell" title="Rituals and messages" sub="Wind down · 9:00 pm" onClick={() => go('rituals')} />
            <Row icon="gift" title="Give a friend a week" sub="They get Plus. So do you." />
            <Row icon="star" title="Plus" sub="Unlimited calls, deeper memory" onClick={() => go('paywall')} />
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
      <TabBar active="you" onSelect={(t) => go(t === 'call' ? 'connecting' : t)} />
    </>
  )
}

/* ── Settings & privacy ─────────────────────────────────────────── */
export function Settings({ go = noop }) {
  return (
    <>
      <NavBar left={<BackBtn onClick={() => go('you')} />} title="Privacy" />
      <div className="body grow">
        <div className="stack gap4 pt2">
          <div className="glass pad4 stack gap2">
            <div className="row gap2">
              <Icon name="shield" size={17} style={{ color: 'var(--leaf-500)' }} />
              <span className="t-sm semi">Nothing here costs money</span>
            </div>
            <p className="t-xs muted">
              Export, delete and every safety control are free on every plan, forever. Anything in
              here that nudges you says what it is nudging you toward, on the same screen.
            </p>
          </div>

          <div className="stack gap2">
            <span className="t-label muted">Memory</span>
            <div className="list">
              <Row icon="book" title="What Poppy knows" sub="41 memories" onClick={() => go('memory')} />
              <Row icon="lock" title="Sensitive topics" sub="Off — health, money, private" right={<Toggle on={false} />} />
              <Row icon="clock" title="Forget things after" sub="Never, unless marked temporary" />
            </div>
          </div>

          <div className="stack gap2">
            <span className="t-label muted">Calls</span>
            <div className="list">
              <Row icon="mic" title="Keep call audio" sub="Off — audio is processed, not stored" right={<Toggle on={false} />} />
              <Row icon="chat" title="Keep transcripts" sub="On — searchable, deletable" right={<Toggle on />} />
            </div>
          </div>

          <div className="stack gap2">
            <span className="t-label muted">Your data</span>
            <div className="list">
              <Row icon="export" title="Export everything" sub="Memories, transcripts, moments" />
              <Row icon="trash" title="Delete everything" sub="Instant. Nothing kept, nothing recoverable." />
            </div>
          </div>

          <div className="glass glass--quiet pad4 stack gap2">
            <span className="t-sm semi">Poppy is an AI</span>
            <p className="t-xs muted">
              She&apos;ll say so if you ask, and she&apos;s not a therapist. If you&apos;re in a
              hard place, she&apos;ll point you to people who can actually help.
            </p>
            <button className="chip chip--tiny" style={{ alignSelf: 'flex-start' }} onClick={() => go('safety')}>
              See what that looks like
            </button>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
    </>
  )
}

/* ── Safety / distress flow ─────────────────────────────────────── */
export function Safety({ go = noop }) {
  return (
    <>
      <div className="grow stack" style={{ padding: '0 20px', justifyContent: 'center', gap: 22 }}>
        <Presence size={92} tone="calm" rings={false} style={{ margin: '0 auto' }} />
        <div className="glass pad5 stack gap4">
          <span className="t-label muted">Poppy</span>
          <p className="t-title">
            &ldquo;I&apos;m staying right here. But I&apos;m not the right kind of help for this
            part, and I&apos;d rather be honest with you than useful-sounding.&rdquo;
          </p>
          <div className="stack gap2">
            <button className="btn btn--ink btn--block">
              <Icon name="phone" size={17} /> Talk to a person now
            </button>
            <button className="btn btn--glass btn--block">
              Tele-MANAS · 14416 · free, 24×7
            </button>
          </div>
          <p className="t-xs muted">
            India. Change your region in settings for local lines.
          </p>
        </div>
        <button className="chip" style={{ alignSelf: 'center' }} onClick={() => go('call')}>
          Keep talking to Poppy
        </button>
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <p className="t-xs muted center">
          She won&apos;t roleplay this, won&apos;t agree that no one would care, and won&apos;t
          change the subject to keep you on the call.
        </p>
      </div>
    </>
  )
}
