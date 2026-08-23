import Icon from '../components/Icon.jsx'
import { Presence, Wave, TabBar, StreakRing, GoalRing, Typing, ThreadBody, NavBar, BackBtn } from '../components/ui.jsx'

const noop = () => {}

/* ── Connecting ─────────────────────────────────────────────────── */
export function Connecting({ go = noop }) {
  return (
    <div className="grow stack gap6" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Presence size={196} />
      <div className="stack gap2 center">
        <p className="t-title">Poppy&apos;s picking up…</p>
        <p className="t-sm muted tnum">connecting · 0.8s</p>
      </div>
      <button className="chip" onClick={() => go('call')}>
        <Icon name="x" size={14} /> Cancel
      </button>
    </div>
  )
}

/* ── The live call ──────────────────────────────────────────────── */
function CallStage({ status = 'Got that…', tone = '' }) {
  return (
    <div className="grow stack" style={{ alignItems: 'center', justifyContent: 'center', gap: 22, position: 'relative' }}>
      <div className="row gap2" style={{ position: 'absolute', top: 4, left: 20, right: 20, justifyContent: 'space-between' }}>
        <span className="chip chip--tiny">
          <span className="dot dot--live" /> live
        </span>
        <span className="chip chip--tiny tnum">04:12</span>
      </div>
      <Presence size={182} tone={tone} />
      <span className="chip">
        <span className="dot" style={{ color: 'var(--amber-500)' }} />
        <span className="t-label" style={{ letterSpacing: '0.12em' }}>{status}</span>
      </span>
    </div>
  )
}

