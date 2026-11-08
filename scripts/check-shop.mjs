// The shops (story 10.1): the data (prices, items, shops), the purchase and equip actions with their rejections, the
// slingshot and tram effects of upgrades and tickets, and the texts. Pure logic, no Phaser; the shop screen, the prompt and
// the visible cosmetics are covered by the smoke scenario `shop`.
// Run: node scripts/check-shop.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState } from '../state/GameState.js';
import { ammoBonus, hasDayTicket, itemById, itemStatus, shopItems, validateShop } from '../services/shopLogic.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const shop = load('data/shop.json');
const base = load('data/state.json');
const tool = load('data/tool.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };

// ---- data
assert.deepEqual(validateShop(shop), [], validateShop(shop).join('\n'));
for (const l of ['de', 'en']) {
  for (const id of Object.keys(shop.shops)) assert.ok(i18n[l][`shop.${id}.name`], `${l}: shop.${id}.name`);
  for (const i of shop.items) {
    assert.ok(i18n[l][`item.${i.id}.desc`], `${l}: item.${i.id}.desc`);
    if (i.type === 'vehicle') assert.ok(i18n[l][`vehicle.${i.vehicle}`], `${l}: vehicle.${i.vehicle}`);
    else assert.ok(i18n[l][`item.${i.id}.name`], `${l}: item.${i.id}.name`);
  }
}
const map = load('data/maps/town.json');
for (const o of map.objects.filter(o => o.type === 'shop')) assert.ok(shop.shops[o.shopId], `map shop ${o.id} sells something`);
assert.ok(map.objects.some(o => o.type === 'bakery') && shop.shops.bakery, 'the bakery has a shop');
for (const v of ['skateboard', 'skates', 'bike', 'scooter', 'rollerblades']) assert.ok(shop.items.some(i => i.type === 'vehicle' && i.vehicle === v), `${v} is for sale`);
assert.ok(shopItems(shop, 'vehicles').length >= 8 && shopItems(shop, 'bakery').length >= 3);

// ---- actions
const fresh = (money = 100000, players = 2) => {
  const events = new EventEmitter();
  const state = new GameState(events, { ...base, shop, startMoneyCents: money, players });
  return state;
};
let s = fresh(1000);
const money = () => s.shared.money;
assert.ok(s.dispatch('shop.buy', { id: 'snack-roll', player: 0 }) && money() === 1000 - 90, 'a snack costs its price and nothing else');
assert.ok(s.dispatch('shop.buy', { id: 'snack-roll', player: 1 }) && money() === 820, 'snacks can be bought again and again');
assert.ok(!s.dispatch('shop.buy', { id: 'hat-crown', player: 0 }) && money() === 820, 'too expensive: nothing is taken and nothing is given');
assert.deepEqual(s.players[0].cosmetics.owned, []);
assert.ok(s.dispatch('shop.buy', { id: 'hat-cap', player: 1 }) && money() === 520, 'a hat');
assert.deepEqual([s.players[1].cosmetics.owned, s.players[1].cosmetics.equipped.hat], [['hat-cap'], 'hat-cap'], 'it is the buyer\'s and worn at once');
assert.deepEqual(s.players[0].cosmetics.owned, [], 'the sibling did not get it');
assert.ok(!s.dispatch('shop.buy', { id: 'hat-cap', player: 1 }) && money() === 520, 'owning twice is refused without charging');
assert.ok(s.dispatch('shop.buy', { id: 'hat-cap', player: 0 }) && s.players[0].cosmetics.equipped.hat === 'hat-cap', 'each kid can own their own');
s.dispatch('wallet.earn', { cents: 1000, reason: 'test' });
assert.ok(s.dispatch('shop.buy', { id: 'hat-party', player: 1 }) && s.players[1].cosmetics.equipped.hat === 'hat-party', 'a newer hat replaces the one worn');
assert.deepEqual(s.players[1].cosmetics.owned, ['hat-cap', 'hat-party']);
assert.ok(s.dispatch('cosmetics.equip', { player: 1, slot: 'hat', id: 'hat-cap' }) && s.players[1].cosmetics.equipped.hat === 'hat-cap', 'an owned hat is put back on');
assert.ok(!s.dispatch('cosmetics.equip', { player: 1, slot: 'hat', id: 'hat-crown' }), 'an unowned one is refused');
assert.ok(!s.dispatch('cosmetics.equip', { player: 1, slot: 'ring', id: 'hat-cap' }), 'and so is the wrong slot');
assert.ok(s.dispatch('cosmetics.equip', { player: 1, slot: 'hat', id: null }) && s.players[1].cosmetics.equipped.hat === undefined, 'taking it off');
assert.ok(!s.dispatch('shop.buy', { id: 'vehicle-bike', player: 0 }), 'vehicles go through shop.buyVehicle');
assert.ok(!s.dispatch('shop.buy', { id: 'no-such-thing', player: 0 }) && !s.dispatch('shop.buy', { id: 'snack-roll', player: 5 }));

// upgrades and the day ticket live in the shared flags
s = fresh(5000);
assert.equal(ammoBonus(s.shared, shop), 0);
assert.ok(s.dispatch('shop.buy', { id: 'upgrade-ammo', player: 0 }) && s.shared.money === 4200);
assert.equal(ammoBonus(s.shared, shop), 4, 'the magazine grows by the bonus');
assert.ok(tool.slingshot.maxAmmo + ammoBonus(s.shared, shop) === 16);
assert.ok(!s.dispatch('shop.buy', { id: 'upgrade-ammo', player: 1 }) && s.shared.money === 4200, 'one upgrade for the family');
assert.ok(!hasDayTicket(s.shared));
assert.ok(s.dispatch('shop.buy', { id: 'ticket-day', player: 0 }) && hasDayTicket(s.shared) && s.shared.money === 3900, 'the day ticket');
assert.ok(!s.dispatch('shop.buy', { id: 'ticket-day', player: 1 }), 'one ticket a day covers everybody');
s.dispatch('clock.set', { day: 2, minute: 400, phase: 'morning' });
assert.ok(!hasDayTicket(s.shared), 'the ticket is only good today');

// vehicles keep their action and the status helper reports it
s = fresh(10000);
const bike = itemById(shop, 'vehicle-bike');
assert.ok(!itemStatus(shop, s.data, 0, bike).owned && itemStatus(shop, s.data, 0, bike).affordable);
assert.ok(s.dispatch('shop.buyVehicle', { id: 'bike' }) && itemStatus(shop, s.data, 0, bike).owned && s.shared.money === 4000);
assert.ok(!itemStatus(shop, s.data, 0, itemById(shop, 'vehicle-rollerblades')).affordable, 'the status shows what the wallet cannot pay');

// every price is a whole number of cents and nothing sells for more than a month of pocket money would be silly
assert.ok(shop.items.every(i => Number.isInteger(i.price)));
console.log(`shop ok: ${shop.items.length} items in ${Object.keys(shop.shops).length} shops, purchases, rejections, cosmetics per kid, upgrade and day ticket`);
