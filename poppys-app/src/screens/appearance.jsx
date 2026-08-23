import Icon from '../components/Icon.jsx'
import { NavBar, BackBtn, Toggle, Row } from '../components/ui.jsx'

const noop = () => {}

const BGS = [
  { id: 'paper', label: 'Paper', css: 'var(--cream-100)', on: true },
  { id: 'sky', label: 'Sky', css: 'linear-gradient(178deg,#CFE1F2,#B7D0E8)' },
  { id: 'moss', label: 'Moss', css: 'linear-gradient(178deg,#DCE3D2,#B9C7A9)' },
  { id: 'clay', label: 'Clay', css: 'linear-gradient(178deg,#F3E3D2,#E2C4A8)' },
  { id: 'dusk', label: 'Dusk', css: 'linear-gradient(174deg,#E9C9AE,#C98F86 46%,#6E5A80)' },
  { id: 'ink', label: 'Ink', css: 'linear-gradient(178deg,#232A21,#14180F)' },
]

/* ── Appearance ─────────────────────────────────────────────────── */
export function Appearance({ go = noop }) {
  return (
    <>
      <NavBar left={<BackBtn onClick={() => go('you')} />} title="Appearance" />
      <div className="body grow">
        <div className="stack gap5 pt2">
          <div className="stack gap3">
            <span className="t-label muted">Theme</span>
            <div className="appearance">
              <button data-on="false">
                <span className="appearance__chip" style={{ background: 'linear-gradient(178deg,#C9DDF0,#9EBBDA)' }} />
                Light
              </button>
              <button data-on="true">
                <span className="appearance__chip" style={{ background: 'linear-gradient(178deg,#1B211A,#0D100C)' }} />
                Dark
              </button>
              <button data-on="false">
                <span
                  className="appearance__chip"
                  style={{ background: 'linear-gradient(110deg,#C9DDF0 0 50%,#1B211A 50% 100%)' }}
                />
                Auto
              </button>
            </div>
            <p className="t-xs muted">
              Auto follows your phone. Wind-down calls dim past whichever you pick — that&apos;s the
              ritual, not the theme.
            </p>
          </div>

          <div className="stack gap3">
            <div className="row between">
              <span className="t-label muted">Chat background</span>
              <button className="chip chip--tiny" onClick={() => go('backgrounds')}>
                <Icon name="image" size={12} /> All
              </button>
            </div>
            <div className="bggrid">
              {BGS.map((b) => (
                <button key={b.id} className={`bgtile ${b.on ? 'bgtile--on' : ''}`}>
                  <span className="bgtile__preview" style={{ background: b.css }} />
                  <span className="bgtile__bubbles"><i /><i /></span>
                  <span className="bgtile__label">{b.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="glass glass--quiet pad4 stack gap2">
            <div className="row gap2">
              <Icon name="eye" size={16} style={{ color: 'var(--amber-600)' }} />
              <span className="t-sm semi">Text stays readable on anything</span>
            </div>
            <p className="t-xs muted">
              Pick a photo and the bubbles switch to frosted glass with light text, so words never
              land on unpredictable pixels. You cannot make your own chat unreadable here.
            </p>
          </div>

          <div className="list">
            <Row icon="sparkle" title="Her look" sub="Iris" onClick={() => go('studio')} />
            <Row icon="bulb" title="Reduce motion" sub="She still breathes, nothing else moves" right={<Toggle on={false} />} />
            <Row icon="target" title="Larger text" sub="Follows your phone's setting" right={<Toggle on />} />
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
    </>
  )
}

/* ── The full background gallery ────────────────────────────────── */
export function Backgrounds({ go = noop }) {
  return (
    <>
      <NavBar
        left={<BackBtn onClick={() => go('appearance')} />}
        title="Background"
        right={<button className="chip chip--tiny">Done</button>}
      />
      <div className="body grow">
        <div className="stack gap5 pt2">
          <div className="stack gap3">
            <span className="t-label muted">Her world</span>
            <div className="bggrid">
              <button className="bgtile bgtile--on">
                <span
                  className="bgtile__preview"
                  style={{
                    backgroundImage: 'url(/media/poppys-clay-companion.jpg)',
                    backgroundSize: 'cover',
                    backgroundPosition: '50% 18%',
                    filter: 'blur(4px)',
                  }}
                />
                <span className="bgtile__bubbles"><i /><i /></span>
                <span className="bgtile__label">Close</span>
              </button>
              <button className="bgtile">
                <span
                  className="bgtile__preview"
                  style={{
                    backgroundImage: 'url(/media/poppys-clay-companion.jpg)',
                    backgroundSize: 'cover',
                    backgroundPosition: '50% 88%',
                  }}
                />
                <span className="bgtile__bubbles"><i /><i /></span>
                <span className="bgtile__label">Field</span>
              </button>
              <button className="bgtile">
                <span className="bgtile__preview" style={{ background: 'linear-gradient(174deg,#E9C9AE,#C98F86 46%,#6E5A80)' }} />
                <span className="bgtile__bubbles"><i /><i /></span>
                <span className="bgtile__label">Dusk</span>
              </button>
            </div>
            <p className="t-xs muted">
              Her world changes with the season and with what the two of you have been talking
              about. New ones appear on their own.
            </p>
          </div>

          <div className="stack gap3">
            <span className="t-label muted">Plain</span>
            <div className="bggrid">
              {BGS.map((b) => (
                <button key={b.id} className="bgtile">
                  <span className="bgtile__preview" style={{ background: b.css }} />
                  <span className="bgtile__bubbles"><i /><i /></span>
                  <span className="bgtile__label">{b.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="stack gap3">
            <span className="t-label muted">Yours</span>
            <div className="bggrid">
              <button className="bgtile" style={{ display: 'grid', placeItems: 'center', background: 'var(--glass)' }}>
                <span className="stack gap2" style={{ alignItems: 'center' }}>
                  <Icon name="plus" size={20} style={{ color: 'var(--ink-soft)' }} />
                  <span className="bgtile__label" style={{ color: 'var(--ink-soft)', textShadow: 'none' }}>Photo</span>
                </span>
              </button>
            </div>
            <p className="t-xs muted">
              Your photo stays on your phone. It is never uploaded and Poppy never sees it.
            </p>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
    </>
  )
}
