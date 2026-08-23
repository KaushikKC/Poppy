import { useState, useMemo, useEffect } from 'react'
import { SECTIONS, FLOW, BY_ID } from './screens/registry.js'
import { Device } from './components/ui.jsx'
import Foundations from './components/Foundations.jsx'
import Octalysis from './components/Octalysis.jsx'
import Dashboard from './components/Dashboard.jsx'
import Icon from './components/Icon.jsx'

/* ---------------- Gallery plate ---------------- */

function Plate({ screen, theme = 'day' }) {
  const { Comp, title, step, note, spec, skin, pair, hat, ledger } = screen
  const resolved = skin === 'night' ? 'night' : theme

  /* A comparison plate: the screen we shipped beside the one we did not. */
  if (pair) {
    const Shipped = BY_ID[pair]?.Comp
    return (
      <article className="plate plate--wide">
        <div className="plate__head">
          <h3>{title}</h3>
          <span className="tag" style={{ marginLeft: 'auto' }}>{hat}</span>
        </div>
        <div className="compare">
          <div className="compare__side">
            <span className="compare__tag compare__tag--ship"><i />shipped</span>
            <Device skin={resolved}>{Shipped ? <Shipped /> : null}</Device>
          </div>
          <div className="compare__side">
            <span className="compare__tag compare__tag--black"><i />black hat</span>
            <Device skin={resolved}>
              <Comp />
            </Device>
          </div>
        </div>
        <p className="plate__note" dangerouslySetInnerHTML={{ __html: note }} />
        {ledger && (
          <div className="card ledger">
            {ledger.map(([k, v]) => (
              <div className="ledger__row" key={k}>
                <span className="ledger__k">{k}</span>
                <span className="ledger__v" dangerouslySetInnerHTML={{ __html: v }} />
              </div>
            ))}
          </div>
        )}
      </article>
    )
  }

  return (
    <article className="plate">
      <div className="plate__head">
        {step && <span className="plate__step">{step}</span>}
        <h3>{title}</h3>
        {skin === 'night' && <span className="tag" style={{ marginLeft: 'auto' }}>night</span>}
      </div>
      <Device skin={resolved}>
        <Comp />
      </Device>
      <p className="plate__note" dangerouslySetInnerHTML={{ __html: note }} />
      {spec && (
        <ul className="spec">
          {spec.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </article>
  )
}

/* ---------------- Rail ---------------- */

function Rail({ mode, setMode, theme, setTheme }) {
  return (
    <aside className="rail">
      <div className="rail__brand">
        <b>Poppys</b>
        <span>v1</span>
      </div>

      <div className="modeswitch">
        <button data-on={mode === 'canvas'} onClick={() => setMode('canvas')}>Canvas</button>
        <button data-on={mode === 'proto'} onClick={() => setMode('proto')}>Prototype</button>
      </div>

      <div className="modeswitch">
        <button data-on={theme === 'day'} onClick={() => setTheme('day')}>Day</button>
        <button data-on={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
      </div>

      {mode === 'canvas' && (
        <>
          <div className="rail__group">
            <span className="rail__kicker">System</span>
            <a className="rail__link" href="#foundations">Foundations <em>00</em></a>
            <a className="rail__link" href="#dashboard">Strategy dashboard <em>—</em></a>
            <a className="rail__link" href="#octalysis">Octalysis map <em>—</em></a>
          </div>
          {SECTIONS.map((s) => (
            <div className="rail__group" key={s.id}>
              <a className="rail__kicker" href={`#sec-${s.id}`} style={{ textDecoration: 'none' }}>
                {s.num} · {s.title}
              </a>
              {s.screens.map((sc) => (
                <a className="rail__link" key={sc.id} href={`#${sc.id}`}>
                  {sc.title}
                </a>
              ))}
            </div>
          ))}
        </>
      )}

      <div className="rail__foot">
        46 screens · 390 × 844
        <br />
        glass · sky · cream · poppy
      </div>
    </aside>
  )
}

/* ---------------- Canvas mode ---------------- */

function Canvas({ theme }) {
  return (
    <main className="main">
      <header className="masthead">
        <p className="masthead__eyebrow">Mobile design system · August 2026</p>
        <h1>
          The AI that <i>picks up</i> when you call.
        </h1>
        <p>
          Forty-six screens for Poppys, end to end. Every string in here was rewritten against
          Yu-kai Chou&rsquo;s Octalysis: each one has to move a Desired Action or it was cut, and
          each one has to pass his two-question ethics test — transparent purpose, real opt-in.
          Glass over a daylight sky, palette lifted from your reference screen.
        </p>
        <div className="masthead__meta">
          <span className="tag">iPhone 390 × 844</span>
          <span className="tag">glass / daylight + night</span>
          <span className="tag">Instrument Serif + SF Pro</span>
          <span className="tag">React components</span>
        </div>
      </header>

      <Foundations />

      <Dashboard />

      <Octalysis />

      {SECTIONS.map((s) => (
        <section className="section" id={`sec-${s.id}`} key={s.id}>
          <div className="section__head">
            <span className="section__num">{s.num}</span>
            <h2>{s.title}</h2>
            <p>{s.blurb}</p>
          </div>
          <div className="grid">
            {s.screens.map((sc) => (
              <div
                id={sc.id}
                key={sc.id}
                className={sc.pair ? 'span-all' : undefined}
                style={{ scrollMarginTop: 24 }}
              >
                <Plate screen={sc} theme={theme} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}

/* ---------------- Prototype mode ---------------- */

function Prototype({ theme = 'day' }) {
  const [id, setId] = useState('splash')
  const screen = BY_ID[id] ?? BY_ID.splash
  const idx = FLOW.indexOf(id)
  const go = (next) => {
    if (BY_ID[next]) setId(next)
  }
  const Comp = screen.Comp

  const stripped = useMemo(() => {
    const el = document.createElement('div')
    el.innerHTML = screen.note.replace(/<[^>]+>/g, '')
    return el.textContent || ''
  }, [screen])

  return (
    <div className="proto__stage">
      <Device skin={screen.skin === 'night' ? 'night' : theme}>
        <Comp go={go} />
      </Device>

      <div className="proto__side">
        <div>
          <p className="t-label muted" style={{ marginBottom: 8 }}>
            {screen.step ? `Onboarding ${screen.step}` : 'Screen'}
          </p>
          <h3>{screen.title}</h3>
        </div>
        <p>{stripped}</p>

        <div className="stepper">
          <button onClick={() => go(FLOW[idx - 1])} disabled={idx <= 0}>
            <Icon name="left" size={15} /> Back
          </button>
          <button onClick={() => go(FLOW[idx + 1])} disabled={idx >= FLOW.length - 1}>
            Next <Icon name="right" size={15} />
          </button>
          <span className="stepper__count">
            {idx + 1} / {FLOW.length}
          </span>
        </div>

        <label className="stack gap2">
          <span className="t-label muted">Jump to</span>
          <select className="jump" value={id} onChange={(e) => setId(e.target.value)}>
            {SECTIONS.map((s) => (
              <optgroup label={`${s.num} · ${s.title}`} key={s.id}>
                {s.screens.map((sc) => (
                  <option value={sc.id} key={sc.id}>
                    {sc.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <p className="t-xs muted">
          The controls are live — tap through the app itself. Every primary CTA, tab bar item and
          list row that has a destination is wired.
        </p>
      </div>
    </div>
  )
}

/* ---------------- App ---------------- */

export default function App() {
  const [mode, setMode] = useState('canvas')
  const [theme, setTheme] = useState('day')

  /* The switch drives the documentation page as well as the devices, so the
     whole review surface moves together. */
  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light'
  }, [theme])

  return (
    <div className={mode === 'canvas' ? 'shell' : 'proto'}>
      <Rail mode={mode} setMode={setMode} theme={theme} setTheme={setTheme} />
      {mode === 'canvas' ? <Canvas theme={theme} /> : <Prototype theme={theme} />}
    </div>
  )
}
