// The quest runner's rules (story 9.1): the mission data against the maps and texts, the three state actions, step
// completion by place and by event, and the phone-call choice. Pure logic; the runner, the phone booth, the message screens
// and the objective arrow in the running game are covered by the smoke scenario `quests`.
// Run: node scripts/check-quests.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState } from '../state/GameState.js';
import { canStart, countsFor, currentStep, missionById, nextCall, raceProgress, reached, stepFinishedBy, validateMissions } from '../services/questLogic.js';
import { wantedKinds } from '../ai/chaseLogic.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/missions.json');
const base = load('data/state.json');
const maps = Object.fromEntries(['town', 'home', 'school', 'dojo'].map(id => [id, load(`data/maps/${id}.json`)]));
const kopfnoten = load('data/kopfnoten.json');

// ---- data
for (const l of ['de', 'en']) {
  const i18n = load(`i18n/${l}.json`);
  const problems = validateMissions(cfg, maps, i18n);
  assert.deepEqual(problems, [], `${l}: ${problems.join('\n')}`);
  for (const k of ['quest.call', 'quest.noCall', 'quest.next', 'quest.firstStep', 'quest.done.title', 'quest.reward', 'hud.mission']) assert.ok(i18n[k], `${l}: ${k}`);
}
const town = maps.town;
assert.ok(town.rows.some(r => [...r].some(c => town.legend[c] === 'booth')), 'the town has a phone booth');
assert.ok(kopfnoten.events.some(e => e.event === 'mission:done' && e.filter?.kind === 'help'), 'helpful missions feed Hilfsbereitschaft');

// ---- start rules
const quests = (active = [], done = []) => ({ active, done });
assert.ok(canStart(cfg, quests(), 'parcel', 'afternoon', 1));
assert.ok(!canStart(cfg, quests(), 'parcel', 'morning', 1), 'only at the times the mission names');
assert.ok(!canStart(cfg, quests([{ id: 'parcel', step: 0 }]), 'parcel', 'afternoon', 1), 'not twice at once');
assert.ok(!canStart(cfg, quests([], ['parcel']), 'parcel', 'afternoon', 1), 'finished missions stay finished');
assert.ok(!canStart(cfg, quests(), 'nonsense', 'afternoon', 1));
const repeating = { missions: [{ id: 'r', booth: 'any', repeat: true, steps: [{ id: 'a', event: 'x' }], reward: { cents: 0, xp: 0 } }] };
assert.ok(!canStart(repeating, quests([], ['r']), 'r', 'afternoon', 3, { 'mission.r.day': 3 }), 'a repeating mission once a day');
assert.ok(canStart(repeating, quests([], ['r']), 'r', 'afternoon', 4, { 'mission.r.day': 3 }), 'and again the next day');
assert.equal(nextCall(cfg, quests(), 'afternoon', 1, {})?.id, 'parcel', 'a phone call offers the mission');
assert.equal(nextCall(cfg, quests([], ['parcel']), 'afternoon', 1, {})?.id, 'grandma', 'the next call offers the next mission');
assert.equal(nextCall(cfg, quests([], cfg.missions.map(m => m.id)), 'afternoon', 1, {}), null, 'and nothing once everything is done');
assert.ok(!nextCall(cfg, quests(), 'afternoon', 1, {}).trigger, 'a trigger-only mission is never offered by phone');

// ---- steps
const step = currentStep(cfg, { id: 'parcel', step: 0 });
const ts = town.tileSize;
assert.ok(reached(step, 'town', (step.reach.x + 0.5) * ts + 10, (step.reach.y + 0.5) * ts, ts), 'close enough counts');
assert.ok(!reached(step, 'town', (step.reach.x + 0.5) * ts + 90, (step.reach.y + 0.5) * ts, ts), 'too far does not');
assert.ok(!reached(step, 'home', (step.reach.x + 0.5) * ts, (step.reach.y + 0.5) * ts, ts), 'and the place is on its own map');
const ev = { event: 'bike:found', match: { kind: ['bike', 'board'] } };
assert.ok(stepFinishedBy(ev, 'bike:found', { kind: 'bike' }) && !stepFinishedBy(ev, 'bike:found', { kind: 'car' }) && !stepFinishedBy(ev, 'other', { kind: 'bike' }));
assert.equal(currentStep(cfg, { id: 'parcel', step: 9 }), null);

