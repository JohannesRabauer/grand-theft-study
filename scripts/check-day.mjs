// Checks the day clock without Phaser (services/DayClock.js, services/dayTime.js, data/day.json): time
// math, phase windows, a full day through all five phases with ordered events and the configured real
// length, autosave on phase end, restore from a save, freeplay, freezing, weather schedule and tint.
// Run: node scripts/check-day.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';
import { DayClock } from '../services/DayClock.js';
import { compileDay, formatTime, parseTime, phaseIndexAt, sanitizeClock, scheduledWeather, tintAt } from '../services/dayTime.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const raw = read('day.json');
const stateCfg = read('state.json');
const cfg = compileDay(raw);

// time math
assert.equal(parseTime('06:30'), 390);
assert.equal(formatTime(390), '06:30');
assert.equal(formatTime(13 * 60 + 5), '13:05');
assert.equal(formatTime(1440 + 61), '01:01', 'wraps past midnight');
assert.throws(() => parseTime('25:00'));
assert.throws(() => parseTime('7'));

// data: five phases in the specified order and windows, contiguous, one season each
assert.deepEqual(cfg.phases.map(p => p.id), ['morning', 'commute', 'school', 'afternoon', 'evening']);
assert.deepEqual(cfg.phases.map(p => p.season), ['autumn', 'autumn', 'winter', 'spring', 'summer']);
assert.equal(cfg.phases[2].start, parseTime('08:00'), 'school starts at the 08:00 deadline');
assert.equal(cfg.phases[2].end, parseTime('13:15'));
const realMinutes = ((cfg.end - cfg.start) * cfg.secondsPerMinute) / 60;
assert.ok(realMinutes > 22 && realMinutes < 28, `a day takes about 25 real minutes (${realMinutes.toFixed(1)})`);
const bad = (patch) => compileDay({ ...raw, ...patch });
assert.throws(() => bad({ end: '23:00' }), /span/);
assert.throws(() => bad({ phases: [raw.phases[0], raw.phases[2]] }), /span|follow/);

// phase lookup
assert.equal(cfg.phases[phaseIndexAt(cfg, parseTime('06:30'))].id, 'morning');
assert.equal(cfg.phases[phaseIndexAt(cfg, parseTime('07:59'))].id, 'commute');
assert.equal(cfg.phases[phaseIndexAt(cfg, parseTime('08:00'))].id, 'school');
assert.equal(cfg.phases[phaseIndexAt(cfg, parseTime('21:59'))].id, 'evening');

// sanitizing loaded clocks
assert.deepEqual(sanitizeClock(cfg, { day: 1, minute: 0 }), { day: 1, minute: cfg.start, phase: 'morning' }, 'a fresh clock starts the day');
assert.deepEqual(sanitizeClock(cfg, { day: 3, minute: 600, phase: 'morning' }), { day: 3, minute: 600, phase: 'school' }, 'phase follows the minute');
assert.equal(sanitizeClock(cfg, { day: -2, minute: 'x' }).day, 1);
assert.equal(sanitizeClock(cfg, undefined).minute, cfg.start);

// weather schedule: deterministic per day, only inside windows, some days rain and some do not
assert.equal(scheduledWeather(cfg, 1, parseTime('10:00')), 'clear', 'no hints during school');
const rainyDays = [];
for (let d = 1; d <= 60; d++) {
  const a = scheduledWeather(cfg, d, parseTime('15:00'));
  assert.equal(a, scheduledWeather(cfg, d, parseTime('15:00')), 'same day, same weather');
  assert.ok(a === 'clear' || a === 'rain');
  if (a === 'rain') rainyDays.push(d);
}
assert.ok(rainyDays.length > 10 && rainyDays.length < 40, `afternoon rain on some days only (${rainyDays.length}/60)`);
assert.equal(scheduledWeather(cfg, rainyDays[0], parseTime('13:30')), 'clear', 'outside the hint window it is dry');

// tint: warm dawn, neutral day, orange evening, dark bedtime
assert.ok(tintAt(cfg, parseTime('06:30')).alpha > 0.1 && tintAt(cfg, parseTime('06:30')).rgb === 0xff9a55);
assert.equal(tintAt(cfg, parseTime('12:00')).alpha, 0, 'daylight is neutral');
assert.ok(tintAt(cfg, parseTime('19:30')).alpha > 0.1);
assert.ok(tintAt(cfg, parseTime('21:59')).alpha > 0.4, 'bedtime is dark');
const mid = tintAt(cfg, parseTime('07:15'));
assert.ok(mid.alpha > 0 && mid.alpha < 0.18, 'dawn fades out smoothly');
let prev = -1;
for (let m = cfg.start; m < cfg.end; m++) {
  const t = tintAt(cfg, m);
  assert.ok(t.alpha >= 0 && t.alpha <= 1 && t.rgb >= 0 && t.rgb <= 0xffffff);
  if (m > parseTime('17:30')) assert.ok(t.alpha >= prev - 1e-9, 'evening only gets darker');
  prev = t.alpha;
}

// DayClock around the real state store
const memoryStorage = () => {
  const m = new Map();
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};
const setup = (storage = memoryStorage()) => {
  const events = new EventEmitter();
  const state = new GameState(events, stateCfg);
  const saves = new SaveSlots(state, events, storage);
  const ctx = { events, state, saves, frozen: false };
  ctx.day = new DayClock(ctx, raw);
  const log = [];
  for (const e of ['phase:started', 'phase:ended']) events.on(e, p => log.push(`${e.split(':')[1]} ${p.phase} ${p.reason}`));
  return { ctx, events, state, saves, storage, log };
};

