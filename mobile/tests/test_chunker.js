/**
 * The chunker port, checked against the Python it was ported from.
 *
 * Not "does the TypeScript look right" but "does it emit the same phrases as
 * backend/phrase_chunker.py, token for token". It runs the real Python and the
 * real TypeScript over the same streams and diffs the output, so a transcription
 * slip in a threshold or a reordered check fails here rather than showing up as
 * oddly-chopped speech on a phone.
 *
 * Skips itself if python3 or the backend is unavailable, so it never blocks a
 * mobile-only checkout.
 *
 *   node mobile/tests/test_chunker.js
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
  ['--outDir', OUT, '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2020',
   '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node',
   'src/core/chunker.ts'],
  { cwd: ROOT, stdio: 'inherit' },
);
const { PhraseChunker } = require(path.join(OUT, 'core/chunker.js'));

const TEXTS = [
  "I'm just taking a quiet stroll in the garden, feeling the warm sun on my face and listening to the birds singing. It's been a lovely morning so far.",
  'Well, that sounds hard.',
  'Sure. Yes. No.',
  'You can expect a partly cloudy sky with a high of around 58 degrees and a low of 48, with a gentle breeze blowing at about 5 miles per hour.',
  'Averylongsingleunbrokenwordthatjustkeepsgoingandgoingandgoingwithoutanypunctuationatallsoitmusthitthehardcap',
  'Hey',
  "Oh! Really? That's wonderful, truly wonderful; I mean it: you did well.",
  '',
];

/** Run the TS chunker over one text, tokenised per `mode`. */
function runTs(text, mode) {
  const c = new PhraseChunker();
  const toks = mode === 'char' ? [...text] : text.split(' ').map((w) => w + ' ');
  const phrases = [];
  for (const t of toks) {
    const p = c.push(t);
    if (p) phrases.push(p);
  }
  const tail = c.flush();
  if (tail) phrases.push(tail);
  return phrases;
}

// ── the Python side ──────────────────────────────────────────────────────────
const PY = `
import json, os, sys, tempfile
os.environ["POPPY_DATA_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, ${JSON.stringify(path.join(REPO, 'backend'))})
from phrase_chunker import PhraseChunker
TEXTS = json.loads(sys.argv[1])
out = []
for text in TEXTS:
    for mode in ("char", "word"):
        c = PhraseChunker()
        toks = list(text) if mode == "char" else [w + " " for w in text.split(" ")]
        phrases = []
        for t in toks:
            p = c.push(t)
            if p: phrases.append(p)
        tail = c.flush()
        if tail: phrases.append(tail)
        out.append({"text": text, "mode": mode, "phrases": phrases})
print(json.dumps(out))
`;

let pyCases = null;
try {
  const tmp = path.join(os.tmpdir(), 'poppys_chunk_ref.py');
  fs.writeFileSync(tmp, PY);
  const raw = execFileSync('python3', [tmp, JSON.stringify(TEXTS)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  pyCases = JSON.parse(raw);
} catch {
  pyCases = null;
}

console.log('\n== the port emits what the Python emits ==');
if (!pyCases) {
  console.log('  SKIPPED (python3 or backend/ not available here)');
} else {
  let mismatches = 0;
  for (const c of pyCases) {
    const mine = runTs(c.text, c.mode);
    const same = JSON.stringify(mine) === JSON.stringify(c.phrases);
    if (!same) {
      mismatches++;
      console.log(`  FAIL  ${c.mode}: ${JSON.stringify(c.text.slice(0, 40))}`);
      console.log(`        python: ${JSON.stringify(c.phrases)}`);
      console.log(`        ts    : ${JSON.stringify(mine)}`);
      ok = false;
    }
  }
  check(`${pyCases.length} streams match phrase for phrase`, mismatches === 0,
    mismatches ? `${mismatches} differ` : '');
}

console.log('\n== the property the latency fix depends on ==');
// First-audio was 4.65s because the first phrase was 110 characters. The first
// phrase must stay small or that regresses silently.
const long = "I'm just taking a quiet stroll in the garden, feeling the warm sun on my face.";
const first = runTs(long, 'char')[0];
check('first phrase is short', first.length <= 20, `${first.length} chars: ${JSON.stringify(first)}`);
check('later phrases are larger', runTs(long, 'char').slice(1).some((p) => p.length > 20));

console.log('\n== nothing is lost or duplicated ==');
// Compared with whitespace removed, not with phrases rejoined by a space. A word
// longer than the hard cap has no space to break at, so both implementations cut
// it mid-word; rejoining with a space would then invent one and fail a correct
// chunker. What must hold is that no character is dropped or repeated.
for (const text of TEXTS.filter(Boolean)) {
  for (const mode of ['char', 'word']) {
    const bare = (s) => s.replace(/\s+/g, '');
    const joined = bare(runTs(text, mode).join(''));
    const want = bare(text);
    check(`${mode}: no characters lost ${JSON.stringify(text.slice(0, 28))}`,
      joined === want, joined === want ? '' : `got ${JSON.stringify(joined.slice(0, 60))}`);
  }
}

console.log('\n' + (ok ? 'ALL PASS' : 'FAILURES ABOVE'));
process.exit(ok ? 0 : 1);
