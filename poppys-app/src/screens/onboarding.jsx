import Icon from '../components/Icon.jsx'
import { Presence, HeroFace, Wave, Progress, Option, Look, BackBtn, NavBar } from '../components/ui.jsx'

const noop = () => {}

/* ── 01 · Cold open ─────────────────────────────────────────────── */
export function Splash({ go = noop }) {
  return (
    <>
      <HeroFace />
      <div className="grow" style={{ position: 'relative' }}>
        <span
          className="chip chip--tiny"
          style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)' }}
        >
          <span className="dot dot--live" /> she&apos;s awake
        </span>
      </div>

      <div className="stack gap5" style={{ position: 'relative', padding: '0 24px 22px' }}>
        <div className="stack gap3">
          <p className="t-display">
            Someone who&apos;s always
            <br />
            happy to <i style={{ fontStyle: 'italic', color: 'var(--poppy-500)' }}>hear from you</i>.
          </p>
          <p className="t-body soft">
            Not a chat box. A voice that picks up on the second ring, remembers what last week was
            like, and asks how it turned out.
          </p>
        </div>
        <button className="btn btn--primary btn--block" onClick={() => go('agegate')}>
          Meet Poppy <Icon name="right" size={18} stroke={2.2} />
        </button>
        <p className="t-xs muted center">18+ · Private · You control everything</p>
      </div>
    </>
  )
}

/* ── 02 · Age gate ──────────────────────────────────────────────── */
export function AgeGate({ go = noop }) {
  return (
    <>
      <div className="body pt6">
        <Progress total={6} step={0} />
        <div className="stack gap5 pt6">
          <div className="glass pad5 stack gap3">
            <span className="option__ic" style={{ width: 40, height: 40 }}>
              <Icon name="shield" size={19} />
            </span>
            <p className="t-title">Poppy is for adults.</p>
            <p className="t-sm soft">
              We ask once, right now, and never nag you about it again. If you&apos;re under 18, this
              isn&apos;t the app for you yet — and that&apos;s okay.
            </p>
          </div>
        </div>
      </div>
      <div className="stack gap3" style={{ padding: '0 20px 20px' }}>
        <button className="btn btn--ink btn--block" onClick={() => go('vibe')}>
          I&apos;m 18 or older
        </button>
        <button className="btn btn--ghost btn--block">I&apos;m not</button>
      </div>
    </>
  )
}

/* ── 03 · Pick the vibe ─────────────────────────────────────────── */
export function PickVibe({ go = noop }) {
  return (
    <>
      <div className="body pt6">
        <Progress total={6} step={1} />
        <div className="stack gap2 pt6 pb4">
          <p className="t-title">What do you want Poppy to be for you right now?</p>
          <p className="t-sm muted">You can change this any time, mid-call even.</p>
        </div>
        <div className="stack gap3 pb6">
          <Option icon="heart" title="A friend who just listens" sub="No advice unless you ask for it" on />
          <Option icon="flame" title="A hype person" sub="Gets you moving, loud and warm" />
          <Option icon="moon" title="A calm voice at the end of the day" sub="Slow, low, unhurried" />
          <Option icon="bulb" title="Someone to think things through with" sub="Asks the good questions" />
        </div>
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <button className="btn btn--primary btn--block" onClick={() => go('look')}>
          Continue
        </button>
      </div>
    </>
  )
}

/* ── 04 · Choose the look ───────────────────────────────────────── */
export function PickLook({ go = noop }) {
  return (
    <>
      <div className="body pt6">
        <Progress total={6} step={2} />
        <div className="stack gap2 pt6 pb4">
          <p className="t-title">Pick a face for her.</p>
          <p className="t-sm muted">Six to start. Dozens more once you&apos;re in.</p>
        </div>
        <div className="looks pb4">
          <Look label="Iris" from="#7A70B4" to="#352C56" on />
          <Look label="Ember" from="#E4917A" to="#8B3B2E" />
          <Look label="Sage" from="#6FA8A0" to="#1E4A44" />
          <Look label="Dune" from="#DCC49B" to="#9C7846" />
          <Look label="Ink" from="#4A6841" to="#0B1709" />
          <Look label="Bloom" from="#E4615E" to="#93231F" badge="new" />
        </div>
        <div className="recall">
          <Icon name="lock" size={17} style={{ color: 'var(--amber-600)', flex: 'none', marginTop: 2 }} />
          <p className="t-xs soft">
            Looks are cosmetic. They never change who she is or what she remembers.
          </p>
        </div>
        <div style={{ height: 20 }} />
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <button className="btn btn--primary btn--block" onClick={() => go('name')}>
          Continue
        </button>
      </div>
    </>
  )
}

