// Vehicle ownership, bike parking and borrowing without Phaser (story 5.5, CAP-16, AD-22, AD-23): the unlock and buy
// actions, the Ownership service, ownership in saves, the pure parking / theft rules, and the data (shop prices, theft
// numbers, racks, hideouts, garage, i18n) against the town map, including real A* paths from every bully spawn to
// every hideout. Run: node scripts/check-vehicles.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';
import { Ownership, isOwned } from '../vehicles/Ownership.js';
import { awayTime, borrowable, hasMotive, pickHideout, pickOrigin, rackNear } from '../vehicles/theftLogic.js';
import { Pathfinder } from '../ai/Pathfinding.js';
import { validateObject } from '../services/worldLogic.js';

const read = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const stateCfg = { ...read('data/state.json'), morning: read('data/morning.json'), shop: read('data/shop.json') };
const theft = read('data/theft.json');
const vehicles = read('data/vehicles.json');
const chars = read('data/characters.json');
const map = read('data/maps/town.json');
const de = read('i18n/de.json');
const en = read('i18n/en.json');

const fresh = (cfg = stateCfg) => {
  const events = new EventEmitter();
  const log = [];
  for (const e of ['state:changed', 'state:rejected', 'vehicle:unlocked', 'vehicle:refused', 'ui:toast']) events.on(e, p => log.push([e, p]));
  const state = new GameState(events, cfg);
  const ctx = { events, state, t: k => k };
  ctx.ownership = new Ownership(ctx);
  return { events, log, state, ctx };
};
const owned = s => [...s.shared.ownedVehicles].sort();

// ---- unlock action: every path, reasons, no double unlock
{
  const { state, log } = fresh();
  assert.deepEqual(owned(state), ['foot'], 'a new game owns nothing but walking');
  for (const [id, reason] of [['skates', 'start'], ['bike', 'bought'], ['skateboard', 'race']]) assert.equal(state.dispatch('vehicles.unlock', { id, reason }), true, `${reason}`);
  assert.deepEqual(owned(state), ['bike', 'foot', 'skateboard', 'skates']);
  assert.equal(state.dispatch('vehicles.unlock', { id: 'bike', reason: 'garage' }), false, 'twice is rejected');
  assert.equal(log.at(-1)[1].reason, 'already-owned');
  assert.equal(state.dispatch('vehicles.unlock', { id: 'jetpack', reason: 'garage' }), false, 'unknown vehicles are rejected');
  assert.equal(state.dispatch('vehicles.unlock', { id: 'bike', reason: 'found-on-street' }), false, 'unknown reasons are rejected');
  assert.equal(owned(state).length, 4);
  const g = fresh().state;
  assert.equal(g.dispatch('vehicles.unlock', { id: 'skateboard', reason: 'garage' }), true, 'the garage reason works');
  assert.equal(g.data.shared.ownedVehicles.filter(v => v === 'skateboard').length, 1);
  assert.throws(() => g.shared.ownedVehicles.push('bike'), TypeError, 'ownership is frozen state');
}

// ---- shop.buyVehicle: prices from data/shop.json, atomic
{
  const prices = Object.fromEntries(stateCfg.shop.items.filter(i => i.type === 'vehicle').map(i => [i.vehicle, i.price]));
  assert.deepEqual(prices, { skateboard: 4500, skates: 5500, bike: 6000, scooter: 5000, rollerblades: 6500 }, 'prices in cents');
  for (const id of stateCfg.vehicleIds) assert.ok(id in prices && id in vehicles, `${id} has a price and a profile`);
  const { state, log } = fresh();
  assert.equal(state.dispatch('shop.buyVehicle', { id: 'bike' }), false, '5 euro do not buy a bike');
  assert.equal(log.at(-1)[1].reason, 'insufficient-funds');
  assert.deepEqual([state.shared.money, owned(state)], [500, ['foot']], 'a rejected buy changes nothing');
  state.dispatch('wallet.earn', { cents: 10000, reason: 'test' });
  assert.equal(state.dispatch('shop.buyVehicle', { id: 'bike' }), true);
  assert.deepEqual([state.shared.money, owned(state)], [10500 - 6000, ['bike', 'foot']], 'money and unlock change together');
  assert.deepEqual(log.filter(l => l[0] === 'state:changed' && l[1].action === 'shop.buyVehicle').map(l => l[1].path), ['shared.money', 'shared.ownedVehicles']);
  assert.equal(state.dispatch('shop.buyVehicle', { id: 'bike' }), false, 'owning it already');
  assert.equal(log.at(-1)[1].reason, 'already-owned');
  assert.equal(state.dispatch('shop.buyVehicle', { id: 'foot' }), false);
  assert.equal(log.at(-1)[1].reason, 'not-for-sale', 'walking is not for sale');
  assert.equal(state.shared.money, 4500, 'rejections keep the money');
  state.dispatch('shop.buyVehicle', { id: 'skateboard' });
  assert.equal(state.shared.money, 0, 'exactly enough money is enough');
  assert.equal(state.dispatch('shop.buyVehicle', { id: 'skates' }), false);
}

