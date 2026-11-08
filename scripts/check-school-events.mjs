// Surprise events in the school day (story 8.4): the schedule, the homework check against a forgotten item, the
// substitute teacher, and the texts. Pure logic with a fake context; the lesson flow in the running game is covered by the
// smoke scenario `schoolEvents`.
// Run: node scripts/check-school-events.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SchoolEvents, forgotHomework, schedule } from '../services/schoolEvents.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/school-events.json');
const morning = load('data/morning.json');
const timetable = load('data/timetable.json');
const kopfnoten = load('data/kopfnoten.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };

// ---- data
assert.ok(morning.items.some(i => i.id === cfg.homeworkCheck.item), 'the homework check names a real supply item');
assert.ok(morning.always.includes(cfg.homeworkCheck.item), 'homework is always needed, so the check always has something to check');
for (const l of ['de', 'en']) {
  for (const k of ['school.notice.events', 'school.event.homework.ok', 'school.event.homework.forgot', 'school.event.substitute', 'school.popquiz.notice']) assert.ok(i18n[l][k], `${l}: ${k}`);
  for (const n of cfg.substitute.names) for (const part of ['name', 'quirk']) assert.ok(i18n[l][`school.sub.${n}.${part}`], `${l}: school.sub.${n}.${part}`);
}
assert.ok(kopfnoten.events.some(e => e.event === 'homework:forgotten' && e.delta < 0) && kopfnoten.events.some(e => e.event === 'homework:done' && e.delta > 0), 'the check feeds the Ordnung Kopfnote both ways');

// ---- the schedule: the same every time, every event happens on some days, within the timetable
const counts = day => timetable.days[(day - 1) % timetable.days.length].lessons.length;
let quiz = 0, sub = 0, both = 0, none = 0;
for (let day = 1; day <= 80; day++) {
  const n = counts(day);
  const a = schedule(cfg, day, n);
  assert.deepEqual(a, schedule(cfg, day, n), 'a day always has the same surprises');
  if (a.popQuiz >= 0) { quiz++; assert.ok(a.popQuiz >= cfg.popQuiz.fromLesson && a.popQuiz < n, `day ${day}: the quiz is a later lesson that exists`); }
  if (a.substitute >= 0) { sub++; assert.ok(a.substitute < n && cfg.substitute.names.includes(a.substituteName), `day ${day}: a real substitute`); } else assert.equal(a.substituteName, null);
  if (a.popQuiz >= 0 && a.substitute >= 0) both++;
  if (a.popQuiz < 0 && a.substitute < 0) none++;
}
assert.ok(quiz > 25 && quiz < 70, `pop quizzes on ${quiz} of 80 days`);
assert.ok(sub > 10 && sub < 50, `a substitute on ${sub} of 80 days`);
assert.ok(both > 0 && none > 0, 'some days have both, some none');
assert.equal(new Set(Array.from({ length: 80 }, (_, i) => schedule(cfg, i + 1, 5).substituteName).values()).size > 1, true, 'the substitutes vary');

// ---- homework check against what the kid packed
assert.ok(forgotHomework({ day: 3, missing: ['homework'] }, 3, 'homework'));
assert.ok(!forgotHomework({ day: 3, missing: ['pencil-case'] }, 3, 'homework'), 'another forgotten item is not the homework');
assert.ok(!forgotHomework({ day: 2, missing: ['homework'] }, 3, 'homework'), 'yesterday\'s packing says nothing about today');
assert.ok(!forgotHomework({ day: 0, breakfast: false, packed: false, missing: [] }, 3, 'homework'), 'a morning that was never checked is not held against the kid');

// ---- the service with a fake context
function setup(missing) {
  const events = [];
  const players = [{ character: { name: 'Kilian' } }, { character: { name: 'Helena' } }];
  const ctx = {
    day: { day: 2 },
    players,
    state: { players: [{ morning: { day: 2, missing } }, { morning: { day: 2, missing: [] } }] },
    school: { schedule: day => ({ lessons: Array.from({ length: counts(day) }, (_, i) => ({ index: i })) }) },
    t: (k, p = {}) => `${k}${Object.keys(p).length ? JSON.stringify(p) : ''}`,
    events: { emit: (e, p) => events.push([e, p]) }
  };
  globalThis.window = { SCHULWEG_GAME: {} };
  return { ctx, events, svc: new SchoolEvents(ctx, cfg) };
}
let { svc, events, ctx } = setup(['homework']);
const lesson = { day: 2, index: 0, id: 'school-2-1' };
let r = svc.before(lesson, [0, 1]);
assert.equal(events.filter(e => e[0] === 'homework:forgotten' && e[1].player === 0).length, 1, 'the kid who forgot it is told so');
assert.equal(events.filter(e => e[0] === 'homework:done' && e[1].player === 1).length, 1, 'the one who packed it is praised');
assert.ok(r.lines.some(l => l.startsWith('school.event.homework.forgot') && l.includes('Kilian')) && r.lines.some(l => l.startsWith('school.event.homework.ok') && l.includes('Helena')), 'both lines name the kid');
events.length = 0;
r = svc.before(lesson, [0, 1]);
assert.equal(events.filter(e => e[0].startsWith('homework')).length, 0, 'each kid is checked once a day');
r = svc.before({ day: 2, index: 2, id: 'school-2-3' }, [0, 1]);
assert.equal(r.lines.filter(l => l.startsWith('school.event.homework')).length, 0, 'only before the first lesson');
globalThis.window.SCHULWEG_GAME.schoolEventsOff = true;
assert.equal(svc.before({ day: 5, index: 0 }, [0]), null, 'the test switch turns the surprises off');
assert.ok(!svc.popQuiz({ day: 5, index: 1 }));
globalThis.window.SCHULWEG_GAME.schoolEventsOff = false;

// a day with a substitute announces them before the lesson, once
const subDay = Array.from({ length: 40 }, (_, i) => i + 1).find(d => schedule(cfg, d, counts(d)).substitute === 0);
({ svc, events } = setup([]));
r = svc.before({ day: subDay, index: 0, id: `school-${subDay}-1` }, [0]);
assert.ok(r.lines.some(l => l.startsWith('school.event.substitute')) && events.some(e => e[0] === 'school:substitute' && e[1].day === subDay), 'the substitute is announced');
const quizDay = Array.from({ length: 40 }, (_, i) => i + 1).find(d => schedule(cfg, d, counts(d)).popQuiz >= 1);
const qi = schedule(cfg, quizDay, counts(quizDay)).popQuiz;
assert.ok(svc.popQuiz({ day: quizDay, index: qi }) && !svc.popQuiz({ day: quizDay, index: 0 }), 'the pop quiz follows exactly its lesson');

console.log(`school events ok: pop quiz on ${quiz} and substitute on ${sub} of 80 days, homework check both ways, once a day per kid`);
