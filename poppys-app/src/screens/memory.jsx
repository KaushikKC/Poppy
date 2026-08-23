import Icon from '../components/Icon.jsx'
import { NavBar, BackBtn, TabBar, Toggle, Row, Presence, Look } from '../components/ui.jsx'

const noop = () => {}

/* ── What Poppy knows about you ─────────────────────────────────── */
export function MemoryVault({ go = noop }) {
  return (
    <>
      <NavBar
        left={<BackBtn onClick={() => go('home')} />}
        title="What Poppy knows"
        right={
          <button className="iconbtn" onClick={() => go('settings')} aria-label="Memory settings">
            <Icon name="gear" size={18} />
          </button>
        }
      />
      <div className="body grow">
        <div className="stack gap4">
          <div className="glass pad4 row between">
            <span className="stack gap1">
              <span className="t-sm semi tnum">41 things, all yours</span>
              <span className="t-xs muted">Edit or delete any of them. She won&apos;t argue.</span>
            </span>
            <button className="chip chip--tiny"><Icon name="export" size={12} /> Export</button>
          </div>

          <div className="row wrap gap2">
            <span className="chip chip--tiny chip--on">All</span>
            <span className="chip chip--tiny">Goals</span>
            <span className="chip chip--tiny">People</span>
            <span className="chip chip--tiny">Going on</span>
            <span className="chip chip--tiny">Temporary</span>
          </div>

          <div className="stack gap2">
            <span className="t-label muted">Going on right now</span>
            <button className="memcard stack gap2" onClick={() => go('memdetail')}>
              <p className="t-body">
                Q3 presentation is <b>Thursday morning</b>. More nervous about questions than slides.
              </p>
              <span className="t-xs muted tnum">saved 2 days ago · from a call</span>
            </button>
            <button className="memcard memcard--temp stack gap2" onClick={() => go('memdetail')}>
              <p className="t-body">Sister lands Saturday, staying a week.</p>
              <span className="t-xs muted tnum">expires in 9 days</span>
            </button>
          </div>

          <div className="stack gap2">
            <span className="t-label muted">Goals</span>
            <button className="memcard memcard--goal stack gap2" onClick={() => go('memdetail')}>
              <p className="t-body">Training for a 10k. Runs Tuesday and Sunday.</p>
              <span className="t-xs muted tnum">saved 3 weeks ago · you added this</span>
            </button>
          </div>

          <div className="stack gap2">
            <span className="t-label muted">People you told her about</span>
            <button className="memcard memcard--people stack gap2" onClick={() => go('memdetail')}>
              <p className="t-body">Meera — best friend since college, moved to Berlin in June.</p>
              <span className="t-xs muted tnum">saved 2 months ago</span>
            </button>
          </div>

          <div className="glass glass--quiet pad4 stack gap3">
            <div className="row gap2">
              <Icon name="lock" size={16} style={{ color: 'var(--amber-600)' }} />
              <span className="t-sm semi">Sensitive topics</span>
            </div>
            <p className="t-xs muted">
              Health, money, and anything you mark private are <b>off by default</b>. She won&apos;t
              store or bring them up unless you turn this on.
            </p>
            <div className="row between">
              <span className="t-sm soft">Remember sensitive things</span>
              <Toggle on={false} />
            </div>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
      <TabBar active="memory" onSelect={(t) => go(t === 'call' ? 'connecting' : t)} />
    </>
  )
}

