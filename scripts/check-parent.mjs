// Parent settings (story 11.4): the gate questions (always beyond a class 3 mental sum, four different answers, the right one among
// them), the gate rules (a wrong answer keeps it shut, lockouts grow, a right answer during a lockout does not open it), the play-time
// reminder maths, the chase switch and the texts. Pure logic; the screens and the saved settings in the running game are covered by the
// smoke scenario `parent`.
// Run: node scripts/check-parent.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Gate, difficultyId, difficultyValue, dueReminders, makeQuestion, validateParent } from '../services/parentLogic.js';
import { PlayTime } from '../services/PlayTime.js';
import { ChaseLevel } from '../ai/ChaseLevel.js';
import { mulberry32 } from '../learning/engineCore.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/parent.json');
const learning = load('data/learning.json');
const chase = load('data/chase.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };

// ---- data and texts
assert.deepEqual(validateParent(cfg, learning.parentRange), [], validateParent(cfg, learning.parentRange).join('\n'));
for (const l of ['de', 'en']) {
  for (const k of ['pause.parent', 'parent.gate.title', 'parent.gate.intro', 'parent.gate.question', 'parent.gate.wrong', 'parent.gate.locked', 'parent.gate.nav', 'parent.title', 'parent.hint', 'parent.difficulty', 'parent.chases', 'parent.on', 'parent.off', 'parent.reminder', 'parent.minutes', 'parent.back', 'parent.reminder.title', 'parent.reminder.body']) assert.ok(i18n[l][k], `${l}: ${k}`);
  for (const d of cfg.difficulties) assert.ok(i18n[l][`parent.difficulty.${d.id}`], `${l}: ${d.id}`);
  assert.ok(!/muss|zwingen|must stop|forbidden|verboten/i.test(i18n[l]['parent.reminder.body']), `${l}: the break reminder asks, it does not order`);
}

// ---- questions
for (let seed = 1; seed <= 400; seed++) {
  const q = makeQuestion(cfg.gate, mulberry32(seed));
  assert.equal(q.answer, q.a * q.b + q.c);
  assert.equal(q.options.length, 4);
  assert.equal(new Set(q.options).size, 4, 'four different answers');
  assert.equal(q.options[q.correct], q.answer, 'the right answer is among them at the marked place');
  assert.ok(q.options.every(o => Number.isInteger(o) && o > 0));
  assert.ok(q.a * q.b >= 36 && q.answer >= 47, 'beyond a class 3 mental sum');
}
const positions = new Set(Array.from({ length: 60 }, (_, i) => makeQuestion(cfg.gate, mulberry32(i + 1)).correct));
assert.equal(positions.size, 4, 'the right answer is not always in the same place');

// ---- the gate
let gate = new Gate(cfg.gate, mulberry32(5));
const wrongIndex = () => (gate.question.correct + 1) % 4;
assert.equal(gate.answer(wrongIndex(), 100), 'wrong', 'a wrong answer keeps the gate shut');
assert.ok(gate.locked(105) && gate.secondsLeft(105) === 10, 'for a while');
const q1 = gate.question;
assert.equal(gate.answer(gate.question.correct, 105), 'locked', 'the right answer during the lockout does not open it');
assert.equal(gate.question, q1, 'and nothing changes during it');
assert.ok(!gate.locked(100 + cfg.gate.lockoutSeconds));
assert.equal(gate.answer(wrongIndex(), 200), 'wrong');
assert.equal(gate.answer(wrongIndex(), 300), 'wrong', 'the third wrong in a row');
assert.ok(gate.secondsLeft(300) === cfg.gate.longLockoutSeconds, 'locks for longer');
assert.equal(gate.answer(gate.question.correct, 300 + cfg.gate.longLockoutSeconds), 'open', 'after the lockout the right answer opens it');
assert.equal(gate.wrong, 0, 'and forgives the earlier mistakes');
// a kid guessing at random almost never gets in within a few tries
let inside = 0;
for (let seed = 1; seed <= 300; seed++) {
  const g = new Gate(cfg.gate, mulberry32(seed));
  const r = mulberry32(seed * 7);
  let t = 0;
  for (let tries = 0; tries < 6; tries++) { t += 1; if (g.answer(Math.floor(r() * 4), t) === 'open') { inside++; break; } t += cfg.gate.longLockoutSeconds; }
}
assert.ok(inside < 300 * 0.9, 'guessing is not a reliable way in');
// with the lockouts, one minute of trying lets a guesser try only a few times
let tries = 0;
const g2 = new Gate(cfg.gate, mulberry32(9));
for (let t = 0; t < 60; t++) { if (!g2.locked(t)) { tries++; g2.answer((g2.question.correct + 1) % 4, t); } }
assert.ok(tries <= 4, `the lockouts limit guessing to ${tries} tries a minute`);

// ---- play-time reminder
assert.equal(dueReminders(5000, 0, 0), 0, 'off means off');
assert.equal(dueReminders(1199, 20, 0), 0);
assert.equal(dueReminders(1200, 20, 0), 1, 'after the interval');
assert.equal(dueReminders(2500, 20, 1), 1, 'one more after the second interval');
assert.equal(dueReminders(2500, 20, 2), 0, 'each interval only once');
const shown = [];
const ctx = { frozen: false, events: { emit: () => {} }, state: { shared: { flags: { playReminder: 20 } } } };
const pt = new PlayTime(ctx, m => shown.push(m));
for (let i = 0; i < 1199; i++) pt.update(1);
assert.equal(shown.length, 0);
pt.update(1);
assert.deepEqual(shown, [20], 'the reminder comes after 20 minutes of play');
ctx.frozen = true;
for (let i = 0; i < 5000; i++) pt.update(1);
assert.equal(shown.length, 1, 'time under a frozen screen does not count');
ctx.frozen = false;
for (let i = 0; i < 1200; i++) pt.update(1);
assert.deepEqual(shown, [20, 40], 'and it repeats after the same time');
ctx.state.shared.flags.playReminder = 60;
pt.reset();
for (let i = 0; i < 100; i++) pt.update(1);
assert.equal(shown.length, 2, 'a new setting does not fire at once');

// ---- the settings: the values, the chase switch
assert.equal(difficultyValue(cfg, 'harder'), 1.2);
assert.equal(difficultyId(cfg, 0.8), 'easier');
assert.equal(difficultyId(cfg, 1), 'normal');
const lvl = new ChaseLevel(chase.level, true, () => {});
lvl.set(1, 'bump');
assert.equal(lvl.level, 1);
lvl.clear('parent'); // what ChaseDirector.setChasesEnabled does first: the end of a chase going on
assert.equal(lvl.level, 0, 'a chase going on is ended');
lvl.enabled = false;
lvl.set(2, 'bump');
assert.equal(lvl.level, 0, 'switched off: no new trouble is raised');
lvl.set(1, 'turf');
assert.equal(lvl.level, 0, 'chases stay off');

console.log('parent ok: gate questions beyond class 3 with 4 answers, lockouts that stop guessing, reminders per interval, chase switch');
