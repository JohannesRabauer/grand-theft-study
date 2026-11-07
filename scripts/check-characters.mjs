// Checks the characters (CAP-12) without Phaser: data/characters.json against the spec, attribute -> modifier maths,
// growth with caps and fractional progress, growth hooks on events, save/load persistence, bully target weighting,
// start vehicle fallback, i18n coverage. Run: node scripts/check-characters.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';
import { migrate } from '../state/migrations.js';
import { Characters } from '../characters/Characters.js';
import { computeMods, displayValue, grown, resolvePerks, resolveStartVehicle, ruleMatches, targetScore, validateCharacters } from '../characters/attributes.js';

const load = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const cfg = load('data/characters.json');
const growth = load('data/attr-growth.json');
const stateCfg = { ...load('data/state.json'), characters: Object.fromEntries(cfg.characters.map(c => [c.id, c.attributes])) };
const profiles = load('data/vehicles.json');
const by = Object.fromEntries(cfg.characters.map(c => [c.id, c]));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// ---- data against the spec
assert.deepEqual(validateCharacters(cfg), []);
assert.deepEqual(cfg.characters.map(c => c.id), ['lena', 'mehmet', 'jonas']);
const order = cfg.attributeOrder;
assert.deepEqual(order, ['wissen', 'tempo', 'ausdauer', 'charme', 'ordnung', 'zielen']);
const row = c => order.map(a => c.attributes[a]);
assert.deepEqual(row(by.lena), [9, 5, 5, 5, 8, 8]);
assert.deepEqual(row(by.mehmet), [5, 9, 9, 6, 3, 5]);
assert.deepEqual(row(by.jonas), [6, 6, 5, 9, 4, 6]);
assert.deepEqual(cfg.characters.map(c => c.startVehicle), ['bike', 'skateboard', 'rollerskates']);
assert.deepEqual(cfg.characters.map(c => c.name), ['Lena', 'Mehmet', 'Jonas']);
const pal = cfg.characters.map(c => c.palette);
for (const k of ['jacket', 'hair', 'hairStyle', 'accessory', 'frame']) assert.equal(new Set(pal.map(p => p[k])).size, 3, `palette.${k} differs per character`);
assert.deepEqual(Object.keys(cfg.perkDefaults), ['aimPrecision', 'bullyTargetWeight', 'trickMultiplier', 'stickThrowRange', 'forgetHomeworkChance', 'busGrabBonus', 'talkDownBonus', 'musicArtBonus']);
const perks = id => resolvePerks(by[id], cfg);
assert.ok(perks('lena').aimPrecision > 0 && perks('lena').bullyTargetWeight > 1, 'Lena: precision slingshot, bullies target her more');
assert.ok(perks('mehmet').trickMultiplier > 1 && perks('mehmet').stickThrowRange > 1 && perks('mehmet').forgetHomeworkChance > perks('lena').forgetHomeworkChance && perks('mehmet').forgetHomeworkChance > cfg.perkDefaults.forgetHomeworkChance, 'Mehmet: tricks, stick, forgets homework');
assert.ok(perks('jonas').busGrabBonus > perks('lena').busGrabBonus && perks('jonas').talkDownBonus > 0.3 && perks('jonas').musicArtBonus > 0, 'Jonas: buses, talk-downs, music/art');
for (const rule of growth.rules) {
  assert.ok(order.includes(rule.attr) && rule.amount > 0 && rule.cap <= cfg.attrMax && rule.event && rule.reason, `growth rule ${rule.event}`);
}
assert.deepEqual(new Set(growth.rules.map(r => r.event)), new Set(['style:banked', 'prop:hit', 'quiz:correct', 'lesson:done', 'karate:belt']));

// ---- i18n coverage (the key lists the UI reads)
const de = load('i18n/de.json');
const en = load('i18n/en.json');
const keys = ['menu.character.title', 'menu.character.hint', 'menu.character.vehicle', ...order.map(a => `attr.${a}`), ...cfg.characters.flatMap(c => [c.title, c.perkText, ...c.quips, `vehicle.${c.startVehicle}`])];
for (const k of keys) assert.ok(de[k] && en[k], `i18n key ${k} in both languages`);
for (const c of cfg.characters) assert.equal(c.quips.length, 3, `${c.id} has intro quips`);