// a full day in a slot: all phases in order, in the configured real time, autosave at every phase end
{
  const { ctx, events, state, saves, storage, log } = setup();
  saves.startNew(1);
  ctx.day.start();
  assert.equal(ctx.day.mode, 'story');
  assert.deepEqual([ctx.day.time, ctx.day.phase, ctx.day.season, ctx.day.day], ['06:30', 'morning', 'autumn', 1]);
  log.length = 0;
  const ticks = [];
  events.on('clock:tick', e => ticks.push(e));
  const savedPhases = [];
  events.on('phase:ended', () => savedPhases.push(JSON.parse(storage.getItem('schulweg.save.1')).shared.clock.phase));
  const dt = 0.1;
  let seconds = 0;
  while (ctx.day.day === 1) { ctx.day.update(dt); seconds += dt; assert.ok(seconds < 3000, 'the day ends'); }
  assert.deepEqual(log, [
    'ended morning time', 'started commute time', 'ended commute time', 'started school time', 'ended school time',
    'started afternoon time', 'ended afternoon time', 'started evening time', 'ended evening time', 'started morning time'
  ]);
  assert.ok(Math.abs(seconds - (cfg.end - cfg.start) * cfg.secondsPerMinute) < 1, `a day lasts ${seconds.toFixed(1)} s`);
  assert.deepEqual(savedPhases, ['commute', 'school', 'afternoon', 'evening', 'morning'], 'autosave holds the phase that comes next');
  assert.deepEqual([ctx.day.day, ctx.day.time], [2, '06:30'], 'the next day starts in the morning');
  assert.equal(ticks.length, new Set(ticks.map(t => `${t.day}/${t.minute}`)).size, 'one tick per game minute');
  assert.equal(state.shared.clock.minute, cfg.start);
}

// restore: a saved mid-day clock comes back, then keeps running
{
  const first = setup();
  first.saves.startNew(2);
  first.ctx.day.start();
  first.ctx.day.advance('test');
  first.ctx.day.advance('test'); // school, 08:00
  first.ctx.day.update(cfg.secondsPerMinute * 61);
  assert.equal(first.ctx.day.time, '09:01');
  first.saves.save(2);
  const second = setup(first.storage);
  assert.ok(second.saves.load(2));
  second.ctx.day.start();
  assert.deepEqual([second.ctx.day.time, second.ctx.day.phase, second.ctx.day.season], ['09:01', 'school', 'winter']);
  assert.deepEqual(second.log, ['started school load']);
  second.ctx.day.update(cfg.secondsPerMinute);
  assert.equal(second.ctx.day.time, '09:02');
}

// advance(): needs a reason, carries it, and the evening leads to the next day
{
  const { ctx, log } = setup();
  ctx.saves.startNew(1);
  ctx.day.start();
  assert.throws(() => ctx.day.advance(), /reason/);
  log.length = 0;
  ctx.day.advance('missed-bus');
  assert.deepEqual(log, ['ended morning missed-bus', 'started commute missed-bus']);
  assert.equal(ctx.day.time, '07:30');
}

// freeplay (no slot): shows the data time, never ends a phase by itself, and can run without ending it
{
  const { ctx, log } = setup();
  ctx.day.start();
  assert.equal(ctx.day.mode, 'freeplay');
  assert.deepEqual([ctx.day.time, ctx.day.phase], ['07:45', 'commute']);
  assert.deepEqual(log, ['started commute freeplay']);
  ctx.day.update(1000);
  assert.equal(ctx.day.time, '07:45', 'a stopped freeplay clock stands still');
  const running = new DayClock(ctx, { ...raw, freeplay: { ...raw.freeplay, running: true } });
  ctx.day = running;
  running.start();
  running.update(cfg.secondsPerMinute * 500);
  assert.equal(running.phase, 'commute', 'freeplay never leaves its phase by time');
  assert.equal(running.time, '07:59');
  assert.deepEqual(log, ['started commute freeplay', 'started commute freeplay']);
}

// freezing: overlays stop the clock unless the data says otherwise
{
  const { ctx } = setup();
  ctx.saves.startNew(1);
  ctx.day.start();
  ctx.frozen = true;
  ctx.day.update(100);
  assert.equal(ctx.day.time, '06:30');
  ctx.frozen = false;
  ctx.day.update(cfg.secondsPerMinute);
  assert.equal(ctx.day.time, '06:31');
  const runner = new DayClock(ctx, { ...raw, runWhileFrozen: true });
  ctx.day = runner;
  runner.start();
  ctx.frozen = true;
  runner.update(cfg.secondsPerMinute);
  assert.equal(runner.time, '06:32');
}

// the clock lives in the state and changes only through its action
{
  const { ctx, state, events } = setup();
  const changed = [];
  events.on('state:changed', e => changed.push(e.path));
  ctx.day.start();
  assert.ok(changed.includes('shared.clock'));
  assert.equal(state.dispatch('clock.set', { day: 1, minute: 2000, phase: 'x' }), false, 'minute out of range is rejected');
  assert.equal(state.dispatch('clock.set', { day: 0, minute: 400, phase: 'morning' }), false);
  assert.throws(() => { state.shared.clock.minute = 5; }, TypeError, 'the state is frozen');
}

console.log('day clock checks passed');
