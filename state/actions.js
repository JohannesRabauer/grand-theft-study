import { createMorning, createPlayer, grantStartBelt } from './GameState.js';
import { applyRecord, validEntry, moveKopfnote } from '../grading/gradeCore.js';
import { safeStreetPosition, streetRecord } from '../vehicles/streetLogic.js';
import { itemById, itemStatus, ticketKey, upgradeKey } from '../services/shopLogic.js';
import { canStart, missionById } from '../services/questLogic.js';

// Registered state actions (AD-16). Each gets a mutable draft copy, the payload and the config and
// returns { path } (the changed path(s)) or { reject: reason }. New systems add their actions here.
const reject = (reason) => ({ reject: reason });
const positiveInt = (n) => Number.isInteger(n) && n > 0;

// Marks a vehicle as owned (the family's, shared by all players). Returns a rejection reason or null.
function unlockVehicle(s, id, reason, cfg) {
  if (!cfg.vehicleIds?.includes(id) || !cfg.unlockReasons?.includes(reason)) return 'bad-payload';
  if (s.shared.ownedVehicles.includes(id)) return 'already-owned';
  s.shared.ownedVehicles.push(id);
  return null;
}

export const ACTIONS = {
  'street.claim'(s, { id, player, map, x, y }, cfg) {
    const r = streetRecord(cfg, s.shared.streetRides, id);
    if (!r || !s.players[player] || !Number.isInteger(player) || !safeStreetPosition(cfg, map, x, y)) return reject('bad-payload');
    if (r.status === 'carried' || r.map !== map || Math.hypot(r.x - x, r.y - y) > 36) return reject('unavailable');
    if (Object.values(s.shared.streetRides).some(v => v.status === 'carried' && v.player === player)) return reject('already-riding');
    s.shared.streetRides[id] = { ...r, status: 'carried', player, map, x, y };
    return { path: 'shared.streetRides' };
  },

  'street.locate'(s, { id, player, map, x, y, drop = false }, cfg) {
    const r = s.shared.streetRides[id];
    if (!r || !safeStreetPosition(cfg, map, x, y) || typeof drop !== 'boolean') return reject('bad-payload');
    if (r.status === 'available' || (r.status === 'carried' && r.player !== player)
      || (r.status === 'dropped' && (player !== null || map !== r.map || drop))) return reject('invalid-transition');
    Object.assign(r, { map, x, y });
    if (drop) { r.status = 'dropped'; r.player = null; }
    return { path: 'shared.streetRides' };
  },

  'street.return'(s, { id, player, map, x, y }, cfg) {
    const r = s.shared.streetRides[id];
    const o = cfg.streetObjects?.[id];
    if (!o || !r || r.status !== 'carried' || r.player !== player || map !== o.map
      || !safeStreetPosition(cfg, map, x, y) || Math.hypot(x - o.x, y - o.y) > 36) return reject('invalid-return');
    s.shared.streetRides[id] = { kind: o.kind, map: o.map, x: o.x, y: o.y, status: 'available', player: null };
    return { path: 'shared.streetRides' };
  },

  'street.restore'(s, {}, cfg) {
    for (const r of Object.values(s.shared.streetRides)) {
      if (!safeStreetPosition(cfg, r.map, r.x, r.y)) return reject('bad-location');
      if (r.status === 'carried') { r.status = 'dropped'; r.player = null; }
    }
    return { path: 'shared.streetRides' };
  },

  'home.startDay'(s, { player, day }) {
    const p = s.players[player];
    if (!p || !positiveInt(day) || day !== s.shared.clock.day) return reject('bad-payload');
    if (p.morning.day === day) return reject('already-started');
    p.bag = [];
    p.morning = { ...createMorning(), day };
    return { path: [`players.${player}.bag`, `players.${player}.morning`] };
  },

  'home.breakfast'(s, { player, day }) {
    const m = s.players[player]?.morning;
    if (!m || m.day !== day || day !== s.shared.clock.day) return reject('bad-payload');
    if (m.breakfast) return reject('already-eaten');
    m.breakfast = true;
    return { path: `players.${player}.morning.breakfast` };
  },

  'bag.set'(s, { player, day, items }, cfg) {
    const p = s.players[player];
    if (!p || p.morning.day !== day || day !== s.shared.clock.day || !Array.isArray(items)
      || new Set(items).size !== items.length || !items.every(id => cfg.morning?.items.some(i => i.id === id))) return reject('bad-payload');
    p.bag = [...items];
    p.morning.packed = false;
    p.morning.missing = [];
    return { path: [`players.${player}.bag`, `players.${player}.morning`] };
  },

  'bag.check'(s, { player, day, required }, cfg) {
    const p = s.players[player];
    if (!p || p.morning.day !== day || day !== s.shared.clock.day || !Array.isArray(required)
      || new Set(required).size !== required.length || !required.every(id => cfg.morning?.items.some(i => i.id === id))) return reject('bad-payload');
    p.morning.packed = true;
    p.morning.missing = required.filter(id => !p.bag.includes(id));
    return { path: `players.${player}.morning` };
  },

  'wallet.earn'(s, { cents, reason }) {
    if (!positiveInt(cents) || !reason) return reject('bad-payload');
    s.shared.money += cents;
    return { path: 'shared.money' };
  },

  // Money never goes negative: an unaffordable spend is rejected, not clamped.
  'wallet.spend'(s, { cents, reason }) {
    if (!positiveInt(cents) || !reason) return reject('bad-payload');
    if (cents > s.shared.money) return reject('insufficient-funds');
    s.shared.money -= cents;
    return { path: 'shared.money' };
  },

  // Unlock path of a vehicle (CAP-16): reason is 'start' (a character's own), 'bought', 'race' or 'garage'. Owning twice is rejected.
  'vehicles.unlock'(s, { id, reason }, cfg) {
    const why = unlockVehicle(s, id, reason, cfg);
    return why ? reject(why) : { path: 'shared.ownedVehicles' };
  },

  // Buys a vehicle at the price of its data/shop.json entry (cfg.shop): the money and the unlock change together or not at all.
  'shop.buyVehicle'(s, { id }, cfg) {
    const item = cfg.shop?.items.find(i => i.type === 'vehicle' && i.vehicle === id);
    if (!item) return reject('not-for-sale');
    if (s.shared.ownedVehicles.includes(id)) return reject('already-owned');
    if (item.price > s.shared.money) return reject('insufficient-funds');
    unlockVehicle(s, id, 'bought', cfg);
    s.shared.money -= item.price;
    return { path: ['shared.money', 'shared.ownedVehicles'] };
  },

  // Buys any shop item that is not a vehicle (vehicles keep shop.buyVehicle): the money and what it buys change together or
  // not at all. Cosmetics belong to `player` and are put on at once; snacks only cost money (their effect is the shop's).
  'shop.buy'(s, { id, player = 0 }, cfg) {
    const item = itemById(cfg.shop ?? { items: [] }, id);
    if (!item || item.type === 'vehicle') return reject('not-for-sale');
    if (!s.players[player]) return reject('bad-payload');
    if (item.price > s.shared.money) return reject('insufficient-funds');
    if (itemStatus(cfg.shop, s, player, item).owned) return reject('already-owned');
    const path = ['shared.money'];
    if (item.type === 'cosmetic') {
      const c = s.players[player].cosmetics;
      c.owned.push(item.id);
      c.equipped[item.slot] = item.id;
      path.push(`players.${player}.cosmetics`);
    } else if (item.type === 'upgrade') {
      s.shared.flags[upgradeKey(item)] = true;
      path.push('shared.flags');
    } else if (item.type === 'ticket') {
      s.shared.flags[ticketKey(s.shared.clock.day)] = true;
      path.push('shared.flags');
    }
    s.shared.money -= item.price;
    return { path };
  },

  // Puts an owned cosmetic on, or takes the slot's cosmetic off with id null.
  'cosmetics.equip'(s, { player = 0, slot, id = null }, cfg) {
    const p = s.players[player];
    if (!p || !cfg.shop?.slots.includes(slot)) return reject('bad-payload');
    if (id !== null) {
      const item = itemById(cfg.shop, id);
      if (!item || item.type !== 'cosmetic' || item.slot !== slot || !p.cosmetics.owned.includes(id)) return reject('not-owned');
      p.cosmetics.equipped[slot] = id;
    } else delete p.cosmetics.equipped[slot];
    return { path: `players.${player}.cosmetics` };
  },

  // The consequence of a Zeugnis (story 8.6), once per kid and school year (= game day): promoted marks Klasse 4 as reached
  // (flag klasse4, the content of the next class comes later); a repeated year pays the comeback bonus - xp, pocket money and a
  // perk flag - so that repeating always feels like a fresh start, never a punishment.
  'zeugnis.apply'(s, { player, day, promoted, bonus = null }, cfg) {
    const p = s.players[player];
    if (!p || !positiveInt(day) || typeof promoted !== 'boolean') return reject('bad-payload');
    const key = `zeugnis.${day}.${player}`;
    if (s.shared.flags[key]) return reject('already-done');
    s.shared.flags[key] = promoted ? 'promoted' : 'repeat';
    const path = ['shared.flags'];
    if (promoted) s.shared.flags.klasse4 = true;
    else if (bonus) {
      if (!Number.isInteger(bonus.xp) || bonus.xp < 0 || !Number.isInteger(bonus.moneyCents) || bonus.moneyCents < 0) return reject('bad-payload');
      p.xp += bonus.xp;
      p.level = Math.min(cfg.maxLevel, 1 + Math.floor(p.xp / cfg.xpPerLevel));
      s.shared.money += bonus.moneyCents;
      if (bonus.perk) s.shared.flags[`perk.${bonus.perk}.${player}`] = true;
      path.push(`players.${player}.xp`, `players.${player}.level`, 'shared.money');
    }
    return { path };
  },

  // Missions (story 9.1): shared.quests = { active: [{ id, step }], done: [ids] }. Started once (or once a day when it repeats),
  // advanced a step at a time and finished with the last one; the runner pays the reward.
  'quest.start'(s, { id }, cfg) {
    const missions = cfg.missions ?? { missions: [] };
    if (!missionById(missions, id)) return reject('unknown-mission');
    const clock = s.shared.clock;
    if (!canStart(missions, s.shared.quests, id, null, clock.day, s.shared.flags)) return reject('not-available');
    const m = missionById(missions, id);
    s.shared.quests.active.push(m.lives ? { id, step: 0, lives: m.lives } : { id, step: 0 });
    return { path: 'shared.quests' };
  },

  // A bump to a fragile load: one life less (the runner fails the mission at zero). Returns the lives left through the state.
  'quest.hit'(s, { id }) {
    const entry = s.shared.quests.active.find(q => q.id === id);
    if (!entry || !(entry.lives > 0)) return reject('bad-payload');
    entry.lives--;
    return { path: 'shared.quests' };
  },

  // Gives a mission up or loses it: it leaves the active list without counting as done, so it can be started again.
  'quest.abort'(s, { id }) {
    const quests = s.shared.quests;
    if (!quests.active.some(q => q.id === id)) return reject('bad-payload');
    quests.active = quests.active.filter(q => q.id !== id);
    return { path: 'shared.quests' };
  },

  'quest.advance'(s, { id }, cfg) {
    const entry = s.shared.quests.active.find(q => q.id === id);
    const m = missionById(cfg.missions ?? { missions: [] }, id);
    if (!entry || !m || entry.step + 1 >= m.steps.length) return reject('bad-payload');
    entry.step++;
    return { path: 'shared.quests' };
  },

  'quest.finish'(s, { id }, cfg) {
    const quests = s.shared.quests;
    const m = missionById(cfg.missions ?? { missions: [] }, id);
    const entry = quests.active.find(q => q.id === id);
    if (!entry || !m || entry.step !== m.steps.length - 1) return reject('bad-payload');
    quests.active = quests.active.filter(q => q.id !== id);
    if (!quests.done.includes(id)) quests.done.push(id);
    if (m.repeat) s.shared.flags[`mission.${id}.day`] = s.shared.clock.day;
    return { path: ['shared.quests', 'shared.flags'] };
  },

  'flags.set'(s, { key, value = true }) {
    if (!key) return reject('bad-payload');
    s.shared.flags[key] = value;
    return { path: `shared.flags.${key}` };
  },

  // Only DayClock dispatches this (AD-17); `minute` is game minutes since midnight.
  'clock.set'(s, { day, minute, phase }) {
    if (!positiveInt(day) || !Number.isInteger(minute) || minute < 0 || minute >= 1440 || !phase) return reject('bad-payload');
    s.shared.clock = { day, minute, phase };
    return { path: 'shared.clock' };
  },

  // Co-op on or off (flag `coop`). Switching it on makes sure a second player exists: a different kid than player 1
  // with that kid's base attributes. The second player's progress stays when co-op is switched off again.
  'coop.set'(s, { on }, cfg) {
    if (typeof on !== 'boolean') return reject('bad-payload');
    if (on && s.players.length < 2) {
      const p = createPlayer(cfg);
      const id = Object.keys(cfg.characters ?? {}).find(c => c !== s.players[0].character);
      if (id) { p.character = id; p.attributes = { ...cfg.characters[id] }; grantStartBelt(p, cfg); }
      s.players.push(p);
    }
    s.shared.flags.coop = on;
    return { path: ['shared.flags.coop', 'players'] };
  },

  // Choosing a character (cfg.characters: id -> base attributes, when known) also resets the attributes to its base values
  // and gives it its starting belt (cfg.characterBelts, see grantStartBelt).
  'player.setCharacter'(s, { player, character }, cfg) {
    if (!s.players[player] || !character) return reject('bad-payload');
    const base = cfg.characters?.[character];
    if (cfg.characters && !base) return reject('unknown-character');
    s.players[player].character = character;
    if (base) s.players[player].attributes = { ...base };
    grantStartBelt(s.players[player], cfg);
    return { path: [`players.${player}.character`, `players.${player}.attributes`, `players.${player}.karate`] };
  },

  // Attribute growth (CAP-12): fractional points, never past cfg.attrMax; at the cap it is rejected (hooks check first).
  'attr.grow'(s, { player, attr, amount, reason }, cfg) {
    const p = s.players[player];
    if (!p || !(attr in p.attributes) || !(amount > 0) || !Number.isFinite(amount) || !reason) return reject('bad-payload');
    if (p.attributes[attr] >= cfg.attrMax) return reject('at-cap');
    p.attributes[attr] = Math.min(cfg.attrMax, p.attributes[attr] + amount);
    return { path: `players.${player}.attributes.${attr}` };
  },

  // Only LearningEngine dispatches this (AD-19): replaces one topic's stats of one player.
  'learning.record'(s, { player, topic, stats }) {
    if (!s.players[player] || !topic || !stats || !Number.isInteger(stats.n) || !Number.isFinite(stats.level) || typeof stats.items !== 'object') return reject('bad-payload');
    s.players[player].learning[topic] = stats;
    return { path: `players.${player}.learning.${topic}` };
  },

  // Only Grades dispatches this (AD-20): appends one graded result to the ledger and updates the subject tally.
  'grades.record'(s, { player, subject, score, grade, lessonId, day }, cfg) {
    const entry = { subject, score, grade, lessonId, day };
    if (!s.players[player] || !validEntry(entry)) return reject('bad-payload');
    applyRecord(s.players[player].grades, entry, cfg.gradesMaxEntries);
    return { path: `players.${player}.grades` };
  },

  // Kopfnoten move by a fractional delta, clamped to the data's range (so a kid at the limit simply stays there).
  'kopfnoten.add'(s, { player, category, delta, reason }, cfg) {
    const k = cfg.kopfnoten;
    const p = s.players[player];
    if (!p || !k || !k.categories.includes(category) || !Number.isFinite(delta) || delta === 0 || !reason) return reject('bad-payload');
    p.kopfnoten[category] = moveKopfnote(p.kopfnoten[category] ?? k.start, delta, k);
    return { path: `players.${player}.kopfnoten.${category}` };
  },

  // A finished karate training session (story 6.4): points and the session count, and the day's session counter for the daily limit.
  'karate.addPoints'(s, { player, amount, day }) {
    const k = s.players[player]?.karate;
    if (!k || !Number.isInteger(amount) || amount < 0 || !positiveInt(day)) return reject('bad-payload');
    k.points += amount;
    k.sessions += 1;
    if (k.trainDay !== day) { k.trainDay = day; k.trainedToday = 0; }
    k.trainedToday += 1;
    return { path: `players.${player}.karate` };
  },

  // The belt exam was passed: only the next belt of cfg.karateBelts (data/karate.json order) can be earned, one per day.
  'karate.promote'(s, { player, belt, day }, cfg) {
    const k = s.players[player]?.karate;
    const order = cfg.karateBelts;
    if (!k || !order || !positiveInt(day)) return reject('bad-payload');
    if (order[order.indexOf(k.belt) + 1] !== belt) return reject('not-next-belt');
    if (k.lastExamDay === day) return reject('exam-done-today');
    k.belt = belt;
    k.lastExamDay = day;
    return { path: `players.${player}.karate.belt` };
  },

  'xp.add'(s, { player, amount }, cfg) {
    const p = s.players[player];
    if (!p || !positiveInt(amount)) return reject('bad-payload');
    p.xp += amount;
    p.level = Math.min(cfg.maxLevel, 1 + Math.floor(p.xp / cfg.xpPerLevel));
    return { path: [`players.${player}.xp`, `players.${player}.level`] };
  }
};
