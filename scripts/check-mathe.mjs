// Checks the pure logic of the Mathe minigame (minigames/matheCore.js) and its data: the mode mix, which learning
// items fit sprint and block mode, answer blocks and distractors, fall speed from difficulty and timeFactor, lane
// catching, the keypad model, combo sparkles, the gentle winner and the i18n of the minigame.
// Run: node scripts/check-mathe.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FallingBlocks, KEYPAD_LAYOUT, KeypadModel, MODES, blockSet, blockY, blockable, comboSparkles, distractors, fallMsFor,
  keypadable, laneX, makePlan, modeAt, moveLane, shuffle, sprintable, winnerOf
} from '../minigames/matheCore.js';
import { Tally, playerResult } from '../minigames/minigameCore.js';
import { EngineCore } from '../learning/engineCore.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const data = json('data/minigames.json');
const def = data.minigames.find(m => m.id === 'mathe');
const o = def.options;
const de = json('i18n/de.json');
const en = json('i18n/en.json');
const items = json('data/learning/grade3/mathe.json').items;

// seeded rng so the checks are deterministic
const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---- registry entry ----
assert.equal(def.subject, 'mathe');
assert.ok(def.durationSeconds >= 60 && def.durationSeconds <= 75, '60-75 s');
assert.deepEqual(def.topics, ['mathe']);
assert.equal(def.maxPlayers, 2);
assert.ok(!def.debug, 'a real minigame');
assert.ok(MODES.includes(o.mix.first) || o.mix.first === 'random');
assert.ok(['alternate', 'random', ...MODES].includes(o.mix.strategy));
assert.ok(o.fall.minMs < o.fall.baseMs && o.fall.baseMs < o.fall.maxMs && o.fall.perLevel > 0 && o.fall.perLevel < 0.2);
for (const k of ['title', 'mode.sprint', 'mode.blocks', 'help.sprint', 'help.blocks', 'ok', 'blockHint', 'timeout', 'combo', 'winner', 'tie']) {
  assert.ok(de[`minigame.mathe.${k}`] && en[`minigame.mathe.${k}`], `minigame.mathe.${k} in both languages`);
}
assert.ok(de['minigame.mathe.winner'].includes('{name}') && en['minigame.mathe.winner'].includes('{name}'));

// ---- mode mix ----
{
  const rng = seeded(7);
  const ms = 70000;
  const alt = makePlan({ strategy: 'alternate', first: 'sprint', switchAt: 0.5 }, rng, ms);
  assert.deepEqual([alt.first, alt.second, alt.switchMs], ['sprint', 'blocks', 35000], 'two halves');
  assert.equal(modeAt(alt, 0), 'sprint');
  assert.equal(modeAt(alt, 34999), 'sprint');
  assert.equal(modeAt(alt, 35000), 'blocks');
  assert.equal(makePlan({ strategy: 'alternate', first: 'blocks' }, rng, ms).second, 'sprint', 'both modes appear');
  const firsts = new Set();
  for (let i = 0; i < 40; i++) {
    const p = makePlan({ strategy: 'alternate', first: 'random' }, rng, ms);
    assert.notEqual(p.first, p.second);
    firsts.add(p.first);
  }
  assert.equal(firsts.size, 2, 'random first mode varies per run');
  const modes = new Set();
  for (let i = 0; i < 40; i++) {
    const p = makePlan({ strategy: 'random' }, rng, ms);
    assert.equal(p.first, p.second, 'random: one mode per run');
    modes.add(p.first);
  }
  assert.equal(modes.size, 2);
  const fixed = makePlan({ strategy: 'blocks' }, rng, ms);
  assert.equal(modeAt(fixed, 0), 'blocks');
  assert.equal(modeAt(fixed, ms), 'blocks');
  assert.ok(makePlan({ strategy: 'alternate', first: 'sprint', switchAt: 5 }, rng, ms).switchMs <= ms * 0.9, 'switchAt is clamped');
  const own = makePlan(o.mix, seeded(3), def.durationSeconds * 1000);
  assert.ok(MODES.includes(own.first) && own.switchMs > 0 && own.switchMs < def.durationSeconds * 1000, 'the configured mix is valid');
}