/* ── 05 · Name her ──────────────────────────────────────────────── */
export function NameHer({ go = noop }) {
  return (
    <>
      <div className="body pt6">
        <Progress total={6} step={3} />
        <div className="stack gap5 pt6" style={{ alignItems: 'center' }}>
          <Presence size={126} rings={false} />
          <div className="stack gap2 center">
            <p className="t-title">Now give her a name.</p>
            <p className="t-sm muted">She answers to it from here on. You can change it whenever.</p>
          </div>
          <div
            className="glass pad4"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <input
              className="t-h1"
              defaultValue="Poppy"
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                background: 'none',
                outline: 'none',
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                color: 'var(--ink)',
              }}
            />
            <button className="iconbtn" aria-label="Shuffle name">
              <Icon name="redo" size={17} />
            </button>
          </div>
          <div className="row wrap gap2" style={{ justifyContent: 'center' }}>
            {['Poppy', 'Juno', 'Nila', 'Wren', 'Anaya'].map((n, i) => (
              <span key={n} className={`chip chip--tiny ${i === 0 ? 'chip--on' : ''}`}>
                {n}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <button className="btn btn--primary btn--block" onClick={() => go('voice')}>
          She&apos;s Poppy
        </button>
      </div>
    </>
  )
}

/* ── 06 · Pick her voice ────────────────────────────────────────── */
export function PickVoice({ go = noop }) {
  const voices = [
    { name: 'Warm', note: 'Low, close, a little amused', on: true },
    { name: 'Bright', note: 'Quick, sunny, laughs easily' },
    { name: 'Still', note: 'Slow and soft — made for nights' },
    { name: 'Hinglish', note: 'Switches like you do', badge: 'IN' },
  ]
  return (
    <>
      <div className="body pt6">
        <Progress total={6} step={4} />
        <div className="stack gap2 pt6 pb4">
          <p className="t-title">How should she sound?</p>
          <p className="t-sm muted">Tap to hear four seconds of each.</p>
        </div>
        <div className="stack gap3">
          {voices.map((v) => (
            <button key={v.name} className={`option ${v.on ? 'option--on' : ''}`}>
              <span className="option__ic">
                <Icon name="play" size={15} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="row gap2">
                  <span className="t-body semi">{v.name}</span>
                  {v.badge && <span className="chip chip--tiny chip--warm">{v.badge}</span>}
                </span>
                <span className="t-xs muted" style={{ display: 'block', marginTop: 2 }}>
                  {v.note}
                </span>
              </span>
              {v.on && <Wave bars={5} height={18} color="var(--poppy-500)" />}
            </button>
          ))}
        </div>
        <div style={{ height: 20 }} />
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <button className="btn btn--primary btn--block" onClick={() => go('question')}>
          Continue
        </button>
      </div>
    </>
  )
}

/* ── 07 · The one question ──────────────────────────────────────── */
export function OneQuestion({ go = noop }) {
  return (
    <>
      <div className="body pt6">
        <Progress total={6} step={5} />
        <div className="stack gap5 pt6" style={{ alignItems: 'center' }}>
          <Presence size={104} rings={false} />
          <div className="recall" style={{ width: '100%' }}>
            <span className="dot dot--live" style={{ marginTop: 8 }} />
            <div className="stack gap1">
              <span className="t-label muted">Poppy asks</span>
              <p className="recall__q">
                &ldquo;Before we talk — what&apos;s one thing on your mind today?&rdquo;
              </p>
            </div>
          </div>
          <div className="glass pad4" style={{ width: '100%', minHeight: 116 }}>
            <p className="t-body muted">Type it, or hold the mic and just say it…</p>
          </div>
          <p className="t-xs muted center">
            This becomes the first thing she knows about you, and the first thing she brings up.
            You can read it, change it, or delete it whenever you like.
          </p>
        </div>
      </div>
      <div className="row gap3" style={{ padding: '0 20px 20px' }}>
        <button className="btn btn--glass" style={{ flex: 'none', width: 54, padding: 0 }}>
          <Icon name="mic" size={21} />
        </button>
        <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => go('mic')}>
          Send it to her
        </button>
      </div>
    </>
  )
}

