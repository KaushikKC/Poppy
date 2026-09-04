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
   'src/core/memory_extract.ts', 'src/core/engines.ts'],
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

  console.log('\n== the rules save even when the model never answers ==');
  {
    const engines = require(path.join(OUT, 'core/engines.js'));
    await mem.forgetAll();
    // The model hangs. Before, extractAndSave awaited it and nothing was ever written,
    // even though the rules had already found the facts.
    engines.setEngines({
      llm: { complete: () => new Promise(() => {}) },
      stt: { transcribe: async () => '' },
      speech: { sampleRate: 24000, synthesize: async () => ({ samples: [], sampleRate: 24000 }) },
    });
    const saved = await extract.extractAndSave('my friend Sam is coming and we are going to the cinema today');
    check('facts saved despite the hang', saved.length >= 2, `${saved.length}`);
    check('the name is there', saved.some((s) => /Sam/.test(s.text)), JSON.stringify(saved.map((s) => s.text)));
    check('the plan is there', saved.some((s) => /cinema/.test(s.text)));
    check('and they are in the store', (await mem.records()).length >= 2);
    await mem.forgetAll();
  }

  console.log('\n== a long turn keeps its ending ==');
  {
    const all = (m) => [...extract.fromRules(m), ...extract.fromOwnWords(m)].map((c) => c.text);
    // Three sentences from a phone. Only the first two were stored, and the one that
    // was dropped is the only one naming where he actually went.
    const real = all("Hey, okay, okay, that's okay, but I'm from London currently. "
      + "I'm in London and The last week I went to went out in with my friends. "
      + "I went out to Scotland To visit Edinburgh or Glasgow and many places with my friends with my cool friends");
    check('the last sentence survives', real.some((f) => /Scotland/.test(f)), JSON.stringify(real));
    check('Edinburgh and Glasgow with it', real.some((f) => /Edinburgh|Glasgow/.test(f)));
    check('and the first one too', real.some((f) => /from London/.test(f)));

    // The stacked fillers in front of it are not part of the fact.
    check('stacked fillers are stripped', !real.some((f) => /^Okay, okay/.test(f)),
      JSON.stringify(real.filter((f) => /okay/i.test(f))));

    // "I went to went out in" is speech-to-text repeating itself, and the place rule
    // used to store it as "They went to the went out in."
    check('a verb phrase is not stored as a place',
      !real.some((f) => /went to the went/.test(f)), JSON.stringify(real));
  }

  console.log('\n== every way a person says something about themselves ==');
  {
    const all = (m) => [...extract.fromRules(m), ...extract.fromOwnWords(m)].map((c) => c.text);
    const KEEP = [
      ['simple past', 'I went to the beach yesterday with my brother'],
      ['past continuous', 'I was watching a film when my friend called'],
      ['past perfect', 'I had already finished the report before the meeting'],
      ['present simple', 'I work as a software engineer in Bangalore'],
      ['present continuous', 'I am learning to play the guitar at the moment'],
      ['present perfect', 'I have been feeling much better since I started running'],
      ['future will', 'I will visit my parents next weekend'],
      ['future going to', 'I am going to the dentist tomorrow morning'],
      ['future continuous', 'I will be travelling to Delhi all next week'],
      ['conditional', 'I would move to Chennai if I got that job'],
      ['obligation', 'I have to finish this project before Friday'],
      ['negative', 'I do not eat meat any more'],
      ['possession', 'I have two cats and a very loud dog'],
      ['preference', 'I really hate waking up early in the morning'],
      ['relationship', 'my sister just got engaged to her boyfriend'],
      ['plural we', 'we are moving to a new flat next month'],
      ['emotion with cause', 'I am nervous about the interview on Monday'],
      ['garbled speech', 'Yeah, it went well. I just visited a new place of UKs like historical places'],
    ];
    for (const [label, msg] of KEEP) check(`kept: ${label}`, all(msg).length > 0, msg.slice(0, 40));
    // Grammar, because these are read back to the model as facts.
    check('was becomes were', /They were watching/.test(all('I was watching a film when my friend called')[0] || ''));

    const SKIP = [
      ['a question', 'what should I do today?'],
      ['a greeting', 'hey how are you'],
      ['filler', 'ok'],
      ['a question about her', 'what do you do for work?'],
      ['not about them', 'the weather is nice out there today'],
    ];
    for (const [label, msg] of SKIP) check(`skipped: ${label}`, all(msg).length === 0, JSON.stringify(all(msg)));
  }

  console.log('\n== ordinary past-tense speech is not lost ==');
  {
    const own = (t) => extract.fromOwnWords(t).map((c) => c.text);
    // Two real messages from a phone. Every rule was written for plans and proper
    // nouns, so both matched nothing and a whole conversation saved zero facts.
    const a = own("Yeah, I'm a bit busy for past week, I went out, outing with my friends and I was just in vacation.");
    check('a past-tense turn is kept', a.length >= 1, JSON.stringify(a));
    check('and it is about them', /^They/.test(a[0] || ''), a[0]);
    check('mid-sentence pronouns are lowercase', !/ They\b/.test(a[0] || ''), a[0]);
    const b = own('Yeah, it went well. I just visited a new place of UKs like historical places');
    check('the second one too', b.some((f) => /visited/.test(f)), JSON.stringify(b));

    // And still nothing from what carries nothing.
    check('a question is not kept', extract.fromOwnWords('what should I do today?').length === 0);
    check('a filler word is not kept', extract.fromOwnWords('ok').length === 0);
    check('a greeting is not kept', extract.fromOwnWords('hey how are you').length === 0);
    check('someone else entirely is not kept', extract.fromOwnWords('the weather is nice out there today').length === 0,
      JSON.stringify(extract.fromOwnWords('the weather is nice out there today')));

    // The rules still win when they match, so a named fact stays precise.
    check('rules take precedence when they match',
      extract.fromRules('my friend Sam is coming').some((c) => /friend is called Sam/.test(c.text)));
    check('past-tense places are matched by rule now',
      extract.fromRules('I went to the beach with my brother').some((c) => /went to the beach/.test(c.text)));
  }

  console.log('\n== facts by rule, with no model involved ==');
  {
    const R = extract.fromRules;
    const one = (t) => R(t).map((c) => c.text);
    // The real message from a phone, transcription errors and all.
    check('a name survives bad transcription',
      one('Today I went to gym, I met one of the friend, his name is Sam and we are planning to go to cinema today.')
        .some((f) => /Sam/.test(f)));
    check('and so does the plan',
      one('Today I went to gym, his name is Sam and we are planning to go to cinema today.')
        .some((f) => /cinema/.test(f)));
    check('relations are captured', one('my brother Ram is visiting').some((f) => /brother is called Ram/.test(f)));
    check('the job is captured', one('I work as a teacher').some((f) => /work as a teacher/.test(f)));
    check('their own name is captured', one('my name is Kaushik').some((f) => /name is Kaushik/.test(f)));

    // Nothing invented. This matters more than coverage: a wrong memory is repeated to
    // the user as truth on every later turn.
    check('a question yields nothing', R('what should I do today?').length === 0);
    check('a mood yields nothing', R('I am feeling bored today').length === 0);
    // The bug this replaced: "one of my friend is coming" became "their friend is
    // called coming".
    // The real message from a phone, and the three bugs it exposed: the relation was
    // dropped ("someone in their life"), only the first destination was kept, and the
    // day-word was stripped so the fact outlived the day by a fortnight.
    const real = one('Ok, I am planning to go to cinema today with my old friends, cool friend, '
      + 'his name is John and we gonna have after the cinema we going to dinner to restor.');
    check('the relation is named, not "someone"', real.some((f) => /friend is called John/.test(f)), JSON.stringify(real));
    check('both plans are kept', real.filter((f) => /going to/.test(f)).length >= 2, `${real.length}`);
    check('the day is kept, so it expires tonight', real.some((f) => /cinema today/.test(f)));
    check('a second destination survives',
      one('I am going to the gym and then we going to a restaurant').filter((f) => /going to/.test(f)).length === 2);
    // False positives, which are worse than misses.
    check('a mood is not a destination', R('I am feeling bored').length === 0, JSON.stringify(one('I am feeling bored')));
    check('being tired is not a destination', R('I am tired today').length === 0);

    check('a verb is not mistaken for a name',
      !one('one of my friend is coming to my house').some((f) => /called coming/i.test(f)),
      JSON.stringify(one('one of my friend is coming to my house')));
  }

  console.log('\n== a message is not a question just because it ends in one ==');
  {
    const worth = extract.worthExtracting;
    // The message that broke it on a real phone: every fact in the conversation was in
    // this one, and it was discarded whole for its last six words.
    check('facts followed by a question are kept',
      worth('Today I went to gym, I met a friend, his name is Sam and we are planning to go to cinema today. What do you think about this?'));
    check('a statement then a question is kept',
      worth('My friend John is coming for dinner. Do you think that is a good idea?'));
    check('a plain statement is kept', worth('I work as a teacher.'));
    // And a question with nothing in it still costs no inference.
    check('a bare question is skipped', !worth('what should I do today?'));
    check('a greeting is skipped', !worth('how are you'));
    check('a short ask is skipped', !worth('Can you help me?'));
    check('two words are skipped', !worth('ok then'));
  }

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
