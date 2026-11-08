// The Zeugnis (story 8.6): only the grades of the year that ended count, both promotion outcomes are produced from real
// grade ledgers, a repeated year is a bonus lap with the comeback bonus paid exactly once, nothing is punishing, and the texts
// exist in both languages. Pure logic: the real Grades module and GameState with a fake context; the screens and the flow after
// bedtime are covered by the smoke scenario `zeugnis`.
// Run: node scripts/check-zeugnis.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState } from '../state/GameState.js';
import { Grades } from '../grading/Grades.js';
import { yearLedger } from '../grading/gradeCore.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const dicts = { de: load('i18n/de.json'), en: load('i18n/en.json') };
const grading = load('data/grading.json');
const kopfnoten = load('data/kopfnoten.json');
const comments = load('data/teacher-comments.json');
const parents = load('data/parent-reactions.json');
const base = load('data/state.json');

function setup(players = 2) {
  const events = new EventEmitter();
  const state = new GameState(events, { ...base, players, startMoneyCents: 1000 });
  const ctx = { state, events, i18n: { lang: 'en' }, t: k => k };
  const log = [];
  events.on('zeugnis:done', e => log.push(e));
  return { grades: new Grades(ctx, { grading, kopfnoten, comments, parents }, dicts), state, log };
}
const give = (grades, player, day, list) => list.forEach(([subject, grade], i) => grades.record(player, { subject, score: Math.max(0, 1 - (grade - 1) * 0.18), grade, lessonId: `l-${day}-${i}`, day }));
const GOOD = [['mathe', 1], ['deutsch', 2], ['englisch', 2], ['sachkunde', 3], ['science', 1], ['sport', 2]];
const BAD = [['mathe', 5], ['deutsch', 5], ['englisch', 5], ['sachkunde', 4], ['science', 4]];

// ---- the year ledger: only that day's grades
let { grades, state, log } = setup();
give(grades, 0, 1, BAD);
give(grades, 0, 2, GOOD);
assert.equal(yearLedger(state.players[0].grades, 1).entries.length, BAD.length, 'year 1 holds only year 1');
assert.deepEqual(grades.yearCard(0, 2, 'en').zeugnis, { mathe: 1, deutsch: 2, englisch: 2, sachkunde: 3, science: 1, sport: 2 }, 'year 2 does not remember the bad grades of year 1');
assert.ok(grades.yearCard(0, 2, 'en').promotion.promoted && !grades.yearCard(0, 1, 'en').promotion.promoted, 'the same kid: promoted in year 2, not in year 1');

// ---- promoted: settled once, class 4 reached, no bonus
let card = grades.settleYear(0, 2, 'en');
assert.ok(card.applied && card.promotion.promoted && card.promotion.comebackBonus === null);
assert.equal(state.shared.flags.klasse4, true, 'class 4 is reached');
assert.equal(state.shared.flags['zeugnis.2.0'], 'promoted');
assert.equal(state.shared.money, 1000, 'promotion pays no comeback bonus');
assert.ok(!grades.settleYear(0, 2, 'en').applied, 'a year is settled once');
assert.deepEqual(log, [{ player: 0, day: 2, promoted: true }]);
assert.ok(card.teacherComment.length > 10 && card.parentLine.length > 10 && card.teacherComment !== 'teacher.comment.01', 'a real comment and parent line');

// ---- repeat: a bonus lap with the comeback bonus, once; the other kid is not touched
({ grades, state, log } = setup());
give(grades, 0, 1, BAD);
give(grades, 1, 1, GOOD);
const xp0 = state.players[0].xp;
card = grades.settleYear(0, 1, 'en');
assert.ok(!card.promotion.promoted && card.applied, 'bad grades repeat the year');
assert.deepEqual(card.promotion.comebackBonus, grading.promotion.comebackBonus, 'with the comeback bonus from the data');
assert.equal(state.players[0].xp, xp0 + grading.promotion.comebackBonus.xp, 'xp for the bonus lap');
assert.equal(state.shared.money, 1000 + grading.promotion.comebackBonus.moneyCents, 'and pocket money');
assert.equal(state.shared.flags[`perk.${grading.promotion.comebackBonus.perk}.0`], true, 'and the perk');
assert.ok(!state.shared.flags.klasse4, 'not promoted: class 4 not reached');
assert.ok(!grades.settleYear(0, 1, 'en').applied && state.shared.money === 1500 && state.players[0].xp === xp0 + 150, 'the bonus is paid exactly once');
const sibling = grades.settleYear(1, 1, 'en');
assert.ok(sibling.promotion.promoted && sibling.applied && !state.shared.flags[`perk.${grading.promotion.comebackBonus.perk}.1`], 'each kid has their own Zeugnis and consequence');
assert.equal(state.shared.flags.klasse4, true, 'the family reached class 4 with the promoted kid');
assert.equal(log.length, 2);

