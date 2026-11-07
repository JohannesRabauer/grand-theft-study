import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { SchoolDay, compileTimetable } from '../services/SchoolDay.js';
import { DayClock } from '../services/DayClock.js';
import { GameState } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';
import { Grades } from '../grading/Grades.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = json('data/timetable.json');
const defs = json('data/minigames.json').minigames;
const kopfnoten = json('data/kopfnoten.json');
const dicts = { de: json('i18n/de.json'), en: json('i18n/en.json') };
function setup(coop = false) {
  const events = new EventEmitter();
  const state = new GameState(events, { ...json('data/state.json'), kopfnoten });
  if (coop) state.dispatch('coop.set', { on: true });
  const storage = new Map();
  const saves = new SaveSlots(state, events, { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k) ?? null });
  saves.startNew(1);
  if (coop) state.dispatch('coop.set', { on: true });
  const ctx = { state, saves, events, i18n: { lang: 'de' }, world: { id: 'school' },
    players: Array.from({ length: coop ? 2 : 1 }, (_, index) => ({ index })) };
  ctx.day = new DayClock(ctx, json('data/day.json'));
  ctx.day.start();
  ctx.grades = new Grades(ctx, { grading: json('data/grading.json'), kopfnoten,
    comments: json('data/teacher-comments.json'), parents: json('data/parent-reactions.json') }, dicts);
  const calls = [];
  ctx.minigames = { active: null, start: async (id, opts) => {
    calls.push({ id, ...opts });
    return { difficulty: 3, quit: false, perPlayer: opts.players.map(player => ({
      player, score: player === 0 ? 0.95 : 0.3, effort: 0.5
    })) };
  } };
  return { ctx, school: new SchoolDay(ctx, cfg, defs), calls };
}

const { ctx, school, calls } = setup(true);
const compiled = school.days;
assert.equal(compiled.length, 5);
assert.deepEqual(compiled.map(d => d.lessons.length), [5, 4, 6, 5, 4]);
assert.deepEqual([...new Set(compiled.flatMap(d => d.lessons.map(l => l.minigame)))].sort(),
  ['mathe', 'deutsch', 'englisch', 'erdkunde', 'science', 'musik', 'kunst', 'sport'].sort());
for (const lang of Object.values(dicts)) for (const day of compiled) assert.ok(lang[day.name]);
const phase = ctx.day.cfg.phases.find(p => p.id === 'school');
assert.throws(() => compileTimetable({ days: [] }, defs, phase), /needs days/);
for (const change of [
  d => d.days[0].lessons.pop(), d => d.days[0].lessons[0].minigame = 'quiz-demo',
  d => d.days[0].lessons[1].start = '08:10', d => d.days[0].lessons[0].start = '07:00'
]) {
  const bad = structuredClone(cfg);
  change(bad);
  if (bad.days[0].lessons.length === 4) bad.days[0].lessons.pop();
  assert.throws(() => compileTimetable(bad, defs, phase));
}

// Every day launches precisely its 4-6 registered games and saves independent grades, once per lesson.
for (let day = 1; day <= 6; day++) {
  const schedule = school.schedule();
  assert.equal(schedule.lessons[0].day, day);
  const before = calls.length;
  let n = 0;
  while (school.canAttend()) {
    const lesson = school.next();
    await school.attend();
    n++;
    for (const i of [0, 1]) {
      const record = school.recordFor(lesson, i);
      assert.equal(record.subject, lesson.subject);
      assert.equal(record.day, day);
      assert.equal(record.lessonId, lesson.id);
      assert.equal(record.grade, i === 0 ? 1 : 5);
    }
    assert.equal(ctx.saves.load(1), true);
    assert.equal(school.recordFor(lesson, 0).lessonId, lesson.id, 'attendance survives save and load');
  }
  assert.equal(n, schedule.lessons.length);
  assert.equal(ctx.day.phase, 'afternoon');
  assert.equal(ctx.day.time, '13:15');
  assert.deepEqual(calls.slice(before).map(c => c.id), schedule.lessons.map(l => l.minigame));
  assert.ok(calls.slice(before).every(c => c.context === 'lesson' && c.players.join() === '0,1'));
  await assert.rejects(school.attend(), /no lesson/);
  ctx.day.advance('test-evening');
  ctx.day.advance('test-next-day');
}

const solo = setup();
const lesson = solo.school.next();
let release;
solo.ctx.minigames.start = () => new Promise(resolve => { release = resolve; });
const running = solo.school.attend();
assert.equal(solo.ctx.day.phase, 'school', 'attending advances morning and commute through the clock');
assert.equal(solo.school.running, true);
await assert.rejects(solo.school.attend(), /no lesson/);
release({ quit: true });
await running;
assert.equal(solo.school.next().id, lesson.id, 'quit can be retried without a grade');
assert.equal(solo.ctx.state.players[0].grades.entries.length, 0);
assert.equal(solo.school.running, false);

solo.ctx.minigames.start = async () => { throw new Error('test start failure'); };
await assert.rejects(solo.school.attend(), /test start failure/);
assert.equal(solo.school.running, false, 'failed starts are not stuck running');
solo.ctx.world.id = 'town';
assert.equal(solo.school.canAttend(), false);
solo.ctx.world.id = 'school';
solo.ctx.day.skipTo(500, 'test-late');
assert.throws(() => solo.ctx.day.skipTo(480, 'test-backwards'), /forward time/);
assert.throws(() => solo.ctx.day.skipTo(795, 'test-boundary'), /current phase/);
const started = solo.ctx.day.snapshot();
solo.ctx.frozen = true;
solo.ctx.day.update(100);
assert.deepEqual(solo.ctx.day.snapshot(), started, 'overlays still freeze time');
solo.ctx.minigames.start = () => new Promise(resolve => { release = resolve; });
const abort = solo.school.attend();
solo.school.closed = true;
release({ quit: false, perPlayer: [{ player: 0, score: 1, effort: 1 }], difficulty: 3 });
await abort;
assert.equal(solo.ctx.state.players[0].grades.entries.length, 0, 'shutdown cannot grade an interrupted lesson');
console.log('school checks passed: 4-6 lessons, all subjects, solo/co-op, grades, saves, retry, shutdown and clock');
