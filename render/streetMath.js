// Street dressing maths (story 16.9, AD-31). Pure, no Phaser: scripts/check-street.mjs runs it in node.
// Which set dressing a map gets, worked out from the tile neighbours and the object data: standing props (planters, bollards,
// hydrants, letterboxes, recycling bins, parked bikes, street signs, the kiosk and the Pfand machine) that the world system
// (render/StreetProps.js) lends images to, and ground decals (kerb weeds, leaves in the gutter, chalk drawings, playground
// markings, posters on plain walls) that the ground bake draws (scenes/EnvArt.js groundKeys). Everything is hashed from the
// map seed and the tile, so the same map always gets the same street; nothing is random, nothing touches collision or data.
// Dressing never stands on an object tile, in front of a door or on a tile the kids' routes use (npc nodes are objects).
import { mix, buildingAt, isFacade, facadeLook, binAt } from './buildingMath.js';

export const CELL = 16; // base pixels per tile
export const SIDES = ['n', 'e', 's', 'w'];
const OFF = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const SIGN_KINDS = ['speed', 'stop', 'parking', 'school'];
export const POSTERS = 6;
export const PARK_LAMP = { head: [4.5, -33] }; // the lantern glass of the park lamp posts, from their feet (matches data/lighting.json street.head[0])
export const CHALKS = 6;
export const PLAYS = 5;
export const LEAF_VARIANTS = 3;
export const WEED_VARIANTS = 3;
export const PROP_VARIANTS = { planter: 3, bollard: 2, hydrant: 1, letterbox: 2, recycle: 1, bike: 3, sign: 4, kiosk: 1, pfand: 1 };

const GROUND = { C: 'cobble', S: 'concrete', p: 'path', G: 'grass', A: 'asphalt', L: 'lane', P: 'puddle' };
const ROAD = new Set(['asphalt', 'lane', 'puddle']);
const SIDEWALK = new Set(['concrete', 'cobble', 'path']);
const unit = h => h / 4294967296;

const INFO = new WeakMap();

// Everything for one map: { props, items: Map of "tx,ty" -> decal keys is computed per tile by decalKeys }.
export function streetInfo(map, seed, bInfo, cfg) {
  let info = INFO.get(map);
  if (info) return info;
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const idAt = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? null : map.legend[map.rows[y][x]]);
  const used = new Set(); // tiles that carry an object, a door or the step in front of one: no dressing there
  for (const o of map.objects ?? []) {
    const w = o.w ?? 1;
    const h = o.h ?? 1;
    for (let dy = -(o.type === 'door' ? 1 : 0); dy < h + (o.type === 'door' ? 1 : 0); dy++) for (let dx = -(o.type === 'door' ? 1 : 0); dx < w + (o.type === 'door' ? 1 : 0); dx++) used.add(`${o.x + dx},${o.y + dy}`);
  }
  for (const key of bInfo.doors.keys()) { // the floor in front of every door and its neighbours
    const [dx, dy] = key.split(',').map(Number);
    for (let x = -1; x <= 1; x++) for (let y = 0; y <= 2; y++) used.add(`${dx + x},${dy + y}`);
  }
  const school = (map.objects ?? []).find(o => o.type === 'door' && o.to === 'school');
  info = { rows, cols, idAt, used, bInfo, seed, cfg, props: [], school: school ? { x: school.x + (school.w - 1) / 2, y: school.y } : null };
  INFO.set(map, info);
  info.props = placeProps(map, info);
  return info;
}

const open = (info, x, y) => !info.used.has(`${x},${y}`);
const near = (a, b, r) => Math.abs(a.tx - b.tx) <= r && Math.abs(a.ty - b.ty) <= r;

