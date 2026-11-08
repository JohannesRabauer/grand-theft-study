// Checks the characters (CAP-12) without Phaser: data/characters.json against the spec, attribute -> modifier maths,
// growth with caps and fractional progress, growth hooks on events, save/load persistence, bully target weighting,
// start vehicle fallback, i18n coverage. Run: node scripts/check-characters.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';
import { migrate } from '../state/migrations.js';
import { boostedKiai } from '../defense/beltCore.js';
import { emptyStats, normalizeStats } from '../learning/engineCore.js';
import { Characters } from '../characters/Characters.js';
import { HAIR_STYLES, computeMods, displayValue, grown, resolvePerks, resolveStartVehicle, ruleMatches, targetScore, validateCharacters } from '../characters/attributes.js';

const load = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const cfg = load('data/characters.json');
const growth = load('data/attr-growth.json');
const karate = load('data/karate.json');
const characterBelts = Object.fromEntries(cfg.characters.filter(c => c.startBelt).map(c => [c.id, { belt: c.startBelt, points: karate.belts.find(b => b.id === c.startBelt).trainingPoints }]));
const stateCfg = { ...load('data/state.json'), characters: Object.fromEntries(cfg.characters.map(c => [c.id, c.attributes])), karateBelts: karate.belts.map(b => b.id), characterBelts };
const profiles = load('data/vehicles.json');
const by = Object.fromEntries(cfg.characters.map(c => [c.id, c]));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// ---- data against the spec
assert.deepEqual(validateCharacters(cfg), []);
assert.deepEqual(cfg.characters.map(c => c.id), ['helena', 'kilian', 'lorenz']);
assert.deepEqual(cfg.characters.map(c => c.name), ['Helena', 'Kilian', 'Lorenz']);
assert.deepEqual(cfg.characters.map(c => c.age), [12, 10, 8]);
const order = cfg.attributeOrder;
assert.deepEqual(order, ['wissen', 'tempo', 'ausdauer', 'charme', 'ordnung', 'zielen']);
const row = c => order.map(a => c.attributes[a]);
assert.deepEqual(row(by.helena), [9, 5, 6, 5, 8, 7]);
assert.deepEqual(row(by.kilian), [8, 8, 5, 6, 2, 6]);
assert.deepEqual(row(by.lorenz), [5, 7, 8, 9, 4, 5]);
assert.deepEqual(cfg.characters.map(c => c.startVehicle), ['bike', 'skateboard', 'skates']);
const pal = cfg.characters.map(c => c.palette);
for (const k of ['jacket', 'hair', 'frame']) assert.equal(new Set(pal.map(p => p[k])).size, 3, `palette.${k} differs per character`);
assert.deepEqual(Object.keys(cfg.perkDefaults), ['aimPrecision', 'bullyTargetWeight', 'trickMultiplier', 'stickThrowRange', 'forgetHomeworkChance', 'busGrabBonus', 'talkDownBonus', 'musicArtBonus', 'kiaiPower']);
const perks = id => resolvePerks(by[id], cfg);
assert.equal(perks('helena').aimPrecision, 0.35);
assert.equal(perks('helena').bullyTargetWeight, 1.25);
assert.ok(perks('helena').kiaiPower > 1 && perks('kilian').kiaiPower === 1, 'only Helena has the stronger Kiai');
assert.equal(perks('kilian').trickMultiplier, 1.4);
assert.equal(perks('kilian').forgetHomeworkChance, 0.35);
assert.equal(perks('kilian').stickThrowRange, 1.15);
assert.ok(perks('kilian').forgetHomeworkChance > perks('helena').forgetHomeworkChance && perks('kilian').forgetHomeworkChance > cfg.perkDefaults.forgetHomeworkChance, 'Kilian forgets homework most');
assert.ok(perks('lorenz').busGrabBonus === 0.3 && perks('lorenz').talkDownBonus === 0.3 && perks('lorenz').musicArtBonus === 0.25, 'Lorenz: +30% buses and talk-downs, +25% music/art (additive shares)');
assert.ok(perks('helena').busGrabBonus === 0 && perks('kilian').musicArtBonus === 0);
assert.equal(by.helena.startBelt, 'yellow');
assert.ok(!by.kilian.startBelt && !by.lorenz.startBelt);
assert.deepEqual([by.helena.spriteScale, by.kilian.spriteScale, by.lorenz.spriteScale], [1, 1, 0.9], 'the youngest is a bit smaller');
assert.deepEqual([by.helena.learningStartOffset, by.kilian.learningStartOffset, by.lorenz.learningStartOffset], [undefined, undefined, -0.5]);
// the looks the art draws from (scenes/CharacterArt.js)
const looks = Object.fromEntries(cfg.characters.map(c => [c.id, c.look]));
assert.deepEqual(looks.helena, { hairStyle: 'shoulder', glasses: true, eyes: '#3f86e0', freckles: false }, 'Helena: shoulder-length hair, glasses, blue eyes');
assert.deepEqual([looks.kilian.hairStyle, looks.kilian.glasses, looks.kilian.freckles], ['wild', true, true], 'Kilian: wild hair, glasses, freckles');
assert.deepEqual([looks.lorenz.hairStyle, looks.lorenz.glasses, looks.lorenz.freckles], ['short', false, false], 'Lorenz: short hair, no glasses');
assert.equal(looks.kilian.eyes, looks.lorenz.eyes, 'Kilian and Lorenz have dark brown eyes');
assert.notEqual(looks.helena.eyes, looks.kilian.eyes);
const rgb = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return { r, g, b }; };
assert.ok(rgb(looks.helena.eyes).b > rgb(looks.helena.eyes).r + 60, 'blue eyes');
assert.ok(Math.max(...Object.values(rgb(looks.kilian.eyes))) < 100 && rgb(looks.kilian.eyes).r > rgb(looks.kilian.eyes).b, 'dark brown eyes');
const hair = id => rgb(by[id].palette.hair);
assert.ok(hair('helena').r > 200 && hair('helena').g > 170 && hair('helena').b < 120, 'Helena: blonde');
assert.ok(hair('kilian').r > hair('kilian').g + 60 && hair('kilian').g > hair('kilian').b, 'Kilian: red-brown');
assert.ok(hair('lorenz').r < 140 && hair('lorenz').r > hair('lorenz').g && hair('lorenz').g > hair('lorenz').b, 'Lorenz: brown');
assert.ok(cfg.characters.every(c => HAIR_STYLES.includes(c.look.hairStyle)));
assert.ok(validateCharacters({ ...cfg, characters: [{ ...by.helena, look: { ...by.helena.look, eyes: 'blue' } }] }).length > 0, 'a malformed look is reported');
for (const rule of growth.rules) {
  assert.ok(order.includes(rule.attr) && rule.amount > 0 && rule.cap <= cfg.attrMax && rule.event && rule.reason, `growth rule ${rule.event}`);
}
assert.deepEqual(new Set(growth.rules.map(r => r.event)), new Set(['style:banked', 'prop:hit', 'quiz:correct', 'lesson:done', 'karate:belt', 'level:up', 'race:won', 'commute:ontime', 'homework:done']));

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
near(mods('kilian').speed, 1 + 0.06 * 3);
near(mods('helena').speed, 1);
assert.ok(mods('kilian').speed > mods('lorenz').speed && mods('lorenz').speed > mods('helena').speed, 'Tempo orders top speed');
assert.ok(mods('lorenz').staminaSize > mods('helena').staminaSize && mods('helena').staminaSize > mods('kilian').staminaSize, 'Ausdauer orders stamina');
assert.ok(mods('helena').spread < mods('kilian').spread && mods('kilian').spread < mods('lorenz').spread, 'Zielen (and the aimPrecision perk) order the scatter');
assert.ok(mods('helena').assist > mods('kilian').assist);
assert.equal(computeMods({}, { zielen: 10 }, { aimPrecision: 1 }, cfg).spread, 0);
assert.ok(computeMods({}, { zielen: 10 }, {}, cfg).spread >= cfg.modifiers.minSpread, 'spread never goes negative');
const reuse = {};
assert.equal(computeMods(reuse, by.helena.attributes, perks('helena'), cfg), reuse, 'the modifier object is filled in place');

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