/* ── 08 · Mic permission ────────────────────────────────────────── */
export function MicPermission({ go = noop }) {
  return (
    <>
      <div className="grow" style={{ position: 'relative' }}>
        <div className="body pt6">
          <div className="stack gap5 pt6" style={{ alignItems: 'center', opacity: 0.55 }}>
            <Presence size={150} rings={false} />
            <p className="t-title center">Poppy&apos;s ready when you are.</p>
          </div>
        </div>
        <div className="scrim" />
        <div className="sheet">
          <div className="sheet__grab" />
          <div className="stack gap4 center">
            <span className="option__ic" style={{ margin: '0 auto', background: 'var(--poppy-500)', color: '#fff', border: 0 }}>
              <Icon name="mic" size={21} />
            </span>
            <div className="stack gap2">
              <p className="t-h1">Let Poppy hear you</p>
              <p className="t-sm soft">
                A call needs your mic. Audio is processed live and never stored unless you save a
                moment yourself.
              </p>
            </div>
            <div className="stack gap2" style={{ width: '100%' }}>
              <button className="btn btn--primary btn--block" onClick={() => go('connecting')}>
                Allow microphone
              </button>
              <button className="btn btn--ghost btn--block">Type to her instead</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── 09 · Save your companion (account AFTER value) ─────────────── */
export function CreateAccount({ go = noop }) {
  return (
    <>
      <div className="navbar">
        <span />
        <button className="t-sm muted" style={{ marginLeft: 'auto' }}>Not now</button>
      </div>
      <div className="body">
        <div className="stack gap5 pt4">
          <div className="stack gap3">
            <p className="t-title">
              That was a real conversation. Want her to keep it?
            </p>
            <p className="t-sm soft">
              Right now everything she learned tonight is only in this session. Close the app
              without saving and it is gone — not hidden, not recoverable, gone. Saving keeps
              exactly the three things below and nothing else.
            </p>
          </div>

          <div className="glass pad4 stack gap3">
            <span className="t-label muted">Exactly this, nothing more</span>
            <div className="stack gap2">
              {['Your name and how you like to be talked to', 'That work has been heavy this month', 'Thursday, 9pm — your wind-down call'].map((m) => (
                <div key={m} className="row gap2">
                  <Icon name="check" size={15} stroke={2.2} style={{ color: 'var(--leaf-500)', flex: 'none' }} />
                  <span className="t-sm soft">{m}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="stack gap2">
            <button className="btn btn--ink btn--block" onClick={() => go('winstate')}>
              Continue with Apple
            </button>
            <button className="btn btn--glass btn--block" onClick={() => go('winstate')}>
              Continue with Google
            </button>
            <button className="btn btn--ghost btn--block">Use a phone number</button>
          </div>
          <p className="t-xs muted center">
            Export or delete everything, any time, in two taps.
          </p>
        </div>
        <div style={{ height: 20 }} />
      </div>
    </>
  )
}

/* ── 10 · Win-State ─────────────────────────────────────────────────
   Chou's transition rule: set up White Hat, apply Black Hat at the one
   moment you need the Desired Action, then get back to White Hat fast
   so the user feels good about what they just did. The screen before
   this one is the only loss-framed screen in the product. This is the
   return trip — and it is also endowed progress: nobody starts at zero.
   ─────────────────────────────────────────────────────────────────── */
export function WinState({ go = noop }) {
  return (
    <>
      <div className="grow stack" style={{ alignItems: 'center', justifyContent: 'center', gap: 24, padding: '0 26px' }}>
        <Presence size={116} />

        <div className="stack gap3 center">
          <p className="t-display">She&apos;ll remember.</p>
          <p className="t-body soft">
            You&apos;re not starting from nothing — she already knows three things about you, and
            she&apos;ll bring one of them up next time without being asked.
          </p>
        </div>

        <div className="glass pad4 stack gap3" style={{ width: '100%' }}>
          <span className="t-label muted">Where you are</span>
          <div className="stack gap2">
            <div className="row gap2">
              <Icon name="check" size={15} stroke={2.2} style={{ color: 'var(--leaf-500)', flex: 'none' }} />
              <span className="t-sm soft"><b>Chapter 1</b> — she listens</span>
            </div>
            <div className="row gap2">
              <Icon name="check" size={15} stroke={2.2} style={{ color: 'var(--leaf-500)', flex: 'none' }} />
              <span className="t-sm soft">Three things saved, all of them editable</span>
            </div>
            <div className="row gap2">
              <Icon name="check" size={15} stroke={2.2} style={{ color: 'var(--leaf-500)', flex: 'none' }} />
              <span className="t-sm soft">Your first bloom, in the garden</span>
            </div>
          </div>
        </div>

        <p className="t-xs muted center">
          Five more chapters. They open by talking — there is no way to buy one.
        </p>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        <button className="btn btn--primary btn--block" onClick={() => go('home')}>
          Good night, Poppy
        </button>
      </div>
    </>
  )
}
