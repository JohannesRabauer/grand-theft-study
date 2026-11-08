// Checks the state store and save slots without Phaser (state/*, data/state.json): defaults,
// actions-only mutation, wallet rules, save/load round trip, migration, corrupt slots, summaries,
// autosave on phase:ended. Run: node scripts/check-state.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState, createDefaultState, STATE_VERSION } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';
import { migrate } from '../state/migrations.js';
import { slotSummary, formatMoney } from '../ui/slotSummary.js';

const cfg = JSON.parse(readFileSync(new URL('../data/state.json', import.meta.url), 'utf8'));
// the tiny localStorage shim
const memoryStorage = () => {
  const m = new Map();
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};
// tests below count from an empty wallet unless a case reads the real defaults
const fresh = (c = { ...cfg, startMoneyCents: 0 }) => {
  const events = new EventEmitter();
  const log = [];
  for (const e of ['state:changed', 'state:rejected', 'state:slot-corrupt', 'state:saved']) events.on(e, p => log.push([e, p]));
  const storage = memoryStorage();
  const state = new GameState(events, c);
  return { events, log, storage, state, saves: new SaveSlots(state, events, storage) };
};

// defaults
{
  const { state } = fresh(cfg);
  assert.equal(state.data.v, STATE_VERSION);
  assert.equal(state.shared.money, 500, 'the kid starts with 5 euro');
  assert.equal(state.shared.familienfrieden, cfg.startFamilienfrieden);
  assert.deepEqual(state.shared.ownedVehicles, ['foot']);
  assert.equal(state.players.length, cfg.players);
  const p = state.players[0];
  assert.deepEqual([p.character, p.xp, p.level, p.karate.belt], [null, 0, 1, 'white']);
  for (const k of ['attributes', 'grades', 'learning', 'cosmetics']) assert.equal(typeof p[k], 'object', `player.${k}`);
  assert.ok(Array.isArray(p.stickers) && Array.isArray(p.bag));
  const a = createDefaultState(cfg), b = createDefaultState(cfg);
  assert.notEqual(a.players[0].attributes, b.players[0].attributes, 'defaults are not shared objects');
}

// mutation only through dispatch
{
  const { state, log } = fresh();
  assert.throws(() => { state.shared.money = 999; }, TypeError, 'direct writes are blocked');
  assert.throws(() => { state.players[0].bag.push('x'); }, TypeError, 'nested writes are blocked');
  assert.equal(state.shared.money, 0);
  assert.equal(state.dispatch('wallet.earn', { cents: 250, reason: 'chore' }), true);
  assert.equal(state.shared.money, 250);
  assert.deepEqual(log.at(-1), ['state:changed', { path: 'shared.money', action: 'wallet.earn', payload: { cents: 250, reason: 'chore' } }]);
  state.dispatch('flags.set', { key: 'met-oma' });
  assert.equal(state.shared.flags['met-oma'], true);
  state.dispatch('player.setCharacter', { player: 0, character: 'kid-a' });
  assert.equal(state.players[0].character, 'kid-a');
  const before = log.length;
  const warn = console.warn; console.warn = () => {};
  assert.equal(state.dispatch('nope'), false);
  console.warn = warn;
  state.dispatch('xp.add', { player: 0, amount: cfg.xpPerLevel * 2 + 5 });
  assert.deepEqual([state.players[0].xp, state.players[0].level], [cfg.xpPerLevel * 2 + 5, 3]);
  assert.deepEqual(log.slice(before).map(([, p]) => p.path), ['players.0.xp', 'players.0.level']);
  state.dispatch('xp.add', { player: 0, amount: 1e6 });
  assert.equal(state.players[0].level, cfg.maxLevel, 'level is capped');
}

