// Achievements and daily streaks (story 10.4): the content, counting events per kid with filters, unlocking once with xp,
// persistence through a save round trip, and the streak lifecycle (start, grow, milestone, gentle reset). Pure logic with the real GameState;
// the screens and the good-night lines in the running game are covered by the smoke scenario `achievements`.
// Run: node scripts/check-achievements.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState } from '../state/GameState.js';
import { Achievements } from '../services/achievements.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/achievements.json');
const base = load('data/state.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };
const missions = load('data/missions.json');

function setup(players = 2, data) {
  const bus = new EventEmitter();
  const state = new GameState(bus, { ...base, players, startMoneyCents: 0 }, data);
  const toasts = [];
  const unlocked = [];
  const sparks = [];
  bus.on('ui:toast', t => toasts.push(t));
  bus.on('achievement:unlocked', e => unlocked.push(e));
  const ctx = { state, events: bus, t: (k, p = {}) => `${k}${Object.keys(p).length ? JSON.stringify(p) : ''}`, players: Array.from({ length: players }, (_, index) => ({ index, x: 5, y: 9, character: { name: ['Helena', 'Kilian'][index] } })), particles: { emit: (...a) => sparks.push(a) } };
  const svc = new Achievements(ctx, cfg);
  return { ctx, bus, state, svc, toasts, unlocked, sparks };
}

// ---- content
let t = setup();
for (const l of ['de', 'en']) {
  assert.deepEqual(t.svc.validate(i18n[l]), [], `${l}: ${t.svc.validate(i18n[l]).join(', ')}`);
  for (const k of ['ach.unlocked', 'achievements.title', 'achievements.owner', 'achievements.progress', 'achievements.nav', 'achievements.streaks', 'achievements.days', 'achievements.best', 'pause.achievements', 'streak.up', 'streak.milestone', 'streak.reset']) assert.ok(i18n[l][k], `${l}: ${k}`);
}
assert.ok(cfg.achievements.length >= 16 && cfg.achievements.length <= 20, 'two columns of ten hold the list');
for (const a of cfg.achievements.filter(a => a.event === 'mission:done' && a.filter?.id)) assert.ok(missions.missions.some(m => m.id === a.filter.id), `real mission: ${a.filter.id}`);
assert.equal(cfg.streaks.length, 3);

// ---- counting and unlocking
t = setup();
t.bus.emit('lesson:done', { player: 0, effort: 1 });
assert.ok(t.svc.unlocked('first-lesson', 0) && !t.svc.unlocked('first-lesson', 1), 'one lesson unlocks Fresh Start for that kid only');
assert.equal(t.unlocked.filter(e => e.id === 'first-lesson').length, 1);
assert.ok(t.toasts.some(x => x.key === 'ach.unlocked' && x.params.name.includes('ach.first-lesson.name')), 'a toast with the funny name');
assert.equal(t.sparks.length, 1, 'sparks at the kid');
assert.equal(t.state.players[0].xp, cfg.xpReward, 'a little xp for it');
for (let i = 0; i < 8; i++) t.bus.emit('lesson:done', { player: 0 });
assert.equal(t.svc.count('bookworm', 0), 9);
assert.ok(!t.svc.unlocked('bookworm', 0), 'nine of ten is not yet');
t.bus.emit('lesson:done', { player: 0 });
assert.ok(t.svc.unlocked('bookworm', 0), 'the tenth unlocks Bookworm');
t.bus.emit('lesson:done', { player: 0 });
assert.equal(t.svc.count('bookworm', 0), 10, 'counting stops at the unlock');
assert.equal(t.unlocked.filter(e => e.id === 'bookworm').length, 1, 'once only');
assert.equal(t.svc.count('bookworm', 1), 0, 'the sibling counts separately');

// filters and minimums
for (let i = 0; i < 5; i++) t.bus.emit('grades:recorded', { player: 1, subject: 'mathe', grade: 2 });
assert.equal(t.svc.count('top-marks', 1), 0, 'a 2 is not a 1');
for (let i = 0; i < 3; i++) t.bus.emit('grades:recorded', { player: 1, subject: 'mathe', grade: 1 });
assert.ok(t.svc.unlocked('top-marks', 1), 'three 1s unlock Gold Star Collector');
t.bus.emit('level:up', { player: 1, level: 3 });
assert.ok(!t.svc.unlocked('level-five', 1));
t.bus.emit('level:up', { player: 1, level: 5 });
assert.ok(t.svc.unlocked('level-five', 1), 'level 5 or more');
t.bus.emit('shop:bought', { player: 0, id: 'snack-roll', type: 'snack' });
assert.ok(!t.svc.unlocked('fashion-icon', 0), 'a snack is not fashion');
t.bus.emit('shop:bought', { player: 0, id: 'hat-cap', type: 'cosmetic' });
assert.ok(t.svc.unlocked('fashion-icon', 0) && t.svc.count('shopper', 0) === 2);
t.bus.emit('mission:done', { id: 'grandma', kind: 'help' });
assert.ok(t.svc.unlocked('egg-baron', 0) && t.svc.unlocked('egg-baron', 1), 'a mission has no single owner: every kid gets it');
t.bus.emit('tram:ride', { players: [1] });
assert.equal(t.svc.count('globetrotter', 1), 1);
assert.equal(t.svc.count('globetrotter', 0), 0, 'only the riders');
t.bus.emit('prop:hit', { source: 'bike', player: 0 });
assert.equal(t.svc.count('sharp-shooter', 0), 0, 'only slingshot hits');

// ---- persistence: a save round trip keeps progress and does not repeat the unlock
const saved = JSON.parse(JSON.stringify(t.state.data));
const t2 = setup(2, saved);
assert.ok(t2.svc.unlocked('bookworm', 0) && t2.svc.count('shopper', 0) === 2, 'unlocks and counters persist');
t2.bus.emit('lesson:done', { player: 0 });
assert.equal(t2.unlocked.length, 0, 'nothing is unlocked twice after loading');

// ---- streaks
t = setup();
const lessons = (player, day, n) => { for (let i = 0; i < n; i++) t.state.dispatch('grades.record', { player, subject: 'mathe', score: 0.8, grade: 2, lessonId: `x-${day}-${player}-${i}`, day }); };
t.state.dispatch('clock.set', { day: 1, minute: 600, phase: 'school' });
lessons(0, 1, 3);
lessons(1, 1, 2);
let lines = t.svc.settleDay(1);
assert.deepEqual(t.svc.streak('school', 0), { n: 1, last: 1, best: 1 }, 'three lessons start the school streak');
assert.equal(t.svc.streak('school', 1).n, 0, 'two lessons do not');
assert.deepEqual(lines, [], 'a first day makes no fuss');
assert.deepEqual(t.svc.settleDay(1), [], 'a day is settled once');
assert.equal(t.svc.streak('school', 0).n, 1);
lessons(0, 2, 3);
lines = t.svc.settleDay(2);
assert.equal(t.svc.streak('school', 0).n, 2);
assert.ok(lines.some(l => l.startsWith('streak.up') && l.includes('Helena') && l.includes('"n":2')), 'two days in a row are celebrated');
lessons(0, 3, 4);
const xp = t.state.players[0].xp;
lines = t.svc.settleDay(3);
assert.equal(t.svc.streak('school', 0).n, 3);
assert.ok(lines.some(l => l.startsWith('streak.milestone') && l.includes(`"xp":${3 * cfg.streakXpPerDay}`)), 'a milestone pays xp and says so');
assert.equal(t.state.players[0].xp, xp + 3 * cfg.streakXpPerDay + cfg.xpReward, 'the milestone xp, plus the xp of the On a Roll achievement it unlocks at the same moment');
assert.ok(t.svc.unlocked('streaker', 0), 'three days unlock On a Roll');
lines = t.svc.settleDay(4); // nobody had lessons
assert.equal(t.svc.streak('school', 0).n, 0, 'a missed day ends the streak');
assert.equal(t.svc.streak('school', 0).best, 3, 'but the best run is kept');
assert.ok(lines.some(l => l.startsWith('streak.reset')), 'with an encouraging line');
lessons(0, 5, 3);
t.svc.settleDay(5);
assert.deepEqual(t.svc.streak('school', 0), { n: 1, last: 5, best: 3 }, 'tomorrow it starts again');
// a gap without settling still starts at one, never negative or inflated
lessons(0, 9, 3);
t.svc.settleDay(9);
assert.equal(t.svc.streak('school', 0).n, 1);

// punctual and helper streaks from their own sources
t = setup();
t.state.dispatch('clock.set', { day: 2, minute: 480, phase: 'school' });
t.state.dispatch('flags.set', { key: 'commute.2.0', value: 0 });
t.state.dispatch('flags.set', { key: 'commute.2.1', value: 7 });
t.bus.emit('mission:done', { id: 'parcel' });
t.svc.settleDay(2);
assert.equal(t.svc.streak('punctual', 0).n, 1);
assert.equal(t.svc.streak('punctual', 1).n, 0, 'being late is no streak day');
assert.equal(t.svc.streak('helper', 0).n, 1);
assert.equal(t.svc.streak('helper', 1).n, 1, 'both kids helped (shared mission)');

console.log(`achievements ok: ${cfg.achievements.length} achievements and ${cfg.streaks.length} streaks, filters and per-kid counts, persistence, streak start-grow-milestone-reset`);
