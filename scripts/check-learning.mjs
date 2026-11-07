// Checks the learning engine without Phaser (learning/engineCore.js, learning/LearningEngine.js, data/learning*):
// simulated weak, average and strong learners (400 answers each) must end in the 70-90% band with the
// difficulty trending the right way, wrong items must return inside their interval, nothing repeats back to back,
// runs are deterministic with a seeded RNG, stats persist in the state store and through a save slot.
// Run: node scripts/check-learning.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { EngineCore, mulberry32 } from '../learning/engineCore.js';
import { LearningEngine } from '../learning/LearningEngine.js';
import { GameState } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = json('data/learning.json');
const stateCfg = { ...json('data/state.json'), startMoneyCents: 0 };
const reactions = json('data/learning/reactions.json');
const index = json('data/learning/index.json');
const files = index.topics.map(t => json(`data/learning/${t.grade}/${t.topic}.json`));
const topic = 'mathe'; // single-topic scenarios; the learner simulation runs on every topic below
const pools = Object.fromEntries(files.map(f => [f.topic, { bothLangs: !!f.bothLangs, items: f.items }]));

const memoryStore = () => {
  const m = new Map();
  return { m, get: (p, t) => m.get(`${p}:${t}`), record: (p, t, s) => m.set(`${p}:${t}`, s) };
};
const makeCore = (seed, store = memoryStore(), extra = {}) => new EngineCore({ pools, cfg, reactions, store, rng: mulberry32(seed), ...extra });

// ---- content wiring (the content itself is validated by check-learning-content.mjs) ----
{
  assert.deepEqual(Object.keys(pools), ['mathe', 'deutsch', 'englisch', 'sachkunde', 'science'], 'index lists the real Klasse 3 topics');
  assert.deepEqual(Object.keys(pools).filter(t => pools[t].bothLangs), ['englisch'], 'only the English topic shows both languages');
  const de = json('i18n/de.json'), en = json('i18n/en.json');
  for (const key of Object.values(reactions).flat()) assert.ok(de[key] && en[key], `reaction key ${key} exists in both languages`);
}

// ---- simulated learners ----
// P(correct) falls with the item's difficulty; hints and extra time help a little, and an item that was wrong before
// (and explained) is remembered better next time, like it is for a real kid.
const learners = {
  weak: d => 0.9 - 0.15 * (d - 1), // 45% at difficulty 4
  average: d => 0.9 - 0.1 * (d - 1),
  strong: d => 0.97 - 0.06 * (d - 1)
};
const LESSON = 400;

