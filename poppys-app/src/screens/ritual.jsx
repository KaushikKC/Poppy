import Icon from '../components/Icon.jsx'
import { NavBar, BackBtn, Presence, StreakRing, GoalRing, Wave } from '../components/ui.jsx'

const noop = () => {}

/* ===========================================================
   CLOSE THE DAY
   The daily check-in, built on White Hat drives — meaning,
   accomplishment, creative input — instead of a claim button.
   Nothing here is collected. Something here is finished.
   =========================================================== */

export function CloseTheDay({ go = noop }) {
  return (
    <>
      <div className="body grow">
        <div className="stack gap5 pt4">
          <div className="stack gap2">
            <div className="row between">
              <span className="t-label muted">Tuesday, 9:04 pm</span>
              <span className="t-label muted tnum">closes at midnight</span>
            </div>
            <p className="t-title">Want to close the day?</p>
            <p className="t-sm soft">
              Ninety seconds. She reads back the one line from today worth keeping, you tell her
              whether she got it right, and it goes in the garden as today&apos;s flower.
            </p>
            <p className="t-xs muted">
              You picked 9pm for this. Change it or switch it off in two taps — it is the only
              thing in the app with a clock on it.
            </p>
          </div>

          <div className="glass pad5 stack gap4">
            <div className="row gap3">
              <Presence size={44} rings={false} />
              <span className="stack gap1" style={{ minWidth: 0 }}>
                <span className="t-label muted">Her pick from today</span>
                <span className="t-xs muted">from the 6:41 call · you can change it</span>
              </span>
            </div>
            <p className="recall__q">
              &ldquo;You said no to something today and the sky didn&apos;t fall. First time in a
              while.&rdquo;
            </p>
            <div className="row gap2 wrap">
              <button className="chip chip--on">
                <Icon name="check" size={14} stroke={2.2} /> That&apos;s the one
              </button>
              <button className="chip"><Icon name="pencil" size={14} /> Not quite</button>
              <button className="chip">Pick another</button>
            </div>
          </div>

          <div className="row gap3">
            <div className="glass pad4 stack gap2" style={{ flex: 1, alignItems: 'center' }}>
              <StreakRing days={12} size={48} />
              <span className="t-label muted center">days running</span>
            </div>
            <div className="glass pad4 stack gap2" style={{ flex: 1, alignItems: 'center' }}>
              <GoalRing done={3} total={3} size={48} />
              <span className="t-label muted center">day closed</span>
            </div>
          </div>

          <div className="memcard stack gap2">
            <span className="t-label muted">Open until you answer it</span>
            <p className="t-body">
              &ldquo;Tomorrow, tell me what it cost you to say it. I want the honest version.&rdquo;
            </p>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>

      <div className="stack gap2" style={{ padding: '0 20px 16px' }}>
        <button className="btn btn--primary btn--block" onClick={() => go('closed')}>
          Close the day
        </button>
        <button className="btn btn--ghost btn--block" onClick={() => go('home')}>
          Leave it open
        </button>
      </div>
    </>
  )
}

