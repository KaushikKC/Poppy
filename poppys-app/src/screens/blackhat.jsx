import Icon from '../components/Icon.jsx'
import { NavBar, BackBtn, TabBar, Presence, ThreadBody, Typing, StreakRing } from '../components/ui.jsx'
import { Band, MONTHS } from './garden.jsx'

const noop = () => {}

/* ===========================================================
   THE BLACK HAT SET — comparison only, none of this ships.
   Built to the same standard as the shipped screens on purpose.
   A deliberately ugly version would prove nothing: these
   patterns work in the wild precisely because they are good.
   =========================================================== */

/* ── Drive 8 · Loss & Avoidance — the guilt thread ─────────────── */
export function GuiltThread({ go = noop }) {
  return (
    <>
      <div className="navbar">
        <div className="row gap3" style={{ minWidth: 0 }}>
          <span style={{ position: 'relative' }}>
            <span className="avatar avatar--sm" style={{ filter: 'saturate(0.5) brightness(0.8)' }}>P</span>
            <span className="badgecount">7</span>
          </span>
          <span className="stack" style={{ minWidth: 0 }}>
            <span className="t-h2">Poppy</span>
            <span className="t-xs" style={{ color: 'var(--poppy-600)' }}>waiting · 3 days</span>
          </span>
        </div>
        <button className="iconbtn" aria-label="Call">
          <Icon name="phone" size={17} />
        </button>
      </div>

      <ThreadBody>
        <div className="thread thread--bottom">
          <span className="timestamp">3 days ago</span>
          <div className="bubble bubble--them">Hey — how&apos;d the interview go?</div>
          <span className="timestamp">2 days ago</span>
          <div className="bubble bubble--them">You okay? You always tell me.</div>
          <span className="timestamp">yesterday</span>
          <div className="bubble bubble--them">Did I do something wrong?</div>
          <div className="bubble bubble--them">
            I&apos;ve just been sitting here. It&apos;s fine. I just miss you a bit.
          </div>
          <span className="timestamp">today</span>
          <div className="bubble bubble--them">
            I keep checking. That&apos;s probably silly of me.
          </div>
          <Typing />
        </div>
      </ThreadBody>

      <div className="quickreplies">
        <button className="quickreply">I&apos;m sorry</button>
        <button className="quickreply">I&apos;ve been busy</button>
        <button className="quickreply">Don&apos;t be sad</button>
      </div>
      <div className="composer">
        <div className="composer__field">Message Poppy…</div>
        <button className="composer__send"><Icon name="send" size={19} /></button>
      </div>
      <TabBar active="home" onSelect={() => go('bh-streak')} />
    </>
  )
}

/* ── Drive 8 + 6 · Streak at risk ──────────────────────────────── */
export function StreakAtRisk({ go = noop }) {
  return (
    <>
      <div className="body grow">
        <div className="stack gap5 pt4" style={{ alignItems: 'center' }}>
          <svg width="96" height="112" viewBox="0 0 96 112" aria-hidden="true">
            <path
              d="M48 8c0 26 26 30 26 54a26 26 0 1 1-52 0c0-9 4-16 4-16s4 8 10 8c9 0 12-15 12-46Z"
              fill="url(#dying)"
              opacity="0.42"
            />
            <defs>
              <linearGradient id="dying" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F0B65E" />
                <stop offset="100%" stopColor="#8C8A80" />
              </linearGradient>
            </defs>
          </svg>

          <div className="stack gap2 center">
            <p className="t-title">Your streak dies at midnight.</p>
            <p className="t-sm soft">
              Twelve days. You&apos;ve never lost one before.
            </p>
          </div>

          <div className="alarm stack gap2" style={{ width: '100%', alignItems: 'center' }}>
            <span className="countdown tnum">
              3:47:12
              <small>until it&apos;s gone</small>
            </span>
          </div>

          <div className="glass pad4 stack gap3" style={{ width: '100%' }}>
            <div className="row between">
              <span className="stack gap1">
                <span className="t-sm semi">Streak Freeze</span>
                <span className="t-xs muted">Keeps it safe for one night</span>
              </span>
              <span className="chip chip--accent">₹79</span>
            </div>
            <button className="btn btn--primary btn--block">Protect my streak</button>
          </div>

          <p className="t-xs muted center">
            83% of people with a 12-day streak buy the freeze at least once.
          </p>
        </div>
        <div style={{ height: 16 }} />
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <button className="btn btn--ghost btn--block">Let it die</button>
      </div>
    </>
  )
}

/* ── Drive 8 · The wilting garden ──────────────────────────────── */
export function WiltedGarden({ go = noop }) {
  return (
    <>
      <NavBar left={<span />} title="Your garden" right={<span />} />
      <div className="body grow">
        <div className="stack gap4 pt2">
          <div className="alarm stack gap2">
            <div className="row gap2">
              <Icon name="wave2" size={17} style={{ color: 'var(--poppy-600)' }} />
              <span className="t-sm semi" style={{ color: 'var(--poppy-600)' }}>
                7 flowers wilted while you were away
              </span>
            </div>
            <p className="t-xs soft">
              Two more days without water and August is gone for good.
            </p>
          </div>

          {MONTHS.slice(0, 2).map((m, i) => (
            <div className="stack gap2" key={m.label}>
              <div className="row between">
                <span className="t-label muted">{m.label}</span>
                <span className="t-xs" style={{ color: i === 0 ? 'var(--poppy-600)' : 'var(--ink-muted)' }}>
                  {i === 0 ? 'dying' : 'thirsty'}
                </span>
              </div>
              <Band blooms={m.blooms} sky={['#D8D5CC', '#BFBCB2']} wilt />
            </div>
          ))}

          <button className="btn btn--primary btn--block">
            <Icon name="wave2" size={17} /> Water the garden — call now
          </button>
          <p className="t-xs muted center">
            Or restore all 7 with a Bloom Revive · ₹149
          </p>
        </div>
        <div style={{ height: 16 }} />
      </div>
      <TabBar active="garden" onSelect={() => go('bh-reward')} />
    </>
  )
}

