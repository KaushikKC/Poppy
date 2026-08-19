/**
 * The bridge: the shimmed fetch inside the WebView reaching the TS router.
 *
 * Runs in plain node with no simulator, because the whole port rests on this
 * being testable that way. It evaluates the *real* injected shim string, wires its
 * postMessage to the *real* router, and asserts the frontend's own boot sequence
 * comes back with the shapes backend/main.py returns.
 *
 *   node mobile/tests/test_bridge.js
 */

const path = require('path');
const { execFileSync } = require('child_process');

let ok = true;
function check(label, cond, extra = '') {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (extra ? `  ${extra}` : ''));
  if (!cond) ok = false;
}

// ── compile the TS core to something node can require ────────────────────────
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '.test-build');
execFileSync(
  path.join(ROOT, 'node_modules', '.bin', 'tsc'),
  ['--outDir', OUT, '--rootDir', 'src', '--strict', '--module', 'commonjs', '--target', 'es2020',
   '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node',
   'src/core/router.ts', 'src/core/handlers.ts', 'src/core/companion.ts',
   'src/core/characters.ts', 'src/core/store.ts', 'src/bridge/shim.ts'],
  { cwd: ROOT, stdio: 'inherit' },
);

const router = require(path.join(OUT, 'core/router.js'));
const handlers = require(path.join(OUT, 'core/handlers.js'));
const store = require(path.join(OUT, 'core/store.js'));
const { SHIM_JS } = require(path.join(OUT, 'bridge/shim.js'));
const { CAST } = require(path.join(OUT, 'core/characters.js'));

const fsMem = store.memoryFs();
store.configureStore(fsMem, '/data');
handlers.registerHandlers();

// ── stand up the shim exactly as the WebView would ───────────────────────────
// A minimal window: the shim is written to run before any polyfills, so if it
// needs more than this it would also fail inside WKWebView.
const listeners = {};
const win = {
  ReactNativeWebView: {
    postMessage: (json) => queue.push(JSON.parse(json)),
  },
  // The shim attaches touch listeners to unlock the AudioContext. document exists in
  // WKWebView at before-content-loaded time, so stubbing it here is right; leaving it
  // out made this fail where the real thing would not.
  document: {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: () => {},
    hidden: false,
  },
  // The shim throttles animation to 30fps for battery and heat, so it needs this.
  // WKWebView has it; the stub did not, which is a gap in the stub rather than in the
  // shim.
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  fetch: () => Promise.reject(new Error('real fetch should not be called for core URLs')),
  atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
  Blob: class { constructor(parts) { this.parts = parts; } },
};
const queue = [];

// Evaluate the real injected source with `window` and `this` bound to our stub.
new Function('window', 'atob', 'Blob', 'document', `with (window) { ${SHIM_JS} }`)(
  win, win.atob, win.Blob, win.document,
);

check('shim installs itself', win.__poppysShim === true);
check('BACKEND is set before page scripts run', win.BACKEND === 'http://poppys.local',
  String(win.BACKEND));
check('WS_BACKEND is set too', typeof win.WS_BACKEND === 'string');
check('fetch was replaced', typeof win.fetch === 'function');
check('WebSocket was replaced', typeof win.WebSocket === 'function');
check('audio unlock is armed on touch', Array.isArray(listeners.touchend) && listeners.touchend.length > 0);

/** Pump one queued message through the router and answer the page, like host.ts. */
async function pump() {
  while (queue.length) {
    const msg = queue.shift();
    if (msg.t === 'fetch') {
      const body = msg.body ? JSON.parse(msg.body) : null;
      const res = await router.handle(msg.method, msg.url, body);
      win.__poppysBridge({ t: 'fetch:res', id: msg.id, status: res.status, body: res.body });
    } else if (msg.t === 'ws:open') {
      win.__poppysBridge({ t: 'ws:opened', id: msg.id });
    }
  }
}

async function get(url, init) {
  const p = win.fetch(url, init);
  await pump();
  return p;
}