// wallet rules
{
  const { state, log } = fresh();
  state.dispatch('wallet.earn', { cents: 100, reason: 'a' });
  assert.equal(state.dispatch('wallet.spend', { cents: 101, reason: 'b' }), false);
  assert.equal(state.shared.money, 100, 'overspend leaves money untouched');
  assert.equal(log.at(-1)[1].reason, 'insufficient-funds');
  assert.equal(state.dispatch('wallet.spend', { cents: 100, reason: 'b' }), true);
  assert.equal(state.shared.money, 0);
  for (const bad of [{ cents: 1.5, reason: 'x' }, { cents: -5, reason: 'x' }, { cents: 0, reason: 'x' }, { cents: 5 }, { cents: '5', reason: 'x' }]) {
    assert.equal(state.dispatch('wallet.earn', bad), false, `earn rejects ${JSON.stringify(bad)}`);
    assert.equal(state.dispatch('wallet.spend', bad), false, `spend rejects ${JSON.stringify(bad)}`);
  }
  assert.equal(state.shared.money, 0);
}

// round trip, summaries, delete
{
  const { state, saves, storage, log } = fresh();
  state.dispatch('wallet.earn', { cents: 1234, reason: 'a' });
  state.dispatch('player.setCharacter', { player: 0, character: 'kid-b' });
  state.dispatch('xp.add', { player: 0, amount: 150 });
  assert.deepEqual(saves.list().map(r => r.status), ['empty', 'empty', 'empty']);
  assert.equal(saves.save(2), true);
  assert.ok(storage.m.has('schulweg.save.2'));
  const snapshot = JSON.stringify(state.data);
  state.dispatch('wallet.earn', { cents: 1, reason: 'later' });
  assert.equal(saves.load(2), true);
  assert.equal(JSON.stringify(state.data), snapshot, 'load restores exactly what was saved');
  assert.equal(log.at(-1)[1].path, '', 'load announces a whole-state change');
  assert.throws(() => { state.shared.money = 1; }, TypeError, 'loaded data is frozen too');
  const rows = saves.list();
  assert.deepEqual(rows.map(r => r.status), ['empty', 'ok', 'empty']);
  assert.deepEqual([rows[1].money, rows[1].players, rows[1].day], [1234, [{ character: 'kid-b', level: 2 }], 1]);
  assert.ok(rows[1].savedAt > 0);
  assert.equal(saves.load(1), false, 'empty slot loads nothing');
  saves.delete(2);
  assert.equal(saves.list()[1].status, 'empty');
  for (const bad of [0, 4, 1.5, '1']) assert.throws(() => saves.save(bad), RangeError);
  const full = fresh();
  full.storage.setItem = () => { throw new Error('quota'); };
  const failed = [];
  full.events.on('state:save-failed', p => failed.push(p));
  const warn = console.warn; console.warn = () => {};
  assert.equal(full.saves.save(1), false);
  console.warn = warn;
  assert.deepEqual(failed, [{ slot: 1 }], 'a full storage reports instead of throwing');
}

// migration chain
{
  const old = { v: 0, euros: 12.34, player: { character: 'kid-c', xp: 40, level: 1 } }; // the old placeholder id maps to Lorenz (migration v5)
  const m = migrate(old, cfg, STATE_VERSION);
  assert.equal(m.v, STATE_VERSION);
  assert.equal(m.shared.money, 1234, 'float euros become integer cents');
  assert.equal(m.players[0].character, 'lorenz');
  assert.equal(m.players[0].xp, 40);
  assert.deepEqual(m.shared.ownedVehicles, ['foot']);
  assert.throws(() => migrate({ v: STATE_VERSION + 1 }, cfg, STATE_VERSION), /unsupported/);
  const { saves, storage, state } = fresh();
  storage.setItem('schulweg.save.3', JSON.stringify(old));
  assert.equal(saves.list()[2].money, 1234, 'summaries read old saves through the migration');
  assert.equal(saves.load(3), true);
  assert.equal(state.shared.money, 1234);
  assert.equal(state.data.v, STATE_VERSION);
}

