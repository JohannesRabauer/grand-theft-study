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

  'player.setCharacter'(s, { player, character }) {
    if (!s.players[player] || !character) return reject('bad-payload');
    s.players[player].character = character;
    return { path: `players.${player}.character` };
  },

  'xp.add'(s, { player, amount }, cfg) {
    const p = s.players[player];
    if (!p || !positiveInt(amount)) return reject('bad-payload');
    p.xp += amount;
    p.level = Math.min(cfg.maxLevel, 1 + Math.floor(p.xp / cfg.xpPerLevel));
    return { path: [`players.${player}.xp`, `players.${player}.level`] };
  }
};