// ---- bully target weights: Helena is chosen more often
{
  const pick = (d1, d2, w1, w2) => (targetScore(d1 * d1, w1) <= targetScore(d2 * d2, w2) ? 0 : 1);
  const helena = perks('helena').bullyTargetWeight;
  const kilian = perks('kilian').bullyTargetWeight;
  assert.equal(pick(100, 100, helena, kilian), 0, 'a tie goes to Helena');
  assert.equal(pick(110, 100, helena, kilian), 0, 'slightly farther, Helena is still chosen');
  assert.equal(pick(100, 60, helena, kilian), 1, 'much nearer Kilian is chosen');
  assert.equal(pick(100, 100, 1, 1), 0);
  let picked = 0;
  for (let i = 0; i < 1000; i++) {
    const dl = 50 + (i * 37) % 100;
    const dm = 50 + (i * 61) % 100;
    if (pick(dl, dm, helena, kilian) === 0) picked++;
  }
  assert.ok(picked > 530, `Helena picked ${picked}/1000 with varying distances`);
}

// ---- start vehicle fallback
assert.equal(resolveStartVehicle('bike', cfg, profiles), 'bike');
assert.equal(resolveStartVehicle('skateboard', cfg, profiles), 'skateboard', 'Kilian rides his board');
assert.equal(resolveStartVehicle('skates', cfg, profiles), 'skates', 'Lorenz rolls on his skates');
assert.equal(resolveStartVehicle('rollerskates', cfg, profiles), 'foot', 'unknown ids run');
assert.equal(resolveStartVehicle('skates', cfg, { ...profiles, skates: undefined }), 'foot', 'no profile: run');
assert.equal(resolveStartVehicle('skates', { ...cfg, playerVehicles: ['foot'] }, profiles), 'foot', 'not a player vehicle until the config lists it');
assert.equal(resolveStartVehicle(undefined, cfg, profiles), 'foot');

