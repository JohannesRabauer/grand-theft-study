// New-game menu logic (AD-18) without Phaser: modes, who picks what, validation, navigation keys and pads, the start
// actions run against the real state store, the pad owner mapping and the text keys. Run: node scripts/check-menu.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NewGameFlow, coopAvailable, menuPads, modeSummary, navAction, padAction, padJoinHint, startActions } from '../ui/menuFlow.js';
import { padFor, padOwner } from '../ui/inputBindings.js';
import { GameState } from '../state/GameState.js';

const load = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const ids = load('data/characters.json').characters.map(c => c.id);

// ---- solo: mode, one pick, done
let f = new NewGameFlow(ids);
assert.equal(f.step, 'mode');
assert.equal(f.result, null);
assert.equal(f.pick(ids[0]), false, 'no pick before a mode is chosen');
assert.equal(f.chooseMode('trio'), false, 'unknown mode refused');
assert.equal(f.chooseMode('solo'), true);
assert.deepEqual([f.step, f.picker], ['pick', 0]);
assert.equal(f.chooseMode('coop'), false, 'the mode cannot change mid-pick');
assert.equal(f.pick('nobody'), false, 'unknown character refused');
assert.equal(f.pick(ids[1]), true);
assert.equal(f.step, 'done');
assert.deepEqual(f.result, { coop: false, characters: [ids[1]] });
assert.equal(f.pick(ids[0]), false, 'nothing more to pick');

// ---- co-op: two picks, the same character twice is fine
f = new NewGameFlow(ids);
f.chooseMode('coop');
assert.equal(f.pick(ids[2]), true);
assert.deepEqual([f.step, f.picker, f.result], ['pick', 1, null], 'player 2 picks next');
assert.equal(f.pick(ids[2]), true);
assert.deepEqual(f.result, { coop: true, characters: [ids[2], ids[2]] });

// ---- back steps one screen up and forgets the pick it undoes
f = new NewGameFlow(ids);
assert.equal(f.back(), 'exit', 'back from the mode screen leaves the flow');
f.chooseMode('coop');
f.pick(ids[0]);
assert.equal(f.back(), 'pick');
assert.deepEqual([f.step, f.picker, f.picks.length], ['pick', 0, 0], 'back to player 1');
assert.equal(f.back(), 'mode');
assert.equal(f.step, 'mode');
assert.equal(f.chooseMode('solo'), true, 'a different mode can be chosen after going back');

// ---- co-op is refused where there is no second device
f = new NewGameFlow(ids, { coopAllowed: coopAvailable({ coarse: true, pads: 0 }) });
assert.equal(f.chooseMode('coop'), false, 'touch only: no co-op');
assert.equal(f.step, 'mode');
assert.equal(f.chooseMode('solo'), true);
assert.equal(coopAvailable({ coarse: true, pads: 1 }), true, 'a pad on a touch device allows co-op');
assert.equal(coopAvailable({ coarse: false, pads: 0 }), true, 'a keyboard device allows co-op');
assert.equal(padJoinHint({ pads: 1, coopAllowed: true }), true);
assert.equal(padJoinHint({ pads: 0, coopAllowed: true }), false);

// ---- who steers a pick
assert.equal(navAction(0, true, 'KeyA'), 'left');
assert.equal(navAction(0, true, 'Space'), 'confirm');
assert.equal(navAction(0, true, 'ArrowLeft'), null, 'co-op: P1 does not use the arrows');
assert.equal(navAction(1, true, 'ArrowRight'), 'right');
assert.equal(navAction(1, true, 'Enter'), 'confirm');
assert.equal(navAction(1, true, 'KeyD'), null, 'co-op: P2 does not use WASD');
assert.equal(navAction(0, false, 'ArrowRight'), 'right', 'alone, either key set works');
assert.equal(navAction(0, false, 'KeyD'), 'right');
assert.equal(navAction(0, false, 'Enter'), 'confirm');
assert.equal(navAction(0, false, 'KeyZ'), null);
assert.deepEqual(menuPads(0, false, 2), [0, 1], 'alone: any pad');
assert.deepEqual(menuPads(1, true, 1), [0], 'co-op, one pad: it is player 2');
assert.deepEqual(menuPads(0, true, 1), [], 'co-op, one pad: player 1 has none');
assert.deepEqual([menuPads(0, true, 2), menuPads(1, true, 2)], [[1], [0]], 'two pads: pad 1 -> P1, pad 2 -> P2');
assert.deepEqual(menuPads(1, true, 0), []);

// ---- pad polling: edges only, the first poll just records a held button
const pad = (down = [], x = 0) => ({ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i) })), leftStick: { x, y: 0 } });
const mem = {};
assert.equal(padAction(pad([0]), mem), null, 'A held when the screen opens does nothing');
assert.equal(padAction(pad([0]), mem), null);
assert.equal(padAction(pad(), mem), null);
assert.equal(padAction(pad([0]), mem), 'confirm');
assert.equal(padAction(pad([0]), mem), null, 'held: no repeat');
assert.equal(padAction(pad([15]), mem), 'right');
assert.equal(padAction(pad([], -0.9), mem), 'left', 'the stick steers too');
assert.equal(padAction(pad([], -0.9), mem), null);
assert.equal(padAction(pad([], -0.2), mem), null, 'inside the dead zone');

// ---- the actions start the right game on the real store
const stateCfg = { ...load('data/state.json'), characters: Object.fromEntries(load('data/characters.json').characters.map(c => [c.id, c.attributes])) };
const run = (result) => {
  const s = new GameState({ emit() {} }, stateCfg);
  for (const { action, payload } of startActions(result)) assert.ok(s.dispatch(action, payload) !== false, action);
  return s;
};
const duo = run({ coop: true, characters: ['lena', 'mehmet'] });
assert.equal(duo.shared.flags.coop, true);
assert.deepEqual(duo.players.map(p => p.character), ['lena', 'mehmet'], 'each player has the picked character');
const same = run({ coop: true, characters: ['jonas', 'jonas'] });
assert.deepEqual(same.players.map(p => p.character), ['jonas', 'jonas']);
const solo = run({ coop: false, characters: ['mehmet'] });
assert.equal(!!solo.shared.flags.coop, false);
assert.equal(solo.players[0].character, 'mehmet');
assert.equal(solo.players.length, 1);

// ---- pad owner: the inverse of padFor
for (const count of [1, 2]) for (let i = 0; i < count; i++) assert.equal(padOwner(padFor(i, count), count), i);
assert.equal(padOwner(1, 1), -1, 'alone, the second pad drives nobody');
assert.equal(padOwner(5, 2), -1);

// ---- text
const de = load('i18n/de.json');
const en = load('i18n/en.json');
const t = (d) => (k, p = {}) => d[k].replace(/\{(\w+)\}/g, (_, n) => p[n]);
assert.equal(modeSummary(['Lena', 'Jonas'], t(en)), 'Co-op: Lena + Jonas');
assert.equal(modeSummary(['Lena'], t(de)), 'Allein: Lena');
for (const k of ['menu.mode.solo', 'menu.mode.coop', 'menu.mode.controls', 'menu.mode.padJoin', 'menu.mode.touchOnly', 'toast.padLost', 'menu.character.titleP1', 'menu.character.titleP2', 'menu.character.hintP1', 'menu.character.hintP2']) {
  assert.ok(de[k] && en[k], `text key ${k}`);
}
console.log('check-menu: flow, navigation, pad polling, start actions and texts ok');
