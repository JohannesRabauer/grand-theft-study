// Question activities (story 9.2): the data against the real question pools, the daily limit, the reward maths and the texts.
// The screens and the paid rewards in the running game are covered by the smoke scenario `activities`.
// Run: node scripts/check-activities.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canPlay, dayKey, fits, questionsIn, reward, stagesOf, timesToday, validateActivities } from '../services/activityLogic.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/activities.json');
const pools = { mathe: load('data/learning/grade3/mathe.json'), deutsch: load('data/learning/grade3/deutsch.json'), englisch: load('data/learning/grade3/englisch.json') };
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };

// ---- data
assert.deepEqual(validateActivities(cfg, pools), [], validateActivities(cfg, pools).join('\n'));
assert.equal(questionsIn(stagesOf(cfg, 'pfand')), 4);
assert.equal(questionsIn(stagesOf(cfg, 'bakery', 'de')), 6);
assert.equal(questionsIn(stagesOf(cfg, 'bakery', 'en')), 6);
assert.ok(stagesOf(cfg, 'bakery', 'en')[0].topic === 'englisch' && stagesOf(cfg, 'bakery', 'de')[0].topic === 'deutsch', 'the bakery orders in the language chosen');
const mp = load('data/maps/town.json').objects.filter(o => o.type === 'pfand-machine');
assert.ok(mp.length >= 1, 'the town has a Pfand machine');

// ---- stages are copies (the screen may not change the data)
stagesOf(cfg, 'pfand')[0].n = 99;
assert.equal(cfg.pfand.stages[0].n, 4);

// ---- the stage filter: choice questions of the tag only
const f = fits({ tag: 'geld' });
assert.ok(f({ type: 'choice', tags: ['geld'] }) && !f({ type: 'choice', tags: ['uhr'] }) && !f({ type: 'input', tags: ['geld'] }) && !f({ type: 'choice' }));
assert.ok(fits({})({ type: 'choice' }));

// ---- the daily limit is per activity, day and kid
const flags = {};
assert.ok(canPlay(cfg, flags, 'pfand', 3, 0));
flags[dayKey('pfand', 3, 0)] = 1;
assert.equal(timesToday(flags, 'pfand', 3, 0), 1);
assert.ok(canPlay(cfg, flags, 'pfand', 3, 0));
flags[dayKey('pfand', 3, 0)] = 2;
assert.ok(!canPlay(cfg, flags, 'pfand', 3, 0), 'two runs a day are enough');
assert.ok(canPlay(cfg, flags, 'pfand', 3, 1) && canPlay(cfg, flags, 'pfand', 4, 0) && canPlay(cfg, flags, 'bakery', 3, 0), 'other kid, other day, other activity');

// ---- rewards
assert.deepEqual(reward(cfg, 'pfand', 'de', 4, 4), { cents: 150, xp: 16 });
assert.deepEqual(reward(cfg, 'pfand', 'de', 3, 4), { cents: 75, xp: 12 });
assert.deepEqual(reward(cfg, 'pfand', 'de', 0, 4), { cents: 0, xp: 0 });
assert.deepEqual(reward(cfg, 'bakery', 'de', 6, 6), { cents: 160, xp: 24 });
assert.deepEqual(reward(cfg, 'bakery', 'en', 6, 6), { cents: 240, xp: 24 });
for (const [id, v, total] of [['pfand', 'de', 4], ['bakery', 'de', 6], ['bakery', 'en', 6]]) {
  for (let c = 0; c <= total; c++) assert.equal(reward(cfg, id, v, c, total).cents % 5, 0, 'cents are whole 5s');
  assert.ok(reward(cfg, id, v, total, total).cents <= 300, 'a run never pays more than three euros');
  assert.ok(reward(cfg, id, v, 1, total).cents > reward(cfg, id, v, 0, total).cents, 'a right answer pays');
}
assert.ok(reward(cfg, 'bakery', 'en', 3, 6).cents > reward(cfg, 'bakery', 'de', 3, 6).cents, 'English pays better');

// ---- texts
for (const l of ['de', 'en']) {
  for (const id of ['pfand', 'bakery']) assert.ok(i18n[l][`activity.${id}.title`], `${l}: ${id} title`);
  for (const k of ['activity.limit', 'activity.pfand.prompt', 'activity.bakery.intro', 'activity.bakery.german', 'activity.bakery.english', 'activity.bakery.bonus', 'activity.stage.count', 'activity.stage.order', 'activity.stage.pay', 'activity.progress', 'activity.right', 'activity.wrong', 'activity.done', 'activity.reward', 'activity.nav.ask', 'activity.nav.next', 'activity.nav.close', 'shop.practice']) assert.ok(i18n[l][k], `${l}: ${k}`);
}
console.log(`activities ok: pfand and bakery (${questionsIn(stagesOf(cfg, 'bakery', 'de'))} questions), daily limit, rewards, texts`);