// ---- state, service and hooks together
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const rig = (character) => {
  const events = new EventEmitter();
  const state = new GameState(events, stateCfg);
  const saves = new SaveSlots(state, events, memory());
  const ctx = { events, state, players: [], res: { inv: 1 } };
  const player = { index: 0, perks: {}, mods: { speed: 1, accel: 1, staminaSize: 1, staminaRegen: 1, spread: 1, assist: 1 }, move: {}, sprite: { scale: 1, setScale(v) { this.scale = v; } }, refreshLook() { this.looked = true; }, get attrs() { return state.players[0].attributes; } };
  ctx.players.push(player);
  const characters = new Characters(ctx, cfg, growth, profiles);
  if (character) state.dispatch('player.setCharacter', { player: 0, character });
  characters.apply(player);
  return { events, state, saves, ctx, player, characters };
};

{
  const { state, player, events, saves, characters } = rig('kilian');
  assert.deepEqual(order.map(a => state.players[0].attributes[a]), row(by.kilian), 'setCharacter copies the base attributes');
  assert.equal(player.character.id, 'kilian');
  assert.equal(player.look.walk, 'player-kilian');
  assert.equal(player.look.bike, 'player-kilian-bike');
  assert.equal(player.startVehicle, 'skateboard', 'Kilian starts on the board');
  assert.equal(player.look.skate, 'player-kilian-skate');
  assert.equal(player.look.skates, 'player-kilian-skates');
  assert.ok(player.looked);
  near(player.move.speedMult, 1.18);
  assert.equal(player.sprite.scale, 1, 'a normal-sized kid');
  near(player.move.staminaSize, 1);
  assert.equal(player.bullyWeight, 1);
  assert.equal(state.dispatch('player.setCharacter', { player: 0, character: 'nobody' }), false);

  const ups = [];
  events.on('attr:up', e => ups.push(e));
  // tricks raise Tempo (fractional); the displayed value changes only when the rounding does
  const tempo0 = state.players[0].attributes.tempo; // 8
  events.emit('style:banked', { player: 0, points: 120 });
  near(state.players[0].attributes.tempo, tempo0 + 0.15);
  assert.equal(displayValue(state.players[0].attributes.tempo), 8);
  assert.equal(ups.length, 0, 'no attr:up while the rounded value is unchanged');
  for (let i = 0; i < 4; i++) events.emit('style:banked', { player: 0 });
  assert.equal(displayValue(state.players[0].attributes.tempo), 9, '8.75 shows as 9');
  assert.deepEqual(ups.at(-1), { player: 0, attr: 'tempo', value: 9 });
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
  assert.ok(player.mods.spread < mods('kilian').spread, 'better aim after hits shrinks the scatter');
  // knowledge and order come from learning and karate; unknown players and payload-less events are ignored
  const w0 = state.players[0].attributes.wissen;
  events.emit('quiz:correct', { player: 0 });
  events.emit('lesson:done', { player: 0 });
  near(state.players[0].attributes.wissen, w0 + 0.35);
  events.emit('karate:belt', { player: 0, belt: 'yellow' });
  assert.equal(state.players[0].attributes.ordnung, by.kilian.attributes.ordnung + 1);
  events.emit('quiz:correct', { player: 1 });
  events.emit('quiz:correct');
  near(state.players[0].attributes.wissen, w0 + 0.40);
  assert.equal(characters.display(player).tempo, 10);

  // growth persists through save and load
  assert.ok(saves.save(2));
  const grownTempo = state.players[0].attributes.tempo;
  const grownWissen = state.players[0].attributes.wissen;
  state.dispatch('player.setCharacter', { player: 0, character: 'helena' });
  assert.ok(saves.load(2));
  assert.equal(state.players[0].character, 'kilian');
  assert.equal(state.players[0].attributes.tempo, grownTempo);
  near(state.players[0].attributes.wissen, grownWissen);
  characters.apply(player);
  assert.equal(player.character.id, 'kilian');
}

