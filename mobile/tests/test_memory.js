/**
 * Memory and boundaries.
 *
 * The properties that matter are the ones desktop had to learn: temporary facts
 * expire and stay expired, the prompt is capped so time-to-first-token does not
 * drift, relevance degrades to "most recent" rather than to nothing, and a subject
 * the user forbade is withheld from the prompt without being deleted.
 *
 *   node mobile/tests/test_memory.js
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
   'src/core/memory_store.ts', 'src/core/boundaries.ts', 'src/core/store.ts',
   'src/core/memory_extract.ts'],
  { cwd: ROOT, stdio: 'inherit' },
);

const store = require(path.join(OUT, 'core/store.js'));
const mem = require(path.join(OUT, 'core/memory_store.js'));
const bounds = require(path.join(OUT, 'core/boundaries.js'));
const extract = require(path.join(OUT, 'core/memory_extract.js'));

function fresh() {
  const fs = store.memoryFs();
  store.configureStore(fs, '/d');
  return fs;
}

(async () => {
  console.log('\n== remembering, editing, forgetting ==');
  fresh();
  const a = await mem.remember('works as a nurse', 'profile');
  check('a fact comes back with an id', !!a && !!a.id);
  check('and is stored', (await mem.recall()).includes('works as a nurse'));

  const dup = await mem.remember('Works As A Nurse', 'profile');
  check('duplicates are refused, case-insensitively', dup === null);

  await mem.update(a.id, 'works as a night nurse');
  check('editable', (await mem.recall()).includes('works as a night nurse'));
  check('removable', (await mem.remove(a.id)) === true && (await mem.recall()).length === 0);
  check('removing twice is false, not a throw', (await mem.remove(a.id)) === false);

  console.log('\n== an unknown category falls back rather than throwing ==');
  fresh();
  const odd = await mem.remember('likes rain', 'not-a-category');
  check('stored under the default', odd.category === 'ongoing', odd.category);
  check('empty text is refused', (await mem.remember('   ')) === null);

  console.log('\n== temporary facts expire, and stay expired ==');
  const fs = fresh();
  const temp = await mem.remember('has a dentist appointment on Friday', 'temporary');
  check('a TTL was set', typeof temp.expires_at === 'string');
  check('a permanent fact has none', (await mem.remember('has a sister', 'people')).expires_at === null);

  // Age it past its TTL by editing the stored file, the way real time would.
  const raw = JSON.parse(fs.files.get('/d/memory_poppy.json'));
  raw.records = raw.records.map((r) =>
    r.category === 'temporary'
      ? { ...r, expires_at: new Date(Date.now() - 1000).toISOString() }
      : r,
  );
  fs.files.set('/d/memory_poppy.json', JSON.stringify(raw));

  const after = await mem.recall();
  check('the expired fact is gone', !after.some((t) => t.includes('dentist')), JSON.stringify(after));
  check('the permanent one survives', after.some((t) => t.includes('sister')));
  const persisted = JSON.parse(fs.files.get('/d/memory_poppy.json'));
  check('pruning was written to disk, so it cannot return',
    !persisted.records.some((r) => r.category === 'temporary'));

  console.log('\n== the prompt block is capped ==');
  // Uncapped, every remembered fact would land in the prefill and first-token
  // latency would creep up as the relationship got longer.
  fresh();
  for (let i = 0; i < 40; i++) await mem.remember(`fact number ${i} about badgers`, 'ongoing');
  const chosen = await mem.relevant('badgers');
  check('at most 15 facts reach the prompt', chosen.length <= 15, `${chosen.length}`);
  const block = await mem.asPromptBlock('badgers');
  check('block is formatted as a list', block.includes('Things you remember about the user:'));
  check('one line per fact', block.split('\n- ').length - 1 === chosen.length);

  console.log('\n== relevance prefers the on-topic facts ==');
  fresh();
  await mem.remember('is training for a marathon', 'goals');
  await mem.remember('has a cat called Biscuit', 'people');
  for (let i = 0; i < 20; i++) await mem.remember(`unrelated note ${i}`, 'ongoing');
  const aboutRunning = await mem.relevant('how is the marathon training going');
  check('the marathon fact is included', aboutRunning.some((t) => t.includes('marathon')));

  console.log('\n== identity facts are pinned ==');
  fresh();
  await mem.remember('name is Kaushik', 'profile');
  for (let i = 0; i < 30; i++) await mem.remember(`chatter ${i}`, 'ongoing');
  const withProfile = await mem.relevant('something entirely unrelated');
  check('profile survives a non-matching turn', withProfile.some((t) => t.includes('Kaushik')),
    JSON.stringify(withProfile.slice(0, 3)));

  console.log('\n== a zero-match turn degrades to recent, not to nothing ==');
  fresh();
  for (let i = 0; i < 25; i++) await mem.remember(`note ${i}`, 'ongoing');
  const none = await mem.relevant('zzzzz qqqqq');
  check('still returns facts', none.length === 15, `${none.length}`);

  console.log('\n== a forbidden subject is withheld but not deleted ==');
  // Instructing her not to mention it was measured as insufficient: with the memory
  // in context the 3B raised it in 3 of 4 replies. Withholding is what worked.
  fresh();
  await mem.remember('had a bad breakup with Sam', 'sensitive');
  await mem.remember('is learning the guitar', 'goals');
  await bounds.add('avoid', 'the breakup');
  check('the rule is stored', (await bounds.get()).avoid.includes('breakup'));
  check('isBlocked recognises the subject', (await bounds.isBlocked('had a bad breakup with Sam')) === true);

  const injected = await mem.relevant('how are things');
  check('it is kept out of the prompt', !injected.some((t) => t.includes('breakup')),
    JSON.stringify(injected));
  check('unrelated facts still get through', injected.some((t) => t.includes('guitar')));
  check('but it is NOT deleted', (await mem.recall()).some((t) => t.includes('breakup')));

  console.log('\n== lifting the rule brings it back ==');
  await bounds.remove('avoid', 'breakup');
  check('no longer blocked', (await bounds.isBlocked('had a bad breakup with Sam')) === false);
  check('back in the prompt', (await mem.relevant('how are things')).some((t) => t.includes('breakup')));

  console.log('\n== memories are per character ==');
  fresh();
  mem.setCharacter('poppy');
  await mem.remember('told Poppy about work', 'ongoing');
  mem.setCharacter('luna');
  check('Luna cannot see it', !(await mem.recall()).some((t) => t.includes('told Poppy')));
  await mem.remember('told Luna about music', 'ongoing');
  mem.setCharacter('poppy');
  const back = await mem.recall();
  check('Poppy still has hers', back.some((t) => t.includes('told Poppy')));
  check('and not Luna\'s', !back.some((t) => t.includes('told Luna')));

  console.log('\n== forgetting clears only the current character ==');
  await mem.forgetAll();
  check('Poppy is empty', (await mem.recall()).length === 0);
  mem.setCharacter('luna');
  check('Luna is untouched', (await mem.recall()).some((t) => t.includes('told Luna')));
  mem.setCharacter('poppy');

  console.log('\n== a fact about today does not outlive the day ==');
  {
    await mem.forgetAll();
    const beach = await mem.remember('They are going to the beach today.', 'temporary');
    const visit = await mem.remember('Priya is visiting them next week.', 'temporary');
    const stable = await mem.remember('They work as a teacher.', 'profile');
    const hours = (r) => (new Date(r.expires_at).getTime() - Date.now()) / 3600000;
    check('a "today" fact expires within a day', beach && hours(beach) <= 25, beach && `${hours(beach).toFixed(0)}h`);
    check('a "next week" fact keeps the fortnight', visit && hours(visit) > 300, visit && `${hours(visit).toFixed(0)}h`);
    check('a stable fact never expires', stable && stable.expires_at === null);
    await mem.forgetAll();
  }

  console.log('\n== the extractor\'s output is parsed, wrapped or not ==');
  {
    // What the fine-tuned 0.6B actually returns for this prompt: the objects, no
    // enclosing brackets. Keyed on indexOf('['), the old parser read that as nothing
    // and discarded every fact — so the memory block was always empty, she never
    // remembered anything, and the model took the blame for a parser bug.
    const real = '{"text": "Sam is a childhood friend, coming over today.", "category": "people"}, '
      + '{"text": "They are going to the beach with Sam.", "category": "ongoing"}';
    const got = extract.parseCandidates(real);
    check('unwrapped objects are kept', got.length === 2, `${got.length}`);
    check('the first fact survives intact', /Sam is a childhood friend/.test(got[0] ? got[0].text : ''), JSON.stringify(got[0]));
    check('categories come through', got[0] && got[0].category === 'people', got[0] && got[0].category);

    check('a proper array still works', extract.parseCandidates('[{"text":"They live in Chennai.","category":"people"}]').length === 1);
    check('a single bare object works', extract.parseCandidates('{"text":"They want to learn Spanish.","category":"goals"}').length === 1);
    check('an empty array stays empty', extract.parseCandidates('[]').length === 0);
    check('prose yields nothing', extract.parseCandidates('nothing worth remembering here').length === 0);
    check('truncated JSON yields nothing', extract.parseCandidates('{"text": "half a fac').length === 0);

    // The old prompt produced these, and saved they read "- John / - dinner / - cinema"
    // in the memory block, which told the model nothing about who or what.
    const fragments = '[{"text":"John","category":"people"},{"text":"dinner","category":"ongoing"}]';
    check('one-word fragments are refused', extract.parseCandidates(fragments).length === 0, `${extract.parseCandidates(fragments).length}`);
    const sentence = '[{"text":"Their friend John is coming for dinner.","category":"people"}]';
    check('a real sentence is kept', extract.parseCandidates(sentence).length === 1);
  }

  console.log('\n' + (ok ? 'ALL PASS' : 'FAILURES ABOVE'));
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('\nthrew:', e);
  process.exit(1);
});