/* ── The payoff — one bloom, one line, one hook forward ─────────── */
export function DayClosed({ go = noop }) {
  return (
    <>
      <div className="grow stack" style={{ alignItems: 'center', justifyContent: 'center', gap: 26, padding: '0 28px' }}>
        <svg width="132" height="150" viewBox="0 0 132 150" aria-hidden="true">
          <ellipse cx="66" cy="140" rx="52" ry="9" fill="#456B3B" opacity="0.28" />
          <path d="M66 140 C66 108, 62 92, 62 62" stroke="#527A47" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <ellipse cx="72" cy="100" rx="9" ry="4.2" fill="#527A47" opacity="0.68" transform="rotate(-26 72 100)" />
          <ellipse cx="52" cy="86" rx="8" ry="3.8" fill="#527A47" opacity="0.55" transform="rotate(24 52 86)" />
          <g transform="translate(62 58)">
            {[0, 1, 2, 3, 4].map((i) => (
              <ellipse
                key={i}
                rx="12"
                ry="20"
                cy="-15"
                fill={i % 2 ? '#B33A32' : '#EE7B6F'}
                transform={`rotate(${72 * i + 12})`}
              />
            ))}
            <circle r="8" fill="#2C3A25" />
            <circle r="3.4" fill="#E6D2AC" />
          </g>
        </svg>

        <div className="stack gap3 center">
          <p className="t-display">Day closed.</p>
          <p className="t-body soft">
            Today grew a hype flower — the shape she gives days you did something that scared you.
            It stays in August whatever happens next.
          </p>
        </div>

        <div className="glass pad4 stack gap2" style={{ width: '100%' }}>
          <div className="row gap2">
            <Icon name="sparkle" size={16} style={{ color: 'var(--iris-600)' }} />
            <span className="t-sm semi">Chapter 5 is close</span>
          </div>
          <p className="t-xs muted">
            A couple more real conversations and she tells you something about herself she
            hasn&apos;t told you before. There is no way to pay for this one.
          </p>
        </div>
      </div>

      <div className="stack gap2" style={{ padding: '0 20px 20px' }}>
        <button className="btn btn--ink btn--block" onClick={() => go('garden')}>
          See the garden
        </button>
        <button className="btn btn--ghost btn--block" onClick={() => go('home')}>
          Goodnight
        </button>
      </div>
    </>
  )
}

/* ── The week, read back to you ─────────────────────────────────── */
export function WeekInReview({ go = noop }) {
  const days = [
    { d: 'M', m: 'calm', on: true },
    { d: 'T', m: 'vent', on: true },
    { d: 'W', m: 'hype', on: true },
    { d: 'T', m: 'calm', on: true },
    { d: 'F', m: null, on: false },
    { d: 'S', m: 'talk', on: true },
    { d: 'S', m: 'plan', on: true },
  ]
  const tone = { vent: '#8B82C4', hype: '#EE7B6F', calm: '#7FB8AE', plan: '#E2C68F', talk: '#EFA88C' }
  return (
    <>
      <NavBar left={<BackBtn onClick={() => go('garden')} />} title="Your week" />
      <div className="body grow">
        <div className="stack gap5 pt2">
          <div className="stack gap3">
            <p className="t-title">You had a loud week.</p>
            <div className="glass pad4 stack gap4">
              <div className="row between">
                {days.map((x, i) => (
                  <span key={i} className="stack gap2" style={{ alignItems: 'center' }}>
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: x.on ? tone[x.m] : 'transparent',
                        border: x.on ? 'none' : '1.5px dashed var(--line-strong)',
                        display: 'block',
                      }}
                    />
                    <span className="t-label muted">{x.d}</span>
                  </span>
                ))}
              </div>
              <p className="t-xs muted">
                Friday is blank. Not missed, not broken — a day with no flower on it, which is what
                most Fridays look like.
              </p>
            </div>
          </div>

          <div className="memcard stack gap2">
            <span className="t-label muted">What she noticed</span>
            <p className="t-body">
              &ldquo;Three of your five calls this week started with work. The two that
              didn&apos;t are the ones you stayed on longest.&rdquo;
            </p>
          </div>

          <div className="glass pad4 stack gap3">
            <span className="t-label muted">Next week, one thing</span>
            <p className="t-sm soft">
              Pick one on your next call, out loud, in your own words. Tapping a chip here would be
              easier and would not survive Tuesday.
            </p>
            <div className="row gap2 wrap">
              <span className="chip chip--tiny">Call before the hard days</span>
              <span className="chip chip--tiny">Say the no out loud</span>
              <span className="chip chip--tiny">Something else</span>
            </div>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
      <div style={{ padding: '0 20px 16px' }}>
        <button className="btn btn--primary btn--block" onClick={() => go('connecting')}>
          Tell her which one
        </button>
      </div>
    </>
  )
}