{
  const { state, player } = rig('helena');
  assert.equal(player.startVehicle, 'bike');
  assert.equal(player.bullyWeight, 1.25);
  assert.equal(player.mods.speed, 1);
  assert.ok(player.mods.spread < 0.5);
  assert.deepEqual([state.players[0].karate.belt, state.players[0].karate.points], ['yellow', 60], 'Helena starts the game with the yellow belt and its points');
  assert.equal(state.dispatch('attr.grow', { player: 0, attr: 'wissen', amount: 5, reason: 'test' }), true);
  assert.equal(state.players[0].attributes.wissen, 10, 'the action clamps at the maximum');
  assert.equal(state.dispatch('attr.grow', { player: 0, attr: 'wissen', amount: 1, reason: 'test' }), false, 'and rejects growth at the cap');
  const bad = [{ player: 3, attr: 'tempo', amount: 1 }, { player: 0, attr: 'luck', amount: 1 }, { player: 0, attr: 'tempo', amount: -1 }, { player: 0, attr: 'tempo', amount: NaN }, { player: 0, attr: 'tempo', amount: 1 }];
  for (const payload of bad) assert.equal(state.dispatch('attr.grow', payload), false, JSON.stringify(payload));
}

{ // Lorenz: the youngest, smaller, talks and grabs
  const { state, player } = rig('lorenz');
  assert.equal(player.startVehicle, 'skates');
  near(player.sprite.scale, 0.9);
  assert.deepEqual([state.players[0].karate.belt, state.players[0].karate.points], ['white', 0], 'only Helena starts with a higher belt');
  near(player.mods.speed, 1 + 0.06 * 2);
}

{ // a second player that joins co-op gets Helena's belt as well when it is her
  const { state } = rig('kilian');
  state.dispatch('coop.set', { on: true });
  assert.equal(state.players[1].character, 'helena');
  assert.equal(state.players[1].karate.belt, 'yellow');
  assert.ok(state.dispatch('player.setCharacter', { player: 0, character: 'helena' }));
  state.dispatch('karate.promote', { player: 0, belt: 'orange', day: 2 });
  state.dispatch('player.setCharacter', { player: 0, character: 'helena' });
  assert.equal(state.players[0].karate.belt, 'orange', 'choosing Helena again never lowers an earned belt');
}

// ---- the stronger Kiai: kiaiPower scales the radius and the Aerger taken off, never below the belt's own
{
  const out = {};
  const yellow = karate.belts.find(b => b.id === 'yellow');
  boostedKiai(yellow, 1, out);
  assert.deepEqual(out, { radius: yellow.kiaiRadius, aerger: yellow.aergerReduction });
  boostedKiai(yellow, perks('helena').kiaiPower, out);
  near(out.radius, yellow.kiaiRadius * perks('helena').kiaiPower);
  assert.ok(out.radius > yellow.kiaiRadius && out.aerger > yellow.aergerReduction, 'Helena shouts further and calms more');
  boostedKiai(yellow, 0.5, out);
  assert.equal(out.aerger, yellow.aergerReduction, 'never below the belt value');
}