function simulate(kind, seed, topic = 'mathe') {
  const core = makeCore(seed);
  const rng = mulberry32(seed * 7919 + 1);
  const log = [];
  const memory = {};
  for (let i = 0; i < LESSON; i++) {
    const q = core.next(topic);
    const bonus = (q.meta.hintsAllowed > 0 ? 0.03 : 0) + 0.06 * (q.meta.timeFactor - 1) + (memory[q.id] ?? 0);
    const ok = rng() < Math.min(0.99, learners[kind](q.difficulty) + bonus);
    memory[q.id] = ok ? (memory[q.id] ?? 0) / 2 : 0.15;
    const ms = q.meta.expectedMs * (0.7 + 0.6 * rng());
    const stats = core.answer(q, ok, ms);
    log.push({ id: q.id, ok, due: q.meta.due, level: stats.level, box: stats.items[q.id].b });
  }
  return { core, log, stats: core.stats(0, topic) };
}
const meanOf = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
for (const topic of Object.keys(pools)) {
  const SEEDS = [1, 2, 3, 4, 5];
  const runs = {};
  for (const kind of Object.keys(learners)) {
    runs[kind] = SEEDS.map(seed => simulate(kind, seed, topic));
    for (const { stats, log } of runs[kind]) {
      assert.equal(stats.n, LESSON);
      const tail = meanOf(log.slice(-200), e => (e.ok ? 1 : 0));
      assert.ok(stats.acc >= 0.7 && stats.acc <= 0.92, `${topic} ${kind}: rolling accuracy ${stats.acc.toFixed(3)} in 0.70-0.92`); // the moving average is noisy by a couple of points
      assert.ok(tail >= 0.7 && tail <= 0.9, `${topic} ${kind}: accuracy of the last 200 answers ${tail.toFixed(3)} in 0.70-0.90`);
    }
    const lv = meanOf(runs[kind], r => r.stats.level);
    console.log(`${topic} ${kind}: level ${lv.toFixed(2)}, rolling accuracy ${meanOf(runs[kind], r => r.stats.acc).toFixed(3)}`);
  }
  {
    const lvl = k => meanOf(runs[k], r => r.stats.level);
    assert.ok(lvl('weak') < cfg.startLevel + 0.1, 'weak learner settles at or below the start level (simulation noise 0.1)');
    assert.ok(lvl('strong') > cfg.startLevel, 'strong learner ends above the start level');
    assert.ok(lvl('weak') < lvl('average') && lvl('average') < lvl('strong'), 'levels order weak < average < strong');
  }

  // ---- repetition and no back-to-back ----
  {
    const intervals = cfg.intervals;
    let checked = 0, worst = 0;
    for (const kind of Object.keys(learners)) {
      for (const { log } of runs[kind]) {
        for (let i = 1; i < log.length; i++) assert.notEqual(log[i].id, log[i - 1].id, `${topic} ${kind}: no item twice in a row`);
        for (let i = 0; i < log.length; i++) {
          const e = log[i];
          if (e.box === 0) continue;
          const j = log.findIndex((x, k) => k > i && x.id === e.id);
          if (j < 0) continue;
          const between = j - i - 1, iv = intervals[e.box - 1];
          checked++;
          assert.ok(between >= iv, `${topic} ${kind}: ${e.id} came back after ${between} questions, before its interval ${iv}`);
          worst = Math.max(worst, between - iv);
          assert.ok(between <= iv + 4 * cfg.maxOverdue, `${topic} ${kind}: ${e.id} came back late (${between} vs interval ${iv})`);
        }
      }
    }
    assert.ok(checked > 200, 'enough repetitions were observed');
    console.log(`repetitions checked: ${checked}, latest return ${worst} questions after the interval`);
  }
}

// ---- Leitner boxes by hand ----
{
  const store = memoryStore();
  const core = makeCore(11, store);
  const q = core.next(topic);
  core.answer(q, false, 1000);
  assert.deepEqual(store.get(0, topic).items[q.id], { s: 1, c: 0, b: 1, d: 1 + cfg.intervals[0] });
  // the item stays out of next() until it is due, then comes back and moves up a box
  const seen = [];
  for (let i = 0; i < cfg.intervals[0]; i++) { const n = core.next(topic); seen.push(n.id); core.answer(n, true, 1000); }
  assert.ok(!seen.includes(q.id), 'parked item is not asked before its interval');
  assert.equal(core.due(0, { topic }).length, 1);
  assert.equal(core.due(0, { topic })[0].id, q.id);
  const again = core.next(topic, { context: 'bully' });
  assert.equal(again.id, q.id, 'bully context asks due items first');
  assert.equal(again.meta.due, true);
  core.answer(again, true, 1000);
  const it = store.get(0, topic).items[q.id];
  assert.equal(it.b, 2);
  assert.equal(it.d, store.get(0, topic).n + cfg.intervals[1]);
  assert.equal(core.due(0, { topic }).length, 0);
}

// ---- determinism ----
{
  const a = simulate('average', 42), b = simulate('average', 42), c = simulate('average', 43);
  assert.deepEqual(a.log, b.log, 'same seed, same run');
  assert.deepEqual(a.stats, b.stats);
  assert.notDeepEqual(a.log.map(e => e.id), c.log.map(e => e.id), 'another seed differs');
}

