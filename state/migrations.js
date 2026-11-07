// Save upgrades (AD-16). MIGRATIONS[n] turns a version-n save into version n+1; migrate() chains them.
// v0 was the pre-release shape: money as a float `euros` and a single flat `player`.
import { createPlayer, createShared } from './GameState.js';
import { emptyGrades, defaultKopfnoten } from '../grading/gradeCore.js';

export const MIGRATIONS = {
  0({ euros = 0, player = {}, ...rest }, cfg) {
    const p = createPlayer(cfg);
    return {
      ...rest,
      v: 1,
      shared: { ...createShared(cfg), money: Math.round(euros * 100) },
      players: [{ ...p, character: player.character ?? null, xp: player.xp ?? 0, level: player.level ?? 1 }]
    };
  },

  // v2: six character attributes (wissen..zielen) replace the placeholder four; a chosen character keeps its base values.
  1(d, cfg) {
    return {
      ...d,
      v: 2,
      players: d.players.map(p => ({ ...p, attributes: { ...(cfg.characters?.[p.character] ?? cfg.attributes) } }))
    };
  },

  // v3: the grade ledger (entries + per-subject tallies) replaces the empty `grades` placeholder; Kopfnoten start at their default.
  2(d, cfg) {
    return {
      ...d,
      v: 3,
      players: d.players.map(p => ({
        ...p,
        grades: Array.isArray(p.grades?.entries) ? p.grades : emptyGrades(),
        kopfnoten: p.kopfnoten ?? (cfg.kopfnoten ? defaultKopfnoten(cfg.kopfnoten) : {})
      }))
    };
  }
};

// Throws when the save is from the future or a step is missing.
export function migrate(data, cfg, target) {
  let cur = data;
  while (cur.v < target) {
    const step = MIGRATIONS[cur.v];
    if (!step) throw new Error(`no migration from v${cur.v}`);
    cur = step(cur, cfg);
  }
  if (cur.v !== target) throw new Error(`unsupported save version ${data.v}`);
  return cur;
}
