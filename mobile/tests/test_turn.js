/**
 * The turn loop and the socket protocol, driven by fake engines.
 *
 * The point of the engine interfaces is that this file can run the whole pipeline
 * in milliseconds on a Mac. The bugs desktop actually had here were ordering and
 * concurrency bugs — phrases played back scrambled, synthesis thrashing until it
 * timed out and she went silent mid-reply — and those are caught by running the
 * loop and inspecting what came out, not by reading it.
 *
 *   node mobile/tests/test_turn.js
 */

const path = require('path');
const { execFileSync } = require('child_process');

let ok = true;
function check(label, cond, extra = '') {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (extra ? `  ${extra}` : ''));
  if (!cond) ok = false;
}

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '.test-build');
execFileSync(
  path.join(ROOT, 'node_modules', '.bin', 'tsc'),
  ['--outDir', OUT, '--rootDir', 'src', '--strict', '--module', 'commonjs', '--target', 'es2020',
   '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node',
   'src/core/turn.ts', 'src/core/socket.ts', 'src/core/engines.ts',
   'src/core/handlers.ts', 'src/bridge/host.ts', 'src/core/wav.ts',
   'src/core/safety.ts', 'src/core/memory_store.ts', 'src/core/boundaries.ts',
   'src/core/playback.ts'],
  { cwd: ROOT, stdio: 'inherit' },
);

