/**
 * The stylesheet rules this app's layout cannot survive without.
 *
 * This exists because the same accident happened three times: a block edit to
 * style.css took working rules with it, nothing failed, and the damage only showed up
 * on a device. The worst of them deleted the Companions screen's stylesheet — with no
 * `position: fixed` the overlay landed at the end of <body> as an ordinary block, and
 * with no size on `.cs-face` every portrait rendered at its natural size. One face
 * filled the screen and bled through every other view.
 *
 * A missing rule is invisible to every other check we have: the JS parses, the tests
 * pass, and the page renders — just wrongly.
 *
 * The list is curated rather than "every class in the markup". The broad version
 * reported eleven names that were never styled on purpose, and a test that cries wolf
 * gets muted — a muted test would not have caught the one that mattered.
 *
 *   node tests/test_style_contract.js
 */

const fs = require('fs');
const path = require('path');

let ok = true;
function check(label, cond, extra = '') {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (extra ? `  ${extra}` : ''));
  if (!cond) ok = false;
}

const FRONTEND = path.join(__dirname, '..', 'frontend');
const css = ['tokens.css', 'app.css', 'style.css']
  .map((f) => fs.readFileSync(path.join(FRONTEND, f), 'utf8'))
  .join('\n');

/** Classes whose absence does not degrade a screen but destroys it. */
const LOAD_BEARING = [
  // Companions — the block that vanished.
  '.cs-sheet', '.cs-nav', '.cs-body', '.cs-row', '.cs-face', '.cs-right',
  // The You screen.
  '.you-nav', '.home-body', '.listrow', '.listrow__title', '.listrow__sub',
  // The memory vault.
  '.mem-nav', '.mem-body', '.memcard',
  // Voice notes.
  '.vn-row', '.vn-mark', '.vn-wave', '.vn-transcript', '.vn-text',
  // Onboarding and the tab bar.
  '.ob-screen', '.ob-foot', '.tabbar', '.tab', '.hero-face',
  // The picker's one-liner and its scrim.
  '.look__sub', '.look--sub',
];

console.log(`== ${LOAD_BEARING.length} load-bearing classes ==`);
const missing = LOAD_BEARING.filter((c) => !css.includes(c));
check(
  'each has a rule in tokens.css, app.css or style.css',
  missing.length === 0,
  missing.length ? `missing ${missing.join(', ')}` : 'all present',
);

// The specific shape of the worst failure: an overlay that is not positioned lands in
// the document flow and paints over everything after it.
console.log('\n== overlays are actually overlays ==');
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
for (const id of ['char-switch', 'memory-panel', 'account-sheet']) {
  // The selector may be part of a group — "#traits, #look, #account-sheet { … }" —
  // so look at every rule whose selector list mentions this id.
  const positioned = rules.some(
    (m) => new RegExp(`#${id}\\b`).test(m[1]) && /position:\s*fixed/.test(m[2]),
  );
  check(`#${id} is positioned`, positioned, positioned ? '' : 'would land in the flow');
}

// And the portraits inside them are bounded, which is what stops a face becoming a
// wallpaper.
console.log('\n== portraits are bounded ==');
const faceRule = css.match(/\.cs-face\s*\{[^}]*\}/);
check('.cs-face has a width', !!faceRule && /width:/.test(faceRule[0]));
check('.cs-face img is constrained', /\.cs-face img\s*\{[^}]*object-fit/.test(css));

// iOS 15.1 is the deployment target. Both of these look right in Chrome and fail
// there, and both have been introduced by accident once already.
console.log('\n== nothing that needs a newer WebKit ==');
// Comments explaining *why* these are avoided mention them by name, so strip comments
// before looking. A test that fails on its own documentation teaches people to ignore it.
const live = css.replace(/\/\*[\s\S]*?\*\//g, '');
check('no :has()', !/:has\(/.test(live), 'needs Safari 15.4');
check('no color-mix()', !/color-mix\(/.test(live), 'needs Safari 16.2');

console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
