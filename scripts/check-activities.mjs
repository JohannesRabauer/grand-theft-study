// Question activities (story 9.2): the data against the real question pools, the daily limit, the reward maths and the texts.
// The screens and the paid rewards in the running game are covered by the smoke scenario `activities`.
// Run: node scripts/check-activities.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fastTargets, knownStop, stopKey } from '../services/commuteLogic.js';
import { activityIds, choreIds, pocketMoney, canPlay, dayKey, fits, questionsIn, reward, stagesOf, timesToday, validateActivities } from '../services/activityLogic.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/activities.json');
const pools = { science: load('data/learning/grade3/science.json'), sachkunde: load('data/learning/grade3/sachkunde.json'), mathe: load('data/learning/grade3/mathe.json'), deutsch: load('data/learning/grade3/deutsch.json'), englisch: load('data/learning/grade3/englisch.json') };
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };

// ---- data
assert.deepEqual(validateActivities(cfg, pools), [], validateActivities(cfg, pools).join('\n'));
assert.equal(questionsIn(stagesOf(cfg, 'pfand')), 4);
assert.equal(questionsIn(stagesOf(cfg, 'bakery', 'de')), 6);
assert.equal(questionsIn(stagesOf(cfg, 'bakery', 'en')), 6);
assert.ok(stagesOf(cfg, 'bakery', 'en')[0].topic === 'englisch' && stagesOf(cfg, 'bakery', 'de')[0].topic === 'deutsch', 'the bakery orders in the language chosen');
const mp = load('data/maps/town.json').objects.filter(o => o.type === 'pfand-machine');
assert.ok(mp.length >= 1, 'the town has a Pfand machine');
const town = load('data/maps/town.json');
assert.ok(town.objects.some(o => o.type === 'newsstand'), 'the town has a newsstand');
assert.ok(town.objects.filter(o => o.type === 'sign' && o.board).length >= 3, 'the town has English signs to scan');

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
assert.ok(canPlay(cfg, {}, 'scan', 1, 0, 'a') && !canPlay(cfg, { 'scan.a.0': true }, 'scan', 9, 0, 'a') && canPlay(cfg, { 'scan.a.0': true }, 'scan', 9, 0, 'b') && canPlay(cfg, { 'scan.a.0': true }, 'scan', 9, 1, 'a'), 'a sign is scanned once per kid, on any day');
assert.ok(canPlay(cfg, flags, 'pfand', 3, 1) && canPlay(cfg, flags, 'pfand', 4, 0) && canPlay(cfg, flags, 'bakery', 3, 0), 'other kid, other day, other activity');

// ---- rewards
assert.deepEqual(reward(cfg, 'pfand', 'de', 4, 4), { cents: 150, xp: 16 });
assert.deepEqual(reward(cfg, 'pfand', 'de', 3, 4), { cents: 75, xp: 12 });
assert.deepEqual(reward(cfg, 'pfand', 'de', 0, 4), { cents: 0, xp: 0 });
assert.deepEqual(reward(cfg, 'scan', 'de', 1, 1), { cents: 25, xp: 6 });
assert.deepEqual(reward(cfg, 'route', 'de', 5, 5), { cents: 210, xp: 25 });
assert.deepEqual(reward(cfg, 'bakery', 'de', 6, 6), { cents: 160, xp: 24 });
assert.deepEqual(reward(cfg, 'bakery', 'en', 6, 6), { cents: 240, xp: 24 });
for (const [id, v, total] of [['pfand', 'de', 4], ['bakery', 'de', 6], ['bakery', 'en', 6]]) {
  for (let c = 0; c <= total; c++) assert.equal(reward(cfg, id, v, c, total).cents % 5, 0, 'cents are whole 5s');
  assert.ok(reward(cfg, id, v, total, total).cents <= 300, 'a run never pays more than three euros');
  assert.ok(reward(cfg, id, v, 1, total).cents > reward(cfg, id, v, 0, total).cents, 'a right answer pays');
}
assert.ok(reward(cfg, 'bakery', 'en', 3, 6).cents > reward(cfg, 'bakery', 'de', 3, 6).cents, 'English pays better');

// ---- the tram map: home and school are known, others by quiz, the line partner first
const tram = load('data/commute.json').tram;
const ids = ['home-tram-stop', 'school-tram-stop', 'riverside-tram-stop', 'market-tram-stop'];
assert.ok(knownStop(tram, {}, 'home-tram-stop') && !knownStop(tram, {}, 'riverside-tram-stop') && knownStop(tram, { [stopKey('riverside-tram-stop')]: true }, 'riverside-tram-stop'));
assert.deepEqual(fastTargets(tram, {}, ids, 'home-tram-stop'), ['school-tram-stop']);
assert.deepEqual(fastTargets(tram, { [stopKey('riverside-tram-stop')]: true }, ids, 'home-tram-stop'), ['school-tram-stop', 'riverside-tram-stop']);
assert.deepEqual(fastTargets(tram, { [stopKey('riverside-tram-stop')]: true, [stopKey('market-tram-stop')]: true }, ids, 'riverside-tram-stop'), ['market-tram-stop', 'home-tram-stop', 'school-tram-stop']);
for (const l of ['de', 'en']) for (const id of ids) assert.ok(i18n[l][`tram.stop.${id}`], `${l}: stop name ${id}`);

// ---- chores and the Familienfrieden
assert.equal(choreIds(cfg).length, 6, 'six chores');
assert.equal(pocketMoney(cfg, 6), 300, 'all chores done: the full pocket money');
assert.equal(pocketMoney(cfg, 5), 260);
assert.equal(pocketMoney(cfg, 0), 100, 'never below the minimum');
for (let n = 1; n <= 6; n++) assert.ok(pocketMoney(cfg, n) >= pocketMoney(cfg, n - 1), 'every chore helps');
assert.ok(load('data/maps/home.json').objects.some(o => o.type === 'chore-board'), 'the home has a chore board');

// ---- texts
for (const l of ['de', 'en']) {
  for (const id of activityIds(cfg)) {
    assert.ok(i18n[l][`activity.${id}.title`], `${l}: ${id} title`);
    for (const v of cfg[id].variants ? Object.keys(cfg[id].variants) : [null]) for (const st of stagesOf(cfg, id, v ?? 'de')) assert.ok(i18n[l][`activity.stage.${st.kind}`], `${l}: stage ${st.kind}`);
    if (cfg[id].variants) for (const k of ['intro', 'german', 'english', 'bonus']) assert.ok(i18n[l][`activity.${id}.${k}`], `${l}: ${id}.${k}`);
  }
  for (const k of ['chores.pocket', 'chores.done', 'chores.nav', 'activity.chore.prompt', 'activity.chores.title']) assert.ok(i18n[l][k], `${l}: ${k}`);
  for (const id of ['scan', 'route']) assert.ok(i18n[l][`activity.${id}.prompt`] && i18n[l][`activity.stage.${id}`], `${l}: ${id} texts`);
  for (const k of ['activity.limit', 'activity.pfand.prompt', 'activity.bakery.intro', 'activity.bakery.german', 'activity.bakery.english', 'activity.bakery.bonus', 'activity.stage.count', 'activity.stage.order', 'activity.stage.pay', 'activity.progress', 'activity.right', 'activity.wrong', 'activity.done', 'activity.reward', 'activity.nav.ask', 'activity.nav.next', 'activity.nav.close', 'shop.practice']) assert.ok(i18n[l][k], `${l}: ${k}`);
}
console.log(`activities ok: pfand and bakery (${questionsIn(stagesOf(cfg, 'bakery', 'de'))} questions), daily limit, rewards, texts`);