// ---- Ownership service: events, toasts, the race hook
{
  const { ctx, events, log, state } = fresh();
  const { ownership } = ctx;
  assert.ok(isOwned(state.shared, 'foot') && ownership.owns('foot') && !ownership.owns('bike'));
  assert.equal(ownership.unlock('skates', 'start'), true);
  assert.deepEqual(log.filter(l => l[0] === 'ui:toast'), [], 'the start vehicle is no news');
  assert.equal(ownership.unlock('skates', 'start'), false, 'already owned');
  assert.equal(ownership.unlock(undefined, 'start'), false);
  assert.equal(ownership.unlock('foot', 'start'), false, 'walking is always owned');
  events.emit('race:won', { vehicle: 'skateboard' });
  assert.ok(ownership.owns('skateboard'), 'race:won unlocks the prize vehicle');
  assert.deepEqual(log.filter(l => l[0] === 'vehicle:unlocked').at(-1)[1], { id: 'skateboard', reason: 'race' });
  assert.deepEqual(log.filter(l => l[0] === 'ui:toast').at(-1)[1], { key: 'vehicle.unlocked', params: { name: 'vehicle.skateboard' } });
  events.emit('race:won', { vehicle: 'jetpack' });
  events.emit('race:won', {});
  events.emit('race:won');
  assert.deepEqual(owned(state), ['foot', 'skateboard', 'skates'], 'a bad race prize changes nothing');
  state.dispatch('wallet.earn', { cents: 6000, reason: 'test' });
  state.dispatch('shop.buyVehicle', { id: 'bike' });
  assert.deepEqual(log.filter(l => l[0] === 'vehicle:unlocked').at(-1)[1], { id: 'bike', reason: 'bought' }, 'buying announces too');
  const fresh2 = fresh();
  fresh2.ctx.ownership.refuse('bike');
  assert.deepEqual(fresh2.log.map(l => l[0]), ['vehicle:refused', 'ui:toast']);
  assert.equal(fresh2.log[1][1].key, 'vehicle.locked');
}