// ---- learning difficulty: Lorenz starts a bit easier on topics not answered yet
{
  const lc = load('data/learning.json');
  assert.equal(emptyStats(lc).level, lc.startLevel);
  near(emptyStats(lc, by.lorenz.learningStartOffset).level, lc.startLevel - 0.5);
  near(normalizeStats(undefined, lc, -0.5).level, lc.startLevel - 0.5);
  near(normalizeStats({ level: 3 }, lc, -0.5).level, 3, 1e-9);
  assert.ok(normalizeStats({ level: -9 }, lc, -0.5).level >= lc.levelMin, 'still clamped');
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
  const old = { v: 1, shared: { money: 100, clock: { day: 1, minute: 0, phase: null } }, players: [{ character: 'lorenz', attributes: { fitness: 1, kopf: 1, mut: 1, charme: 1 }, xp: 0, level: 1 }, { character: null, attributes: { fitness: 1 } }] };
  const m = migrate(old, stateCfg, 2);
  assert.deepEqual(m.players[0].attributes, by.lorenz.attributes);
  assert.deepEqual(m.players[1].attributes, stateCfg.attributes);
  assert.equal(m.v, 2);
}

// ---- migration v4 -> v5: Lena/Mehmet/Jonas (and the old placeholder ids) become Helena/Kilian/Lorenz by position
{
  const old = id => ({ v: 4, shared: {}, players: [{ character: id, attributes: { wissen: 9, tempo: 5, ausdauer: 5, charme: 5, ordnung: 8, zielen: 8 }, karate: { belt: 'white', points: 3, sessions: 0, lastExamDay: 0, trainDay: 0, trainedToday: 0 } }, { character: null, attributes: {}, karate: { belt: 'white' } }] });
  const to = { lena: 'helena', mehmet: 'kilian', jonas: 'lorenz', 'kid-a': 'helena', 'kid-b': 'kilian', 'kid-c': 'lorenz' };
  for (const [from, id] of Object.entries(to)) assert.equal(migrate(old(from), stateCfg, 5).players[0].character, id, `${from} -> ${id}`);
  const lena = migrate(old('lena'), stateCfg, 5);
  assert.equal(lena.v, 5);
  assert.equal(lena.players[1].character, null, 'an empty slot stays empty');
  assert.deepEqual(row({ attributes: lena.players[0].attributes }), [9, 5, 6, 5, 8, 7], 'an ungrown Lena is exactly Helena');
  assert.deepEqual([lena.players[0].karate.belt, lena.players[0].karate.points], ['yellow', 60], 'Helena gets her yellow belt');
  const grownMehmet = old('mehmet');
  Object.assign(grownMehmet.players[0].attributes, { wissen: 5, tempo: 9.5, ausdauer: 9, charme: 6, ordnung: 3, zielen: 5 });
  const kilian = migrate(grownMehmet, stateCfg, 5).players[0];
  near(kilian.attributes.tempo, 8.5, 1e-9);
  assert.equal(kilian.attributes.wissen, 8, 'the earned growth carries over on the new base');
  assert.equal(kilian.karate.belt, 'white');
  const ranked = old('jonas');
  ranked.players[0].karate.belt = 'green';
  assert.equal(migrate(ranked, stateCfg, 5).players[0].karate.belt, 'green');
  const helena = old('lena');
  helena.players[0].karate.belt = 'orange';
  assert.equal(migrate(helena, stateCfg, 5).players[0].karate.belt, 'orange', 'a higher earned belt is kept');
  assert.equal(migrate(old('someone-else'), stateCfg, 5).players[0].character, 'someone-else', 'unknown ids stay');
  assert.deepEqual(migrate(migrate(old('lena'), stateCfg, 5), stateCfg, 5), migrate(old('lena'), stateCfg, 5), 'a v5 save is untouched');
}

console.log('check-characters: ok');
