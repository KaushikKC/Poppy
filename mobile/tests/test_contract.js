/**
 * Does the port answer what the UI actually asks for?
 *
 * This exists because of a real miss. The memory endpoints were written as
 * POST /memory/update and POST /memory/delete; frontend/memory.js sends PATCH and
 * DELETE to /memory/:id. Every one of those calls is wrapped in .catch(), so
 * nothing threw and nothing logged — editing and deleting a memory would simply
 * have done nothing on the phone, and it would have been debugged as a UI bug.
 *
 * So the contract is not maintained by hand. This reads frontend/*.js, extracts
 * every request it makes with its method, and checks the router answers it. The
 * output doubles as the honest progress report for the port.
 *
 *   node mobile/tests/test_contract.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let ok = true;
function check(label, cond, extra = '') {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (extra ? `  ${extra}` : ''));
  if (!cond) ok = false;
}

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, '..', 'frontend');
const OUT = path.join(ROOT, '.test-build');

execFileSync(
  path.join(ROOT, 'node_modules', '.bin', 'tsc'),
  ['--outDir', OUT, '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2020',
   '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node',
   'src/core/handlers.ts', 'src/core/router.ts'],
  { cwd: ROOT, stdio: 'inherit' },
);
const router = require(path.join(OUT, 'core/router.js'));
require(path.join(OUT, 'core/handlers.js')).registerHandlers();

/**
 * Pull every backend request out of the UI source. Template-literal paths with an
 * interpolation become a ":id" segment. The method is whatever `method:` appears in
 * the same call expression, else GET.
 */
function extractCalls() {
  const calls = new Map(); // "METHOD /path" -> Set(files)
  for (const file of fs.readdirSync(FRONTEND).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(FRONTEND, file), 'utf8');
    // Find fetch(`${BACKEND}/...`  and capture a window of text after it so the
    // options object (and its method) is in scope.
    const re = /fetch\(\s*`\$\{(?:BACKEND|MEM_BACKEND)\}(\/[^`]*)`([\s\S]{0,200}?)\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const rawPath = m[1];
      const tail = m[2] ?? '';
      const method = (tail.match(/method:\s*["'](\w+)["']/) || [, 'GET'])[1].toUpperCase();
      const cleaned = rawPath
        .replace(/\$\{[^}]*\}/g, ':id') // interpolated id segments
        .split('?')[0]
        .replace(/\/$/, '');
      const key = `${method} ${cleaned}`;
      if (!calls.has(key)) calls.set(key, new Set());
      calls.get(key).add(file);
    }
  }
  return calls;
}

const calls = extractCalls();
const registered = new Set(router.registered());

/** Does a registered pattern cover this concrete call? */
function covered(key) {
  if (registered.has(key)) return true;
  const [method, p] = key.split(' ');
  for (const r of registered) {
    const [rm, rp] = r.split(' ');
    if (rm !== method) continue;
    const a = rp.split('/');
    const b = p.split('/');
    if (a.length !== b.length) continue;
    if (a.every((seg, i) => seg.startsWith(':') || seg === b[i])) return true;
  }
  return false;
}

// Deliberately not ported. mic.js is replaced on iOS by web-overlay/mic.js, which
// captures and transcribes natively, so the desktop upload endpoint is never
// called. Listing it as a gap would misreport the port's state forever.
const BYPASSED = new Set(['POST /stt']);

const all = [...calls.keys()].sort().filter((k) => !BYPASSED.has(k));
const missing = all.filter((k) => !covered(k));
const done = all.filter(covered);

console.log('\n== what the desktop UI asks the backend for ==');
console.log(`   ${all.length} distinct requests across frontend/*.js`);
console.log(`   answered: ${done.length}      missing: ${missing.length}`);

console.log('\n== answered ==');
for (const k of done) console.log(`   ok   ${k}`);

console.log('\n== not ported yet ==');
for (const k of missing) {
  console.log(`   --   ${k}   (${[...calls.get(k)].join(', ')})`);
}

console.log('\n== the screens that work today ==');
// Grouped the way a user meets them, so "what can I actually do on the phone" has
// an answer that is not a guess.
const SCREENS = {
  'onboarding + character picker': ['GET /companion', 'GET /characters', 'POST /companion',
    'GET /settings', 'POST /companion/character'],
  'speaking (the turn loop)': ['WS /ws/chat'],
  'memory screen': ['GET /memory', 'POST /memory/confirm', 'PATCH /memory/:id',
    'DELETE /memory/:id', 'DELETE /memory', 'POST /memory/suppress'],
  'standing rules': ['GET /boundaries', 'POST /boundaries'],
  'home screen': ['GET /home'],
  garden: ['GET /garden', 'POST /garden/label'],
  'streaks + quests': ['GET /quests', 'POST /streak/repair', 'GET /long-year'],
  rituals: ['GET /ritual/due', 'POST /ritual', 'POST /ritual/dismiss'],
  'call lifecycle': ['POST /call/open', 'POST /call/close'],
};
for (const [screen, needs] of Object.entries(SCREENS)) {
  const have = needs.filter((n) => n === 'WS /ws/chat' || covered(n));
  const state = have.length === needs.length ? 'WORKS' : `${have.length}/${needs.length}`;
  console.log(`   ${state.padEnd(6)} ${screen}`);
}

console.log('\n== the mismatch this test was written for ==');
check('PATCH /memory/:id is answered', covered('PATCH /memory/:id'));
check('DELETE /memory/:id is answered', covered('DELETE /memory/:id'));
check('DELETE /memory is answered', covered('DELETE /memory'));

console.log('\n== endpoints intentionally bypassed on iOS ==');
for (const k of BYPASSED) console.log(`   n/a  ${k}  (native capture replaces it)`);

console.log('\n== the memory screen is whole ==');
// Every one of these is wrapped in .catch() by the UI, so a gap here is silent.
for (const k of ['GET /memory', 'POST /memory/confirm', 'POST /memory/suppress',
                 'PATCH /memory/:id', 'DELETE /memory/:id', 'DELETE /memory']) {
  check(k, covered(k));
}

console.log('\n== the boot path must never regress ==');
for (const k of ['GET /companion', 'GET /characters', 'GET /settings', 'POST /companion']) {
  check(k, covered(k));
}

console.log('\n' + (ok ? 'BOOT PATH OK' : 'FAILURES ABOVE'));
console.log(`(${missing.length} endpoints still to port — P4 covers the retention engine)`);
process.exit(ok ? 0 : 1);