// ---- support, parent modifier, fast answers ----
{
  const struggling = makeCore(5);
  for (let i = 0; i < 12; i++) struggling.answer(struggling.next(topic), false, 5000);
  const q = struggling.next(topic);
  assert.equal(q.meta.tier, 'struggling');
  assert.equal(q.meta.timeFactor, cfg.support.struggling.timeFactor);
  assert.equal(q.meta.hintsAllowed, q.hints.length, 'struggling kids may use every hint');
  assert.equal(struggling.stats(0, topic).level, cfg.levelMin, 'level bottoms out');

  const strong = makeCore(5);
  for (let i = 0; i < 12; i++) strong.answer(strong.next(topic), true, 500);
  const s = strong.next(topic);
  assert.equal(s.meta.tier, 'strong');
  assert.equal(s.meta.hintsAllowed, 0);
  assert.ok(s.meta.timeFactor < 1);

  let parent = 1;
  const p = makeCore(5, memoryStore(), { parentDifficulty: () => parent });
  const base = p.next(topic).meta;
  parent = 1.25;
  const hard = p.next(topic).meta;
  assert.ok(hard.target > base.target && hard.timeFactor < base.timeFactor, 'parent difficulty above 1 raises the target and trims time');
  parent = 99;
  assert.ok(p.next(topic).meta.target <= cfg.levelMax, 'parent modifier is clamped');

  const slowCore = makeCore(9), fastCore = makeCore(9);
  for (let i = 0; i < 6; i++) { slowCore.answer(slowCore.next(topic), true, 99999); fastCore.answer(fastCore.next(topic), true, 1); }
  assert.ok(fastCore.stats(0, topic).level > slowCore.stats(0, topic).level, 'fast correct answers ramp the level faster');
}

// ---- presentation helpers ----
{
  const core = makeCore(3);
  const q = core.next(topic);
  const de = core.localize(q, 'de'), en = core.localize(q, 'en');
  assert.equal(de.q, q.q.de);
  assert.equal(en.q, q.q.en);
  const both = new EngineCore({ pools: { eng: { bothLangs: true, items: [{ id: 'e1', topic: 'eng', type: 'typed', difficulty: 1, q: { de: 'Wie heißt "Hund"?', en: 'What is "dog" in German?' }, answers: [{ text: 'Hund' }], explain: { de: 'Hund ist dog.', en: 'Hund means dog.' }, hints: [] }] } }, cfg, reactions, store: memoryStore() });
  const bq = both.next('eng');
  assert.equal(bq.meta.bothLangs, true);
  assert.equal(both.localize(bq, 'de').q, 'Wie heißt "Hund"?\nWhat is "dog" in German?');
  assert.equal(both.localize(bq, 'en').q, 'What is "dog" in German?\nWie heißt "Hund"?');
  assert.equal(both.isCorrect(bq, ' hund '), true);

  const choice = pools[topic].items.find(i => i.type === 'choice');
  const ci = choice.answers.findIndex(a => a.correct);
  assert.equal(core.isCorrect(choice, ci), true);
  assert.equal(core.isCorrect(choice, (ci + 1) % choice.answers.length), false);
  const typed = pools[topic].items.find(i => i.type === 'typed');
  assert.equal(core.isCorrect(typed, typed.answers[0].text), true);
  assert.equal(core.isCorrect(typed, '-1'), false);

  const wrong = core.feedback(q, false, 0);
  assert.deepEqual([wrong.kind, wrong.showExplain, wrong.explain], ['wrong', true, q.explain]);
  assert.ok(reactions.wrong.includes(wrong.reaction));
  assert.equal(core.feedback(q, true, 1).kind, 'correct');
  assert.equal(core.feedback(q, true, cfg.streakAt).kind, 'streak');
  assert.equal(core.feedback(q, true, cfg.streakAt).showExplain, false);
  assert.equal(core.next('no-such-topic'), null);
  assert.equal(core.answer({ id: 'nope', topic }, true, 1), null);
}