function placeProps(map, info) {
  const { cfg, idAt, bInfo, seed } = info;
  const out = [];
  const d = cfg.density;
  const add = (kind, tx, ty, h, dx = 0, feet = 14, minGap = 0) => {
    if (minGap && out.some(p => p.kind === kind && near(p, { tx, ty }, minGap))) return;
    const v = (h >>> 9) % PROP_VARIANTS[kind];
    const x = tx * CELL + CELL / 2 + dx;
    const y = ty * CELL + feet;
    out.push({ kind, v, tx, ty, x, y, depth: y, seed: h });
  };
  for (let ty = 1; ty < info.rows - 1; ty++) for (let tx = 1; tx < info.cols - 1; tx++) {
    const id = idAt(tx, ty);
    const walk = SIDEWALK.has(id);
    if (!walk && id !== 'grass') continue;
    if (!open(info, tx, ty)) continue;
    const h = mix(seed, tx, ty + 5000);
    const roll = h % 1000;
    const jit = ((h >>> 12) % 5) - 2;
    const wallN = !!buildingAt(bInfo, tx, ty - 1) && isFacade(bInfo, tx, ty - 1);
    const roadS = ROAD.has(idAt(tx, ty + 1));
    const roadN = ROAD.has(idAt(tx, ty - 1));
    const edge = i => i === 'fence' || i === 'hedge';
    const fenceW = edge(idAt(tx - 1, ty));
    const fenceE = edge(idAt(tx + 1, ty));
    if ((walk || id === 'grass') && wallN && binAt(bInfo, tx, ty) < 0) {
      if (!walk) { if (roll < d.bike) add('bike', tx, ty, h, jit, 14, 3); else if (roll < d.bike + d.letterbox / 3) add('letterbox', tx, ty, h, jit, 13, 3); } // a garden in front of the house: a bike against the wall, a post box
      else if (roll < d.planter) add('planter', tx, ty, h, jit, 13);
      else if (roll < d.planter + d.recycle) add('recycle', tx, ty, h, jit, 13, 12);
      else if (roll < d.planter + d.recycle + d.bike) add('bike', tx, ty, h, jit, 14);
    } else if (walk && (roadS || roadN) && !wallN) {
      const feet = roadS ? 15 : 7;
      if (roll < d.hydrant) add('hydrant', tx, ty, h, jit, feet, 9);
      else if (roll < d.hydrant + d.bollard) add('bollard', tx, ty, h, jit, feet, 3);
      else if (roll < d.hydrant + d.bollard + d.sign && idAt(tx - 1, ty) === idAt(tx, ty) && idAt(tx + 1, ty) === idAt(tx, ty)) add('sign', tx, ty, h, jit, feet, 6);
    } else if ((walk || id === 'grass' || id === 'path') && (fenceW || fenceE)) {
      if (roll < d.letterbox) add('letterbox', tx, ty, h, fenceW ? -5 : 5, 13, 4);
      else if (roll < d.letterbox + d.bike * 2) add('bike', tx, ty, h, fenceW ? -2 : 2, 14, 3);
    }
  }
  for (const o of map.objects ?? []) { // objects that get a real sprite instead of a drawn rectangle
    if (o.type === 'newsstand') out.push({ kind: 'kiosk', v: 0, tx: o.x, ty: o.y, x: (o.x + 0.5) * CELL, y: (o.y + 0.5) * CELL + 6, depth: (o.y + 0.5) * CELL + 6, seed: 0, object: o.id });
    else if (o.type === 'pfand-machine') out.push({ kind: 'pfand', v: 0, tx: o.x, ty: o.y, x: (o.x + 0.5) * CELL, y: (o.y + 0.5) * CELL + 6, depth: (o.y + 0.5) * CELL + 6, seed: 0, object: o.id });
  }
  return out;
}

// True where (tx, ty) is part of the schoolyard: open concrete near the school door.
export function inSchoolyard(info, tx, ty) {
  const s = info.school;
  return !!s && info.idAt(tx, ty) === 'concrete' && Math.abs(tx - s.x) <= info.cfg.schoolyard.rx && ty >= s.y && ty - s.y <= info.cfg.schoolyard.ry;
}

// Decal keys of one ground tile, in drawing order (they come after the base tile, its edges and the other overlays).
export function decalKeys(info, tx, ty) {
  const { idAt, cfg, seed, bInfo } = info;
  const id = idAt(tx, ty);
  const keys = [];
  const h = mix(seed, tx, ty + 9000);
  const roll = h % 1000;
  if (id === 'wall') { // posters on the plain stretches of a facade
    const look = facadeLook(bInfo, tx, ty);
    if (look && look.style < 0 && roll < cfg.density.poster) keys.push(`env-poster-${(h >>> 10) % POSTERS}`);
    return keys;
  }
  const walk = SIDEWALK.has(id) || id === 'path';
  if (!walk && !ROAD.has(id)) return keys;
  if (walk && open(info, tx, ty)) {
    const yard = inSchoolyard(info, tx, ty);
    const plaza = id === 'concrete' && SIDES.every(s => idAt(tx + OFF[s][0], ty + OFF[s][1]) === 'concrete');
    if (yard && roll < cfg.density.play) keys.push(`env-play-${(h >>> 10) % PLAYS}`);
    else if (yard ? roll < cfg.density.play + cfg.density.chalk : plaza && roll < cfg.density.chalkOpen) keys.push(`env-chalk-${(h >>> 10) % CHALKS}`);
  }
  const hs = mix(seed, tx, ty + 9100);
  for (let i = 0; i < 4; i++) {
    const s = SIDES[i];
    const n = idAt(tx + OFF[s][0], ty + OFF[s][1]);
    if (walk && ROAD.has(n) && unit(mix(hs, i)) < cfg.density.weeds) keys.push(`env-kweed-${s}-${(hs >>> (4 + i)) % WEED_VARIANTS}`);
    else if (ROAD.has(id) && SIDEWALK.has(n) && unit(mix(hs, i + 4)) < cfg.density.leaves) keys.push(`env-gleaf-${s}-${(hs >>> (6 + i)) % LEAF_VARIANTS}`);
  }
  return keys;
}
