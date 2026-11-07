import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { Morning, missingItems, requiredItems, morningStartMap } from '../services/Morning.js';
import { SchoolDay } from '../services/SchoolDay.js';
import { DayClock } from '../services/DayClock.js';
import { GameState, createDefaultState, createMorning, STATE_VERSION } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';
import { migrate } from '../state/migrations.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = json('data/morning.json');
const stateCfg = { ...json('data/state.json'), morning: cfg };
const dicts = { de: json('i18n/de.json'), en: json('i18n/en.json') };
const events = new EventEmitter();
const state = new GameState(events, stateCfg);
const storage = new Map();
const saves = new SaveSlots(state, events, {
  getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v)
});
saves.startNew(1);
state.dispatch('coop.set', { on: true });
const ctx = { events, state, saves, world: { id: 'home' }, players: [0, 1].map(index => ({
  index, character: { name: `Kid ${index + 1}` }, move: { stamina: 0.2, exhausted: true }
})), minigames: { active: null }, t: (key, params) => {
  let text = dicts.en[key];
  assert.ok(text, `known translation ${key}`);
  for (const [k, v] of Object.entries(params ?? {})) text = text.replaceAll(`{${k}}`, v);
  return text;
} };
ctx.day = new DayClock(ctx, json('data/day.json'));
ctx.school = new SchoolDay(ctx, json('data/timetable.json'), json('data/minigames.json').minigames);
const morning = new Morning(ctx, cfg);
ctx.day.start();
assert.deepEqual(state.players.map(p => p.morning), [0, 1].map(() => ({ ...createMorning(), day: 1 })));
for (const lang of Object.values(dicts)) for (const item of cfg.items) assert.ok(lang[item.label]);
assert.deepEqual(missingItems(['a', 'b'], ['b', 'extra']), ['a']);
for (const day of ctx.school.days) {
  const required = requiredItems(cfg, day.lessons);
  assert.equal(required.length, new Set(required).size);
  for (const l of day.lessons) for (const item of cfg.byMinigame[l.minigame]) assert.ok(required.includes(item));
  for (const item of cfg.always) assert.ok(required.includes(item));
}
assert.throws(() => requiredItems(cfg, [{ minigame: 'unknown' }]), /no supplies/);
const maps = { home: {}, town: {} }, index = { start: 'town' };
assert.equal(morningStartMap(index, maps, saves, { phase: null }), 'home');
assert.equal(morningStartMap(index, maps, saves, { phase: 'morning' }), 'home');
assert.equal(morningStartMap(index, maps, saves, { phase: 'school' }), 'town');
assert.equal(morningStartMap(index, maps, { activeSlot: null }, { phase: 'morning' }), 'town');

assert.equal(morning.breakfast(0), true);
assert.equal(morning.breakfast(0), false, 'breakfast cannot be farmed');
assert.equal(ctx.players[0].move.stamina, 1);
assert.equal(ctx.players[0].move.exhausted, false);
assert.equal(state.players[1].morning.breakfast, false, 'breakfast is per child');
const required = morning.required();
morning.setBag(0, required);
morning.setBag(1, required.filter(id => id !== 'maths-book'));
assert.deepEqual(morning.check(0), []);
assert.deepEqual(morning.check(1), ['maths-book']);
assert.equal(state.players[0].morning.packed, true);
morning.save();
const saved = JSON.stringify(state.data);
morning.setBag(1, []);
assert.equal(saves.load(1), true);
assert.equal(JSON.stringify(state.data), saved, 'breakfast, bags and forgotten supplies survive Continue');
assert.throws(() => state.players[1].morning.missing.push('x'), TypeError);
const notice = morning.lessonNotice(ctx.school.next(), [0, 1]);
assert.equal(notice.key, 'home.borrow');
assert.ok(notice.params.items.includes('Kid 2') && !notice.params.items.includes('Kid 1'));
assert.ok(notice.params.items.includes('Maths book'));
assert.equal(morning.lessonNotice(ctx.school.next(), [0]), null);
const rejected = [];
events.on('state:rejected', e => rejected.push(e));
for (const items of [['unknown'], ['pencil-case', 'pencil-case'], null, 'pencil-case']) {
  assert.equal(state.dispatch('bag.set', { player: 0, day: 1, items }), false);
}
assert.equal(state.dispatch('bag.set', { player: 8, day: 1, items: [] }), false);
assert.equal(state.dispatch('home.startDay', { player: 0, day: 2 }), false, 'cannot prepare a future day');
assert.equal(state.dispatch('home.breakfast', { player: 0, day: 2 }), false);
assert.ok(rejected.every(e => e.reason === 'bad-payload'));
assert.equal(JSON.stringify(state.data), saved, 'invalid actions are atomic');
morning.leave();
assert.equal(ctx.day.phase, 'commute');
assert.deepEqual(state.players[1].morning.missing, ['maths-book']);
assert.ok(saves.load(1));
assert.equal(ctx.day.phase, 'commute', 'departure autosaves the next phase with forgotten items');
ctx.day.advance('test-school');
assert.throws(() => morning.breakfast(0), /not available/);
assert.throws(() => morning.setBag(0, []), /not available/);
ctx.day.advance('test-afternoon');
ctx.day.advance('test-evening');
ctx.day.advance('test-next-day');
assert.equal(ctx.day.day, 2);
assert.ok(state.players.every(p => p.bag.length === 0 && !p.morning.breakfast && !p.morning.packed && p.morning.day === 2));
assert.notDeepEqual(morning.required(), required, 'the next day has its own timetable requirements');
morning.setBag(0, ['pencil-case']);
ctx.day.advance('time');
assert.ok(state.players[0].morning.missing.length, 'the clock deadline also stores unfinished packing');
assert.ok(saves.load(1));
assert.ok(state.players[0].morning.missing.length, 'deadline packing is saved after the phase changes');

const old = createDefaultState(stateCfg);
old.v = 5;
delete old.players[0].morning;
old.players[0].bag = ['pencil-case'];
old.players[0].xp = 125;
const upgraded = migrate(old, stateCfg, STATE_VERSION);
assert.deepEqual(upgraded.players[0].morning, createMorning());
assert.deepEqual(upgraded.players[0].bag, ['pencil-case']);
assert.equal(upgraded.players[0].xp, 125);
assert.deepEqual(migrate(upgraded, stateCfg, STATE_VERSION), upgraded);
console.log('morning checks passed: timetable supplies, breakfast, individual bags, forgotten items, saves, day rollover and v5 migration');