// ---- item types: choice, typed, match, sort travel through next() intact and are judged by isCorrect ----
{
  const core = makeCore(21);
  const items = type => Object.values(pools).flatMap(p => p.items).filter(i => i.type === type);
  for (const type of ['choice', 'typed', 'match', 'sort']) assert.ok(items(type).length >= 3, `content has ${type} items`);

  // next() hands out every type unchanged apart from `meta`
  for (const [topic, type] of [['sachkunde', 'match'], ['science', 'sort'], ['englisch', 'match'], ['englisch', 'typed']]) {
    const seen = new Set();
    for (let i = 0; i < 400 && !seen.has(type); i++) {
      const q = core.next(topic);
      if (q.type === type) {
        const { meta, ...item } = q;
        assert.deepEqual(item, pools[topic].items.find(x => x.id === q.id), `${type} item ${q.id} is served intact`);
        assert.equal(meta.topic, topic);
        assert.ok(meta.expectedMs > 0 && Number.isFinite(meta.expectedMs), `${type} has an expected time`);
        seen.add(type);
      }
      core.answer(q, true, 3000);
    }
    assert.ok(seen.has(type), `${topic} served a ${type} item`);
  }

  // match: one choice per left side (index of the right side or its text); every pair must be right
  const match = { type: 'match', pairs: [{ left: 'a', right: { de: 'Eins', en: 'One' } }, { left: 'b', right: { de: 'Zwei', en: 'Two' } }, { left: 'c', right: 'Drei' }] };
  assert.equal(core.isCorrect(match, [0, 1, 2]), true);
  assert.equal(core.isCorrect(match, ['eins', ' Zwei ', 'drei']), true, 'texts match case-insensitively');
  assert.equal(core.isCorrect(match, [0, 2, 1]), false, 'a swapped pair is wrong');
  assert.equal(core.isCorrect(match, [0, 1]), false, 'missing pairs are wrong');
  assert.equal(core.isCorrect(match, undefined), false);
  for (const m of items('match')) assert.equal(core.isCorrect(m, m.pairs.map((_, i) => i)), true, `${m.id} solves with the identity assignment`);

  // sort: one category id per sortItem (array or object keyed by index); every assignment must be right
  const sort = { type: 'sort', categories: [{ id: 'x' }, { id: 'y' }], sortItems: [{ text: 'p', category: 'x' }, { text: 'q', category: 'y' }, { text: 'r', category: 'x' }, { text: 's', category: 'y' }] };
  assert.equal(core.isCorrect(sort, ['x', 'y', 'x', 'y']), true);
  assert.equal(core.isCorrect(sort, { 0: 'x', 1: 'y', 2: 'x', 3: 'y' }), true);
  assert.equal(core.isCorrect(sort, ['x', 'y', 'y', 'y']), false, 'one wrong assignment fails');
  assert.equal(core.isCorrect(sort, ['x', 'y']), false);
  for (const s of items('sort')) assert.equal(core.isCorrect(s, s.sortItems.map(x => x.category)), true, `${s.id} solves with its own categories`);
  assert.equal(core.isCorrect({ type: 'unknown' }, 0), false);

  // choice and typed keep working for the new topics (circuit puzzles are plain choice items)
  const circuit = pools.science.items.find(i => i.circuit);
  assert.equal(circuit.type, 'choice');
  assert.equal(core.isCorrect(circuit, circuit.answers.findIndex(a => a.correct)), true);
  const spelling = pools.englisch.items.find(i => i.type === 'typed' && i.answers.length > 1);
  assert.equal(core.isCorrect(spelling, `  ${spelling.answers[1].text.toUpperCase()} `), true, 'typed English ignores case and spaces');

  // localize keeps match and sort data; bothLangs shows both languages
  const sk = pools.sachkunde.items.find(i => i.type === 'sort');
  const lz = core.localize({ ...sk, meta: { bothLangs: false } }, 'en');
  assert.equal(lz.categories.length, sk.categories.length);
  assert.equal(lz.sortItems.length, sk.sortItems.length);
  assert.equal(lz.sortItems[0].category, sk.sortItems[0].category);
  assert.deepEqual(lz.answers, []);
  const en = pools.englisch.items.find(i => i.type === 'match');
  const lb = core.localize({ ...en, meta: { bothLangs: true } }, 'de');
  assert.equal(lb.pairs.length, en.pairs.length);
  assert.ok(lb.q === `${en.q.de}\n${en.q.en}`,'English questions show German first, then English');
}

