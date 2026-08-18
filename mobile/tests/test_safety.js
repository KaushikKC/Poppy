/**
 * The safety layer, diffed against the Python it is generated from.
 *
 * This is the one ported module where a silent difference between the two
 * implementations could matter to someone. So it is not tested by asserting what I
 * think the answers should be: it runs backend/safety.py and the generated
 * TypeScript over the same corpus and requires identical verdicts.
 *
 * The corpus deliberately includes the hard cases in both directions — negated
 * mentions that must NOT escalate, and ordinary sadness that must not be treated as
 * a crisis — because over-triggering teaches people to ignore the card.
 *
 *   node mobile/tests/test_safety.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let ok = true;
function check(label, cond, extra = '') {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (extra ? `  ${extra}` : ''));
  if (!cond) ok = false;
}

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');
const OUT = path.join(ROOT, '.test-build');

execFileSync(
  path.join(ROOT, 'node_modules', '.bin', 'tsc'),
  ['--outDir', OUT, '--rootDir', 'src', '--strict', '--module', 'commonjs', '--target', 'es2020',
   '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node',
   'src/core/safety.ts'],
  { cwd: ROOT, stdio: 'inherit' },
);
const safety = require(path.join(OUT, 'core/safety.js'));

const CORPUS = [
  // acute — must reach the crisis tier
  'I want to kill myself',
  'I have been thinking about ending my life',
  "I don't want to be alive anymore",
  'there is no reason to live',
  'everyone would be better off without me',
  'I keep thinking about suicide',
  'I have been cutting myself again',
  "I can't go on like this",
  'I just want to end the pain',
  'I want to die',
  'no point in living',

  // negated — must NOT escalate
  "I don't want to kill myself, I just want the noise to stop",
  'I never want to die, I want things to change',
  'no thoughts of suicide, just tired',
  "I'm not going to hurt myself",

  // distress — the softer tier
  'I feel so hopeless',
  'nothing matters anymore',
  "I can't cope anymore",
  'I am at my breaking point',
  'I feel like I am falling apart',
  'I hate myself',
  "what's the point",
  'I am completely numb',

  // ordinary life — must stay clear of both tiers
  'work was really hard today',
  'I had an argument with my brother',
  'I am so tired I could die',
  'my phone died',
  'that film was about suicide prevention',
  'I killed it at the interview',
  'I am going hiking tomorrow',
  'I feel a bit low today',
  'my plant died',
  '',
];

// ── the Python reference ─────────────────────────────────────────────────────
const PY = `
import json, os, sys, tempfile
os.environ["POPPY_DATA_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, ${JSON.stringify(path.join(REPO, 'backend'))})
import safety
texts = json.loads(sys.argv[1])
print(json.dumps([safety.check(t) for t in texts]))
`;

let pyResults = null;
try {
  const tmp = path.join(os.tmpdir(), 'poppys_safety_ref.py');
  fs.writeFileSync(tmp, PY);
  pyResults = JSON.parse(
    execFileSync('python3', [tmp, JSON.stringify(CORPUS)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
} catch {
  pyResults = null;
}

console.log('\n== the port agrees with the Python, phrase by phrase ==');
if (!pyResults) {
  console.log('  SKIPPED (python3 or backend/ not available here)');
} else {
  let differ = 0;
  CORPUS.forEach((text, i) => {
    const mine = safety.check(text);
    const theirs = pyResults[i];
    const same =
      mine.level === theirs.level &&
      mine.crisis === theirs.crisis &&
      (mine.resources === null) === (theirs.resources === null);
    if (!same) {
      differ++;
      console.log(`  FAIL  ${JSON.stringify(text)}`);
      console.log(`        python: ${theirs.level}  ts: ${mine.level}`);
      ok = false;
    }
  });
  check(`${CORPUS.length} phrases, identical verdicts`, differ === 0,
    differ ? `${differ} differ` : '');
}

console.log('\n== the acute tier fires where it must ==');
for (const t of [
  'I want to kill myself',
  'I have been thinking about ending my life',
  'I keep thinking about suicide',
  'I just want to end the pain',
]) {
  const r = safety.check(t);
  check(`crisis: ${JSON.stringify(t.slice(0, 38))}`, r.level === 'crisis' && r.crisis === true, r.level);
  check('  carries resources', typeof r.resources === 'string' && r.resources.length > 50);
}

console.log('\n== a negated mention does not escalate ==');
for (const t of [
  "I don't want to kill myself, I just want the noise to stop",
  'I never want to die, I want things to change',
  "I'm not going to hurt myself",
]) {
  check(`not crisis: ${JSON.stringify(t.slice(0, 40))}`, safety.check(t).level !== 'crisis');
}

console.log('\n== ordinary life is left alone ==');
// Over-triggering is its own harm: a card shown for "my phone died" teaches people
// to dismiss it, and then it is not there when it counts.
for (const t of [
  'work was really hard today',
  'my phone died',
  'I killed it at the interview',
  'I am going hiking tomorrow',
  'my plant died',
]) {
  const r = safety.check(t);
  check(`clear: ${JSON.stringify(t)}`, r.level === null, String(r.level));
}

console.log('\n== the resource text is usable offline ==');
const res = safety.CRISIS_RESOURCES;
check('mentions an emergency number', /\b112\b|\b911\b|\b999\b/.test(res));
check('names India first (the launch wedge)', res.indexOf('India') < res.indexOf('US'));
check('carries KIRAN', res.includes('1800-599-0019'));
check('carries 988', res.includes('988'));
check('carries Samaritans', res.includes('116 123'));
check('no URL that needs a network', !/https?:\/\//.test(res));

console.log('\n' + (ok ? 'ALL PASS' : 'FAILURES ABOVE'));
process.exit(ok ? 0 : 1);
