import { createPlayer } from './GameState.js';

// Registered state actions (AD-16). Each gets a mutable draft copy, the payload and the config and
// returns { path } (the changed path(s)) or { reject: reason }. New systems add their actions here.
const reject = (reason) => ({ reject: reason });
const positiveInt = (n) => Number.isInteger(n) && n > 0;

export const ACTIONS = {
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
      if (id) { p.character = id; p.attributes = { ...cfg.characters[id] }; }
      s.players.push(p);
    }
    s.shared.flags.coop = on;
    return { path: ['shared.flags.coop', 'players'] };
  },

  // Choosing a character (cfg.characters: id -> base attributes, when known) also resets the attributes to its base values.
  'player.setCharacter'(s, { player, character }, cfg) {
    if (!s.players[player] || !character) return reject('bad-payload');
    const base = cfg.characters?.[character];
    if (cfg.characters && !base) return reject('unknown-character');
    s.players[player].character = character;
    if (base) s.players[player].attributes = { ...base };
    return { path: [`players.${player}.character`, `players.${player}.attributes`] };
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

  'xp.add'(s, { player, amount }, cfg) {
    const p = s.players[player];
    if (!p || !positiveInt(amount)) return reject('bad-payload');
    p.xp += amount;
    p.level = Math.min(cfg.maxLevel, 1 + Math.floor(p.xp / cfg.xpPerLevel));
    return { path: [`players.${player}.xp`, `players.${player}.level`] };
  }
};
