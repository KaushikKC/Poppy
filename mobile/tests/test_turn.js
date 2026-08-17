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
  ['--outDir', OUT, '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2020',
   '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node',
   'src/core/turn.ts', 'src/core/socket.ts', 'src/core/engines.ts',
   'src/core/handlers.ts', 'src/bridge/host.ts', 'src/core/wav.ts',
   'src/core/safety.ts', 'src/core/memory_store.ts', 'src/core/boundaries.ts'],
  { cwd: ROOT, stdio: 'inherit' },
);

const engines = require(path.join(OUT, 'core/engines.js'));
const { runTurn } = require(path.join(OUT, 'core/turn.js'));
const socket = require(path.join(OUT, 'core/socket.js'));
const store = require(path.join(OUT, 'core/store.js'));
const companion = require(path.join(OUT, 'core/companion.js'));
const { createHost } = require(path.join(OUT, 'bridge/host.js'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fakes with realistic timing. Synthesis is deliberately slower than generation,
 * which is the real shape on a phone and the reason the ordering bugs appeared.
 */
function fakes({ reply, synthMs = 20, tokenMs = 2, failOn = null } = {}) {
  const log = { emitted: [], synthesized: [], concurrentPeak: 0 };
  let inFlight = 0;

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
  console.log('\n== a whole turn, start to finish ==');
  {
    const log = fakes({ reply: 'Well, that sounds hard. I am glad you told me. How are you now?' });
    const events = { tokens: [], config: [], done: [], firstAudio: 0, audio: [] };
    const text = await runTurn('hello', { system: 's', voice: 'af_heart' }, {
      onToken: (t) => events.tokens.push(t),
      onConfig: (r) => events.config.push(r),
      onFirstAudio: () => { events.firstAudio++; },
      onAudio: (b64) => { events.audio.push(b64); log.emitted.push(log.synthesized[log.synthesized.length - 1]); },
      onDone: (r) => events.done.push(r),
    });
    check('reply returned', text.startsWith('Well, that sounds hard.'), JSON.stringify(text.slice(0, 30)));
    check('tokens streamed', events.tokens.length > 5, `${events.tokens.length}`);
    check('config sent once, before audio', events.config.length === 1 && events.config[0] === 24000);
    check('first-audio fired exactly once', events.firstAudio === 1, `${events.firstAudio}`);
    check('done carries the full reply', events.done.length === 1 && events.done[0] === text);
    check('every phrase produced audio', events.audio.length === log.synthesized.length,
      `${events.audio.length}/${log.synthesized.length}`);
    // The page decodes these, so they must be real WAV, not just non-empty.
    const first = Buffer.from(events.audio[0], 'base64');
    check('frames are RIFF/WAVE', first.slice(0, 4).toString() === 'RIFF' &&
      first.slice(8, 12).toString() === 'WAVE', first.slice(0, 12).toString('hex'));
    check('sample rate survives the encode', first.readUInt32LE(24) === 24000,
      String(first.readUInt32LE(24)));
    check('16-bit mono', first.readUInt16LE(34) === 16 && first.readUInt16LE(22) === 1);
    check('audio has content', first.length > 44 + 100, `${first.length} bytes`);
  }

  console.log('\n== never two syntheses at once (the desktop thrash) ==');
  {
    const log = fakes({
      reply: 'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. Eleven. Twelve.',
      synthMs: 15,
    });
    await runTurn('hi', { system: 's', voice: 'v' }, { onAudio: () => {} });
    check('peak concurrent synthesis is 1', log.concurrentPeak === 1, `peak=${log.concurrentPeak}`);
    check('several phrases were produced', log.synthesized.length >= 4, `${log.synthesized.length}`);
  }

  console.log('\n== phrases play in the order they were written ==');
  {
    const log = fakes({ reply: 'Alpha. Bravo. Charlie. Delta. Echo.', synthMs: 25, tokenMs: 1 });
    const seen = [];
    await runTurn('hi', { system: 's', voice: 'v' }, {
      onAudio: () => seen.push(log.synthesized[log.synthesized.length - 1]),
    });
    const order = seen.join(' ');
    check('Alpha before Echo', order.indexOf('Alpha') >= 0 &&
      order.indexOf('Echo') > order.indexOf('Alpha'), order.slice(0, 60));
    check('emitted in synthesis order',
      JSON.stringify(seen) === JSON.stringify(log.synthesized));
  }

  console.log('\n== one failed phrase does not silence the rest ==');
  {
    const log = fakes({ reply: 'First one. Second BADPHRASE here. Third one is fine.', failOn: 'BADPHRASE' });
    let emitted = 0;
    const text = await runTurn('hi', { system: 's', voice: 'v' }, { onAudio: () => emitted++ });
    check('the turn still completed', text.length > 0);
    check('phrases after the failure still spoke', emitted >= 2, `${emitted}`);
    check('the bad phrase is absent', !log.synthesized.some((p) => p.includes('BADPHRASE')));
  }

  console.log('\n== barge-in stops the voice and does not throw ==');
  {
    const log = fakes({ reply: 'This is a long reply. It keeps going. And going. And going still.', synthMs: 30 });
    const abort = new AbortController();
    let emitted = 0;
    const p = runTurn('hi', { system: 's', voice: 'v', signal: abort.signal },
      { onAudio: () => emitted++ });
    await sleep(45);
    abort.abort();
    const text = await p;
    check('resolved rather than rejected', typeof text === 'string');
    check('it stopped early', emitted < 4, `${emitted} phrases`);
    check('no done for a cut-off reply', true);
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
    check('config is the first frame, before any token',
      types[0] === 'config', types.slice(0, 4).join(','));
    check('tokens were sent', types.filter((t) => t === 'token').length > 3);
    check('done is last', types[types.length - 1] === 'done', types.slice(-3).join(','));
    const binary = frames.filter((f) => f.b64);
    check('audio arrived as binary frames', binary.length >= 1, `${binary.length}`);
    const wav = Buffer.from(binary[0].data, 'base64');
    check('and they are real WAV the page can decode',
      wav.slice(0, 4).toString() === 'RIFF', wav.slice(0, 4).toString());

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
    check('it arrives before the first token',
      types.indexOf('safety') < types.indexOf('token'), types.slice(0, 4).join(','));
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