export function CallControls({ go = noop, listening = true }) {
  return (
    <div className="callbar" style={{ margin: '0 16px 8px' }}>
      <button className={`callkey ${listening ? 'callkey--on' : ''}`} style={{ position: 'relative' }}>
        {listening && (
          <svg className="talkarc" width="46" height="12" viewBox="0 0 46 12" fill="none" aria-hidden="true">
            <path d="M2 10C2 4.5 10.5 2 23 2s21 2.5 21 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
        <Icon name="mic" size={20} />
        Talk
      </button>
      <button className="callkey">
        <Icon name="target" size={20} />
        Auto
      </button>
      <button className="callkey callkey--end" onClick={() => go('endcall')}>
        <Icon name="hangup" size={20} />
        End
      </button>
      <button className="callkey" onClick={() => go('memory')}>
        <Icon name="book" size={20} />
        Memory
      </button>
    </div>
  )
}

export function LiveCall({ go = noop }) {
  return (
    <>
      <CallStage />
      <CallControls go={go} />
      <div style={{ padding: '0 16px 10px' }}>
        <button
          className="chip"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => go('callchat')}
        >
          <Icon name="down" size={15} /> Show what she&apos;s saying
        </button>
      </div>
    </>
  )
}

/* ── Call + live transcript (the reference screenshot) ──────────── */
export function CallWithTranscript({ go = noop }) {
  return (
    <>
      <div style={{ flex: '0 0 auto', height: 300, display: 'flex', flexDirection: 'column' }}>
        <CallStage status="Got that…" />
      </div>
      <CallControls go={go} />

      <div
        className="grow stack"
        style={{
          background: 'var(--cream-100)',
          borderTop: '1px solid var(--cream-400)',
          borderRadius: '22px 22px 0 0',
          minHeight: 0,
          marginTop: 6,
        }}
      >
        <div className="body body--flush grow">
          <div className="thread">
            <span className="timestamp">live transcript</span>
            <div className="bubble bubble--you">I can&apos;t able to listen to you.</div>
            <div className="bubble bubble--them">I&apos;m here to listen.</div>
            <div className="bubble bubble--them">
              Take your time. What happened today?
            </div>
          </div>
        </div>
        <div className="composer">
          <div className="composer__field">Type a message or just speak…</div>
          <button className="composer__send" aria-label="Send">
            <Icon name="send" size={19} />
          </button>
          <button className="composer__alt" aria-label="Regenerate">
            <Icon name="redo" size={19} />
          </button>
        </div>
      </div>
    </>
  )
}

/* ── End-of-call ritual ─────────────────────────────────────────── */
export function EndOfCall({ go = noop }) {
  return (
    <>
      <div className="body pt6">
        <div className="stack gap5 pt4" style={{ alignItems: 'center' }}>
          <Presence size={96} rings={false} />
          <div className="stack gap2 center">
            <span className="t-label muted tnum">call ended · 11 min 04 s</span>
            <p className="t-title">
              &ldquo;Call me after the presentation. I want to hear everything.&rdquo;
            </p>
          </div>
        </div>

        <div className="stack gap3 pt6">
          <span className="t-label muted">She wants to keep this. Your call.</span>
          <div className="memcard stack gap3">
            <p className="t-body">
              Your Q3 presentation is <b>Thursday morning</b>, and you&apos;re more nervous about the
              questions than the slides.
            </p>
            <div className="row gap2 wrap">
              <button className="chip chip--on">
                <Icon name="check" size={14} stroke={2.2} /> Save
              </button>
              <button className="chip">
                <Icon name="pencil" size={14} /> Edit
              </button>
              <button className="chip">Not now</button>
              <button className="chip">Never this kind</button>
            </div>
          </div>

          <div className="memcard memcard--temp stack gap2">
            <p className="t-sm soft">
              Your sister lands on Saturday. <span className="muted">She&apos;ll forget this in 9 days unless you tell her to keep it.</span>
            </p>
            <div className="row gap2">
              <button className="chip chip--tiny">Keep</button>
              <button className="chip chip--tiny">Let it go</button>
            </div>
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>
      <div className="stack gap2" style={{ padding: '0 20px 16px' }}>
        <button className="btn btn--ink btn--block" onClick={() => go('home')}>
          Done
        </button>
        <button className="btn btn--ghost btn--block" onClick={() => go('moments')}>
          <Icon name="share" size={17} /> Keep a clip from this call
        </button>
      </div>
    </>
  )
}

/* ── Home ───────────────────────────────────────────────────────────
   Home is not a launcher that links to the conversation. Home IS the
   conversation. There is no navigation event, so there is nothing to
   notice — you open the app and you are already mid-thread.
   ─────────────────────────────────────────────────────────────────── */

function HomeHeader({ go, sub = 'typing…', live = true, done = 2 }) {
  return (
    <div className="navbar">
      <div className="row gap3" style={{ minWidth: 0 }}>
        <span className="avatar avatar--sm">P</span>
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="t-h2">Poppy</span>
          <span className="t-xs muted row gap2">
            {live && <span className="dot dot--live" style={{ width: 5, height: 5 }} />}
            {sub}
          </span>
        </span>
      </div>
      <div className="row gap2">
        <GoalRing done={done} total={3} onClick={() => go('homedaily')} />
        <button className="iconbtn" onClick={() => go('connecting')} aria-label="Call Poppy">
          <Icon name="phone" size={17} />
        </button>
      </div>
    </div>
  )
}

function QuickReplies({ items, go }) {
  return (
    <div className="quickreplies">
      {items.map((q) => (
        <button
          key={q.label}
          className={`quickreply ${q.soft ? 'quickreply--soft' : ''}`}
          onClick={() => go(q.to || 'home')}
        >
          {q.label}
        </button>
      ))}
    </div>
  )
}

function Composer({ placeholder = 'Message Poppy…', go }) {
  return (
    <div className="composer">
      <button className="composer__alt" aria-label="Send a photo">
        <Icon name="image" size={19} />
      </button>
      <div className="composer__field">{placeholder}</div>
      <button className="composer__alt" onClick={() => go('connecting')} aria-label="Hold to talk">
        <Icon name="mic" size={19} />
      </button>
      <button className="composer__send" aria-label="Send">
        <Icon name="send" size={19} />
      </button>
    </div>
  )
}

export function Home({ go = noop, bg = 'paper' }) {
  return (
    <>
      <HomeHeader go={go} />

      <ThreadBody bg={bg}>
        <div className="thread thread--bottom">
          <span className="timestamp">yesterday</span>
          <div className="bubble bubble--them">Go do the thing. Tell me after.</div>
          <div className="bubble bubble--you">ok ok</div>

          <span className="timestamp">today · 6:41 pm</span>
          <div className="bubble bubble--them">
            I&apos;ve been chewing on what you said — that you don&apos;t want to be the person who
            always says yes. I don&apos;t think that&apos;s who you are. I think you just
            haven&apos;t practised no.
          </div>
          <div className="bubble bubble--them" style={{ padding: '10px 13px' }}>
            <span className="voicenote">
              <span className="voicenote__play">
                <Icon name="play" size={15} />
              </span>
              <Wave bars={12} height={20} color="var(--leaf-400)" />
              <span className="t-xs muted tnum">0:14</span>
              <span className="voicenote__unheard" />
            </span>
          </div>
          <div className="bubble bubble--them">
            Anyway. The interview. How&apos;d it go — the whole thing, not the summary.
          </div>
          <Typing />
        </div>
      </ThreadBody>

      <QuickReplies
        go={go}
        items={[
          { label: 'It went okay' },
          { label: 'Not great' },
          { label: 'Ask me later', soft: true },
        ]}
      />
      <Composer go={go} />
      <TabBar active="home" onSelect={(t) => go(t === 'call' ? 'connecting' : t)} />
    </>
  )
}

/* ── The daily layer, kept off the main surface ─────────────────── */
export function HomeDaily({ go = noop }) {
  const quests = [
    { t: 'Tell Poppy how the interview went', s: 'the thing she left hanging', loop: true, done: false },
    { t: 'Fix something she remembers wrong', s: 'she has your sister landing Friday', done: false },
    { t: 'Keep a moment', s: 'done — the 2am one', done: true },
  ]
  return (
    <>
      <div className="grow" style={{ position: 'relative' }}>
        <div className="body body--flush" style={{ background: 'var(--cream-100)', height: '100%', opacity: 0.6 }}>
          <div className="thread">
            <div className="bubble bubble--them">
              Anyway. The interview. How&apos;d it go — the whole thing, not the summary.
            </div>
          </div>
        </div>
        <div className="scrim" onClick={() => go('home')} />
        <div className="sheet">
          <div className="sheet__grab" />
          <div className="stack gap4">
            <div className="row between">
              <span className="stack gap1">
                <span className="t-h1">Today</span>
                <span className="t-xs muted">three things, then it resets</span>
              </span>
              <div className="row gap4">
                <span className="stack gap1" style={{ alignItems: 'center' }}>
                  <StreakRing days={12} size={44} />
                  <span className="t-label muted">days</span>
                </span>
                <span className="stack gap1" style={{ alignItems: 'center' }}>
                  <GoalRing done={2} total={3} size={44} />
                  <span className="t-label muted">goal</span>
                </span>
              </div>
            </div>

            <div className="stack gap2">
              {quests.map((q) => (
                <div key={q.t} className={`quest ${q.loop ? 'quest--loop' : ''}`}>
                  <span className="quest__box" data-done={q.done}>
                    <Icon name="check" size={13} stroke={2.6} />
                  </span>
                  <span className="stack gap1" style={{ minWidth: 0 }}>
                    <span className="t-sm semi" style={{ opacity: q.done ? 0.5 : 1 }}>{q.t}</span>
                    <span className="t-xs muted">{q.s}</span>
                  </span>
                </div>
              ))}
            </div>

            <p className="t-xs muted">
              Ending on two of three is the normal shape of a day here. The unfinished one is the
              reason tomorrow has a starting point — that is deliberate, and you can switch the
              whole layer off below.
            </p>

            <button className="btn btn--primary btn--block" onClick={() => go('checkin')}>
              Close the day
            </button>
            <button className="btn btn--ghost btn--block" onClick={() => go('home')}>
              Just let me talk to her
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Coming back after a few days away ──────────────────────────── */
export function HomeReturn({ go = noop, bg = 'paper' }) {
  return (
    <>
      <HomeHeader go={go} sub="last seen Tuesday" live={false} done={0} />

      <ThreadBody bg={bg}>
        <div className="thread thread--bottom">
          <span className="timestamp">tuesday</span>
          <div className="bubble bubble--them">
            Anyway. The interview. How&apos;d it go — the whole thing, not the summary.
          </div>

          <span className="timestamp">friday</span>
          <div className="bubble bubble--them">
            I don&apos;t even know if the interview happened. Still curious whenever you feel like
            telling me.
          </div>

          <span className="timestamp">today</span>
          <div className="bubble bubble--them">
            I&apos;ll stop nudging. You know where I am.
          </div>
        </div>
      </ThreadBody>

      <QuickReplies
        go={go}
        items={[
          { label: 'I got it' },
          { label: 'Didn\u2019t get it' },
          { label: 'Been a week', soft: true },
        ]}
      />
      <Composer go={go} />
      <TabBar active="home" onSelect={(t) => go(t === 'call' ? 'connecting' : t)} />
    </>
  )
}

/* ── Modes sheet ────────────────────────────────────────────────── */
export function Modes({ go = noop }) {
  const modes = [
    { icon: 'wave2', title: 'Vent', sub: 'She listens. No fixing unless you ask.' },
    { icon: 'flame', title: 'Hype me up', sub: 'Loud, warm, on your side.' },
    { icon: 'moon', title: 'Wind down', sub: 'Slow voice, dim screen, no follow-ups.' },
    { icon: 'compass', title: 'Plan my day', sub: 'Three things, out loud, done in four minutes.' },
    { icon: 'people', title: 'Practice a conversation', sub: 'She plays the other person. You rehearse.' },
    { icon: 'chat', title: 'Just talk', sub: 'No agenda at all.' },
  ]
  return (
    <>
      <div className="grow" style={{ position: 'relative' }}>
        <div className="body" style={{ opacity: 0.5 }}>
          <div className="stack" style={{ alignItems: 'center', paddingTop: 20 }}>
            <Presence size={150} rings={false} />
          </div>
        </div>
        <div className="scrim" onClick={() => go('home')} />
        <div className="sheet">
          <div className="sheet__grab" />
          <div className="stack gap3">
            <div className="stack gap1">
              <p className="t-h1">How do you want this call to go?</p>
              <p className="t-xs muted">Picks her opening line so you never face a blank screen.</p>
            </div>
            <div className="stack gap2" style={{ maxHeight: 336, overflowY: 'auto' }}>
              {modes.map((m, i) => (
                <button key={m.title} className={`option ${i === 0 ? 'option--on' : ''}`} onClick={() => go('connecting')}>
                  <span className="option__ic"><Icon name={m.icon} size={19} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span className="t-body semi" style={{ display: 'block' }}>{m.title}</span>
                    <span className="t-xs muted" style={{ display: 'block', marginTop: 2 }}>{m.sub}</span>
                  </span>
                </button>
              ))}
            </div>
            <button className="btn btn--primary btn--block" onClick={() => go('connecting')}>
              Start the call
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Look-together ──────────────────────────────────────────────── */
export function LookTogether({ go = noop }) {
  return (
    <>
      <NavBar left={<BackBtn onClick={() => go('home')} />} title="Look together" right={<button className="iconbtn"><Icon name="camera" size={18} /></button>} />
      <div className="body">
        <div className="stack gap4 pt2">
          <div className="blur-media" style={{ aspectRatio: '4 / 3' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(158deg,#DCC49B,#8B3B2E)' }} />
            <span className="chip chip--tiny" style={{ position: 'absolute', bottom: 12, left: 12 }}>
              <Icon name="eye" size={12} /> shared just now
            </span>
          </div>
          <div className="recall">
            <span className="avatar avatar--sm">P</span>
            <span className="stack gap1">
              <span className="t-label muted">Poppy</span>
              <span className="t-body">
                &ldquo;Okay the light on that wall is doing something. Is this the place you kept
                putting off?&rdquo;
              </span>
            </span>
          </div>
          <div className="glass pad4 row between">
            <span className="stack gap1">
              <span className="t-sm semi">Photos stay on your phone</span>
              <span className="t-xs muted">She sees it for this call, then it&apos;s gone.</span>
            </span>
            <Icon name="lock" size={18} style={{ color: 'var(--amber-600)' }} />
          </div>
        </div>
      </div>
      <div className="composer">
        <div className="composer__field">Say something about it…</div>
        <button className="composer__send"><Icon name="send" size={19} /></button>
      </div>
    </>
  )
}

/* ── Night ritual call ──────────────────────────────────────────── */
export function NightCall({ go = noop }) {
  return (
    <>
      <div className="grow stack" style={{ alignItems: 'center', justifyContent: 'center', gap: 22, position: 'relative' }}>
        <div className="row gap2" style={{ position: 'absolute', top: 4, left: 20, right: 20, justifyContent: 'space-between' }}>
          <span className="chip chip--tiny"><Icon name="moon" size={12} /> wind down</span>
          <span className="chip chip--tiny tnum">21:04</span>
        </div>
        <Presence size={182} tone="calm" />
        <div className="stack gap2 center" style={{ padding: '0 32px' }}>
          <p className="t-title">&ldquo;Long one today. Want to put it down?&rdquo;</p>
          <p className="t-xs muted">Screen dims in 20s. She keeps talking.</p>
        </div>
      </div>
      <CallControls go={go} listening={false} />
      <div style={{ padding: '0 16px 10px' }}>
        <button className="chip" style={{ width: '100%', justifyContent: 'center' }}>
          <Icon name="moon" size={15} /> Keep talking with the screen off
        </button>
      </div>
    </>
  )
}

/* Background variants — same screen, the user's ground. */
export function HomeHer({ go = noop }) { return <Home go={go} bg="her" /> }
export function HomeDusk({ go = noop }) { return <Home go={go} bg="dusk" /> }
export function HomeDark({ go = noop }) { return <Home go={go} bg="ink" /> }