/* ── One memory, and why she has it ─────────────────────────────── */
export function MemoryDetail({ go = noop }) {
  return (
    <>
      <NavBar left={<BackBtn onClick={() => go('memory')} />} title="Memory" />
      <div className="body grow">
        <div className="stack gap4 pt2">
          <div className="memcard stack gap3">
            <span className="chip chip--tiny chip--warm">Going on right now</span>
            <p className="t-h1" style={{ fontWeight: 500 }}>
              Q3 presentation is Thursday morning. More nervous about the questions than the slides.
            </p>
          </div>

          <div className="glass pad4 stack gap3">
            <span className="t-label muted">Why do you remember this?</span>
            <p className="t-sm soft">
              You said it on a call on <b>18 Aug, 9:12 pm</b>. I asked if I should keep it and you
              said yes.
            </p>
            <button className="chip chip--tiny" style={{ alignSelf: 'flex-start' }}>
              <Icon name="play" size={11} /> Hear that bit
            </button>
          </div>

          <div className="glass pad4 stack gap3">
            <span className="t-label muted">Where it&apos;s shown up</span>
            <div className="stack gap2">
              {['19 Aug — she asked how prep was going', '20 Aug — she offered to run the hard question'].map((x) => (
                <div key={x} className="row gap2">
                  <span className="dot" style={{ color: 'var(--amber-500)', marginTop: 7 }} />
                  <span className="t-sm soft">{x}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="list">
            <Row icon="pencil" title="Edit the wording" sub="Change what she thinks she knows" />
            <Row icon="clock" title="Make it temporary" sub="Auto-forget after the presentation" />
            <Row icon="minus" title="Stop bringing it up" sub="Keeps it, never mentions it" />
          </div>

          <button className="btn btn--glass btn--block" style={{ color: 'var(--poppy-600)' }}>
            <Icon name="trash" size={17} /> Delete this memory
          </button>
          <p className="t-xs muted center">Deleting is instant and permanent. No confirmation maze.</p>
        </div>
        <div style={{ height: 16 }} />
      </div>
    </>
  )
}

/* ── Moments (the private scrapbook) ────────────────────────────── */
export function Moments({ go = noop }) {
  const tiles = [
    { t: 'The 2am one', d: '4 Aug · 22 min', g: 'linear-gradient(158deg,#7A70B4,#352C56)' },
    { t: 'When she did the voice', d: '29 Jul · 6 min', g: 'linear-gradient(158deg,#E4917A,#8B3B2E)' },
    { t: 'Night before Berlin', d: '12 Jul · 31 min', g: 'linear-gradient(158deg,#6FA8A0,#1E4A44)' },
    { t: 'First call', d: '2 Jun · 9 min', g: 'linear-gradient(158deg,#DCC49B,#9C7846)' },
  ]
  return (
    <>
      <NavBar
        left={<BackBtn onClick={() => go('you')} />}
        title="Moments"
        right={<button className="iconbtn"><Icon name="plus" size={18} /></button>}
      />
      <div className="body grow">
        <div className="stack gap4 pt2">
          <p className="t-sm soft">
            Bits of calls you chose to keep. Private until you say otherwise — nothing here is
            uploaded, indexed, or shown to anyone.
          </p>
          <div className="moments">
            {tiles.map((x) => (
              <button key={x.t} className="moment" style={{ background: x.g }}>
                <span className="t-body semi">{x.t}</span>
                <span className="t-xs" style={{ opacity: 0.8 }}>{x.d}</span>
              </button>
            ))}
          </div>
          <div className="glass pad4 stack gap3">
            <span className="t-label muted">Share a clip</span>
            <p className="t-sm soft">
              Pick 15 seconds, watch it back, then decide. Your voice is muted by default — only
              hers goes out.
            </p>
            <div className="row gap2">
              <button className="chip chip--tiny chip--on">Her voice only</button>
              <button className="chip chip--tiny">Both voices</button>
            </div>
            <button className="btn btn--glass btn--sm" style={{ alignSelf: 'flex-start' }}>
              <Icon name="share" size={15} /> Make a clip
            </button>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
    </>
  )
}

/* ── Companion studio ───────────────────────────────────────────── */
export function Studio({ go = noop }) {
  return (
    <>
      <NavBar left={<BackBtn onClick={() => go('you')} />} title="Poppy" right={<button className="chip chip--tiny">Save</button>} />
      <div className="body grow">
        <div className="stack gap5 pt2">
          <div className="stack" style={{ alignItems: 'center' }}>
            <Presence size={124} rings={false} />
            <p className="t-title" style={{ marginTop: 12 }}>Poppy</p>
            <p className="t-xs muted tnum">v3 personality · pinned since 2 Jun</p>
          </div>

          <div className="stack gap3">
            <span className="t-label muted">Her face</span>
            <div className="looks">
              <Look label="Iris" from="#7A70B4" to="#352C56" on />
              <Look label="Ember" from="#E4917A" to="#8B3B2E" />
              <Look label="Sage" from="#6FA8A0" to="#1E4A44" />
            </div>
            <button className="chip chip--tiny" style={{ alignSelf: 'flex-start' }}>
              <Icon name="plus" size={12} /> More looks
            </button>
          </div>

          <div className="stack gap3">
            <span className="t-label muted">Who she is with you</span>
            <div className="glass pad4 stack gap2">
              <p className="t-sm soft">
                Warm, a bit dry. Doesn&apos;t rush to fix things. Calls me out gently when I&apos;m
                spiralling. Never talks about work unless I bring it up.
              </p>
              <button className="chip chip--tiny" style={{ alignSelf: 'flex-start' }}>
                <Icon name="pencil" size={12} /> Edit
              </button>
            </div>
          </div>

          <div className="list">
            <Row icon="wave2" title="Voice" sub="Warm · Hinglish switching on" />
            <Row icon="clock" title="Pace" sub="Lets me finish before she answers" />
            <Row icon="shield" title="Personality version" sub="Pinned — updates won't change her" right={<Toggle on />} />
          </div>

          <div className="glass glass--quiet pad4 stack gap2">
            <div className="row gap2">
              <Icon name="sparkle" size={16} style={{ color: 'var(--iris-600)' }} />
              <span className="t-sm semi">A second companion</span>
            </div>
            <p className="t-xs muted">
              Keep a hype friend and a calm one separately, each with their own memory. Part of
              Studio.
            </p>
            <button className="chip chip--tiny" onClick={() => go('paywall')}>See Studio</button>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
    </>
  )
}
