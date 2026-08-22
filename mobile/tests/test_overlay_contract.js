/**
 * The web overlay has to keep up with the page files it replaces.
 *
 * `web-overlay/` is rsynced over the copied frontend at build time, so each file here
 * *shadows* a desktop one. That is invisible from the desktop side: someone adds a
 * method to frontend/audio_player.js, the browser is fine, and the phone gets a class
 * that no longer has it.
 *
 * It is also not a small failure. chat.js registers `player.onPlaybackEnd` while wiring
 * up the socket for a turn, so when the overlay lacked that method the TypeError killed
 * the turn *before the message was sent*: every reply, typed or spoken, sat on
 * "thinking" forever and the model never ran at all. Nothing logged, nothing rendered,
 * and it looked exactly like a broken model.
 *
 * So the surface is compared here rather than trusted. Method names only: whether the
 * bodies agree is not something a test can tell, and the bodies are supposed to differ
 * — that is the whole point of an overlay.
 *
 *   node mobile/tests/test_overlay_contract.js
 */

const fs = require('fs');
const path = require('path');

let ok = true;
function check(label, cond, extra = '') {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (extra ? `  ${extra}` : ''));
  if (!cond) ok = false;
}

const ROOT = path.join(__dirname, '..');
const OVERLAY = path.join(ROOT, 'web-overlay');
const FRONTEND = path.join(ROOT, '..', 'frontend');

/**
 * Method names declared inside a `class` body.
 *
 * Scoped to the class deliberately. Matching two-space indentation across the whole
 * file also catches call sites inside an IIFE, which reads as the overlay "missing"
 * a method that was never a method — a test that cries wolf gets muted, and a muted
 * test would not have caught the real one.
 */
function methodsOf(source) {
  const found = new Set();
  const start = source.search(/^class\s+[A-Za-z_$][\w$]*/m);
  if (start === -1) return found;
  // The class body runs to the first line that closes it at column zero.
  const rest = source.slice(start);
  const end = rest.search(/^\}/m);
  const body = end === -1 ? rest : rest.slice(0, end);
  const re = /^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while ((m = re.exec(body))) {
    if (!['if', 'for', 'while', 'switch', 'catch', 'return', 'constructor'].includes(m[1])) {
      found.add(m[1]);
    }
  }
  return found;
}

/** Everything the page assigns to window, which is how these files are reached. */
function globalsOf(source) {
  const found = new Set();
  const re = /window\.([A-Za-z_$][\w$]*)\s*=/g;
  let m;
  while ((m = re.exec(source))) found.add(m[1]);
  return found;
}

console.log('== every overlay file shadows a real page file ==');
const overlayFiles = fs.readdirSync(OVERLAY).filter((f) => f.endsWith('.js'));
for (const file of overlayFiles) {
  check(
    `${file} replaces frontend/${file}`,
    fs.existsSync(path.join(FRONTEND, file)),
    'an overlay file with no counterpart is dead weight in the bundle',
  );
}

console.log('\n== the overlay implements everything the desktop file declares ==');
for (const file of overlayFiles) {
  const desktopPath = path.join(FRONTEND, file);
  if (!fs.existsSync(desktopPath)) continue;
  const desktop = fs.readFileSync(desktopPath, 'utf8');
  const overlay = fs.readFileSync(path.join(OVERLAY, file), 'utf8');

  // Private helpers (_name) are implementation, not interface: the two files are
  // allowed to get there differently.
  const want = [...methodsOf(desktop)].filter((n) => !n.startsWith('_'));
  const have = methodsOf(overlay);
  const missing = want.filter((n) => !have.has(n));
  check(`${file}: methods`, missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${want.length} checked`);

  const wantG = [...globalsOf(desktop)];
  const haveG = globalsOf(overlay);
  const missingG = wantG.filter((n) => !haveG.has(n));
  check(
    `${file}: window globals`,
    missingG.length === 0,
    missingG.length ? `missing window.${missingG.join(', window.')}` : `${wantG.length} checked`,
  );
}

console.log('\n== the page only calls methods the overlay has ==');
// The direct version of the same question, asked from the caller's side, because a
// method the page calls is the thing that actually throws.
// Every page file, not a list someone has to remember to extend.
const callers = fs
  .readdirSync(FRONTEND)
  .filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(FRONTEND, f), 'utf8'))
  .join('\n');

const playerCalls = new Set(
  [...callers.matchAll(/\bplayer\.([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]),
);
const overlayPlayer = methodsOf(fs.readFileSync(path.join(OVERLAY, 'audio_player.js'), 'utf8'));
const missingCalls = [...playerCalls].filter((n) => !overlayPlayer.has(n));
check(
  'audio_player: every player.x() the page calls',
  missingCalls.length === 0,
  missingCalls.length ? `missing ${missingCalls.join(', ')}` : `${playerCalls.size} checked`,
);

console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