// ---- actions
const fresh = () => new GameState(new EventEmitter(), { ...base, missions: cfg });
let s = fresh();
assert.ok(s.dispatch('quest.start', { id: 'parcel' }) && s.shared.quests.active.length === 1 && s.shared.quests.active[0].step === 0);
assert.ok(!s.dispatch('quest.start', { id: 'parcel' }), 'a running mission cannot start again');
assert.ok(!s.dispatch('quest.start', { id: 'ghost' }), 'unknown missions are refused');
assert.ok(!s.dispatch('quest.finish', { id: 'parcel' }), 'finishing needs the last step');
assert.ok(s.dispatch('quest.advance', { id: 'parcel' }) && s.shared.quests.active[0].step === 1);
assert.ok(!s.dispatch('quest.advance', { id: 'parcel' }), 'there is no step after the last');
assert.ok(s.dispatch('quest.finish', { id: 'parcel' }) && s.shared.quests.active.length === 0 && s.shared.quests.done.includes('parcel'));
assert.ok(!s.dispatch('quest.start', { id: 'parcel' }), 'not again');
s = new GameState(new EventEmitter(), { ...base, missions: repeating });
s.dispatch('quest.start', { id: 'r' });
assert.ok(s.dispatch('quest.finish', { id: 'r' }) && s.shared.flags['mission.r.day'] === 1, 'a repeating mission remembers the day');
assert.ok(!s.dispatch('quest.start', { id: 'r' }), 'once a day');
s.dispatch('clock.set', { day: 2, minute: 400, phase: 'morning' });
assert.ok(s.dispatch('quest.start', { id: 'r' }), 'and is back the next day');
assert.equal(missionById(cfg, 'parcel').steps.length, 2);

// ---- lives (fragile load), abort and restart
s = fresh();
assert.ok(s.dispatch('quest.start', { id: 'grandma' }) && s.shared.quests.active[0].lives === 3, 'the eggs start with three lives');
assert.ok(s.dispatch('quest.hit', { id: 'grandma' }) && s.dispatch('quest.hit', { id: 'grandma' }) && s.shared.quests.active[0].lives === 1);
assert.ok(!s.dispatch('quest.hit', { id: 'parcel' }), 'a mission without lives takes no hits');
assert.ok(s.dispatch('quest.abort', { id: 'grandma' }) && s.shared.quests.active.length === 0 && !s.shared.quests.done.includes('grandma'), 'a failed mission is not done');
assert.ok(s.dispatch('quest.start', { id: 'grandma' }) && s.shared.quests.active[0].lives === 3, 'and starts again with fresh eggs');
assert.ok(!s.dispatch('quest.abort', { id: 'parcel' }), 'only running missions can be given up');
assert.ok(s.dispatch('quest.start', { id: 'stolen-bike' }), 'the bike rescue starts without a phone');
const homework = missionById(cfg, 'lost-homework');
assert.ok(homework.steps[0].skipIfFlag === 'lostHomeworkFound' && homework.finishEvent.name === 'homework:done', 'the homework hunt knows its flag and its Kopfnote event');
assert.ok(kopfnoten.events.some(e => e.event === 'homework:done'), 'finishing it earns the Ordnung bonus');

// ---- races: checkpoints in order, on the right vehicles, within the time
const race = missionById(cfg, 'skate-race').steps[1].race;
const at = (i, dx = 0) => [(race.points[i][0] + 0.5) * ts + dx, (race.points[i][1] + 0.5) * ts];
assert.equal(raceProgress(race, 0, ...at(0), 'skateboard', ts), 1, 'a checkpoint reached on wheels counts');
assert.equal(raceProgress(race, 0, ...at(0), 'bike', ts), 0, 'but not on a bike in a skate race');
assert.equal(raceProgress(race, 0, ...at(0), 'foot', ts), 0, 'and not on foot');
assert.equal(raceProgress(race, 1, ...at(0), 'skateboard', ts), 1, 'checkpoints go in order: only the next one counts');
assert.equal(raceProgress(race, 0, ...at(0, race.radius + 20), 'skateboard', ts), 0, 'too far away does not');
assert.equal(raceProgress(race, race.points.length, 0, 0, 'skateboard', ts), race.points.length, 'a finished race stays finished');
const brace = missionById(cfg, 'bike-race').steps[1].race;
assert.deepEqual(brace.vehicles, ['bike'], 'the bike race is for the bike');
for (const id of ['skate-race', 'bike-race']) {
  const m = missionById(cfg, id);
  assert.ok(m.reward.vehicle && load('data/vehicles.json')[m.reward.vehicle], `${id} wins a real vehicle`);
  assert.ok(m.steps[0].reach && m.steps[1].race.seconds >= 20, `${id}: a start line, then a fair time`);
}

