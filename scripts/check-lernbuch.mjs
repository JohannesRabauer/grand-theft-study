// The Lernbuch (story 10.5): the bars, medals and badges computed from the real learning engine's saved stats after scripted play, the
// thresholds in the data, and the texts. Pure logic with the real EngineCore and the real question pools; the screen in the running game
// is covered by the smoke scenario `lernbuch`.
// Run: node scripts/check-lernbuch.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EngineCore, mulberry32 } from '../learning/engineCore.js';
import { barColor, bookOf, progressOf } from '../learning/lernbuch.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/lernbuch.json');
const index = load('data/learning/index.json');
const learningCfg = load('data/learning.json');
const reactions = load('data/learning/reactions.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };

// ---- data and texts
assert.deepEqual(cfg.medals.map(m => m.id), ['gold', 'silver', 'bronze'], 'best medal first');
assert.ok(cfg.medals.every((m, i) => i === 0 || (m.answered < cfg.medals[i - 1].answered && m.accuracy < cfg.medals[i - 1].accuracy)), 'each medal is easier than the one above');
assert.ok(cfg.barColors.at(-1).min === 0 && cfg.barColors.every((c, i) => i === 0 || c.min < cfg.barColors[i - 1].min), 'bar colours cover every accuracy');
for (const l of ['de', 'en']) {
  for (const k of ['pause.lernbuch', 'lernbuch.title', 'lernbuch.owner', 'lernbuch.info', 'lernbuch.medal.gold', 'lernbuch.medal.silver', 'lernbuch.medal.bronze', 'lernbuch.total', 'lernbuch.empty', 'lernbuch.legend', 'lernbuch.nav']) assert.ok(i18n[l][k], `${l}: ${k}`);
  for (const t of index.topics) assert.ok(i18n[l][`grades.subject.${t.topic}`], `${l}: a name for ${t.topic}`);
  for (const k of ['lernbuch.title', 'lernbuch.empty', 'lernbuch.legend']) assert.ok(!/durchgefallen|versagt|dumm|failed|stupid/i.test(i18n[l][k]), `${l}: ${k} is encouraging`);
}

// ---- scripted play with the real engine
const files = index.topics.map(t => load(`data/learning/${t.grade}/${t.topic}.json`));
const pools = Object.fromEntries(files.map(f => [f.topic, { grade: f.grade, bothLangs: !!f.bothLangs, items: f.items }]));
const mem = {};
const core = new EngineCore({
  pools, cfg: learningCfg, reactions, rng: mulberry32(11),
  store: { get: (p, t) => mem[`${p}:${t}`], record: (p, t, s) => { mem[`${p}:${t}`] = s; return true; } }
});
const play = (topic, player, pattern) => { for (const ok of pattern) core.answer(core.next(topic, { player }), ok, 4000, { player }); };
const pattern = (n, rightEvery) => Array.from({ length: n }, (_, i) => (i + 1) % rightEvery !== 0); // a wrong answer every `rightEvery`th

play('mathe', 0, pattern(50, 10)); // 45 right, 5 wrong
let book = bookOf(core.topics(), t => core.stats(0, t), t => pools[t].items.length, cfg);
let mathe = book.rows.find(r => r.topic === 'mathe');
assert.equal(mathe.answered, 50);
assert.ok(Math.abs(mathe.accuracy - 0.9) < 1e-9, 'the bar is the real accuracy: 45 of 50');
assert.equal(mathe.medal, 'silver', 'enough answers and accuracy for silver, not yet gold (60 answers needed)');
play('mathe', 0, Array(20).fill(true));
mathe = bookOf(core.topics(), t => core.stats(0, t), t => pools[t].items.length, cfg).rows.find(r => r.topic === 'mathe');
assert.equal(mathe.answered, 70);
assert.ok(Math.abs(mathe.accuracy - 65 / 70) < 1e-9);
assert.equal(mathe.medal, 'gold', '70 answers at 93 percent: gold');
assert.ok(mathe.badges.streak, 'a run of 20 right answers earns the streak badge');
assert.ok(mathe.learned > 0 && mathe.pool === pools.mathe.items.length && mathe.seen >= mathe.learned, 'learned and seen counts come from the repetition data');

play('deutsch', 0, [true, false, true, false, true, false, true, false, true, false, true, false]); // 6 of 12
play('englisch', 0, [true, true, false, true, true, false, true, true, false, true]); // 7 of 10
book = bookOf(core.topics(), t => core.stats(0, t), t => pools[t].items.length, cfg);
const by = t => book.rows.find(r => r.topic === t);
assert.equal(by('deutsch').medal, null, '50 percent is no medal yet, and nothing is taken away for it');
assert.ok(Math.abs(by('deutsch').accuracy - 0.5) < 1e-9 && by('deutsch').answered === 12);
assert.equal(by('englisch').medal, 'bronze', '10 answers at 70 percent: bronze');
assert.equal(by('sachkunde').answered, 0);
assert.equal(by('sachkunde').accuracy, 0, 'a topic never played is an empty bar');
assert.equal(by('sachkunde').medal, null);
assert.ok(!by('sachkunde').badges.streak && !by('sachkunde').badges.learner);
assert.equal(book.answered, 92);
assert.ok(Math.abs(book.accuracy - (65 + 6 + 7) / 92) < 1e-9, 'the total is over all subjects');
assert.equal(book.medals, 2);

// the other kid has their own book
const other = bookOf(core.topics(), t => core.stats(1, t), t => pools[t].items.length, cfg);
assert.equal(other.answered, 0, 'each kid has their own stats');

// a wrong answer lowers the bar a little, never below what is true
play('englisch', 0, [false]);
assert.ok(Math.abs(progressOf(core.stats(0, 'englisch'), 10, cfg).accuracy - 7 / 11) < 1e-9);
assert.equal(progressOf(core.stats(0, 'englisch'), 10, cfg).medal, 'bronze', '7 of 11 is still 64 percent: bronze stays');
play('englisch', 0, [false, false]);
assert.equal(progressOf(core.stats(0, 'englisch'), 10, cfg).medal, null, 'the medal follows the real accuracy: 7 of 13 is 54 percent, below bronze');
assert.ok(progressOf(undefined, 0, cfg).accuracy === 0 && progressOf(undefined, 0, cfg).answered === 0, 'missing stats are an empty topic');

// ---- bar colours from the accuracy
assert.equal(barColor(0.95, cfg), cfg.barColors[0].color);
assert.equal(barColor(0.72, cfg), cfg.barColors[1].color);
assert.equal(barColor(0.55, cfg), cfg.barColors[2].color);
assert.equal(barColor(0.1, cfg), cfg.barColors[3].color);

console.log('lernbuch ok: bars from real accuracy, bronze/silver/gold from the data, streak and learner badges, empty topics, own book per kid');
