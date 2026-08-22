/**
 * The recordings the page can ask to hear again.
 *
 * Small, but the two rules it enforces are both silent when broken: an id reused
 * across recordings lets an old bubble replay a newer message (the app appearing to
 * lie about what was said), and a slot that grows instead of replacing holds every
 * reply of a long conversation in memory as raw float samples.
 *
 *   node mobile/tests/test_clips.js
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
   'src/core/clips.ts', 'src/core/playback.ts'],
  { cwd: ROOT, stdio: 'inherit' },
);

const clips = require(path.join(OUT, 'core/clips.js'));

const secondOfSilence = new Float32Array(16000);

console.log('== a kept recording can be found and measured ==');
const a = clips.keep('mine', secondOfSilence, 16000);
check('id names its slot', a.id.startsWith('mine-'), a.id);
check('length comes from the samples', Math.round(a.durationMs) === 1000, `${a.durationMs}ms`);
check('and it can be fetched back', clips.get(a.id)?.id === a.id);

console.log('\n== a new recording replaces the old one in its slot ==');
const b = clips.keep('mine', new Float32Array(8000), 16000);
check('the new one is there', clips.get(b.id)?.durationMs === 500);
check('the old one is gone', clips.get(a.id) === null, 'or a long call holds every clip in RAM');
check('ids are never reused', a.id !== b.id, `${a.id} vs ${b.id}`);

console.log('\n== slots do not evict each other ==');
const reply = clips.keep('reply', new Float32Array(24000), 24000);
check('hers is kept', clips.get(reply.id)?.id === reply.id);
check('and theirs survives it', clips.get(b.id)?.id === b.id);

console.log('\n== resuming plays the tail, not the whole thing again ==');
const half = clips.from(clips.get(reply.id), 0.5);
check('half a clip is half the samples', half.length === 12000, String(half.length));
check('from the start is all of it', clips.from(clips.get(reply.id), 0).length === 24000);
// A fraction outside 0..1 comes from a tap at the very edge of the waveform, and must
// not produce a negative slice (which reads from the end and replays the last moment).
check('past the end is empty, not reversed', clips.from(clips.get(reply.id), 1.4).length === 0);
check('before the start is the whole clip', clips.from(clips.get(reply.id), -0.3).length === 24000);

(async () => {
  console.log('\n== playing one again, and pausing it ==');
  const { clipPlayer, setSpeaker } = require(path.join(OUT, 'core/playback.js'));

  // A speaker that records what it was handed and, like the real one, resolves its
  // play promise when it is stopped early — that is what source.stop() does.
  const heard = [];
  let finish = null;
  setSpeaker({
    play: (samples) => new Promise((resolve) => {
      heard.push(samples.length);
      finish = resolve;
    }),
    stop: () => finish && finish(),
  });

  const ended = [];
  clipPlayer.setSink((m) => ended.push(m.id));

  const clip = clips.keep('reply', new Float32Array(24000), 24000);
  const playing = clipPlayer.play(clip.id);
  await new Promise((r) => setTimeout(r, 5));
  check('the whole recording was handed over', heard[0] === 24000, String(heard[0]));
  finish();
  await playing;
  check('and its ending was reported', ended[0] === clip.id, ended.join(','));

  console.log('\n== resuming picks up where it stopped ==');
  const again = clipPlayer.play(clip.id, 0.25);
  await new Promise((r) => setTimeout(r, 5));
  check('only the tail is played', heard[1] === 18000, String(heard[1]));
  finish();
  await again;

  console.log('\n== a pause is not an ending ==');
  ended.length = 0;
  const third = clipPlayer.play(clip.id);
  await new Promise((r) => setTimeout(r, 5));
  clipPlayer.pause();
  await third;
  // The bubble reads this as "finished, go back to the start". Reporting it for a
  // pause would rewind a note the user meant to resume.
  check('nothing was reported as ended', ended.length === 0, ended.join(','));

  console.log(ok ? '\nALL PASS' : '\nFAILURES');
  process.exit(ok ? 0 : 1);
})();