// ---- counting: the Kirmes cans and the friendship counts
const range = missionById(cfg, 'kirmes-range').steps[1].count;
const can = (x, y, source = 'slingshot', kind = 'can') => ({ prop: { kind, body: { position: { x: (x + 0.5) * ts, y: (y + 0.5) * ts } } }, source });
assert.ok(countsFor(range, 'prop:hit', can(4, 35)), 'a can near the stall hit by the slingshot counts');
assert.ok(!countsFor(range, 'prop:hit', can(4, 35, 'bike')), 'a can bumped by something else does not');
assert.ok(!countsFor(range, 'prop:hit', can(4, 35, 'slingshot', 'crate')), 'neither does a crate');
assert.ok(!countsFor(range, 'prop:hit', can(40, 20)), 'nor a can far away from the stall');
assert.ok(!countsFor(range, 'other', can(4, 35)));
const cans = town.objects.filter(o => o.type === 'prop' && o.kind === 'can' && Math.hypot(o.x - range.where.near.x, o.y - range.where.near.y) <= range.where.near.radius);
assert.ok(cans.length >= range.n + 1, `the range has more cans (${cans.length}) than the five to hit`);
assert.ok(countsFor({ event: 'loot:collected', where: { kind: 'candy' }, n: 2 }, 'loot:collected', { kind: 'candy' }) && !countsFor({ event: 'loot:collected', where: { kind: 'candy' }, n: 2 }, 'loot:collected', { kind: 'coin' }));

// ---- the friendship arc: in order, each step up measurably leaves a bully out of the chase
assert.ok(canStart(cfg, quests(), 'friendship-1', 'afternoon', 1) && !canStart(cfg, quests(), 'friendship-2', 'afternoon', 1) && !canStart(cfg, quests(), 'friendship-3', 'afternoon', 1), 'only the first can start at first');
assert.ok(!canStart(cfg, quests([], ['friendship-1']), 'friendship-3', 'afternoon', 1) && canStart(cfg, quests([], ['friendship-1']), 'friendship-2', 'afternoon', 1), 'one after the other');
assert.deepEqual([1, 2, 3].map(n => missionById(cfg, `friendship-${n}`).finishFlag), [1, 2, 3].map(n => ({ key: 'friendship', value: n })));
const level = load('data/chase.json').level;
const kinds = (lv, f, coop = false) => wantedKinds(level, lv, coop, 3, f);
assert.deepEqual([kinds(1, 0).length, kinds(1, 1).length], [1, 0], 'level 1: the first friend ends the foot bully');
assert.deepEqual([0, 1, 2, 3].map(f => kinds(2, f).length), [3, 2, 1, 1], 'level 2: one bully less per friendship level, never none');
assert.deepEqual(kinds(0, 3), [], 'no chase stays no chase');
assert.ok(kinds(2, 1, true).length <= 3 && wantedKinds(level, 2, true, 1, 0).length === 1, 'the quality cap still applies');

// ---- the booth offers them in order
let q = quests([], []);
const seen = [];
for (let i = 0; i < 12; i++) { const m = nextCall(cfg, q, 'afternoon', 1, {}); if (!m) break; seen.push(m.id); q = quests([], [...q.done, m.id]); }
assert.deepEqual(seen, ['parcel', 'grandma', 'lost-homework', 'skate-race', 'bike-race', 'kirmes-range', 'friendship-1', 'friendship-2', 'friendship-3'], 'one call after the other, the chain in order');

console.log(`quests ok: ${cfg.missions.length} mission(s), start rules, steps by place and event, three actions, repeat per day`);