// corrupt slots
{
  const junks = ['{not json', '[]', 'null', '{"v":"1"}', JSON.stringify({ v: 1, shared: {}, players: [] }),
    JSON.stringify({ v: 99, shared: {}, players: [{}] })];
  for (const junk of junks) {
    const { saves, storage, state, log } = fresh();
    storage.setItem('schulweg.save.1', junk);
    assert.equal(saves.list()[0].status, 'corrupt', `list flags ${junk}`);
    assert.ok(storage.m.has('schulweg.save.1'), 'listing does not touch the slot');
    const before = JSON.stringify(state.data);
    assert.equal(saves.load(1), false);
    assert.equal(storage.getItem('schulweg.save.1.bak'), junk, 'raw copy kept as .bak');
    assert.equal(storage.getItem('schulweg.save.1'), null);
    assert.equal(log.filter(([e]) => e === 'state:slot-corrupt').length, 1);
    assert.equal(JSON.stringify(state.data), before, 'live state untouched');
    assert.equal(saves.activeSlot, null);
  }
}

// autosave
{
  const { saves, events, state, storage } = fresh();
  events.emit('phase:ended', { phase: 'school' });
  assert.equal(storage.m.size, 0, 'no slot chosen: no autosave');
  saves.save(1);
  state.dispatch('wallet.earn', { cents: 500, reason: 'a' });
  events.emit('phase:ended', { phase: 'school' });
  assert.equal(JSON.parse(storage.getItem('schulweg.save.1')).shared.money, 500, 'phase:ended saves into the active slot');
  assert.equal(storage.m.size, 1);
  saves.delete(1);
  events.emit('phase:ended', {});
  assert.equal(storage.m.size, 0, 'deleting the active slot stops autosave');
}

// a finished run removes every listener of the shared emitter: the autosave has to come back with the next run (attach)
{
  const { saves, events, state, storage } = fresh();
  saves.save(1);
  events.removeAllListeners(); // what GameScene does when a run ends
  state.dispatch('wallet.earn', { cents: 700, reason: 'a' });
  events.emit('phase:ended', { phase: 'school' });
  assert.equal(JSON.parse(storage.getItem('schulweg.save.1')).shared.money, 0, 'without attach the autosave is gone (the bug this guards against)');
  saves.attach();
  saves.attach(); // twice is harmless
  let writes = 0;
  const set = storage.setItem;
  storage.setItem = (k, v) => { writes++; set(k, v); };
  events.emit('phase:ended', { phase: 'afternoon' });
  assert.equal(JSON.parse(storage.getItem('schulweg.save.1')).shared.money, 700, 'after attach the autosave works again');
  assert.equal(writes, 1, 'and saves once per phase end, however often attach ran');
}

// slot screen: startNew, backup flag, summary text
{
  const { saves, state, storage } = fresh(cfg);
  state.dispatch('wallet.earn', { cents: 99, reason: 'a' });
  assert.equal(saves.startNew(2), true);
  assert.equal(saves.activeSlot, 2, 'a new game binds its slot');
  assert.equal(state.shared.money, 500, 'new game resets the state to defaults');
  assert.ok(storage.m.has('schulweg.save.2'), 'and writes it right away');
  storage.setItem('schulweg.save.1', '{broken');
  assert.equal(saves.hasBackup(1), false);
  saves.load(1);
  assert.equal(saves.hasBackup(1), true);
  const t = (k, p = {}) => `${k}${Object.values(p).join(',')}`;
  assert.equal(formatMoney(1234, 'de'), '12,34');
  assert.equal(formatMoney(5, 'en'), '0.05');
  const rows = saves.list();
  assert.equal(slotSummary(rows[0], t, 'de', true), 'menu.slot.emptyBackup');
  assert.equal(slotSummary(rows[2], t, 'de'), 'menu.slot.empty');
  assert.equal(slotSummary({ status: 'corrupt' }, t, 'de'), 'menu.slot.corrupt');
  assert.equal(slotSummary(rows[1], t, 'de'), 'menu.slot.player1 menu.slot.level1 | menu.slot.day1 | € 5,00');
  assert.equal(slotSummary({ ...rows[1], players: [{ character: 'kid-a', level: 3 }, { character: null, level: 1 }] }, t, 'en').split(' | ')[0],
    'kid-a menu.slot.level3 + menu.slot.player2 menu.slot.level1');
}

console.log('check-state: ok');
