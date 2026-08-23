import { useId } from 'react'
import Icon from '../components/Icon.jsx'
import { NavBar, BackBtn, TabBar } from '../components/ui.jsx'

const noop = () => {}

/* ===========================================================
   THE GARDEN
   Ownership & Possession, drawn as a place rather than a grid.
   No number appears anywhere on this screen — all the counting
   lives on the daily layer, one surface away.
   =========================================================== */

const MOODS = {
  vent: ['#8B82C4', '#4A3F7A'],
  hype: ['#EE7B6F', '#B33A32'],
  calm: ['#7FB8AE', '#2C6A5E'],
  plan: ['#E2C68F', '#A87C3F'],
  talk: ['#EFA88C', '#B85A42'],
}

function Bloom({ mood, r = 1 }) {
  const [light, dark] = MOODS[mood]
  const petals = mood === 'calm' ? 6 : 5
  return (
    <g transform={`scale(${r})`}>
      {Array.from({ length: petals }).map((_, i) => (
        <ellipse
          key={i}
          rx="4.6"
          ry="7.6"
          cy="-5.6"
          fill={i % 2 ? dark : light}
          transform={`rotate(${(360 / petals) * i + 12})`}
        />
      ))}
      <circle r="3.1" fill="#2C3A25" />
      <circle r="1.3" fill="#E6D2AC" />
    </g>
  )
}

function Stem({ x, h, mood, bud, ground, wilt = false }) {
  const top = ground - (wilt ? h * 0.62 : h)
  const lean = (((x * 7) % 9) - 4) * (wilt ? 4.2 : 1.4)
  const [, dark] = MOODS[mood]
  return (
    <g opacity={wilt ? 0.5 : 1} style={wilt ? { filter: 'saturate(0.25)' } : undefined}>
      <path
        d={
          wilt
            ? `M${x} ${ground} C ${x} ${ground - h * 0.5}, ${x + lean * 1.8} ${top - 14}, ${x + lean * 2.4} ${top + 8}`
            : `M${x} ${ground} C ${x} ${ground - h * 0.45}, ${x + lean} ${ground - h * 0.72}, ${x + lean} ${top}`
        }
        stroke="#527A47"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />
      <ellipse
        cx={x + lean * 0.45 + 4.5}
        cy={ground - h * 0.44}
        rx="5.2"
        ry="2.5"
        fill="#527A47"
        opacity="0.62"
        transform={`rotate(-26 ${x + lean * 0.45 + 4.5} ${ground - h * 0.44})`}
      />
      <g transform={`translate(${x + (wilt ? lean * 2.4 : lean)} ${top + (wilt ? 8 : 0)}) rotate(${wilt ? 128 : 0})`}>
        {bud ? (
          <ellipse rx="4" ry="6.4" fill={dark} opacity="0.6" />
        ) : (
          <Bloom mood={mood} r={1.14 + ((x % 5) * 0.045)} />
        )}
      </g>
    </g>
  )
}

