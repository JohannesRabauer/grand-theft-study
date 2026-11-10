// Building maths (story 16.7, AD-31). Pure, no Phaser: scripts/check-buildings.mjs runs it in node.
// A building is a connected block of wall tiles (the map border is not one). Each gets a seed from its map and its position, then a
// look (palette x roof material) that differs from every building within `NEAR` tiles, and a character (preferred window style,
// grime, shopfront, chimneys). Every tile's dressing (window, curtains, ageing, drainpipe, bin) is hashed from that seed, so the
// same map always builds the same street. The art (scenes/BuildingArt.js) and the world system (render/Buildings.js) both read this.

export const ROOFS = ['tile', 'slate', 'flat'];
export const STYLES = ['window', 'shutter', 'flowers', 'balcony', 'shop']; // facade styles with a window (index 4 is the shopfront)
const ROOF_PICK = [0, 0, 0, 0, 1, 1, 1, 2]; // clay tile 4 in 8, slate 3, flat 1
export const NEAR = 2; // buildings within this many tiles must not share a look
const CELL = 16; // base pixels per tile

// 32 bit mixing hash of three integers.
export function mix(a, b = 0, c = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
const unit = h => h / 4294967296;

const INFO = new WeakMap();
const buildingAt = (info, tx, ty) => {
  const i = info.bld[ty * info.cols + tx];
  return i ? info.list[i - 1] : null;
};

// Everything derived from the grid and the door objects of one map. `bld` holds the building index + 1 of every wall tile (0 = none).
export function buildingInfo(map, seed, nPal = 4) {
  let info = INFO.get(map);
  if (info) return info;
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const wall = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && map.legend[map.rows[y][x]] === 'wall';
  const border = (x, y) => x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
  const bld = new Int32Array(rows * cols);
  const list = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (bld[y * cols + x] || !wall(x, y) || border(x, y)) continue;
    const b = { index: list.length, x0: x, y0: y, x1: x, y1: y, cells: [] };
    const stack = [[x, y]];
    bld[y * cols + x] = b.index + 1;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      b.cells.push([cx, cy]);
      b.x0 = Math.min(b.x0, cx); b.x1 = Math.max(b.x1, cx); b.y1 = Math.max(b.y1, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!wall(nx, ny) || border(nx, ny) || bld[ny * cols + nx]) continue;
        bld[ny * cols + nx] = b.index + 1;
        stack.push([nx, ny]);
      }
    }
    b.seed = mix(seed, x, y); // x, y: the first tile in reading order
    list.push(b);
  }
  for (const b of list) { // a look no building within NEAR tiles has: the seed picks a roof material (flat roofs are rarer), then a palette
    const taken = new Set();
    const pals = new Set();
    for (const [cx, cy] of b.cells) {
      for (let dy = -NEAR; dy <= NEAR; dy++) for (let dx = -NEAR; dx <= NEAR; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const o = bld[ny * cols + nx] - 1;
        if (o >= 0 && o < b.index) { taken.add(list[o].pal * ROOFS.length + list[o].roof); pals.add(list[o].pal); }
      }
    }
    const r0 = ROOF_PICK[b.seed % ROOF_PICK.length];
    const p0 = (b.seed >>> 7) % nPal;
    let pick = -1;
    for (let pass = 0; pass < 6 && pick < 0; pass++) { // pass 0-1: the chosen roof with a fresh palette, then any palette; later passes try the other roofs
      const roof = pass < 2 ? r0 : (r0 + pass - 1) % ROOFS.length;
      for (let k = 0; k < nPal; k++) {
        const pal = (p0 + k) % nPal;
        if (!taken.has(pal * ROOFS.length + roof) && (pass !== 0 || !pals.has(pal))) { pick = pal * ROOFS.length + roof; break; }
      }
    }
    if (pick < 0) pick = p0 * ROOFS.length + r0;
    b.pal = Math.floor(pick / ROOFS.length);
    b.roof = pick % ROOFS.length;
    b.pref = (b.seed >>> 5) % 4; // the window style this building mostly uses
    b.grime = 0.04 + unit(mix(b.seed, 1)) * 0.2; // share of facade tiles with ageing
    b.shop = (b.seed >>> 9) % 5 === 0;
    b.chimneys = 1 + ((b.seed >>> 13) % 3 === 0 ? 1 : 0);
  }
  const doors = new Map();
  for (const o of map.objects ?? []) {
    if (o.type !== 'door') continue;
    const kind = ['home', 'school', 'dojo'].includes(o.to) ? o.to : 'plain';
    for (let i = 0; i < o.w; i++) {
      const part = o.w === 1 ? 'c' : o.w === 2 ? (i === 0 ? 'l' : 'r') : i === 0 ? 'sl' : i === o.w - 1 ? 'sr' : 'c';
      doors.set(`${o.x + i},${o.y - 1}`, { kind, part });
    }
  }
  for (const key of doors.keys()) { const [dx, dy] = key.split(',').map(Number); const b = buildingAt({ bld, cols, list }, dx, dy); if (b) b.shop = false; } // a school, home or dojo is no shop
  info = { rows, cols, bld, list, doors, wall: (x, y) => wall(x, y), stops: new Set((map.objects ?? []).filter(o => o.type === 'tram-stop').map(o => `${o.x},${o.y}`)) };
  INFO.set(map, info);
  return info;
}

