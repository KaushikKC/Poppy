import { useEffect, useRef } from 'react'
import Icon from './Icon.jsx'

/* ---------------- Device shell ---------------- */

export function StatusBar({ time = '9:41' }) {
  return (
    <div className="statusbar">
      <span className="tnum">{time}</span>
      <span className="statusbar__icons">
        <Icon name="signal" size={15} />
        <Icon name="wifi" size={15} stroke={1.9} />
        <Icon name="battery" size={19} stroke={1.5} />
      </span>
    </div>
  )
}

export function Device({ skin = 'day', time, children, chrome = true }) {
  return (
    <div className="device-wrap">
      <div className={`device skin-${skin}`}>
        {chrome && <StatusBar time={time} />}
        <div className="screen">{children}</div>
        {chrome && (
          <div className="homebar">
            <span />
          </div>
        )}
      </div>
    </div>
  )
}

/* A thread opens on the newest message, the way every chat client does.
   History is above you, one scroll away. */
export function ThreadBody({ children, style, bg = 'paper' }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])
  return (
    <div
      ref={ref}
      className="body body--flush grow chatbg"
      data-bg={bg}
      style={style}
    >
      {children}
    </div>
  )
}

/* ---------------- Companion presence ---------------- */

export function Presence({ size = 168, tone = '', rings = true, style }) {
  return (
    <div className="orb-stage" style={{ width: size, height: size, ...style }}>
      {rings && (
        <div className="orb-rings">
          <i /><i /><i />
        </div>
      )}
      <div
        className={`face ${tone ? `face--${tone}` : ''}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label="Poppy"
      />
    </div>
  )
}

export function HeroFace() {
  return <div className="hero-face" aria-hidden="true" />
}

export function Orb({ size = 168, tone = '', rings = true, style }) {
  return (
    <div className="orb-stage" style={{ width: size, height: size, ...style }}>
      {rings && (
        <div className="orb-rings">
          <i /><i /><i />
        </div>
      )}
      <div className={`orb ${tone ? `orb--${tone}` : ''}`} style={{ width: size, height: size }} />
    </div>
  )
}

const WAVE_SHAPE = [38, 66, 92, 54, 78, 100, 44, 70, 86, 50, 62, 34, 74]

export function Wave({ bars = 9, color = 'currentColor', height = 26 }) {
  return (
    <div className="wave" style={{ color, height }}>
      {Array.from({ length: bars }).map((_, i) => (
        <i
          key={i}
          style={{
            height: `${WAVE_SHAPE[i % WAVE_SHAPE.length]}%`,
            animationDelay: `${(i % 5) * 0.11}s`,
          }}
        />
      ))}
    </div>
  )
}

/* ---------------- Bars ---------------- */

export function NavBar({ left, title, right }) {
  return (
    <div className="navbar">
      <div style={{ width: 38, display: 'flex' }}>{left}</div>
      <div className="navbar__title">{title}</div>
      <div style={{ width: 38, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </div>
  )
}

export function BackBtn({ onClick }) {
  return (
    <button className="iconbtn" onClick={onClick} aria-label="Back">
      <Icon name="left" size={18} />
    </button>
  )
}

const TABS = [
  { id: 'home', label: 'Poppy', icon: 'chat' },
  { id: 'garden', label: 'Garden', icon: 'sparkle' },
  { id: 'call', label: 'Call', icon: 'phone' },
  { id: 'memory', label: 'Memory', icon: 'book' },
  { id: 'you', label: 'You', icon: 'user' },
]

export function TabBar({ active = 'home', onSelect }) {
  return (
    <nav className="tabbar" aria-label="Primary">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab ${t.id === 'call' ? 'tab--call' : ''}`}
          data-on={t.id === active}
          onClick={() => onSelect?.(t.id)}
        >
          <Icon name={t.icon} size={21} stroke={t.id === active ? 2 : 1.7} />
          {t.label}
        </button>
      ))}
    </nav>
  )
}

export function Progress({ total, step }) {
  return (
    <div className="progress">
      {Array.from({ length: total }).map((_, i) => (
        <i key={i} data-on={i <= step} />
      ))}
    </div>
  )
}

/* ---------------- Small parts ---------------- */

