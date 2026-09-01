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
   'src/core/playback.ts', 'src/core/clips.ts'],
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
  console.log('\n== spoken to: one recording, no tokens ==');
  {
    const log = fakes({ reply: 'Well, that sounds hard. I am glad you told me. How are you now?' });
    const events = { tokens: [], config: [], done: [], firstAudio: 0, audio: [], voice: [] };
    const text = await runTurn('hello', { system: 's', voice: 'af_heart', spoken: true }, {
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

  console.log('\n== typed to: tokens, and never a sound ==');
  {
    const log = fakes({ reply: 'Well, that sounds hard. I am glad you told me. How are you now?' });
    const events = { tokens: [], done: [], voice: [], firstAudio: 0 };
    const text = await runTurn('hello', { system: 's', voice: 'af_heart', spoken: false }, {
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

  console.log('\n== spoken to, but the answer is too slight to be worth hearing ==');
  {
    // Short enough that a recording would cost about four seconds for something
    // readable at a glance — so it arrives as text even though it was spoken to.
    const log = fakes({ reply: "I'm good, thanks. You?" });
    const events = { tokens: [], voice: [], firstAudio: 0 };
    const text = await runTurn('hi', { system: 's', voice: 'v', spoken: true }, {
      onToken: (t) => events.tokens.push(t),
      onVoice: (ms) => events.voice.push(ms),
      onFirstAudio: () => { events.firstAudio++; },
    });
    await sleep(120);
    check('nothing was synthesised', log.synthesized.length === 0, `${log.synthesized.length}`);
    check('no recording was announced', events.voice.length === 0);
    check('the words arrived whole, in one go', events.tokens.length === 1, `${events.tokens.length}`);
    check('and they are the reply', events.tokens[0] === text, JSON.stringify(events.tokens[0]));
  }

  console.log('\n== a reasoning trace never reaches the page or the speaker ==');
  {
    // Qwen3, the fine-tune base, has a thinking mode. Generation asks for it to be
    // off, and a 0.6B can emit the tag anyway. Unhandled, the trace is displayed and
    // then read out loud in her voice as though she had said it.
    const log = fakes({
      reply: '<think>The user greeted me. I should be warm and ask about their day.</think>'
        + 'Hey you. It has been a long day here, how was yours? Tell me the whole thing.',
    });
    const events = { tokens: [] };
    const text = await runTurn('hi', { system: 's', voice: 'v', spoken: true }, {
      onToken: (t) => events.tokens.push(t),
    });
    await sleep(120);
    check('the trace is gone from the reply', !/<think>|should be warm/i.test(text), JSON.stringify(text.slice(0, 40)));
    check('the reply itself survived', text.startsWith('Hey you.'), JSON.stringify(text.slice(0, 20)));
    check('nothing spoken mentions it', !log.synthesized.join(' ').includes('user greeted'));
  }

  console.log('\n== a greeting is answered like a greeting ==');
  {
    const { isGreeting } = require(path.join(OUT, 'core/reply_shape.js'));
    for (const g of ['Hi', 'hey', 'Hello!', 'how are you', "what's up", 'Good morning']) {
      check(`"${g}" is a greeting`, isGreeting(g));
    }
    // Anything carrying content is not, and must keep the full budget.
    for (const n of ['Hi, I had a rough day', 'how are you supposed to fix a tap',
                     'hey can you help me plan tomorrow', 'I am bored']) {
      check(`"${n.slice(0, 26)}…" is not`, !isGreeting(n));
    }
  }

  console.log('\n== she calls the user by the user\'s name ==');
  {
    const { fixVocative } = require(path.join(OUT, 'core/turn.js'));
    // The real failure, measured in 6 of 8 samples: told "my school friend is called
    // Sam", the model opens its reply addressing the user as Sam.
    check('opening vocative corrected', fixVocative('Sam, you know that story, right?', 'Kaushik') === 'Kaushik, you know that story, right?',
      fixVocative('Sam, you know that story, right?', 'Kaushik'));
    check('trailing vocative corrected', fixVocative('How is your day going, Sam?', 'Kaushik') === 'How is your day going, Kaushik?',
      fixVocative('How is your day going, Sam?', 'Kaushik'));
    check('the right name is left alone', fixVocative('Kaushik, that sounds good.', 'Kaushik') === 'Kaushik, that sounds good.');
    // Mentioning someone is not addressing them, and must survive untouched.
    check('a mention is not an address', fixVocative('Sam sounds like good company.', 'Kaushik') === 'Sam sounds like good company.',
      fixVocative('Sam sounds like good company.', 'Kaushik'));
    check('mid-sentence names survive', fixVocative('I hope Sam enjoys the film.', 'Kaushik') === 'I hope Sam enjoys the film.');
    check('no user name means no change', fixVocative('Sam, hello.', '') === 'Sam, hello.');
  }

  console.log('\n== a typed reply never streams the reasoning tags ==');
  {
    // The bug that shipped: withoutReasoning() runs on the finished reply, and a typed
    // turn had already streamed every raw token to the screen. Voice notes were clean;
    // typed replies opened with "<think></think>".
    const log = fakes({ reply: '<think>\n\n</think>\n\nHey Kaushik, how is life treating you?' });
    const events = { tokens: [] };
    const text = await runTurn('Hi', { system: 's', voice: 'v', spoken: false }, {
      onToken: (t) => events.tokens.push(t),
    });
    await sleep(80);
    const shown = events.tokens.join('');
    check('nothing shown contains a think tag', !/<\/?think>/i.test(shown), JSON.stringify(shown.slice(0, 50)));
    check('the reply still arrived', /Hey Kaushik/.test(shown), JSON.stringify(shown.slice(0, 40)));
    check('and it does not open with blank lines', !/^\s/.test(shown), JSON.stringify(shown.slice(0, 12)));
    check('the returned text is clean too', !/<\/?think>/i.test(text));
  }

  console.log('\n== an unclosed trace takes everything after it ==');
  {
    // The tag opened and the reply ran out before it closed, which is what a truncated
    // generation looks like. Keeping the tail would put raw reasoning on screen.
    const log = fakes({ reply: 'Here is the thing I wanted to tell you about today. <think>Now I should' });
    const text = await runTurn('hi', { system: 's', voice: 'v', spoken: false }, {});
    await sleep(60);
    check('the tail is dropped', !text.includes('<think>') && !text.includes('Now I should'), JSON.stringify(text));
    check('what came before it is kept', text.startsWith('Here is the thing'), JSON.stringify(text.slice(0, 20)));
  }

  console.log('\n== a failed recording does not fail the turn ==');
  {
    // Long enough to be spoken, so the failure is in synthesis rather than in the
    // reply simply being too slight to bother speaking.
    const log = fakes({
      reply: 'This reply contains BADPHRASE and is quite deliberately long enough that it '
        + 'would otherwise be worth speaking out loud.',
      failOn: 'BADPHRASE',
    });
    const errors = [];
    const text = await runTurn('hi', { system: 's', voice: 'v', spoken: true }, {
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
    const p = runTurn('hi', { system: 's', voice: 'v', spoken: true, signal: abort.signal }, {});
    await sleep(30);
    abort.abort();
    const text = await p;
    check('resolved rather than rejected', typeof text === 'string');
    check('nothing reached the speaker', log.spoken.length === 0, `${log.spoken.length} spoken`);
  }

  console.log('\n== the socket speaks what chat.js expects ==');
  {
    // Substantial, and not opening as a pleasantry, so this exercises the spoken
    // path rather than the too-slight-to-speak shortcut.
    fakes({ reply: 'That sounds like it took something out of you, and I am glad you said it out loud.' });
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
    // Recording is announced when synthesis begins, not when the turn does: during
    // generation nobody knows yet whether this reply will be spoken at all.
    check('recording is announced before the audio',
      types.indexOf('recording') > -1 && types.indexOf('recording') < types.indexOf('voice'),
      types.join(','));
    check('config comes first, so the player is ready', types[0] === 'config', types.join(','));
    check('one recording frame, carrying a duration',
      sent.filter((m) => m.type === 'voice').length === 1
      && sent.find((m) => m.type === 'voice').durationMs > 0);

    // The frame has to name a recording that exists by the time it is sent, or the
    // bubble is handed nothing and her voice note can be heard exactly once. It is a
    // pure ordering property — push() keeps the copy, the frame quotes its id — and
    // it was wrong in exactly the direction that leaves no trace: an undefined id on
    // the first turn, and the *previous* reply's id on every turn after it.
    const voice = sent.find((m) => m.type === 'voice');
    const clips = require(path.join(OUT, 'core/clips.js'));
    check('the recording frame names a clip', !!voice.clipId, String(voice.clipId));
    check('and that clip is already kept', !!clips.get(voice.clipId), 'nothing to replay');
    check('whose length matches the frame',
      Math.abs((clips.get(voice.clipId)?.durationMs ?? 0) - voice.durationMs) < 1,
      `${clips.get(voice.clipId)?.durationMs} vs ${voice.durationMs}`);
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
    // Before any of the reply, whatever shape the reply turns out to take — the
    // helplines must never queue behind a recording that takes seconds to render.
    const replyFrames = types.filter((t) => ['token', 'recording', 'voice'].includes(t));
    check('it arrives before any part of the reply',
      types.indexOf('safety') < types.indexOf(replyFrames[0]), types.slice(0, 4).join(','));
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