// ---- items per mode (real content) ----
{
  const sprint = items.filter(q => sprintable(q, o.keypadMaxDigits));
  const blocks = items.filter(q => blockable(q, { maxChars: o.blockMaxChars, maxDigits: o.keypadMaxDigits }));
  assert.ok(sprint.length >= items.length - 2, 'nearly every mathe item works in sprint mode');
  assert.ok(blocks.length >= 150, `enough items for blocks (${blocks.length})`);
  for (let d = 1; d <= 5; d++) assert.ok(blocks.some(q => q.difficulty === d), `block items at difficulty ${d}`);
  assert.ok(items.some(q => q.type === 'typed' && keypadable(q)), 'typed items use the keypad');
  assert.ok(!keypadable({ type: 'typed', answers: [{ text: '138,00' }] }), 'a decimal answer cannot be typed on the keypad');
  assert.ok(!keypadable({ type: 'typed', answers: [{ text: '1234567' }] }), 'too many digits');
  assert.ok(!blockable({ type: 'choice', answers: [{ text: '12:00 Uhr' }, { text: 'x' }] }), 'long answers do not fit a block');
  assert.ok(!blockable({ type: 'choice', answers: [{ text: '1' }] }), 'needs at least two blocks');
  for (const q of blocks) {
    const texts = q.answers.map(a => (typeof a.text === 'string' ? a.text : a.text.de));
    const set = blockSet(q, texts, seeded(q.id.length * 31 + q.difficulty));
    assert.ok(set.texts.length >= 2 && set.texts.length <= 4, `${q.id}: 2-4 blocks`);
    assert.equal(new Set(set.texts).size, set.texts.length, `${q.id}: block texts differ`);
    const right = q.type === 'typed' ? q.answers[0].text : q.answers.find(a => a.correct).text;
    assert.equal(set.texts[set.correct], right, `${q.id}: the correct lane holds the right answer`);
  }
}

// ---- regression: a due item that does not fit the mode must not starve the question pick ----
// The engine returns the most overdue repetition item first. MatheGame once asked for `next` 60 times and kept only
// items that fit, so a parked non-blockable item came back every time ("mathe: no blocks question found").
{
  const cfg = json('data/learning.json');
  const reactions = json('data/learning/reactions.json');
  const fits = q => blockable(q, { maxChars: o.blockMaxChars, maxDigits: o.keypadMaxDigits });
  const misfit = items.find(q => !fits(q));
  assert.ok(misfit, 'the real pool has an item that does not fit blocks');
  const stats = { n: 50, level: 3, last: null, items: { [misfit.id]: { s: 1, c: 0, b: 1, d: 10 } } }; // overdue by 40
  const store = { get: () => structuredClone(stats), record() {} };
  const core = new EngineCore({ pools: { mathe: { bothLangs: false, items } }, cfg, reactions, store, rng: seeded(11) });
  assert.equal(core.next('mathe').id, misfit.id, 'the overdue item is returned first (the old failure mode)');
  for (let i = 0; i < 200; i++) assert.ok(fits(core.next('mathe', { filter: fits })), 'the fit filter always yields a fitting question');
}

// ---- distractors and blocks ----
{
  for (let n = 0; n < 400; n += 7) {
    const d = distractors(n, 3, seeded(n + 1));
    assert.equal(d.length, 3, `3 distractors for ${n}`);
    assert.ok(d.every(v => v !== n && v >= 0 && Number.isInteger(v)) && new Set(d).size === 3, `distractors of ${n} are unique, non-negative and wrong`);
  }
  assert.equal(distractors(0, 3).length, 3, 'also for zero');
  const q = { type: 'typed', answers: [{ text: '56' }] };
  const lanes = new Set();
  for (let i = 0; i < 40; i++) {
    const s = blockSet(q, [], seeded(i + 5));
    assert.equal(s.texts.length, 4);
    assert.equal(s.texts[s.correct], '56');
    lanes.add(s.correct);
  }
  assert.ok(lanes.size > 1, 'the right block is not always in the same lane');
  const list = [1, 2, 3, 4, 5, 6];
  assert.deepEqual([...shuffle([...list], seeded(9))].sort(), list, 'shuffle keeps the elements');
}

// ---- fall speed follows difficulty and timeFactor ----
{
  const f = o.fall;
  const at = (target, timeFactor) => fallMsFor(f, { target, timeFactor });
  assert.equal(at(1, 1), f.baseMs);
  assert.ok(at(5, 1) < at(3, 1) && at(3, 1) < at(1, 1), 'harder questions fall faster');
  assert.ok(at(3, 1.5) > at(3, 1) && at(3, 1) > at(3, 0.85), 'a struggling child (timeFactor > 1) gets slower blocks, a strong one faster');
  for (let t = 1; t <= 5; t += 0.5) for (const tf of [0.5, 0.85, 1, 1.5, 2.5]) assert.ok(at(t, tf) >= f.minMs && at(t, tf) <= f.maxMs, 'within the limits');
  assert.equal(fallMsFor(f, undefined), fallMsFor(f, { target: 3, timeFactor: 1 }), 'a missing meta uses the defaults');
  assert.ok(at(3, 1.5) >= 1.4 * at(3, 1) || at(3, 1.5) === f.maxMs, 'struggling children get clearly more time');
}