// ---- no lessons at all: not promoted yet, no bonus either, the reason is a friendly line
({ grades, state } = setup(1));
card = grades.settleYear(0, 3, 'en');
assert.ok(!card.promotion.promoted && card.promotion.comebackBonus === null && card.promotion.reasons[0] === 'grades.reason.noGrades');
assert.equal(state.shared.money, 1000, 'no bonus for a year without lessons');

// ---- three fives repeat even with a good average; two do not
({ grades } = setup(1));
give(grades, 0, 4, [['mathe', 1], ['deutsch', 1], ['englisch', 1], ['sachkunde', 5], ['science', 5], ['sport', 5]]);
assert.ok(!grades.yearCard(0, 4, 'en').promotion.promoted, 'three fives repeat');
({ grades } = setup(1));
give(grades, 0, 4, [['mathe', 1], ['deutsch', 1], ['englisch', 1], ['sachkunde', 5], ['science', 5]]);
assert.ok(grades.yearCard(0, 4, 'en').promotion.promoted, 'two fives with a good average do not');

// ---- actions refuse nonsense
({ grades, state } = setup(1));
assert.ok(!state.dispatch('zeugnis.apply', { player: 5, day: 1, promoted: true }) && !state.dispatch('zeugnis.apply', { player: 0, day: 0, promoted: true }) && !state.dispatch('zeugnis.apply', { player: 0, day: 1, promoted: 'yes' }));
assert.ok(!state.dispatch('zeugnis.apply', { player: 0, day: 1, promoted: false, bonus: { xp: -5, moneyCents: 0 } }) && !state.shared.flags['zeugnis.1.0'], 'a rejected bonus leaves no trace');

// ---- texts: every subject a lesson can be graded in has a name, repeating is never put as failing
const minigames = load('data/minigames.json').minigames.filter(m => !m.debug);
for (const l of ['de', 'en']) {
  for (const m of minigames) assert.ok(dicts[l][`grades.subject.${m.subject}`], `${l}: subject name ${m.subject}`);
  for (const k of ['zeugnis.title', 'zeugnis.owner', 'zeugnis.average', 'zeugnis.conduct', 'zeugnis.noGrades', 'zeugnis.teacher', 'zeugnis.parents', 'zeugnis.promoted', 'zeugnis.repeat', 'zeugnis.bonus', 'zeugnis.page', 'zeugnis.next', 'zeugnis.continue', 'zeugnis.end.title', 'zeugnis.end.body', 'grades.perk.extraHints', 'grades.reason.average', 'grades.reason.fives', 'grades.reason.noGrades', 'grades.reason.promoted']) assert.ok(dicts[l][k], `${l}: ${k}`);
  const shaming = /durchgefallen|versagt|dumm|faul|schande|peinlich|failed|failure|stupid|lazy|shame|embarrass/i;
  for (const k of [...Object.keys(dicts[l]).filter(k => k.startsWith('parent.repeat.')), 'zeugnis.repeat', 'zeugnis.bonus', 'grades.reason.average', 'grades.reason.fives', 'grades.reason.noGrades']) assert.ok(!shaming.test(dicts[l][k]), `${l}: ${k} must be encouraging`);
}
assert.ok(parents.repeat.length >= 8 && parents.promoted.length >= 8, 'plenty of parent lines for both outcomes');

console.log('zeugnis ok: year ledgers, promotion and repeat from real grades, comeback bonus once, own Zeugnis per kid, encouraging texts');