(async () => {
  console.log('\n== the frontend boot sequence, through the shim ==');

  const health = await (await get('http://poppys.local/health')).json();
  check('/health', health.status === 'ok', JSON.stringify(health));

  const settings = await (await get('http://poppys.local/settings')).json();
  check('/settings has detection + avatar',
    settings.detection === false && settings.avatar === '3d', JSON.stringify(settings));

  const cast = await (await get('http://poppys.local/characters')).json();
  check('/characters returns the full cast', cast.length === CAST.length, `${cast.length}`);
  check('each has the keys the picker reads',
    cast.every((c) => c.key && c.name && c.tagline && c.color && c.color.glow && c.photo));

  let profile = await (await get('http://poppys.local/companion')).json();
  check('first run reports onboarded=false', profile.onboarded === false);
  check('and still carries defaults', profile.character === 'poppy' && profile.voice === 'af_heart');

  console.log('\n== onboarding writes a profile that persists ==');
  profile = await (
    await get('http://poppys.local/companion', {
      method: 'POST',
      body: JSON.stringify({ character: 'ravi' }),
    })
  ).json();
  check('onboarded flips true', profile.onboarded === true);
  check('character taken from the picker', profile.character === 'ravi', profile.character);
  check('name follows the character', profile.companion_name === 'Ravi', profile.companion_name);
  check('voice follows the character', profile.voice !== 'af_heart', profile.voice);
  check('created_at stamped', typeof profile.created_at === 'string');
  check('it actually hit the filesystem', fsMem.files.has('/data/companion.json'));

  const reread = await (await get('http://poppys.local/companion')).json();
  check('survives a reread', reread.character === 'ravi' && reread.onboarded === true);

  console.log('\n== update() drops unknown keys, like desktop ==');
  // The desktop bug this guards: every streak_* write was silently lost because
  // update() only persists declared fields. Undeclared keys must not appear.
  const patched = await (
    await get('http://poppys.local/companion/update', {
      method: 'POST',
      body: JSON.stringify({ vibe: 'mentor', not_a_real_field: 42 }),
    })
  ).json();
  check('known key written', patched.vibe === 'mentor');
  check('unknown key refused', patched.not_a_real_field === undefined);

  console.log('\n== unknown routes 404 rather than throwing ==');
  // Deliberately a path that will never exist. /garden was used here once and then
  // became real, which is how a test starts asserting the opposite of the truth.
  const missing = await get('http://poppys.local/no-such-endpoint-ever');
  check('404 status', missing.status === 404);
  check('ok is false', missing.ok === false);

  console.log('\n== non-core URLs are left to the real fetch ==');
  let realCalled = false;
  win.fetch2 = win.fetch;
  const realFetchProbe = { called: false };
  // The page loads its own assets; those must not be routed through the bridge.
  try {
    await win.fetch('avatar/characters/poppy.jpg');
  } catch (e) {
    realCalled = /real fetch should not be called/.test(e.message);
  }
  check('asset URL went to the real fetch', realCalled);

  console.log('\n== WebSocket shim opens and reports state ==');
  const sock = new win.WebSocket('ws://poppys.local/ws/chat');
  check('starts CONNECTING', sock.readyState === 0);
  let opened = false;
  sock.onopen = () => { opened = true; };
  await pump();
  check('onopen fires after the host answers', opened && sock.readyState === 1);

  let got = null;
  sock.onmessage = (e) => { got = e.data; };
  win.__poppysBridge({ t: 'ws:msg', id: sock._id, data: 'hello' });
  check('text frames arrive', got === 'hello', String(got));

  win.__poppysBridge({ t: 'ws:msg', id: sock._id, data: Buffer.from([1, 2, 3]).toString('base64'), b64: true });
  check('binary frames decode to bytes', got instanceof win.Blob || got instanceof ArrayBuffer);

  console.log('\n== coverage against backend/main.py ==');
  const have = router.registered().length;
  console.log(`   ${have} routes registered; backend/main.py has 45 endpoints + 1 socket`);
  check('P1 registers the boot sequence at minimum', have >= 7, `${have}`);

  console.log('\n' + (ok ? 'ALL PASS' : 'FAILURES ABOVE'));
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('\nthrew:', e);
  process.exit(1);
});