// ---- falling blocks and catching ----
{
  const fall = new FallingBlocks();
  assert.equal(fall.catchLane(0), null, 'nothing to catch before a question');
  fall.start(1000, 4, 2);
  assert.equal(fall.progress, 0);
  assert.equal(fall.tick(250), null);
  assert.equal(fall.progress, 0.25);
  assert.equal(fall.catchLane(4), null, 'no such lane');
  assert.equal(fall.catchLane(-1), null);
  assert.deepEqual(fall.catchLane(2), { lane: 2, ok: true });
  assert.equal(fall.state, 'caught');
  assert.equal(fall.catchLane(2), null, 'one catch per question');
  assert.equal(fall.tick(5000), null, 'a caught question never lands');
  fall.start(1000, 4, 1);
  assert.deepEqual(fall.catchLane(3), { lane: 3, ok: false }, 'a wrong block is reported, not punished here');
  fall.start(1000, 3, 0);
  assert.equal(fall.tick(900), null);
  assert.equal(fall.tick(200), 'landed');
  assert.equal(fall.progress, 1);
  assert.equal(fall.tick(100), null, 'landed only once');
  assert.equal(fall.catchLane(0), null, 'landed blocks cannot be caught');
  assert.equal(moveLane(0, -1, 4), 0);
  assert.equal(moveLane(3, 1, 4), 3);
  assert.equal(moveLane(1, 1, 4), 2);
  assert.equal(laneX(0, 400, 0, 4), 50);
  assert.equal(laneX(0, 400, 3, 4), 350);
  assert.equal(blockY(0, 10, 110), 10);
  assert.equal(blockY(0.5, 10, 110), 60);
  assert.equal(blockY(2, 10, 110), 110, 'clamped at the ground');
}

// ---- keypad ----
{
  const k = new KeypadModel(3);
  assert.equal(k.key, '1');
  k.move(1, 0);
  assert.equal(k.key, '2');
  k.move(0, 1);
  assert.equal(k.key, '7');
  k.move(0, 1);
  assert.ok(KEYPAD_LAYOUT[2].includes(k.key), 'the short last row keeps the horizontal position');
  assert.equal(k.key, 'back');
  k.move(1, 0);
  assert.equal(k.key, 'hint');
  k.move(1, 0);
  assert.equal(k.key, 'ok');
  k.move(1, 0);
  assert.equal(k.key, 'back', 'columns wrap');
  k.move(0, 1);
  assert.equal(k.key, '1', 'rows wrap');
  assert.equal(k.press('ok'), null, 'ok needs a digit');
  k.press('4');
  k.press('2');
  assert.equal(k.text, '42');
  k.press('0');
  k.press('9');
  assert.equal(k.text, '420', 'limited to maxDigits');
  k.press('back');
  assert.equal(k.text, '42');
  assert.equal(k.press('hint'), 'hint');
  assert.equal(k.press('ok'), 'submit');
  k.reset();
  k.press('0');
  k.press('5');
  assert.equal(k.text, '5', 'no leading zero');
  k.reset();
  assert.equal(k.text, '');
}

// ---- cosmetics and scoring ----
{
  const c = o.combo;
  assert.equal(comboSparkles(1, c), c.sparkleBase);
  assert.ok(comboSparkles(4, c) > comboSparkles(2, c));
  assert.equal(comboSparkles(500, c), c.sparkleMax, 'capped');
  const t = (...r) => { const x = new Tally(); r.forEach(ok => x.record(ok, 1000, 0, 'mathe')); return x; };
  assert.equal(winnerOf([t(true, true), t(true)]), 0);
  assert.equal(winnerOf([t(true), t(true, true, true)]), 1);
  assert.equal(winnerOf([t(true), t(true)]), -1, 'a tie');
  assert.equal(winnerOf([t(false), t(false)]), -1, 'nobody right is a tie, nobody is crowned');
  // both modes count the same way: correct over max(attempted, expected), effort = attempted share
  const opts = { expected: def.expectedQuestions, quit: false, quitEffortCap: data.settings.quitEffortCap };
  const r = playerResult(t(true, true, true, false, true, true, true, true, true, true), opts);
  assert.equal(r.score, 0.9);
  assert.equal(r.effort, 1);
  assert.equal(playerResult(t(true, false, true, true), opts).effort, 0.44, 'a short round shows its effort');
}

console.log('check-mathe: ok');
