/**
 * Pausing and resuming a voice note.
 *
 * Reported from a phone: "when it starts playing, I can't pause the audio". The bubble
 * was a picture of a player during the live pass and only became a real one once the
 * reply had finished — so the pass you are actually listening to was the one with no
 * controls. That was deliberate on desktop, where the page plays the audio into the
 * analyser that drives the orb and a second player would fight it; on the phone the
 * audio is native and there is nothing to fight.
 *
 * What that leaves resting on arithmetic is "continue from where I paused", which is
 * what this pins: the offset held at the pause point, the resume asking to continue
 * from it rather than from zero, and the position advancing from there.
 *
 *   node tests/test_voice_note.js
 */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'frontend', 'voice_note.js'), 'utf8');
const body = src.slice(src.indexOf('function nativeHandle'), src.indexOf('function render('));
const posted = [];
global.window = { ReactNativeWebView: { postMessage: (s) => posted.push(JSON.parse(s)) } };
eval(body + '; globalThis.nativeHandle = nativeHandle;');

let ok = true;
const check = (label, cond, extra = '') => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (extra ? `  ${extra}` : ''));
  if (!cond) ok = false;
};

const h = nativeHandle('reply-1', 10000); // a ten-second note

// It adopts a playback that started natively, which is the live pass.
h.assumePlaying();
check('adopted playback reports playing', h.playing());
check('and starts from the beginning', h.position() < 0.05, `${h.position().toFixed(3)}`);

// Pause part-way, using a fake clock.
const realNow = Date.now;
let t = realNow();
Date.now = () => t;
h.assumePlaying();
t += 4000; // four seconds in
const at = h.position();
h.pause();
check('pause reports not playing', !h.playing());
check('position held at the pause point', Math.abs(h.position() - at) < 0.001, h.position().toFixed(2));
check('roughly four seconds in', Math.abs(h.position() - 0.4) < 0.02, h.position().toFixed(2));
check('a pause was sent natively', posted.some((m) => m.t === 'clip:pause'));

// Resume: it must ask to continue from there, not from zero.
posted.length = 0;
h.play();
const resume = posted.find((m) => m.t === 'clip:play');
check('resume asks to continue', !!resume && Math.abs(resume.fromFraction - 0.4) < 0.02,
  resume ? `${resume.fromFraction.toFixed(2)}` : 'none');
check('and it is playing again', h.playing());

// Position keeps advancing from the resume point, not from zero.
t += 2000;
check('position advances from the offset', Math.abs(h.position() - 0.6) < 0.03, h.position().toFixed(2));

// Ending puts it back to the start so the next tap replays.
h._finished();
check('ended resets to the start', h.position() === 0 && !h.playing());
Date.now = realNow;
console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