// ---- state integration: only through learning.record, persistence through a save slot ----
{
  const events = new EventEmitter();
  const changed = [];
  events.on('state:changed', e => changed.push(e));
  const answered = [];
  events.on('learning:answered', e => answered.push(e));
  const state = new GameState(events, stateCfg);
  const engine = new LearningEngine({ state, events, i18n: { lang: 'de' } }, cfg, files, reactions);
  const q = engine.next(topic, { player: 0 });
  const fb = engine.answer(q, false, 2000, { player: 0 });
  assert.equal(fb.kind, 'wrong');
  assert.deepEqual(changed.at(-1).path, `players.0.learning.${topic}`);
  assert.equal(changed.at(-1).action, 'learning.record');
  assert.equal(answered.length, 1);
  assert.equal(state.players[0].learning[topic].n, 1);
  assert.throws(() => { state.players[0].learning[topic].n = 5; }, TypeError, 'stats are frozen');
  for (let i = 0; i < 30; i++) { const n = engine.next(topic); engine.answer(n, i % 4 !== 0, 3000, { player: 0 }); }
  const before = JSON.stringify(state.players[0].learning);
  const storage = { m: new Map(), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, String(v)); }, removeItem(k) { this.m.delete(k); } };
  const saves = new SaveSlots(state, events, storage);
  assert.ok(saves.save(1));
  const state2 = new GameState(new EventEmitter(), stateCfg);
  const saves2 = new SaveSlots(state2, new EventEmitter(), storage);
  assert.ok(saves2.load(1));
  assert.equal(JSON.stringify(state2.players[0].learning), before, 'stats survive save and load');
  const engine2 = new LearningEngine({ state: state2, events: new EventEmitter(), i18n: { lang: 'de' } }, cfg, files, reactions);
  assert.equal(engine2.stats(0, topic).n, 31, 'the loaded engine continues from the saved stats');
  assert.ok(engine2.next(topic).id !== state2.players[0].learning[topic].last, 'and does not repeat the last item');
  // player 2 has its own stats; a bad payload is rejected
  state.dispatch('coop.set', { on: true });
  engine.answer(engine.next(topic, { player: 1 }), true, 1000, { player: 1 });
  assert.equal(state.players[1].learning[topic].n, 1);
  assert.equal(state.players[0].learning[topic].n, 31);
  const warn = console.warn; console.warn = () => {};
  assert.equal(state.dispatch('learning.record', { player: 0, topic, stats: { n: 'x' } }), false);
  console.warn = warn;
  // saves without stats (older saves) work
  assert.equal(makeCore(1).next(topic, { player: 7 }).topic, topic);
}

// ---- next(): the optional item filter ----
{
  const core = makeCore(11);
  const tagsOf = q => q.tags;
  for (let i = 0; i < 60; i++) {
    const q = core.next('deutsch', { filter: 'artikel' });
    assert.ok(tagsOf(q).includes('artikel'), 'a tag name keeps only items with that tag');
    core.answer(q, i % 3 !== 0, 2000);
  }
  const spell = ['rechtschreibung', 'mehrzahl'];
  for (let i = 0; i < 60; i++) {
    const q = core.next('deutsch', { filter: spell, player: 1 });
    assert.ok(tagsOf(q).some(t => spell.includes(t)), 'an array keeps items with any of the tags');
    core.answer(q, i % 2 === 0, 2000, { player: 1 });
  }
  assert.ok(core.next('deutsch', { filter: i => i.type === 'typed' }).type === 'typed', 'a function is a predicate');
  assert.equal(core.next('deutsch', { filter: 'no-such-tag' }), null, 'no match gives null');
  assert.equal(core.next('deutsch', { filter: [] }), null, 'an empty tag list matches nothing');
  assert.ok(core.next('deutsch', {}).id, 'no filter still picks from the whole topic');
  // repetition: a wrong filtered item returns through the filter only when it matches
  const c2 = makeCore(5);
  const wrong = c2.next('deutsch', { filter: 'artikel' });
  c2.answer(wrong, false, 1000);
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const q = c2.next('deutsch', { filter: 'gegenteile', context: 'lesson' });
    assert.ok(q.tags.includes('gegenteile') && q.id !== wrong.id, 'due items outside the filter are not pulled in');
    seen.add(q.id);
    c2.answer(q, true, 1000);
  }
  assert.ok(seen.size > 5);
  assert.equal(core.next('mathe', { filter: 'einmaleins' }).tags[0], 'einmaleins', 'works for every topic');
}

console.log('check-learning: ok');