export function Toggle({ on = true }) {
  return (
    <span className="toggle" data-on={on}>
      <i />
    </span>
  )
}

export function Row({ icon, title, sub, right, onClick }) {
  return (
    <button className="listrow" onClick={onClick}>
      {icon && (
        <span className="listrow__ic">
          <Icon name={icon} size={17} />
        </span>
      )}
      <span className="listrow__body">
        <span className="listrow__title" style={{ display: 'block' }}>{title}</span>
        {sub && <span className="listrow__sub" style={{ display: 'block' }}>{sub}</span>}
      </span>
      {right ?? <Icon name="right" size={16} style={{ color: 'var(--ink-muted)', flex: 'none' }} />}
    </button>
  )
}

export function Feat({ children }) {
  return (
    <li className="feat">
      <Icon name="check" size={15} stroke={2.2} />
      <span>{children}</span>
    </li>
  )
}

export function Look({ label, from, to, on, badge }) {
  return (
    <button
      className={`look ${on ? 'look--on' : ''}`}
      style={{ background: `linear-gradient(158deg, ${from}, ${to})` }}
    >
      {on && (
        <span className="look__check">
          <Icon name="check" size={13} stroke={2.6} />
        </span>
      )}
      {badge && (
        <span className="chip chip--tiny" style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}>
          {badge}
        </span>
      )}
      <span>{label}</span>
    </button>
  )
}

export function Option({ icon, title, sub, on }) {
  return (
    <button className={`option ${on ? 'option--on' : ''}`}>
      <span className="option__ic">
        <Icon name={icon} size={20} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="t-body semi" style={{ display: 'block' }}>{title}</span>
        <span className="t-xs muted" style={{ display: 'block', marginTop: 2 }}>{sub}</span>
      </span>
    </button>
  )
}

/* The goal ring — a half-filled ring is a Zeigarnik trigger rendered as UI.
   Never shown full for long; resets at rollover. */
export function GoalRing({ done = 2, total = 3, size = 34, onClick }) {
  const r = size / 2 - 3
  const c = 2 * Math.PI * r
  const pct = Math.min(done / total, 1)
  return (
    <button
      className="iconbtn iconbtn--bare"
      onClick={onClick}
      aria-label={`Daily goal, ${done} of ${total}`}
      style={{ position: 'relative', width: size, height: size }}
    >
      <svg className="ring" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--glass-edge-lo)" strokeWidth="3" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--amber-500)"
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span
        className="tnum"
        style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600 }}
      >
        {done}
      </span>
    </button>
  )
}

/* Typing dots — she is mid-thought when you arrive. */
export function Typing() {
  return (
    <span className="typing" aria-label="Poppy is typing">
      <i /><i /><i />
    </span>
  )
}

/* One bloom = one call with a real moment in it. Never carries a number. */
export function Bloom({ mood = 'talk', size = 46, faded = false }) {
  const tone = {
    vent: ['#7A70B4', '#352C56'],
    hype: ['#E4615E', '#93231F'],
    calm: ['#6FA8A0', '#1E4A44'],
    plan: ['#DCC49B', '#9C7846'],
    talk: ['#E4917A', '#8B3B2E'],
  }[mood]
  const petals = mood === 'calm' ? 6 : 5
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ opacity: faded ? 0.34 : 1 }} aria-hidden="true">
      <g transform="translate(20 20)">
        {Array.from({ length: petals }).map((_, i) => (
          <ellipse
            key={i}
            rx="6.4"
            ry="11"
            cy="-8"
            fill={i % 2 ? tone[1] : tone[0]}
            transform={`rotate(${(360 / petals) * i})`}
          />
        ))}
        <circle r="4.6" fill="var(--leaf-800)" />
        <circle r="2" fill="var(--amber-300)" />
      </g>
    </svg>
  )
}

export function StreakRing({ days = 12, size = 54 }) {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const pct = Math.min(days % 30 || 30, 30) / 30
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg className="ring" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--glass-edge-lo)" strokeWidth="3.5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--amber-500)"
          strokeWidth="3.5"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span
        className="tnum semi"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: 15,
          letterSpacing: '-0.02em',
        }}
      >
        {days}
      </span>
    </div>
  )
}
