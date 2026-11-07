// Pure rules of the swung stick (story 6.2, AD-24): the hit zone in front of the player, the object query that is limited to
// props and map objects by construction, and the seeded loot tables. No Phaser; tools/Stick.js and scripts/check-stick.mjs use it.
import { CAT } from '../physics/categories.js';

// What a swing can ever look at. People and animals (PLAYER, BULLY, NPC, ANIMAL) are not here: `swingHits` throws for any
// other kind, skips candidates whose body is not a PROP or STATIC one, and the callers never pass a crowd, chase or dog list.
export const OBJECT_KINDS = ['prop', 'bush', 'doorbell', 'pinata'];

const DEG = Math.PI / 180;

// The zone of a swing from (px, py) along the unit vector (dx, dy): a sector of radius `reach` and a total angle of `arcDeg`.
export function swingZone(out, cfg, px, py, dx, dy) {
  out.x = px;
  out.y = py;
  out.dx = dx;
  out.dy = dy;
  out.reach = cfg.reach;
  out.cos = Math.cos((cfg.arcDeg * DEG) / 2);
  return out;
}

// Distance from the player to a circle (x, y, r) when it is inside the zone, otherwise -1. A circle the player stands in always counts.
export function zoneDistance(zone, x, y, r) {
  const vx = x - zone.x;
  const vy = y - zone.y;
  const d = Math.hypot(vx, vy);
  if (d > zone.reach + r) return -1;
  if (d <= r) return d;
  return (vx * zone.dx + vy * zone.dy) / d >= zone.cos ? d : -1;
}

const objectBody = (body) => {
  if (!body) return true;
  const cat = body.collisionFilter?.category;
  return cat === CAT.PROP || cat === CAT.STATIC;
};

// Adds the candidates of one object `kind` that lie in the zone to `out` ({ n, kinds[], items[], dist[] }, sorted nearest
// first, at most out.max entries kept). `locate(item, pt)` fills pt.x, pt.y, pt.r and returns false for an item that cannot be hit now.
const pt = { x: 0, y: 0, r: 0 };
export function swingHits(out, zone, kind, items, locate) {
  if (!OBJECT_KINDS.includes(kind)) throw new Error(`a swing cannot target '${kind}'`);
  for (const item of items) {
    if (!objectBody(item.body) || !locate(item, pt)) continue;
    const d = zoneDistance(zone, pt.x, pt.y, pt.r);
    if (d < 0) continue;
    let i = out.n;
    while (i > 0 && out.dist[i - 1] > d) i--;
    if (i >= out.max) continue;
    for (let j = Math.min(out.n, out.max - 1); j > i; j--) {
      out.kinds[j] = out.kinds[j - 1];
      out.items[j] = out.items[j - 1];
      out.dist[j] = out.dist[j - 1];
    }
    out.kinds[i] = kind;
    out.items[i] = item;
    out.dist[i] = d;
    out.n = Math.min(out.n + 1, out.max);
  }
  return out;
}

export function makeHits(max) {
  return { n: 0, max, kinds: new Array(max), items: new Array(max), dist: new Array(max) };
}

// Seeded random numbers in [0, 1) (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One entry of a loot table by weight. `flags` is state.shared.flags: an entry whose `once` flag is set is out of the table.
export function rollLoot(table, rng, flags) {
  let total = 0;
  for (const e of table) if (!(e.once && flags[e.once])) total += e.weight;
  let r = rng() * total;
  for (const e of table) {
    if (e.once && flags[e.once]) continue;
    r -= e.weight;
    if (r < 0) return e;
  }
  return table[table.length - 1];
}

// A whole number from `range` ([min, max], both included).
export function rollRange(range, rng) {
  return range[0] + Math.floor(rng() * (range[1] - range[0] + 1));
}

// Bushes and the pinata give out once per game day: the flag holds the day number of the last time.
export function readyToday(flags, key, day) {
  return flags[key] !== day;
}
