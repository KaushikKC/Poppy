/**
 * Characters the user writes, on the phone.
 *
 * Every failure this guards is silent. A personality paragraph that never reaches
 * the system prompt produces a perfectly fluent reply from the wrong person; a cap
 * that has drifted from custom_characters.py produces a character who is subtly
 * different on iOS than in the browser; a deleted character leaves the profile
 * pointing at someone who no longer exists and the picker simply looks empty.
 * None of it raises anything, which is why it is tested rather than eyeballed.
 *
 *   node mobile/tests/test_custom_characters.js
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
   'src/core/custom_characters.ts', 'src/core/handlers.ts', 'src/core/companion.ts'],
  { cwd: ROOT, stdio: 'inherit' },
);

const custom = require(path.join(OUT, 'core/custom_characters.js'));
const characters = require(path.join(OUT, 'core/characters.js'));
const companion = require(path.join(OUT, 'core/companion.js'));
const store = require(path.join(OUT, 'core/store.js'));
const { registerHandlers } = require(path.join(OUT, 'core/handlers.js'));
const { handle } = require(path.join(OUT, 'core/router.js'));

(async () => {
  console.log('== the caps are the Python\'s caps ==');
  // Read out of the source rather than imported: this file is the only thing holding
  // the two platforms in step, so it has to fail when the Python moves.
  const fs = require('fs');
  const py = fs.readFileSync(
    path.join(ROOT, '..', 'backend', 'custom_characters.py'), 'utf8',
  );
  const pyConst = (name) => Number((py.match(new RegExp(`^${name} = (\\d+)`, 'm')) || [])[1]);
  for (const name of ['NAME_MAX_CHARS', 'TAGLINE_MAX_CHARS', 'PERSONALITY_MAX_CHARS', 'GREETING_MAX_CHARS']) {
    check(name, custom[name] === pyConst(name), `ts=${custom[name]} py=${pyConst(name)}`);
  }
  const pyVoices = (py.match(/"key": "(\w+)"/g) || []).map((m) => m.split('"')[3]);
  check(
    'the same six voices, in the same order',
    JSON.stringify(custom.VOICES.map((v) => v.key)) === JSON.stringify(pyVoices),
    custom.VOICES.map((v) => v.key).join(','),
  );

  console.log('\n== what a written character becomes ==');
  store.configureStore(store.memoryFs(), '/d');
  const saved = await custom.save({
    name: 'Marguerite',
    tagline: 'restores film reels',
    voice: 'am_fenrir',
    personality: 'You restore damaged film reels in a basement archive in Lyon.',
  });
  check('key is prefixed', saved.key.startsWith('custom:'), saved.key);
  check('gender follows the voice', saved.gender === 'male', saved.gender);
  check('a colour was picked for them', !!saved.color.face, saved.color.face);

  const resolved = await custom.resolve(saved.key);
  check(
    'their words are in the prompt',
    resolved.system_prompt.includes('basement archive in Lyon'),
  );
  check(
    'assembled on the same core as ours',
    resolved.system_prompt.startsWith(characters.core('Marguerite')),
  );
  check('marked custom, so the scaffolding yields', resolved.custom === true);

  // The half that made this worth doing at all: before this, the phone built its
  // prompt from the persona, so every character was Poppy with a swapped name.
  const builtIn = await custom.resolve('kai');
  check(
    'a built-in brings their own personality too',
    builtIn.system_prompt.length > characters.core('Kai').length + 40
      && builtIn.system_prompt.includes('Kai'),
  );
  check('and is not marked custom', builtIn.custom === false);

  console.log('\n== over-long input is cut before it can reach the prompt ==');
  const fat = await custom.save({ name: 'x'.repeat(100), personality: 'y'.repeat(2000) });
  check('name capped', fat.name.length === custom.NAME_MAX_CHARS, String(fat.name.length));
  check(
    'personality capped',
    fat.personality.length === custom.PERSONALITY_MAX_CHARS,
    String(fat.personality.length),
  );

  console.log('\n== the routes the page calls ==');
  registerHandlers();
  const list = await handle('GET', '/characters', null);
  check('cast carries ours and theirs', list.body.length === 8, `${list.body.length} rows`);
  check(
    'a written one has no portrait path to fail on',
    list.body.filter((c) => c.custom).every((c) => c.photo === null),
  );
  const voices = await handle('GET', '/characters/voices', null);
  check('voices are offered', voices.body.voices.length === 6);

  const nameless = await handle('POST', '/characters/custom', { personality: 'nobody' });
  check('a character with no name is refused', nameless.status === 400, String(nameless.status));

  console.log('\n== deleting the one in use ==');
  await companion.create(saved.key);
  check('they were the companion', (await companion.profile()).companion_name === 'Marguerite');
  const gone = await handle('DELETE', `/characters/custom/${encodeURIComponent(saved.key)}`);
  check('deleted', gone.body.deleted === true);
  const after = await companion.profile();
  check('the profile fell back to the cast', after.character === 'poppy', after.character);
  check('and took the name and voice with it', after.companion_name === 'Poppy', after.voice);

  console.log(ok ? '\nALL PASS' : '\nFAILURES');
  process.exit(ok ? 0 : 1);
})();
