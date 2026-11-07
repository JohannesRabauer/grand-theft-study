// Save upgrades (AD-16). MIGRATIONS[n] turns a version-n save into version n+1; migrate() chains them.
// v0 was the pre-release shape: money as a float `euros` and a single flat `player`.
import { createKarate, createMorning, createPlayer, createShared, grantStartBelt } from './GameState.js';
import { emptyGrades, defaultKopfnoten } from '../grading/gradeCore.js';

// v5: Lena, Mehmet and Jonas became Helena, Kilian and Lorenz (the placeholder ids kid-a/b/c of old test saves map the same
// way, by position). Earned attribute growth is kept relative to the old base values.
const LEGACY = {
  lena: { to: 'helena', base: { wissen: 9, tempo: 5, ausdauer: 5, charme: 5, ordnung: 8, zielen: 8 } },
  mehmet: { to: 'kilian', base: { wissen: 5, tempo: 9, ausdauer: 9, charme: 6, ordnung: 3, zielen: 5 } },
  jonas: { to: 'lorenz', base: { wissen: 6, tempo: 6, ausdauer: 5, charme: 9, ordnung: 4, zielen: 6 } },
  'kid-a': { to: 'helena' },
  'kid-b': { to: 'kilian' },
  'kid-c': { to: 'lorenz' }
};

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
  },

  // v4: belt progress next to the belt (points, sessions, the day of the last session and exam).
  3(d, cfg) {
    return { ...d, v: 4, players: d.players.map(p => ({ ...p, karate: { ...createKarate(cfg), ...p.karate } })) };
  },

  4(d, cfg) {
    return {
      ...d,
      v: 5,
      players: d.players.map(p => {
        const legacy = LEGACY[p.character];
        if (!legacy) return p;
        const from = legacy.base ?? cfg.attributes;
        const to = cfg.characters?.[legacy.to];
        const attributes = to ? Object.fromEntries(Object.entries(p.attributes).map(([a, v]) => [a, Math.min(cfg.attrMax ?? 10, Math.max(0, (to[a] ?? v) + v - (from[a] ?? v)))])) : p.attributes;
        const out = { ...p, character: legacy.to, attributes, karate: { ...p.karate } };
        grantStartBelt(out, cfg);
        return out;
      })
    };
  },

  5(d) {
    return { ...d, v: 6, players: d.players.map(p => ({ ...p, bag: p.bag ?? [], morning: createMorning() })) };
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