// ---- attribute -> modifier maths
const mods = (id, attrs = by[id].attributes) => computeMods({}, attrs, perks(id), cfg);
const neutral = computeMods({}, stateCfg.attributes, resolvePerks(null, cfg), cfg);
for (const k of ['speed', 'accel', 'staminaSize', 'staminaRegen', 'spread', 'assist']) near(neutral[k], 1);
near(mods('mehmet').speed, 1 + 0.06 * 4);
near(mods('lena').speed, 1);
assert.ok(mods('mehmet').speed > mods('jonas').speed && mods('jonas').speed > mods('lena').speed, 'Tempo orders top speed');
assert.ok(mods('mehmet').staminaSize > mods('jonas').staminaSize && mods('jonas').staminaSize >= mods('lena').staminaSize, 'Ausdauer orders stamina');
assert.ok(mods('lena').spread < mods('jonas').spread && mods('jonas').spread < mods('mehmet').spread, 'Zielen (and the aimPrecision perk) order the scatter');
assert.ok(mods('lena').assist > mods('mehmet').assist);
assert.equal(computeMods({}, { zielen: 10 }, { aimPrecision: 1 }, cfg).spread, 0);
assert.ok(computeMods({}, { zielen: 10 }, {}, cfg).spread >= cfg.modifiers.minSpread, 'spread never goes negative');
const reuse = {};
assert.equal(computeMods(reuse, by.lena.attributes, perks('lena'), cfg), reuse, 'the modifier object is filled in place');

// ---- growth with caps and fractional progress
assert.equal(grown(5, 0.3, 10, 10), 5.3);
assert.equal(grown(9.9, 0.5, 10, 10), 10, 'never past the max');
assert.equal(grown(8, 1, 8.5, 10), 8.5, 'never past the rule cap');
assert.equal(grown(9, 1, 8, 10), 9, 'a value above the cap is not lowered');
assert.equal(displayValue(5.49), 5);
assert.equal(displayValue(5.5), 6);
assert.ok(ruleMatches({ filter: { source: 'slingshot' }, minDist: 60 }, { source: 'slingshot', dist: 70 }));
assert.ok(!ruleMatches({ filter: { source: 'slingshot' }, minDist: 60 }, { source: 'slingshot', dist: 30 }), 'too close: not the target range');
assert.ok(!ruleMatches({ filter: { source: 'slingshot' } }, { source: 'bump' }));

// ---- bully target weights: Lena is chosen more often
{
  const pick = (d1, d2, w1, w2) => (targetScore(d1 * d1, w1) <= targetScore(d2 * d2, w2) ? 0 : 1);
  const lena = perks('lena').bullyTargetWeight;
  const mehmet = perks('mehmet').bullyTargetWeight;
  assert.equal(pick(100, 100, lena, mehmet), 0, 'a tie goes to Lena');
  assert.equal(pick(110, 100, lena, mehmet), 0, 'slightly farther, Lena is still chosen');
  assert.equal(pick(100, 60, lena, mehmet), 1, 'much nearer Mehmet is chosen');
  assert.equal(pick(100, 100, 1, 1), 0);
  let lenaPicked = 0;
  for (let i = 0; i < 1000; i++) {
    const dl = 50 + (i * 37) % 100;
    const dm = 50 + (i * 61) % 100;
    if (pick(dl, dm, lena, mehmet) === 0) lenaPicked++;
  }
  assert.ok(lenaPicked > 550, `Lena picked ${lenaPicked}/1000 with varying distances`);
}

// ---- start vehicle fallback
assert.equal(resolveStartVehicle('bike', cfg, profiles), 'bike');
assert.equal(resolveStartVehicle('skateboard', cfg, profiles), 'foot', 'no skateboard profile yet: run');
assert.equal(resolveStartVehicle('rollerskates', cfg, profiles), 'foot');
assert.equal(resolveStartVehicle('skateboard', cfg, { ...profiles, skateboard: {} }), 'foot', 'not a player vehicle until the config lists it');
assert.equal(resolveStartVehicle(undefined, cfg, profiles), 'foot');

// ---- state, service and hooks together
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const rig = (character) => {
  const events = new EventEmitter();
  const state = new GameState(events, stateCfg);
  const saves = new SaveSlots(state, events, memory());
  const ctx = { events, state, players: [] };
  const player = { index: 0, perks: {}, mods: { speed: 1, accel: 1, staminaSize: 1, staminaRegen: 1, spread: 1, assist: 1 }, move: {}, refreshLook() { this.looked = true; }, get attrs() { return state.players[0].attributes; } };
  ctx.players.push(player);
  const characters = new Characters(ctx, cfg, growth, profiles);
  if (character) state.dispatch('player.setCharacter', { player: 0, character });
  characters.apply(player);
  return { events, state, saves, ctx, player, characters };
};