// ---- ownership survives a save
{
  const memory = new Map();
  const storage = { getItem: k => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
  const a = fresh();
  a.state.dispatch('vehicles.unlock', { id: 'skates', reason: 'start' });
  a.state.dispatch('vehicles.unlock', { id: 'bike', reason: 'garage' });
  a.state.dispatch('flags.set', { key: 'stolenBike', value: { hideout: 'h', x: 1, y: 2, bikeId: 'bike1', map: 'town' } });
  assert.equal(new SaveSlots(a.state, a.events, storage).save(1), true);
  const b = fresh();
  assert.deepEqual(owned(b.state), ['foot']);
  assert.equal(new SaveSlots(b.state, b.events, storage).load(1), true);
  assert.deepEqual(owned(b.state), ['bike', 'foot', 'skates'], 'ownership round-trips');
  assert.equal(b.state.shared.flags.stolenBike.bikeId, 'bike1', 'a pending theft round-trips');
  assert.ok(b.ctx.ownership.owns('bike') && !b.ctx.ownership.owns('skateboard'));
}

// ---- every character's start vehicle can be unlocked
for (const id of ['scooter', 'rollerblades']) {
  const { state, ctx, log } = fresh();
  assert.ok(!ctx.ownership.owns(id), `${id} is not a starting unlock`);
  ctx.ownership.refuse(id);
  assert.equal(log.at(-1)[1].key, 'vehicle.locked');
  assert.equal(state.dispatch('vehicles.unlock', { id, reason: 'street-theft' }), false);
  assert.equal(state.dispatch('shop.buyVehicle', { id }), false, `${id} needs enough money`);
  const price = stateCfg.shop.items.find(i => i.vehicle === id).price;
  state.dispatch('wallet.earn', { cents: price - state.shared.money, reason: 'test' });
  assert.equal(state.dispatch('shop.buyVehicle', { id }), true);
  assert.equal(state.shared.money, 0);
  assert.ok(ctx.ownership.owns(id));
  assert.equal(state.dispatch('vehicles.unlock', { id, reason: 'garage' }), false, 'no duplicate ownership');
  assert.ok(de[`vehicle.${id}`] && en[`vehicle.${id}`], `${id} is localized`);
  const items = map.objects.filter(o => o.type === id);
  assert.ok(items.length > 0 && items.every(o => !o.debug), `${id} has ordinary town displays`);
  const catalog = read('data/object-types.json');
  assert.ok(catalog.types[id].reach, `${id} must be reachable`);
  for (const item of items) assert.deepEqual(validateObject(item, catalog, { catalog, surfaces: read('data/surfaces.json'), tiles: read('data/tiles.json'), i18n: new Set(Object.keys(de)) }, 'town'), []);
}

{
  const a = fresh();
  a.state.dispatch('vehicles.unlock', { id: 'bike', reason: 'start' });
  a.state.dispatch('xp.add', { player: 0, amount: 140, reason: 'test' });
  a.state.dispatch('flags.set', { key: 'garageFound', value: true });
  const before = JSON.parse(JSON.stringify(a.state.data));
  for (const id of ['scooter', 'rollerblades']) assert.ok(a.ctx.ownership.unlock(id, 'race'));
  assert.deepEqual(a.state.players, before.players, 'unlocking keeps attributes and morning preparation');
  const expected = JSON.parse(JSON.stringify(a.state.data));
  const memory = new Map();
  const storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
  assert.ok(new SaveSlots(a.state, a.events, storage).save(1));
  const b = fresh();
  assert.ok(new SaveSlots(b.state, b.events, storage).load(1));
  assert.deepEqual(b.state.data, expected, 'v6 Continue keeps both new IDs and all old progress');
}

for (const c of chars.characters) assert.ok(c.startVehicle === 'foot' || stateCfg.vehicleIds.includes(c.startVehicle), `${c.id}: start vehicle ${c.startVehicle} is a known vehicle`);

// ---- parking and borrowing rules
{
  const racks = [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 140, y: 100 }];
  assert.equal(rackNear([racks[0]], 100 + theft.rackRadius, 100, theft.rackRadius).id, 'a', 'at the radius counts');
  assert.equal(rackNear([racks[0]], 100 + theft.rackRadius + 1, 100, theft.rackRadius), null, 'just outside the radius does not');
  assert.equal(rackNear(racks, 130, 100, theft.rackRadius).id, 'b', 'the nearest rack wins');
  assert.equal(rackNear(racks, 100, 300, theft.rackRadius), null, 'far from every rack the bike stays unlocked');
  assert.equal(rackNear([], 0, 0, 10), null);

  let t = 0;
  for (let i = 0; i < 60 * 30; i++) t = awayTime(t, 1 / 60, theft.awayDistance + 1, theft);
  assert.ok(Math.abs(t - 30) < 0.01, 'time counts while every player is away');
  assert.equal(awayTime(t, 1 / 60, theft.awayDistance, theft), 0, 'a player at the bike resets it');
  assert.equal(awayTime(5, 0.5, 1e6, theft), 5.5);

  const spawns = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 5000, y: 0 }];
  assert.deepEqual(pickOrigin(spawns, 280, 0, theft, () => false), spawns[1], 'nearest spawn');
  assert.deepEqual(pickOrigin(spawns, 280, 0, theft, (x) => x === 300), spawns[0], 'spawns in view are skipped');
  assert.equal(pickOrigin(spawns, 280, 0, theft, () => true), null, 'everything in view: no thief');
  assert.equal(pickOrigin([spawns[2]], 0, 0, theft, () => false), null, 'too far away');

  const near = { x: 100, y: 0 };
  assert.equal(hasMotive(0, false, near, 0, 0, theft), true, 'a spawn close by is a motive');
  assert.equal(hasMotive(0, false, { x: theft.motiveRadius + 1, y: 0 }, 0, 0, theft), false, 'a far spawn alone is not');
  assert.equal(hasMotive(1, false, { x: 5000, y: 0 }, 0, 0, theft), true, 'Aerger is');
  assert.equal(hasMotive(0, true, null, 0, 0, theft), true, 'an active bully is');
  assert.equal(hasMotive(0, false, null, 0, 0, theft), false);

  const ok = { locked: false, busy: false, awayT: theft.awaySeconds, inView: false, motive: true };
  assert.equal(borrowable(ok, theft), true);
  for (const [k, v] of [['locked', true], ['busy', true], ['awayT', theft.awaySeconds - 0.1], ['inView', true], ['motive', false]]) {
    assert.equal(borrowable({ ...ok, [k]: v }, theft), false, `${k} prevents it`);
  }
  const hideouts = [{ id: 'x', x: 0, y: 0 }, { id: 'y', x: 90, y: 0 }];
  assert.equal(pickHideout(hideouts, 70, 0).id, 'y');
  assert.equal(pickHideout([], 0, 0), null);
}

