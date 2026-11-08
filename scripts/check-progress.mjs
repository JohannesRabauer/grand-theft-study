// XP and levels (story 10.2): XP for activities from the data, level-ups detected once from any source, no celebration on load,
// attribute growth hooked onto level-ups and the other new events, and the texts. Pure logic with the real GameState and AttrGrowth;
// the events in the running game are covered by the smoke scenario `progress`.
// Run: node scripts/check-progress.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState } from '../state/GameState.js';
import { Progress } from '../characters/Progress.js';
import { AttrGrowth } from '../characters/AttrGrowth.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const xp = load('data/xp.json');
const growth = load('data/attr-growth.json');
const base = load('data/state.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };
const characters = load('data/characters.json');

// ---- data
for (const r of xp.rules) assert.ok(Number.isInteger(r.amount) && r.amount > 0 && r.event, `${r.event}: a whole positive xp amount`);
assert.ok(xp.rules.some(r => r.event === 'zeugnis:done' && r.filter?.promoted === false), 'a repeated year earns xp too');
for (const l of ['de', 'en']) assert.ok(i18n[l]['xp.levelUp'], `${l}: xp.levelUp`);
for (const ev of ['level:up', 'race:won', 'commute:ontime', 'homework:done']) assert.ok(growth.rules.some(r => r.event === ev), `attribute growth hooks onto ${ev}`);
for (const r of growth.rules) assert.ok(r.cap <= characters.attrMax, `${r.event}: cap within the attribute maximum`);

// ---- the service
function setup(players = 2) {
  const events = new EventEmitter();
  const state = new GameState(events, { ...base, players, startMoneyCents: 0 });
  const toasts = [];
  const ups = [];
  const sparks = [];
  events.on('ui:toast', t => toasts.push(t));
  events.on('level:up', e => ups.push(e));
  const ctx = {
    state, events, t: k => k,
    players: Array.from({ length: players }, (_, i) => ({ x: 10 * i, y: 5, character: { name: ['Helena', 'Kilian'][i] } })),
    particles: { emit: (kind, x, y, o) => sparks.push([kind, x, y, o.count]) }
  };
  const progress = new Progress(ctx, xp);
  const growthRun = new AttrGrowth(events, state, growth, characters.attrMax);
  return { ctx, events, state, progress, growthRun, toasts, ups, sparks };
}
let t = setup();
t.state.dispatch('player.setCharacter', { player: 0, character: 'kilian' });
const xp0 = t.state.players[0].xp;
t.events.emit('commute:ontime', { player: 0 });
assert.equal(t.state.players[0].xp, xp0 + 5, 'being on time earns xp');
assert.equal(t.state.players[1].xp, 0, 'only that kid');
t.events.emit('tram:ride', { players: [0, 1] });
assert.deepEqual([t.state.players[0].xp, t.state.players[1].xp], [xp0 + 7, 2], 'an event naming several kids pays each of them');
t.events.emit('zeugnis:done', { player: 1, promoted: true });
t.events.emit('zeugnis:done', { player: 0, promoted: false });
assert.deepEqual([t.state.players[1].xp, t.state.players[0].xp], [52, xp0 + 7 + 25], 'promoted and repeat pay their own amounts');
t.events.emit('commute:ontime', { player: 9 });
assert.equal(t.ups.length, 0, 'no level-up yet, and an unknown kid is ignored');

// ---- level-ups: once per level, from any source, with a toast and sparks
t = setup();
t.state.dispatch('xp.add', { player: 0, amount: 99 });
assert.equal(t.ups.length, 0, 'level 1 until 100 xp');
t.events.emit('commute:ontime', { player: 0 });
assert.deepEqual(t.ups, [{ player: 0, level: 2 }], 'the 100th xp is level 2, announced once');
assert.equal(t.toasts.filter(x => x.key === 'xp.levelUp' && x.params.level === 2 && x.params.who === 'Helena').length, 1, 'with a toast naming the kid');
assert.deepEqual(t.sparks, [['spark', 0, -3, 24]], 'and a burst of sparks at the kid');
t.state.dispatch('xp.add', { player: 0, amount: 1 });
assert.equal(t.ups.length, 1, 'more xp inside the level is no new level-up');
t.state.dispatch('xp.add', { player: 0, amount: 250 });
assert.equal(t.ups.at(-1).level, 4, 'a big gain jumps to the right level');
assert.equal(t.ups.length, 2, 'announced once for the jump');
t.state.dispatch('xp.add', { player: 1, amount: 100 });
assert.deepEqual(t.ups.at(-1), { player: 1, level: 2 }, 'each kid has their own levels');

// ---- the cap
t = setup(1);
t.state.dispatch('xp.add', { player: 0, amount: base.xpPerLevel * 40 });
assert.equal(t.state.players[0].level, base.maxLevel, 'levels stop at the maximum');
const upsAtMax = t.ups.length;
t.state.dispatch('xp.add', { player: 0, amount: 500 });
assert.equal(t.ups.length, upsAtMax, 'no celebration without a new level');

// ---- loading a save never celebrates
t = setup(1);
t.state.replace({ ...t.state.data, players: t.state.players.map(p => ({ ...p, xp: 450, level: 5 })) });
t.state.dispatch('xp.add', { player: 0, amount: 10 });
assert.equal(t.ups.length, 0, 'a loaded level 5 is not a level-up, and 10 more xp stays level 5');
t.state.dispatch('xp.add', { player: 0, amount: 50 });
assert.deepEqual(t.ups, [{ player: 0, level: 6 }], 'the next real level is');

// ---- attribute growth hooks
t = setup(1);
t.state.dispatch('player.setCharacter', { player: 0, character: 'helena' });
const ausdauer = t.state.players[0].attributes.ausdauer;
t.events.emit('level:up', { player: 0, level: 2 });
assert.ok(t.state.players[0].attributes.ausdauer > ausdauer, 'a level-up grows stamina a little');
const ordnung = t.state.players[0].attributes.ordnung;
t.events.emit('commute:ontime', { player: 0 });
assert.ok(t.state.players[0].attributes.ordnung > ordnung, 'being on time grows tidiness');
const wissen = t.state.players[0].attributes.wissen;
for (let i = 0; i < 10; i++) t.events.emit('quiz:correct', { player: 0 });
t.events.emit('lesson:done', { player: 0, effort: 1 });
assert.ok(t.state.players[0].attributes.wissen > wissen + 0.7, 'right answers and finished lessons grow knowledge');

console.log(`progress ok: ${xp.rules.length} xp rules, level-ups once per level with a toast, no celebration on load, ${growth.rules.length} growth hooks`);
