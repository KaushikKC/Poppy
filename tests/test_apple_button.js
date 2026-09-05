/**
 * The Apple button belongs on Apple's phones.
 *
 * It was gated on the native bridge existing, which is true on Android too — so the
 * button rendered there and opened nothing. The native call is guarded and returns
 * null, so it failed silently, which is the worst way for a button to fail.
 *
 *   node tests/test_apple_button.js
 */
const fs = require('fs');
const path = require('path');

let ok = true;
function check(label, cond, extra = '') {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (extra ? `  ${extra}` : ''));
  if (!cond) ok = false;
}

const flow = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'flow.js'), 'utf8');
const shim = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'src', 'bridge', 'shim.ts'), 'utf8');
const shell = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'src', 'AppShell.tsx'), 'utf8');

console.log('== the page is told which phone it is on ==');
check('the shim declares a platform', /window\.PoppyPlatform\s*=/.test(shim));
check('AppShell substitutes the real one', /SHIM_JS\.replace\('__PLATFORM__', Platform\.OS\)/.test(shell));
check('and imports Platform to do it', /\bPlatform\b[^;]*from 'react-native'/.test(shell));

console.log('\n== and both Apple buttons check it ==');
// The sign-in screen.
const reveal = flow.match(/if \(window\.PoppyNativeAuth\?\.signIn[^)]*\) \{\s*\n\s*document\.getElementById\("si-apple"\)/);
check('the sign-in button is gated', !!reveal && /PoppyPlatform === "ios"/.test(reveal[0]), reveal ? reveal[0].split('\n')[0] : 'not found');
// The account sheet.
check('the account sheet uses an ios-only flag', /const appleOk = native && window\.PoppyPlatform === "ios"/.test(flow));
check('and renders its button from that flag', /appleOk \?[^:]*acct-apple/.test(flow));
check('no Apple button renders from `native` alone', !/native \?[^:]*acct-apple/.test(flow));

// Google must not have been caught by the same net: it works on both.
console.log('\n== Google is unaffected ==');
check('the Google button is not gated on ios', !/PoppyPlatform === "ios"[^\n]*google/i.test(flow));

console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