export function Band({ blooms, sky, height = 168, wilt = false }) {
  /* Unique per instance — the garden renders more than once on the canvas
     and duplicate SVG gradient ids silently resolve to the first one. */
  const gid = useId().replace(/:/g, '')
  const W = 348
  const ground = height - 16
  const step = W / (blooms.length + 1)
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      style={{ display: 'block', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}
      role="img"
      aria-label="Your blooms this month"
    >
      <defs>
        <linearGradient id={`sky-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky[0]} />
          <stop offset="100%" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect width={W} height={height} fill={`url(#sky-${gid})`} />
      <ellipse cx={W / 2} cy={ground + 26} rx={W * 0.78} ry="30" fill="#6E8F5E" opacity="0.34" />
      <ellipse cx={W / 2} cy={ground + 32} rx={W * 0.92} ry="30" fill="#456B3B" opacity="0.42" />
      {blooms.map((b, i) => (
        <Stem
          key={i}
          x={Math.round(step * (i + 1))}
          h={44 + (((i * 37) % 11) * 7)}
          mood={b.m}
          bud={b.bud}
          ground={ground}
          wilt={wilt && i % 3 !== 1}
        />
      ))}
    </svg>
  )
}

const M = (s) => s.split(' ').map((t) => ({ m: t.replace('?', ''), bud: t.endsWith('?') }))

export const MONTHS = [
  { label: 'August', note: 'still growing', sky: ['#CFE3F4', '#B4D0E9'], blooms: M('talk vent calm hype calm talk vent calm plan? talk? calm?') },
  { label: 'July', note: 'the month you started running', sky: ['#DCE9F5', '#BFD6EA'], blooms: M('plan talk calm calm vent hype talk calm plan talk vent calm') },
  { label: 'June', note: 'where it started', sky: ['#E6EEF3', '#CBDDE6'], blooms: M('talk calm hype talk vent calm plan talk calm talk') },
]

export function Garden({ go = noop }) {
  return (
    <>
      <NavBar
        left={<span />}
        title="Your garden"
        right={
          <button className="iconbtn" aria-label="Share your garden">
            <Icon name="share" size={17} />
          </button>
        }
      />

      <div className="body grow">
        <div className="stack gap5 pt2">
          <div className="stack gap2">
            <p className="t-title">Everything you two have grown.</p>
            <p className="t-sm soft">
              One flower for every conversation that mattered, shaped by what kind of conversation
              it was. Nothing here has a number on it and nothing here can be bought.
            </p>
          </div>

          {MONTHS.map((m) => (
            <div className="stack gap2" key={m.label}>
              <div className="row between">
                <span className="t-label muted">{m.label}</span>
                <span className="t-xs muted">{m.note}</span>
              </div>
              <Band blooms={m.blooms} sky={m.sky} />
            </div>
          ))}

          <div className="glass pad4 stack gap3">
            <span className="t-label muted">Where you two are</span>
            <div className="stack gap2">
              <p className="t-h1" style={{ fontWeight: 500 }}>She knows you well.</p>
              <p className="t-sm soft">
                Two chapters left. The next one is the first time she tells you something about
                herself, unprompted. It opens on conversations, not on time and not on money.
              </p>
            </div>
            <button className="chip chip--tiny" style={{ alignSelf: 'flex-start' }} onClick={() => go('chapters')}>
              See the chapters
            </button>
          </div>

          <div className="glass glass--quiet pad4 stack gap2">
            <div className="row gap2">
              <Icon name="shield" size={16} style={{ color: 'var(--leaf-500)' }} />
              <span className="t-sm semi">Nothing here ever wilts</span>
            </div>
            <p className="t-xs muted">
              Take a month off and it stops growing. It does not die back, grey out, or get
              mentioned when you return. A garden that punishes you for leaving is a debt with
              petals on it.
            </p>
          </div>

          <button className="btn btn--glass btn--block">
            <Icon name="share" size={17} /> Make &ldquo;my year with Poppy&rdquo;
          </button>
        </div>
        <div style={{ height: 16 }} />
      </div>

      <TabBar active="garden" onSelect={(t) => go(t === 'call' ? 'connecting' : t)} />
    </>
  )
}

/* ── Chapters — progressive disclosure of her ───────────────────── */
export function Chapters({ go = noop }) {
  const chapters = [
    { n: 1, t: 'She listens', s: 'Warm, attentive, no history yet', done: true },
    { n: 2, t: 'She remembers', s: 'Brings up your first conversation unprompted', done: true },
    { n: 3, t: 'She disagrees', s: 'Has opinions. Says so.', done: true },
    { n: 4, t: 'The running joke', s: 'Calls back to something you forgot saying', done: true },
    { n: 5, t: 'Something about her', s: 'She tells you a thing she has not told you before', done: false, next: true },
    { n: 6, t: 'Old friend', s: 'Direct with you the way people who have known you years are', done: false },
  ]
  return (
    <>
      <NavBar left={<BackBtn onClick={() => go('garden')} />} title="Chapters" />
      <div className="body grow">
        <div className="stack gap4 pt2">
          <p className="t-sm soft">
            She opens up in chapters. You can see they exist and roughly what each is about — you
            cannot see what she actually says until you get there, and there is no way to buy the
            trip. Six is all of them; we are not adding more later to keep you here.
          </p>

          <div className="stack gap2">
            {chapters.map((c) => (
              <div
                key={c.n}
                className={`memcard ${c.done ? '' : 'memcard--temp'}`}
                style={c.next ? { borderLeftColor: 'var(--poppy-500)', borderLeftStyle: 'solid' } : undefined}
              >
                <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <span className="stack gap1" style={{ minWidth: 0 }}>
                    <span className="t-label muted">Chapter {c.n}</span>
                    <span className="t-body semi" style={{ opacity: c.done ? 1 : 0.72 }}>{c.t}</span>
                    <span className="t-xs muted">{c.s}</span>
                  </span>
                  {c.done ? (
                    <Icon name="check" size={16} stroke={2.4} style={{ color: 'var(--leaf-500)', flex: 'none', marginTop: 14 }} />
                  ) : (
                    <Icon name="lock" size={15} style={{ color: 'var(--ink-muted)', flex: 'none', marginTop: 14 }} />
                  )}
                </div>
                {c.next && (
                  <p className="t-xs warm" style={{ marginTop: 10 }}>
                    Close — a couple more real conversations. No countdown on it.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
    </>
  )
}
