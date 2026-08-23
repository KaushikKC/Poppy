import Icon from './Icon.jsx'
import { Presence, Wave, Toggle, StreakRing } from './ui.jsx'

const PALETTE = [
  { n: 'Sky', v: '#B2CDE7', u: 'The ground. Every screen sits on this gradient.' },
  { n: 'Cream', v: '#F4F0E8', u: 'The glass material and every panel fill.' },
  { n: 'Leaf', v: '#162814', u: 'All ink, and the “you” bubble.' },
  { n: 'Poppy', v: '#D53D3B', u: 'Call, end, send. Nothing else.' },
  { n: 'Amber', v: '#BC9564', u: 'Memory, warmth, live indicators.' },
  { n: 'Iris', v: '#5F5696', u: 'Her presence. And Studio.' },
  { n: 'Tan', v: '#D5CBB6', u: 'Hairlines on cream.' },
  { n: 'Warm grey', v: '#8C8A80', u: 'Secondary text. Cream-biased, never neutral.' },
]

export default function Foundations() {
  return (
    <section className="section" id="foundations">
      <div className="section__head">
        <span className="section__num">00</span>
        <h2>Foundations</h2>
        <p>
          Palette sampled pixel-for-pixel from your reference screen. Glass is the material, not a
          filter dropped on top — every surface is a translucent cream sheet floating over the sky.
        </p>
      </div>

      <div className="cols">
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h4>Palette</h4>
          <div className="swatches">
            {PALETTE.map((c) => (
              <div className="swatch" key={c.n}>
                <div className="swatch__chip" style={{ background: c.v }} />
                <div>
                  <div className="swatch__name">{c.n}</div>
                  <div className="swatch__hex">{c.v}</div>
                </div>
                <div className="swatch__use">{c.u}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h4>Type</h4>
          <div className="typerow">
            <span className="typerow__tag">large title / 34</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, lineHeight: 1 }}>
              Happy to hear from you
            </span>
          </div>
          <div className="typerow">
            <span className="typerow__tag">title 1 / 28</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1.1 }}>
              Instrument Serif
            </span>
          </div>
          <div className="typerow">
            <span className="typerow__tag">title 2 / 22 · 600</span>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 21, fontWeight: 600, letterSpacing: '-0.018em' }}>
              SF Pro Semibold
            </span>
          </div>
          <div className="typerow">
            <span className="typerow__tag">body / 17</span>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 17, letterSpacing: '-0.012em' }}>
              SF Pro Regular, the iOS default
            </span>
          </div>
          <div className="typerow">
            <span className="typerow__tag">subhead / 15</span>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: '-0.008em' }}>
              Secondary lines and chips
            </span>
          </div>
          <div className="typerow">
            <span className="typerow__tag">caption 2 / 11</span>
            <span
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.062em',
                textTransform: 'uppercase',
              }}
            >
              Section labels
            </span>
          </div>
          <p className="swatch__use" style={{ marginTop: 14 }}>
            The phone frames call <span className="swatch__hex">-apple-system</span> first, so on
            Apple hardware every screen here is rendering in <b>real SF Pro</b> — including its
            automatic Text/Display optical switch. Sizes are the iOS text styles at default dynamic
            type, and tracking follows SF&apos;s own curve: tighter as it grows, opening back up
            below 13px. Inter is the fallback for anyone not on an Apple device.
          </p>
          <p className="swatch__use" style={{ marginTop: 10 }}>
            The serif is only ever <b>her</b> — what she says, and the titles that speak in her
            register. Everything the app itself says is SF Pro. Numerals sit on
            <span className="swatch__hex"> tabular-nums</span> so counters and durations stop
            jittering.
          </p>
        </div>

        <div className="card">
          <h4>Glass anatomy</h4>
          <div className="stack gap3">
            <div className="glass pad4">
              <div className="deflist">
                <div><dt>fill</dt><dd>cream at <b>60%</b>, 84% when text sits on it</dd></div>
                <div><dt>blur</dt><dd>22px + <b>165% saturate</b> — the sky bleeds through coloured</dd></div>
                <div><dt>top edge</dt><dd>inset 1px white at 62% — this is what reads as glass</dd></div>
                <div><dt>outer edge</dt><dd>1px leaf at 8%, never a grey stroke</dd></div>
                <div><dt>lift</dt><dd>two shadows: a 2px contact, a 24px spread</dd></div>
              </div>
            </div>
            <p className="swatch__use">
              Three depths only. <b>Quiet</b> (34%) for passive containers, <b>standard</b> (60%)
              for cards, <b>strong</b> (84%) for anything floating over content — tab bar, call bar,
              sheets. Never stack two blurred layers directly; the second one muddies.
            </p>
          </div>
        </div>

        <div className="card">
          <h4>Components</h4>
          <div className="stack gap4">
            <div className="row wrap gap2">
              <span className="chip">chip</span>
              <span className="chip chip--on">selected</span>
              <span className="chip chip--accent">accent</span>
              <span className="chip chip--warm">memory</span>
              <span className="chip chip--tiny"><span className="dot dot--live" /> live</span>
            </div>
            <div className="row gap3 wrap">
              <button className="btn btn--primary btn--sm">Primary</button>
              <button className="btn btn--ink btn--sm">Ink</button>
              <button className="btn btn--glass btn--sm">Glass</button>
              <Toggle on />
              <StreakRing days={12} size={44} />
            </div>
            <div className="row gap4" style={{ alignItems: 'center' }}>
              <Presence size={64} rings={false} />
              <Presence size={64} tone="warm" rings={false} />
              <Presence size={64} tone="calm" rings={false} />
              <Wave bars={7} color="var(--poppy-500)" />
            </div>
            <p className="swatch__use">
              Presence is her actual face, not an avatar chip. It breathes on a 6s cycle, ripples
              outward while she speaks, and grades with the mode — full colour by day, warmed when
              she is hyping you up, dimmed to near-dark for the night ritual.
            </p>
          </div>
        </div>

        <div className="card">
          <h4>Motion</h4>
          <div className="deflist">
            <div><dt>breathe</dt><dd>6s, ±7px, always running — she is never a still image</dd></div>
            <div><dt>ripple</dt><dd>4.6s, three offset rings, only while she is speaking</dd></div>
            <div><dt>halo</dt><dd>2.8s pulse on the call button — the one thing that asks for a tap</dd></div>
            <div><dt>press</dt><dd>scale 0.975, 140ms, <span className="swatch__hex">ease-out</span></dd></div>
            <div><dt>sheets</dt><dd>260ms rise, no bounce, no overshoot</dd></div>
          </div>
          <p className="swatch__use" style={{ marginTop: 14 }}>
            Everything else holds still. In a product about presence, ambient motion belongs to her
            alone — animated UI chrome would compete with the only thing that should feel alive.
          </p>
        </div>

        <div className="card">
          <h4>Rules the design holds</h4>
          <div className="rules">
            <div className="rule"><i>01</i><span><b>One primary action per screen.</b> On home that is the call button, and nothing is allowed to compete with it.</span></div>
            <div className="rule"><i>02</i><span><b>Red means the call.</b> Poppy red is start, end, send. Using it for anything else costs it its meaning.</span></div>
            <div className="rule"><i>03</i><span><b>She speaks in the serif.</b> If it is her voice, it is Instrument Serif. If it is the app talking, it is Inter.</span></div>
            <div className="rule"><i>04</i><span><b>Memory is always amber and always reversible.</b> Every memory surface shows an edit or delete within one tap.</span></div>
            <div className="rule"><i>05</i><span><b>Nothing guilt-shaped.</b> No loss states, no sad faces, no countdowns. The streak ring has no empty state that scolds.</span></div>
            <div className="rule"><i>06</i><span><b>44pt minimum touch target</b>, 54pt for anything on the path to a call.</span></div>
          </div>
        </div>
      </div>
    </section>
  )
}
