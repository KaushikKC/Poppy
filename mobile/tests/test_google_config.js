/**
 * The Google client id exists in two places, and they have to agree.
 *
 * `Info.plist` needs it for the URL scheme Google redirects back to. `bridge/auth.ts`
 * needs it because @react-native-google-signin does **not** read `GIDClientID` from the
 * plist — it wants a Firebase `GoogleService-Info.plist` or an explicit `iosClientId`,
 * and throws "failed to determine clientID" when it has neither. Google's own SDK reads
 * the plist key; the wrapper does not. That assumption cost a build and a test on a
 * real phone.
 *
 * Two copies of one value drift. When they do, the failure is not a build error: the
 * sheet opens against one client and the redirect comes back to a scheme registered for
 * another, and what the user sees is sign-in that hangs or silently cancels.
 *
 *   node mobile/tests/test_google_config.js
 */

const fs = require('fs');
const path = require('path');

let ok = true;
function check(label, cond, extra = '') {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (extra ? `  ${extra}` : ''));
  if (!cond) ok = false;
}

const ROOT = path.join(__dirname, '..');
const plist = fs.readFileSync(path.join(ROOT, 'ios/PoppysSpike/Info.plist'), 'utf8');
const auth = fs.readFileSync(path.join(ROOT, 'src/bridge/auth.ts'), 'utf8');

/** The <string> that follows a given <key>. The plist in the repo is XML. */
function plistValue(key) {
  const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`);
  return (plist.match(re) || [])[1] || '';
}

const fromPlist = plistValue('GIDClientID');
const fromCode = (auth.match(/const IOS_CLIENT_ID\s*=\s*\n?\s*'([^']+)'/) || [])[1] || '';
const schemes = [...plist.matchAll(/<string>(com\.googleusercontent\.apps\.[^<]+)<\/string>/g)].map(
  (m) => m[1],
);

console.log('== the id is configured at all ==');
check('Info.plist has GIDClientID', !!fromPlist, fromPlist ? '' : 'sign-in cannot work');
check('auth.ts has IOS_CLIENT_ID', !!fromCode);
const placeheld = /REPLACE_WITH/.test(fromPlist + fromCode);
check('neither is still a placeholder', !placeheld, placeheld ? 'placeholders left in' : '');

console.log('\n== and it is the same id in both ==');
check('plist and auth.ts agree', fromPlist === fromCode, `${fromPlist} vs ${fromCode}`);

console.log('\n== the redirect scheme belongs to that id ==');
// The scheme is the id with the dot-separated halves reversed. A scheme from a
// different client is the failure mode with no error message.
const ident = fromPlist.replace('.apps.googleusercontent.com', '');
check(
  'a reversed-client-id URL scheme is registered',
  schemes.length > 0,
  schemes.join(', ') || 'none — Google cannot return to the app',
);
check(
  'and it is derived from this client id',
  schemes.includes(`com.googleusercontent.apps.${ident}`),
  schemes.join(', '),
);

console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