{
  const { state, player, events, saves, characters } = rig('mehmet');
  assert.deepEqual(order.map(a => state.players[0].attributes[a]), row(by.mehmet), 'setCharacter copies the base attributes');
  assert.equal(player.character.id, 'mehmet');
  assert.equal(player.look.walk, 'player-mehmet');
  assert.equal(player.look.bike, 'player-mehmet-bike');
  assert.equal(player.startVehicle, 'foot', 'skateboard falls back to running');
  assert.ok(player.looked);
  near(player.move.speedMult, 1.24);
  near(player.move.staminaSize, 1 + 0.08 * 4);
  assert.equal(player.bullyWeight, 1);
  assert.equal(state.dispatch('player.setCharacter', { player: 0, character: 'nobody' }), false);

  const ups = [];
  events.on('attr:up', e => ups.push(e));
  // tricks raise Tempo (fractional); the displayed value changes only when the rounding does
  const tempo0 = state.players[0].attributes.tempo; // 9
  events.emit('style:banked', { player: 0, points: 120 });
  near(state.players[0].attributes.tempo, tempo0 + 0.15);
  assert.equal(displayValue(state.players[0].attributes.tempo), 9);
  assert.equal(ups.length, 0, 'no attr:up while the rounded value is unchanged');
  for (let i = 0; i < 4; i++) events.emit('style:banked', { player: 0 });
  assert.equal(displayValue(state.players[0].attributes.tempo), 10, '9.75 shows as 10');
  assert.deepEqual(ups.at(-1), { player: 0, attr: 'tempo', value: 10 });
  near(player.move.speedMult, 1 + 0.06 * (state.players[0].attributes.tempo - 5));
  for (let i = 0; i < 50; i++) events.emit('style:banked', { player: 0 });
  assert.equal(state.players[0].attributes.tempo, cfg.attrMax, 'growth stops at the maximum');
  // slingshot: only hits from the target range count
  const z0 = state.players[0].attributes.zielen;
  events.emit('prop:hit', { source: 'slingshot', player: 0, dist: 20 });
  events.emit('prop:hit', { source: undefined, player: 0, dist: 90 });
  assert.equal(state.players[0].attributes.zielen, z0);
  events.emit('prop:hit', { source: 'slingshot', player: 0, dist: 90 });
  near(state.players[0].attributes.zielen, z0 + 0.12);
  assert.ok(player.mods.spread < mods('mehmet').spread, 'better aim after hits shrinks the scatter');
  // knowledge and order come from learning and karate; unknown players and payload-less events are ignored
  const w0 = state.players[0].attributes.wissen;
  events.emit('quiz:correct', { player: 0 });
  events.emit('lesson:done', { player: 0 });
  near(state.players[0].attributes.wissen, w0 + 0.35);
  events.emit('karate:belt', { player: 0, belt: 'yellow' });
  assert.equal(state.players[0].attributes.ordnung, by.mehmet.attributes.ordnung + 1);
  events.emit('quiz:correct', { player: 1 });
  events.emit('quiz:correct');
  near(state.players[0].attributes.wissen, w0 + 0.40);
  assert.equal(characters.display(player).tempo, 10);

  // growth persists through save and load
  assert.ok(saves.save(2));
  const grownTempo = state.players[0].attributes.tempo;
  const grownWissen = state.players[0].attributes.wissen;
  state.dispatch('player.setCharacter', { player: 0, character: 'lena' });
  assert.ok(saves.load(2));
  assert.equal(state.players[0].character, 'mehmet');
  assert.equal(state.players[0].attributes.tempo, grownTempo);
  near(state.players[0].attributes.wissen, grownWissen);
  characters.apply(player);
  assert.equal(player.character.id, 'mehmet');
}

{
  const { state, player } = rig('lena');
  assert.equal(player.startVehicle, 'bike');
  assert.equal(player.bullyWeight, 1.4);
  assert.equal(player.mods.speed, 1);
  assert.ok(player.mods.spread < 0.5);
  assert.equal(state.dispatch('attr.grow', { player: 0, attr: 'wissen', amount: 5, reason: 'test' }), true);
  assert.equal(state.players[0].attributes.wissen, 10, 'the action clamps at the maximum');
  assert.equal(state.dispatch('attr.grow', { player: 0, attr: 'wissen', amount: 1, reason: 'test' }), false, 'and rejects growth at the cap');
  const bad = [{ player: 3, attr: 'tempo', amount: 1 }, { player: 0, attr: 'luck', amount: 1 }, { player: 0, attr: 'tempo', amount: -1 }, { player: 0, attr: 'tempo', amount: NaN }, { player: 0, attr: 'tempo', amount: 1 }];
  for (const payload of bad) assert.equal(state.dispatch('attr.grow', payload), false, JSON.stringify(payload));
}

{ // no character chosen (debug / smoke start): a neutral kid with the default look
  const { state, player } = rig(null);
  assert.equal(player.character, null);
  assert.equal(player.look, null);
  assert.equal(player.startVehicle, 'foot');
  assert.deepEqual(order.map(a => state.players[0].attributes[a]), [5, 5, 5, 5, 5, 5]);
  near(player.move.speedMult, 1);
  near(player.mods.spread, 1);
}

// ---- migration from the placeholder attributes of save v1
{
  const old = { v: 1, shared: { money: 100, clock: { day: 1, minute: 0, phase: null } }, players: [{ character: 'jonas', attributes: { fitness: 1, kopf: 1, mut: 1, charme: 1 }, xp: 0, level: 1 }, { character: null, attributes: { fitness: 1 } }] };
  const m = migrate(old, stateCfg, 2);
  assert.deepEqual(m.players[0].attributes, by.jonas.attributes);
  assert.deepEqual(m.players[1].attributes, stateCfg.attributes);
  assert.equal(m.v, 2);
}

console.log('check-characters: ok');