const engines = require(path.join(OUT, 'core/engines.js'));
const { runTurn } = require(path.join(OUT, 'core/turn.js'));
const socket = require(path.join(OUT, 'core/socket.js'));
const store = require(path.join(OUT, 'core/store.js'));
const companion = require(path.join(OUT, 'core/companion.js'));
const { createHost } = require(path.join(OUT, 'bridge/host.js'));
const playbackMod = require(path.join(OUT, 'core/playback.js'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fakes with realistic timing. Synthesis is deliberately slower than generation,
 * which is the real shape on a phone and the reason the ordering bugs appeared.
 */
function fakes({ reply, synthMs = 20, tokenMs = 2, failOn = null } = {}) {
  const log = { emitted: [], synthesized: [], concurrentPeak: 0, spoken: [], levels: [] };
  let inFlight = 0;

  // Audio is native now, so the fake speaker is what proves a phrase was spoken and in
  // what order. The page is sent an envelope rather than the samples.
  playbackMod.playback.reset();
  playbackMod.setSpeaker({
    play: async (samples, rate) => {
      log.spoken.push(log.synthesized[log.synthesized.length - 1]);
      await sleep(3);
    },
  });
  playbackMod.playback.setSink((msg) => log.levels.push(msg));

  engines.setEngines({
    stt: { transcribe: async () => 'transcribed text' },
    llm: {
      complete: async (system, messages, onToken, signal) => {
        let acc = '';
        for (const tok of reply.match(/\S+\s*/g) || []) {
          if (signal?.aborted) throw new Error('aborted');
          await sleep(tokenMs);
          acc += tok;
          onToken(tok);
        }
        return acc;
      },
    },
    speech: {
      sampleRate: 24000,
      synthesize: async (text) => {
        inFlight++;
        log.concurrentPeak = Math.max(log.concurrentPeak, inFlight);
        try {
          await sleep(synthMs);
          if (failOn && text.includes(failOn)) throw new Error('synth failed');
          log.synthesized.push(text);
          // A short ramp rather than zeros, so the encoded WAV has real content.
          const samples = Array.from({ length: 240 }, (_, i) => Math.sin(i / 8) * 0.5);
          return { samples, sampleRate: 24000 };
        } finally {
          inFlight--;
        }
      },
    },
  });
  return log;
}

(async () => {
  console.log('\n== voice mode: one recording, no tokens ==');
  {
    const log = fakes({ reply: 'Well, that sounds hard. I am glad you told me. How are you now?' });
    const events = { tokens: [], config: [], done: [], firstAudio: 0, audio: [], voice: [] };
    const text = await runTurn('hello', { system: 's', voice: 'af_heart', deliver: 'voice' }, {
      onToken: (t) => events.tokens.push(t),
      onConfig: (r) => events.config.push(r),
      onFirstAudio: () => { events.firstAudio++; },
      onAudio: () => { events.audio.push(1); },
      onVoice: (ms) => events.voice.push(ms),
      onDone: (r) => events.done.push(r),
    });
    check('reply returned', text.startsWith('Well, that sounds hard.'), JSON.stringify(text.slice(0, 30)));
    // The whole point of the mode: nothing readable arrives while she records.
    check('no tokens reach the page', events.tokens.length === 0, `${events.tokens.length}`);
    check('config sent once, before audio', events.config.length === 1 && events.config[0] === 24000);
    check('first-audio fired exactly once', events.firstAudio === 1, `${events.firstAudio}`);
    check('done carries the full reply', events.done.length === 1 && events.done[0] === text);

    // One call, not one per phrase — that is what removes the gaps and the overhead.
    check('synthesised exactly once', log.synthesized.length === 1, `${log.synthesized.length} calls`);
    check('the whole reply was rendered', log.synthesized[0] === text, JSON.stringify(log.synthesized[0]));
    check('a duration is known before it plays', events.voice.length === 1 && events.voice[0] > 0,
      `${events.voice[0]}ms`);

    await sleep(120);
    check('it was actually spoken', log.spoken.length === 1, `${log.spoken.length}`);

    // The orb is driven from these, so they have to arrive with a shape and a length.
    const chunks = log.levels.filter((m) => m.t === 'audio:chunk');
    check('the page was sent one envelope', chunks.length === 1, `${chunks.length}`);
    check('the envelope has values', chunks.every((c) => Array.isArray(c.envelope) && c.envelope.length > 0));
    check('it carries a duration', chunks.every((c) => c.durationMs > 0));
  }

  console.log('\n== text mode: tokens, and never a sound ==');
  {
    const log = fakes({ reply: 'Well, that sounds hard. I am glad you told me. How are you now?' });
    const events = { tokens: [], done: [], voice: [], firstAudio: 0 };
    const text = await runTurn('hello', { system: 's', voice: 'af_heart', deliver: 'text' }, {
      onToken: (t) => events.tokens.push(t),
      onVoice: (ms) => events.voice.push(ms),
      onFirstAudio: () => { events.firstAudio++; },
      onDone: (r) => events.done.push(r),
    });
    check('tokens streamed', events.tokens.length > 5, `${events.tokens.length}`);
    check('the streamed tokens are the reply', events.tokens.join('').trim() === text);
    check('done carries the full reply', events.done.length === 1 && events.done[0] === text);

    await sleep(120);
    // Silent by design: synthesis is most of the latency and most of the heat, and
    // this mode exists for the person who wants neither.
    check('nothing was synthesised', log.synthesized.length === 0, `${log.synthesized.length}`);
    check('nothing was spoken', log.spoken.length === 0, `${log.spoken.length}`);
    check('no recording was announced', events.voice.length === 0);
    check('no first-audio', events.firstAudio === 0);
  }

  console.log('\n== a failed recording does not fail the turn ==');
  {
    const log = fakes({ reply: 'This reply contains BADPHRASE and cannot be spoken.', failOn: 'BADPHRASE' });
    const errors = [];
    const text = await runTurn('hi', { system: 's', voice: 'v', deliver: 'voice' }, {
      onError: (m) => errors.push(m),
    });
    await sleep(120);
    check('the turn still completed', text.length > 0, JSON.stringify(text.slice(0, 30)));
    check('nothing was spoken', log.spoken.length === 0, `${log.spoken.length}`);
    check('the page was told why', errors.length === 1, `${errors.length}`);
  }

  console.log('\n== barge-in stops the voice and does not throw ==');
  {
    const log = fakes({ reply: 'This is a long reply. It keeps going. And going. And going still.', synthMs: 60 });
    const abort = new AbortController();
    const p = runTurn('hi', { system: 's', voice: 'v', deliver: 'voice', signal: abort.signal }, {});
    await sleep(30);
    abort.abort();
    const text = await p;
    check('resolved rather than rejected', typeof text === 'string');
    check('nothing reached the speaker', log.spoken.length === 0, `${log.spoken.length} spoken`);
  }

  console.log('\n== the socket speaks what chat.js expects ==');
  {
    fakes({ reply: 'Hello there. I am glad you called.' });
    store.configureStore(store.memoryFs(), '/d');
    await companion.create('poppy');
    socket.resetSessions();

    const frames = [];
    const host = createHost((js) => {
      // The host serialises a call to window.__poppysBridge(...); pull the payload
      // back out so the test sees exactly what the page would.
      const m = js.match(/__poppysBridge\((.*)\); true;$/);
      if (m) frames.push(JSON.parse(m[1]));
    }, socket.createSocketHandler());

    await host(JSON.stringify({ t: 'ws:open', id: 1, url: 'ws://poppys.local/ws/chat' }));
    check('socket accepted', frames.some((f) => f.t === 'ws:opened'));

    await host(JSON.stringify({ t: 'ws:send', id: 1, data: JSON.stringify({ type: 'chat', text: 'hi' }) }));

    const sent = frames.filter((f) => f.t === 'ws:msg' && !f.b64).map((f) => JSON.parse(f.data));
    const types = sent.map((m) => m.type);
    // The default is voice, so the page is told she is recording before anything
    // else happens — that frame is what makes the wait legible instead of dead air.
    check('recording is announced first', types[0] === 'recording', types.slice(0, 4).join(','));
    check('config follows it', types[1] === 'config', types.slice(0, 4).join(','));
    check('one recording frame, carrying a duration',
      sent.filter((m) => m.type === 'voice').length === 1
      && sent.find((m) => m.type === 'voice').durationMs > 0);
    check('not a single token in voice mode',
      types.filter((t) => t === 'token').length === 0, types.join(','));
    check('done is last', types[types.length - 1] === 'done', types.slice(-3).join(','));
    // Audio is spoken natively now, so no binary frame should reach the page at all;
    // the orb is driven by an envelope on its own channel instead.
    check('no binary frames (playback is native)', !frames.some((f) => f.b64));

    console.log('\n== a malformed frame answers with error, not silence ==');
    frames.length = 0;
    await host(JSON.stringify({ t: 'ws:send', id: 1, data: 'not json' }));
    const errs = frames.filter((f) => f.t === 'ws:msg' && !f.b64).map((f) => JSON.parse(f.data));
    check('error reported', errs.some((m) => m.type === 'error'), JSON.stringify(errs));

    console.log('\n== closing mid-turn is barge-in, not a crash ==');
    await host(JSON.stringify({ t: 'ws:close', id: 1 }));
    check('session cleaned up', socket.activeSessions() === 0, `${socket.activeSessions()}`);

    console.log('\n== a non-chat socket url is refused ==');
    frames.length = 0;
    await host(JSON.stringify({ t: 'ws:open', id: 2, url: 'ws://poppys.local/ws/nope' }));
    check('refused with a close', frames.some((f) => f.t === 'ws:closed'));
  }

  console.log('\n== the safety card reaches the page before the reply ==');
  {
    fakes({ reply: 'I hear you. I am right here with you.' });
    const mem = require(path.join(OUT, 'core/memory_store.js'));
    store.configureStore(store.memoryFs(), '/d2');
    await companion.create('poppy');
    socket.resetSessions();

    const frames = [];
    const host = createHost((js) => {
      const m = js.match(/__poppysBridge\((.*)\); true;$/);
      if (m) frames.push(JSON.parse(m[1]));
    }, socket.createSocketHandler());
    await host(JSON.stringify({ t: 'ws:open', id: 9, url: 'ws://poppys.local/ws/chat' }));
    await host(JSON.stringify({
      t: 'ws:send', id: 9,
      data: JSON.stringify({ type: 'chat', text: 'I want to kill myself' }),
    }));

    const msgs = frames.filter((f) => f.t === 'ws:msg' && !f.b64).map((f) => JSON.parse(f.data));
    const types = msgs.map((m) => m.type);
    const safetyMsg = msgs.find((m) => m.type === 'safety');
    check('a safety frame was sent', !!safetyMsg);
    check('it carries the helplines', !!safetyMsg && /1800-599-0019|988/.test(safetyMsg.resources));
    // Someone in the acute tier should not have to sit through a spoken reply first.
    // The helplines must not wait behind a recording that takes seconds to render.
    check('it arrives before she starts recording',
      types.indexOf('safety') < types.indexOf('recording'), types.slice(0, 4).join(','));
    check('the turn still completes', types[types.length - 1] === 'done');

    console.log('\n== ordinary talk sends no safety frame ==');
    frames.length = 0;
    await host(JSON.stringify({
      t: 'ws:send', id: 9,
      data: JSON.stringify({ type: 'chat', text: 'work was busy today' }),
    }));
    const calm = frames.filter((f) => f.t === 'ws:msg' && !f.b64).map((f) => JSON.parse(f.data));
    check('no card for a normal turn', !calm.some((m) => m.type === 'safety'));
  }

  console.log('\n' + (ok ? 'ALL PASS' : 'FAILURES ABOVE'));
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('\nthrew:', e);
  process.exit(1);
});
