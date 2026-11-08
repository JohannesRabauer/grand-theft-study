// The quest runner's rules (story 9.1): the mission data against the maps and texts, the three state actions, step
// completion by place and by event, and the phone-call choice. Pure logic; the runner, the phone booth, the message screens
// and the objective arrow in the running game are covered by the smoke scenario `quests`.
// Run: node scripts/check-quests.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState } from '../state/GameState.js';
import { canStart, currentStep, missionById, nextCall, reached, stepFinishedBy, validateMissions } from '../services/questLogic.js';

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
assert.equal(nextCall(cfg, quests([], ['parcel']), 'afternoon', 1, {}), null, 'and nothing once everything is done');

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

console.log(`quests ok: ${cfg.missions.length} mission(s), start rules, steps by place and event, three actions, repeat per day`);
