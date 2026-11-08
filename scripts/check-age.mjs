// Difficulty by age (story 11.7): the age map against the real characters (Lorenz 8, Kilian 10, Helena 12), the family's pick per kid
// independent of the character, the product with the parent difficulty inside the allowed range, and that the age only scales the
// challenge - it never touches a kid's learning stats. Pure logic; the saved flags and the settings rows run in the smoke scenario `age`.
// Run: node scripts/check-age.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EngineCore } from '../learning/engineCore.js';
import { ageFactor, ageFlag, difficultyAge, playerFactor, validateAgeMap } from '../services/ageLogic.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/learning.json');
const chars = Object.fromEntries(load('data/characters.json').characters.map(c => [c.id, c]));
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };
const map = cfg.ageMap;

assert.deepEqual(validateAgeMap(map, cfg.parentRange), [], validateAgeMap(map, cfg.parentRange).join('\n'));
for (const l of ['de', 'en']) for (const k of ['parent.age.p1', 'parent.age.p2', 'parent.age.auto', 'parent.age.years', 'parent.age.explain']) assert.ok(i18n[l][k], `${l}: ${k}`);

// ---- the three characters' defaults
assert.equal(ageFactor(map, chars.lorenz.age), 0.9, 'Lorenz (8) gets the gentler default');
assert.equal(ageFactor(map, chars.kilian.age), 1.0, 'Kilian (10) the standard');
assert.equal(ageFactor(map, chars.helena.age), 1.1, 'Helena (12) the stronger');
assert.equal(ageFactor(map, undefined), 1, 'no age: no change');
for (let a = 6; a < 18; a++) assert.ok(ageFactor(map, a) >= ageFactor(map, a - 1) || a === 6, 'older never means easier');
assert.ok(map.choices.every(a => ageFactor(map, a) > 0), 'every choice has a factor');

// ---- the family's pick is independent of the character and per kid
assert.equal(difficultyAge(map, {}, 0, 12), 12, 'default: the character age');
assert.equal(difficultyAge(map, { [ageFlag(0)]: 8 }, 0, 12), 8, 'an explicit age beats the character');
assert.equal(difficultyAge(map, { [ageFlag(0)]: 8 }, 1, 10), 10, 'the other kid is not touched');
assert.equal(difficultyAge(map, { [ageFlag(0)]: 99 }, 0, 12), 12, 'a value that is not a choice is ignored');
assert.equal(difficultyAge(map, {}, 0, undefined), null);
assert.equal(playerFactor(map, { [ageFlag(1)]: 12 }, 1, 8), 1.1, 'Lorenz played as 12: the 12-year challenge');
assert.equal(playerFactor(map, {}, 1, 8), 0.9);

// ---- inside the engine: per kid, times the parent difficulty, clamped, and the stats stay the kid's own
const pools = { mathe: { bothLangs: false, items: [1, 2, 3, 4, 5].map(d => ({ id: `m${d}`, topic: 'mathe', type: 'choice', difficulty: d, q: { de: 'q', en: 'q' }, answers: [{ text: 'a', correct: true }, { text: 'b' }] })) } };
const stored = {};
let parent = 1;
const flags = {};
const ages = [chars.helena.age, chars.lorenz.age];
const core = new EngineCore({
  pools, cfg, reactions: { correct: [], wrong: [], streak: [] },
  store: { get: (p, t) => stored[`${p}.${t}`], record: (p, t, s) => { stored[`${p}.${t}`] = s; } },
  parentDifficulty: () => parent,
  playerDifficulty: p => playerFactor(map, flags, p, ages[p]),
  startOffset: () => 0
});
const q0 = core.next('mathe', { player: 0 });
const q1 = core.next('mathe', { player: 1 });
assert.ok(Math.abs(core.pd(0) - 1.1) < 1e-9 && Math.abs(core.pd(1) - 0.9) < 1e-9, 'mixed co-op: each kid has their own factor');
assert.ok(q0.meta.timeFactor < q1.meta.timeFactor, 'the older challenge gives less time');
assert.ok(q0.meta.target > q1.meta.target, 'and aims higher');
flags[ageFlag(1)] = 12;
assert.ok(Math.abs(core.pd(1) - 1.1) < 1e-9, 'the pick takes effect at once');
parent = 1.5;
assert.equal(core.pd(0), cfg.parentRange[1], 'parent times age is clamped to the parent range');
parent = 0.5;
assert.equal(core.pd(1), cfg.parentRange[0] > 0.5 * 1.1 ? cfg.parentRange[0] : 0.55, 'and at the low end');
parent = 1;
const before = JSON.stringify(core.stats(0, 'mathe'));
core.pd(0); flags[ageFlag(0)] = 7; core.pd(0);
assert.equal(JSON.stringify(core.stats(0, 'mathe')), before, 'changing the age never rewrites the learning stats');
core.answer(q0, true, 2000, { player: 0 });
core.answer(q1, false, 9000, { player: 1 });
assert.ok(core.stats(0, 'mathe').n === 1 && core.stats(1, 'mathe').n === 1, 'answers keep adapting each kid');
const level = core.stats(0, 'mathe').level;
flags[ageFlag(0)] = 12;
assert.equal(core.stats(0, 'mathe').level, level, 'a new age does not move the earned level');

console.log('age ok: Lorenz 0.9, Kilian 1.0, Helena 1.1, own pick per kid, parent product clamped, stats untouched');