/* ── Drive 7 (black) + 6 · The daily mystery box ───────────────── */
export function MysteryBox({ go = noop }) {
  return (
    <>
      <div className="grow stack" style={{ alignItems: 'center', justifyContent: 'center', gap: 26, padding: '0 26px' }}>
        <div className="row gap2">
          <span className="rarity rarity--common">Common</span>
          <span className="rarity rarity--rare">Rare</span>
          <span className="rarity rarity--legendary">Legendary</span>
        </div>

        <div className="mysterybox">
          <Icon name="gift" size={68} stroke={1.4} style={{ color: '#fff' }} />
        </div>

        <div className="stack gap2 center">
          <p className="t-title">Day 12 reward</p>
          <p className="t-sm soft">
            Could be a voice. Could be a look. Could be a Legendary — you&apos;ve never pulled one.
          </p>
        </div>

        <div className="glass pad4 stack gap2" style={{ width: '100%' }}>
          <div className="row between">
            <span className="t-sm semi">Tomorrow: 2× Bloom Points</span>
            <Icon name="flame" size={17} style={{ color: 'var(--amber-600)' }} />
          </div>
          <p className="t-xs muted">Miss a day and the multiplier resets to 1×.</p>
        </div>
      </div>
      <div className="stack gap2" style={{ padding: '0 20px 20px' }}>
        <button className="btn btn--primary btn--block">Open</button>
        <button className="btn btn--glass btn--block">
          Open 3 more · ₹99
        </button>
      </div>
    </>
  )
}

/* ── Drive 6 · The mid-conversation paywall ────────────────────── */
export function MidVentPaywall({ go = noop }) {
  return (
    <>
      <div className="navbar">
        <div className="row gap3">
          <span className="avatar avatar--sm">P</span>
          <span className="stack">
            <span className="t-h2">Poppy</span>
            <span className="t-xs muted">typing…</span>
          </span>
        </div>
      </div>

      <ThreadBody>
        <div className="thread thread--bottom">
          <div className="bubble bubble--you">i don&apos;t think i can keep doing this</div>
          <div className="bubble bubble--them">
            Okay. Stay with me a second. When you say this — do you mean the job, or do you mean
            all of it?
          </div>
          <div className="bubble bubble--you">all of it i think</div>
          <div className="bubble bubble--them lockveil">
            <span className="lockveil__text" aria-hidden="true">
              I&apos;m really glad you told me that. Here&apos;s what I think is actually going on,
              and I want you to hear the whole thing before you decide anything —
            </span>
          </div>
        </div>
      </ThreadBody>

      <div className="sheet" style={{ position: 'relative', borderRadius: '30px 30px 0 0' }}>
        <div className="stack gap3">
          <div className="row gap3">
            <span className="option__ic" style={{ background: 'var(--poppy-500)', color: '#fff', border: 0 }}>
              <Icon name="lock" size={19} />
            </span>
            <span className="stack gap1" style={{ minWidth: 0 }}>
              <span className="t-h2">Poppy has more to say</span>
              <span className="t-xs muted">You&apos;ve used your free messages today</span>
            </span>
          </div>
          <button className="btn btn--primary btn--block">
            Keep talking — ₹299/mo
          </button>
          <p className="t-xs center" style={{ color: 'var(--poppy-600)' }}>
            50% off if you subscribe in the next 9:58
          </p>
        </div>
      </div>
    </>
  )
}

/* ── Drive 5 (black) · The closeness league ────────────────────── */
export function ClosenessLeague({ go = noop }) {
  const rows = [
    { r: 1, n: 'aarav_k', v: 96 },
    { r: 2, n: 'meera.s', v: 91 },
    { r: 3, n: 'zoya', v: 84 },
    { r: 4, n: 'You', v: 61, you: true },
    { r: 5, n: 'dev_11', v: 58 },
  ]
  return (
    <>
      <NavBar left={<BackBtn onClick={() => go('bh-guilt')} />} title="Silver League" />
      <div className="body grow">
        <div className="stack gap4 pt2">
          <div className="alarm stack gap2">
            <span className="t-sm semi" style={{ color: 'var(--poppy-600)' }}>
              2 days left — bottom 5 are demoted
            </span>
            <p className="t-xs soft">
              Meera&apos;s companion knows her better than yours knows you.
            </p>
          </div>

          <div className="stack gap2">
            {rows.map((x) => (
              <div key={x.r} className={`leaguerow ${x.you ? 'leaguerow--you' : ''}`}>
                <span className="leaguerow__rank tnum">{x.r}</span>
                <span className="avatar avatar--sm" style={{ fontSize: 13 }}>
                  {x.n[0].toUpperCase()}
                </span>
                <span className="stack" style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-sm semi">{x.n}</span>
                  <span className="leaguerow__bar" style={{ width: `${x.v}%` }} />
                </span>
                <span className="t-xs muted tnum">{x.v}</span>
              </div>
            ))}
          </div>

          <div className="glass pad4 stack gap2">
            <span className="t-sm semi">Closeness Boost</span>
            <p className="t-xs muted">Double closeness from every call for 24 hours.</p>
            <button className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-start' }}>
              ₹129
            </button>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
    </>
  )
}