export { buildingAt };

// The front of a building: a wall tile with open ground to the south.
export const isFacade = (info, tx, ty) => !!buildingAt(info, tx, ty) && !info.wall(tx, ty + 1);

// Open sides of a roof tile as a mask: N 1, W 2, E 4 (the roof ends there; an eave hangs over the ground beyond).
export function roofEdges(info, tx, ty) {
  return (info.wall(tx, ty - 1) ? 0 : 1) | (info.wall(tx - 1, ty) ? 0 : 2) | (info.wall(tx + 1, ty) ? 0 : 4);
}

// Dressing of a facade tile: window style (-1 none), curtains 0..3, ageing -1..3, drainpipe side ('' | 'w' | 'e'), awning and sign.
export function facadeLook(info, tx, ty) {
  if (!isFacade(info, tx, ty) || info.doors.has(`${tx},${ty}`)) return null;
  const b = buildingAt(info, tx, ty);
  const h = mix(b.seed, tx, ty);
  let style = -1;
  if (tx % 2 === 0) style = b.shop && (h & 1) ? 4 : (h >>> 3) % 3 === 0 ? (b.pref + 2) % 4 : b.pref;
  const w = !info.wall(tx - 1, ty);
  const e = !info.wall(tx + 1, ty);
  return {
    style,
    curtain: (h >>> 8) % 4,
    age: unit(mix(h, 7)) < b.grime ? (h >>> 12) % 4 : -1,
    pipe: w ? 'w' : e ? 'e' : '',
    awning: style === 4 ? (h >>> 16) % 4 : -1, // awning colour set of a shopfront
    sign: style === 4 && (h >>> 20) % 2 ? (h >>> 22) % 4 : -1, // pictogram of the shop sign
    tone: (h >>> 24) % 5 === 0 ? 1 : 0 // the light behind the window: 1 is a blue television
  };
}

// Where a flat roof gets a vent, a unit or a skylight (-1 none).
export function roofExtra(info, tx, ty) {
  const b = buildingAt(info, tx, ty);
  if (!b || b.roof !== 2 || isFacade(info, tx, ty) || roofEdges(info, tx, ty)) return -1;
  const h = mix(b.seed, tx, ty + 99);
  return h % 5 === 0 ? (h >>> 5) % 3 : -1;
}

// Chimneys of a tiled or slate roof: interior roof tiles chosen from the seed, at most `b.chimneys` per building.
export function chimneyTiles(info, b) {
  if (b.roof === 2) return [];
  const out = [];
  const cells = b.cells.filter(([x, y]) => !isFacade(info, x, y)).sort((p, q) => mix(b.seed, p[0], p[1]) - mix(b.seed, q[0], q[1]));
  for (const c of cells) {
    if (out.length >= b.chimneys) break;
    if (out.every(o => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) > 2)) out.push(c);
  }
  return out;
}

// Bin or crate along a wall: the ground tile in front of a plain facade, now and then.
export const binAt = (info, tx, ty) => {
  const b = buildingAt(info, tx, ty - 1);
  if (!b || !isFacade(info, tx, ty - 1) || info.doors.has(`${tx},${ty - 1}`) || info.doors.has(`${tx - 1},${ty - 1}`) || info.doors.has(`${tx + 1},${ty - 1}`)) return -1;
  const h = mix(b.seed, tx, ty + 313);
  return h % 14 === 0 ? (h >>> 6) % 3 : -1;
};

// ---- windows that glow in the evening
// A lit window of the evening: on from `on` (+ its own spread) until `off`, when its household is up (`occupied`).
export function windowLit(minute, w, cfg) {
  return w.occupied && (minute >= cfg.on + w.jitter * cfg.onSpread || minute < cfg.off + w.jitter * cfg.offSpread);
}

// The window list of one map: where each window is (base pixels), what it looks like, and its own switching time.
export function windowList(info) {
  const out = [];
  for (const b of info.list) {
    for (const [tx, ty] of b.cells) {
      const look = facadeLook(info, tx, ty);
      if (!look || look.style < 0) continue;
      const h = mix(b.seed, tx, ty + 17);
      out.push({
        tx, ty, x: tx * CELL + CELL / 2, y: ty * CELL + 7, style: look.style, curtain: look.curtain, tone: look.tone,
        jitter: unit(h), occupied: unit(mix(h, 3)) < (b.shop ? 0.9 : 0.62), building: b.index
      });
    }
  }
  return out;
}