// ---- data: numbers as designed, the town has what the loop needs
assert.equal(theft.awayDistance, 400, 'away means 400 px');
assert.equal(theft.awaySeconds, 20, 'for 20 s');
assert.ok(theft.rackRadius > 0 && theft.chance > 0 && theft.chance <= 1 && theft.rideSpeed > theft.walkSpeed && theft.cooldownSeconds > 0);
assert.ok(theft.rideSpeed <= vehicles['bully-bike'].maxSpeed, 'the thief rides no faster than a bully on a bike');
const of = t => map.objects.filter(o => o.type === t);
assert.ok(of('bike-rack').length >= 3, 'racks at the skatepark, home and school');
assert.ok(of('bike-hideout').length >= 2, 'two hideouts');
const garages = of('garage');
assert.equal(garages.length, 1, 'one garage near home');
const home = of('spawn')[0];
for (const g of garages) {
  assert.ok(stateCfg.vehicleIds.includes(g.vehicle) && g.hiddenFlag, 'garage names a vehicle and its flag');
  assert.ok(Math.hypot(g.x - home.x, g.y - home.y) < 20, 'the garage is at home');
  assert.deepEqual(validateObject(g, read('data/object-types.json'), { catalog: read('data/object-types.json'), surfaces: read('data/surfaces.json'), tiles: read('data/tiles.json'), i18n: new Set(Object.keys(de)) }, 'town'), [], 'a valid garage object');
}
assert.ok(of('skateboard').every(o => !garages.some(g => o.x >= g.x && o.x < g.x + g.w && o.y === g.y)), 'no board lies in the garage door');
for (const k of ['vehicle.locked', 'vehicle.unlocked', 'bike.locked', 'bike.stolen', 'bike.recovered', 'garage.found', 'garage.old', 'garage.empty', 'hud.bike']) assert.ok(de[k] && en[k], `i18n ${k}`);
assert.equal(de['bike.stolen'], 'Dein Fahrrad wurde geborgt!');
assert.equal(de['vehicle.locked'], 'Das gehört dir noch nicht – im Laden oder bei Rennen freischalten!');

// ---- the thief can really get from every bully spawn to every hideout (and to each bike spot) on the town grid
{
  const surfaces = read('data/surfaces.json');
  const chase = read('data/chase.json');
  const nav = new Pathfinder(map, surfaces, chase.nav);
  const out = new Int32Array(chase.nav.maxPath);
  const px = o => [(o.x + 0.5) * map.tileSize, (o.y + 0.5) * map.tileSize];
  const spots = [...of('bike'), ...of('bike-rack'), ...of('bike-hideout')];
  for (const s of of('bully-spawn')) {
    for (const target of spots) {
      const n = nav.findPath(...px(s), ...px(target), out);
      assert.ok(n > 0, `${s.id} -> ${target.id}: a path of at most ${chase.nav.maxPath} tiles exists`);
    }
  }
  for (const h of of('bike-hideout')) for (const r of of('bike-rack')) assert.ok(nav.findPath(...px(r), ...px(h), out) > 0, `${r.id} -> ${h.id}`);
}

console.log('check-vehicles ok');
