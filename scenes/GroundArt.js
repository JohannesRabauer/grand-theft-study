// Organic ground (story 16.5, CAP-35, CAP-34): the part of the ground bake that is not tile-bound.
//
// Pure module (no Phaser, no DOM): it paints into RGBA buffers at *base pixel* resolution (16 per tile; the caller scales
// the buffer to the tier). Everything is seeded from the map, so a map always bakes to the same ground.
//   paintGround  tone patches (dithered contours, so no flat field), decals, joints, cracks, manholes, drains, lane wear
//   paintWear    worn dirt where paths meet grass; drawn after the edge strips so it reaches over the border
//   edgeLevel    the noise level of a lattice vertex; EnvArt gives border strips a depth that runs from one vertex
//                level to the next, so borders wander across tiles instead of repeating per tile
// Only open ground is touched (grass, asphalt, lane, concrete, cobble, path); water, walls, hedges, entrances and tram
// stops are left alone.
export const BASE = 16; // base pixels per tile
const OPEN = { grass: 'grass', tree: 'grass', asphalt: 'asphalt', lane: 'lane', concrete: 'concrete', fence: 'concrete', cobble: 'cobble', path: 'path' };

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16); };
const C = {
  grassDark: rgb('#3f8a3c'), grassLight: rgb('#6bb85a'), dry: rgb('#86a04a'), clover: rgb('#2f7a3a'),
  flowers: ['#ffffff', '#ffe86a', '#ff9ec4', '#c9a6ff'].map(rgb), flowerHeart: rgb('#e8b830'),
  crack: rgb('#363942'), lid: rgb('#40434c'), lidRim: rgb('#33363f'), lidShine: rgb('#7c7f88'),
  laneBase: rgb('#8a4b45'), asphaltBase: rgb('#4a4d55'), paint: rgb('#e8e4d8'), freshPaint: rgb('#ffffff'),
  concreteDark: rgb('#85898f'), concreteLight: rgb('#b3b7be'), stain: rgb('#5d6270'),
  cobbleDark: rgb('#6e6354'), cobbleLight: rgb('#a89a84'), moss: rgb('#74805a'),
  pebble: rgb('#e6d9b0'), pebbleShade: rgb('#8a7a58'), dirt: rgb('#b9a77d'), dirtDark: rgb('#8a7a58')
};

// ------------------------------------------------------------------------------------------------ seeded noise
export function mapSeed(map, mapId) {
  let s = 7;
  for (const ch of `${mapId}|${map.rows.length}x${map.rows[0].length}`) s = (Math.imul(s, 31) + ch.charCodeAt(0)) | 0;
  return s >>> 0;
}
export function hash2(seed, x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(seed, x, y, cell) {
  const fx = x / cell;
  const fy = y / cell;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  let u = fx - x0;
  let v = fy - y0;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  const a = hash2(seed, x0, y0);
  const b = hash2(seed, x0 + 1, y0);
  const c = hash2(seed, x0, y0 + 1);
  const d = hash2(seed, x0 + 1, y0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Value noise with its lattice hashed once for a chunk (the per-pixel tone pass would otherwise hash 4 times per sample).
class Field {
  constructor(seed, cell, ox, oy, W, H) {
    this.cell = cell;
    this.x0 = Math.floor(ox / cell);
    this.y0 = Math.floor(oy / cell);
    this.cols = Math.ceil(W / cell) + 2;
    this.v = new Float32Array(this.cols * (Math.ceil(H / cell) + 2));
    for (let i = 0; i < this.v.length; i++) this.v[i] = hash2(seed, this.x0 + (i % this.cols), this.y0 + Math.floor(i / this.cols));
  }
  at(x, y) {
    const fx = x / this.cell;
    const fy = y / this.cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    let u = fx - ix;
    let v = fy - iy;
    u = u * u * (3 - 2 * u);
    v = v * v * (3 - 2 * v);
    const o = (iy - this.y0) * this.cols + ix - this.x0;
    const a = this.v[o];
    const b = this.v[o + 1];
    const c = this.v[o + this.cols];
    return a + (b - a) * u + (c - a) * v + (a - b - c + this.v[o + this.cols + 1]) * u * v;
  }
}
// Noise level (0, 1 or 2) of the lattice vertex (vx, vy) for border strips of one surface class.
export function edgeLevel(seed, cls, vx, vy) {
  let k = 0;
  for (let i = 0; i < cls.length; i++) k = (Math.imul(k, 31) + cls.charCodeAt(i)) | 0;
  return Math.min(2, Math.floor(hash2(seed ^ k, vx, vy) * 3));
}
// Tone colours: the tile base moved by one or two steps that cross a 5-bit colour bin in red (8 wide), cooler
// for the dark side and warmer for the light side: [darker, dark, light, lighter]. Every level is its own flat colour.
const step = (base, d, k) => { const n = parseInt(base.slice(1), 16); return rgb('#' + [16, 8, 0].map((s, i) => Math.max(0, Math.min(255, ((n >> s) & 255) + d[i] * k)).toString(16).padStart(2, '0')).join('')); };
const ramp = (base, dark, light) => [step(base, dark, 2), step(base, dark, 1), step(base, light, 1), step(base, light, 2)];
const TONES = {
  grass: ramp('#4f9d4a', [-8, -4, 0], [8, 6, 2]),
  asphalt: ramp('#4a4d55', [-8, -2, 0], [8, 9, 8]),
  lane: ramp('#8a4b45', [-9, -3, 0], [9, 5, 3]),
  path: ramp('#b9a77d', [-9, -4, 0], [8, 6, 3]),
  cobble: ramp('#8a7d6b', [-8, -3, 0], [8, 6, 3]),
  concrete: ramp('#9a9ea6', [-8, -3, 0], [8, 6, 4])
};// Posterised noise with a checker dither on every contour: 0..4, 2 leaves the tile texture alone. Five levels keep every
// level's regions small, so no colour grows into a flat field.
const LEVELS = [0.29, 0.41, 0.51, 0.61];
const tone = (v, x, y) => { const t = v + ((x + y) & 1 ? 0.02 : -0.02); return (t > LEVELS[0]) + (t > LEVELS[1]) + (t > LEVELS[2]) + (t > LEVELS[3]); };
const toneColour = (c, lv) => (lv === 2 ? 0 : TONES[c][lv > 2 ? lv - 1 : lv]);
// ------------------------------------------------------------------------------------------------ grid helpers
const GRIDS = new WeakMap();
function makeGrid(map) {
  let grid = GRIDS.get(map);
  if (grid) return grid;
  const cols = map.rows[0].length;
  const rows = map.rows.length;
  const reserved = new Set();
  for (const o of map.objects ?? []) {
    if (o.type === 'door') for (let i = 0; i < o.w; i++) for (let j = 0; j <= o.h; j++) reserved.add((o.y + j) * cols + o.x + i);
    else if (o.type === 'tram-stop') reserved.add(o.y * cols + o.x);
  }
  const ids = [];
  const classes = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const id = map.legend[map.rows[y][x]];
    ids.push(id);
    classes.push(reserved.has(y * cols + x) ? null : OPEN[id] ?? null);
  }
  const inside = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  grid = { id: (x, y) => (inside(x, y) ? ids[y * cols + x] : null), cls: (x, y) => (inside(x, y) ? classes[y * cols + x] : null) };
  GRIDS.set(map, grid);
  return grid;
}
// ------------------------------------------------------------------------------------------------ painting
// Returns { data, width, height } (RGBA, base pixels) for the chunk of w x h tiles at (tx0, ty0), or null when the map
// is indoors. `under` is drawn before the edge strips, `over` (worn dirt) after them.
export function paintGround(map, seed, tx0, ty0, w, h) {
  if (map.indoor) return null;
  const g = makeGrid(map);
  const W = w * BASE;
  const H = h * BASE;
  const under = new Uint32Array(W * H);
  const over = new Uint32Array(W * H);
  const ox = tx0 * BASE;
  const oy = ty0 * BASE;
  const put = (buf, gx, gy, col, only) => {
    const x = gx - ox;
    const y = gy - oy;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const c = g.cls(gx >> 4, gy >> 4);
    if (only ? !only.includes(c) : !c) return;
    buf[y * W + x] = col;
  };

  // 1. tone patches, per pixel
  const fields = { g1: new Field(seed + 1, 36, ox, oy, W, H), g2: new Field(seed + 2, 11, ox, oy, W, H), n1: new Field(seed + 1, 24, ox, oy, W, H), n2: new Field(seed + 2, 6, ox, oy, W, H), dry: new Field(seed + 3, 20, ox, oy, W, H), moss: new Field(seed + 3, 18, ox, oy, W, H) };
  for (let ty = ty0; ty < ty0 + h; ty++) for (let tx = tx0; tx < tx0 + w; tx++) {
    const c = g.cls(tx, ty);
    if (!c) continue;
    const open = c === 'grass' && stripeField(g, tx, ty);
    for (let py = 0; py < BASE; py++) for (let px = 0; px < BASE; px++) {
      const gx = tx * BASE + px;
      const gy = ty * BASE + py;
      const col = tonePixel(seed, fields, c, gx, gy, open);
      if (col) under[(gy - oy) * W + gx - ox] = col;
    }
  }
  // 2. decals, per tile
  for (let ty = ty0 - 1; ty <= ty0 + h; ty++) for (let tx = tx0 - 1; tx <= tx0 + w; tx++) {
    const c = g.cls(tx, ty);
    if (!c) continue;
    const r = hash2(seed + 11, tx, ty);
    const r2 = hash2(seed + 12, tx, ty);
    const x0 = tx * BASE;
    const y0 = ty * BASE;
    const at = (n, k) => Math.floor(hash2(seed + 20 + k, tx, ty) * n);
    const here = [c];
    if (c === 'asphalt') {
      if (r < 0.07) crack(under, put, seed, tx, ty, C.crack, here);
      if (r2 < 0.012 && [-1, 0, 1].every(dy => [-1, 0, 1].every(dx => g.cls(tx + dx, ty + dy) === 'asphalt'))) manhole(under, put, x0 + 8 + at(5, 1) - 2, y0 + 8 + at(5, 2) - 2, here);
      drains(under, put, g, seed, tx, ty);
    } else if (c === 'concrete') {
      if (r < 0.07) crack(under, put, seed, tx, ty, C.concreteDark, here);
      if (r2 < 0.03) stainBlob(under, put, x0 + 3 + at(10, 3), y0 + 3 + at(10, 4), 2 + at(2, 5), C.stain, here);
    } else if (c === 'lane') {
      laneWear(under, put, x0, y0, r);
    } else if (c === 'cobble') {
      if (r < 0.05) crack(under, put, seed, tx, ty, C.cobbleDark, here);
    } else if (c === 'path') {
      for (let i = 0; i < 2; i++) if (hash2(seed + 30 + i, tx, ty) < 0.5) pebbleAt(under, put, x0 + 1 + at(13, 6 + i), y0 + 1 + at(13, 8 + i), here);
    } else if (c === 'grass') {
      for (let i = 0; i < 2; i++) {
        const q = hash2(seed + 40 + i, tx, ty);
        const gx = x0 + 1 + at(14, 10 + i);
        const gy = y0 + 2 + at(12, 12 + i);
        if (q < 0.10) { put(under, gx, gy, C.clover, here); put(under, gx + 1, gy, C.clover, here); put(under, gx, gy + 1, C.clover, here); put(under, gx - 1, gy + 1, C.clover, here); }
        else if (q < 0.17) { put(under, gx, gy, C.flowers[at(4, 14 + i)], here); put(under, gx, gy - 1, C.flowerHeart, here); }
        else if (q < 0.25) { put(under, gx, gy, C.grassDark, here); put(under, gx, gy - 1, C.grassLight, here); put(under, gx - 1, gy - 2, C.grassLight, here); }
      }
    }
  }
  // 3. worn dirt where paths meet grass
  for (let ty = ty0 - 1; ty <= ty0 + h; ty++) for (let tx = tx0 - 1; tx <= tx0 + w; tx++) {
    const c = g.cls(tx, ty);
    if (c === 'path' || c === 'grass') wearTile(over, put, g, seed, tx, ty, c);
    else if (c === 'lane' || c === 'asphalt') frayTile(over, put, g, seed, tx, ty, c);
  }
  return { under: toRgba(under), over: toRgba(over), width: W, height: H };
}

const toRgba = buf => new Uint8ClampedArray(buf.buffer);

// Open lawn: a tile whose 5x5 neighbourhood is all grass gets mowing stripes.
function stripeField(g, tx, ty) {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (g.cls(tx + dx, ty + dy) !== 'grass' || g.id(tx + dx, ty + dy) === 'tree') return false;
  return true;
}

// Tone of one base pixel (0 = leave the tile texture alone).
function tonePixel(seed, f, c, x, y, mow) {
  const grass = c === 'grass';
  const n1 = (grass ? f.g1 : f.n1).at(x, y);
  const n2 = (grass ? f.g2 : f.n2).at(x, y);
  const grain = hash2(seed + 7, x, y);
  let v = c === 'grass' ? 0.46 * n1 + 0.28 * n2 + 0.26 * grain : 0.3 * n1 + 0.3 * n2 + 0.4 * grain;
  if (mow && Math.floor((x + (seed & 7) + Math.round((vnoise(seed + 6, 0, y, 8) - 0.5) * 8)) / 24) % 2) v += 0.07; // mowing stripes with a ragged edge
  switch (c) {
    case 'grass': {
      const dry = f.dry.at(x, y);
      if (dry > 0.84 && ((x + y) & 1 || dry > 0.9)) return C.dry;
      return toneColour('grass', tone(v, x, y));
    }
    case 'asphalt': return toneColour('asphalt', tone(v, x, y));
    case 'lane': return toneColour('lane', tone(v, x, y));
    case 'path': return toneColour('path', tone(v, x, y));
    case 'cobble': {
      const m = f.moss.at(x, y);
      if (m > 0.82 && ((x + y) & 1 || m > 0.88)) return C.moss;
      return toneColour('cobble', tone(v, x, y));
    }
    default: { // concrete: slabs with joints, then stains
      const row = Math.floor(y / 32);
      const shift = Math.floor(hash2(seed + 4, row, 0) * 48);
      if ((x + shift) % 48 === 0) return C.concreteDark;
      const slab = Math.floor((x + shift) / 48);
      const jog = hash2(seed + 5, slab, row) < 0.5 ? 0 : 1;
      if (y % 32 === jog) return C.concreteDark;
      if (y % 32 === jog + 1 && (x + y) % 3 === 0) return C.concreteLight;
      return toneColour('concrete', tone(v, x, y));
    }
  }
}

function crack(buf, put, seed, tx, ty, col, only) {
  let x = tx * BASE + Math.floor(hash2(seed + 50, tx, ty) * BASE);
  let y = ty * BASE + Math.floor(hash2(seed + 51, tx, ty) * BASE);
  const dir = hash2(seed + 52, tx, ty) < 0.5 ? 1 : -1;
  const len = 10 + Math.floor(hash2(seed + 53, tx, ty) * 14);
  for (let i = 0; i < len; i++) {
    put(buf, x, y, col, only);
    const q = hash2(seed + 54, x, y);
    if (q < 0.6) x += dir; else y += q < 0.85 ? 1 : -1;
    if (q > 0.93) put(buf, x, y + 1, col, only);
  }
}
function stainBlob(buf, put, cx, cy, r, col, only) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && ((dx + dy) & 1) === 0) put(buf, cx + dx, cy + dy, col, only);
}
function manhole(buf, put, cx, cy, only) {
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const d = dx * dx + dy * dy;
    if (d > 18) continue;
    put(buf, cx + dx, cy + dy, d > 12 ? C.lidRim : (dx === 0 || dy === 0 ? C.lidRim : C.lid), only);
  }
  put(buf, cx - 1, cy - 2, C.lidShine, only);
  put(buf, cx - 2, cy - 1, C.lidShine, only);
}
// A gutter grate beside a kerb: every fifth tile along a concrete neighbour.
function drains(buf, put, g, seed, tx, ty) {
  if (hash2(seed + 60, tx, ty) > 0.25) return;
  const sides = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let s = 0; s < 4; s++) {
    const [dx, dy] = sides[s];
    if (g.cls(tx + dx, ty + dy) !== 'concrete') continue;
    const along = 4 + Math.floor(hash2(seed + 61, tx, ty) * 6);
    for (let i = 0; i < 5; i++) for (let d = 0; d < 2; d++) {
      const inward = 4 + d; // clear of the kerb strip (2.5 base px) and its shadow
      const a = along + i;
      const gx = tx * BASE + (dy !== 0 ? a : dx > 0 ? BASE - 1 - inward : inward);
      const gy = ty * BASE + (dx !== 0 ? a : dy > 0 ? BASE - 1 - inward : inward);
      put(buf, gx, gy, i % 2 === 0 ? C.crack : C.lid, ['asphalt']);
    }
    return;
  }
}
// The tile texture draws a dash at units x 0..11, y 14..17 (base px x 0..5, y 7..8): some are worn, some are fresh.
function laneWear(buf, put, x0, y0, r) {
  const only = ['lane'];
  if (r < 0.4) {
    for (let y = 7; y <= 8; y++) for (let x = 0; x <= 5; x++) if (hash2(r * 977 | 0, x0 + x, y0 + y) < 0.55) put(buf, x0 + x, y0 + y, C.laneBase, only);
  } else if (r < 0.5) {
    for (let x = 0; x <= 5; x++) { put(buf, x0 + x, y0 + 7, C.freshPaint, only); put(buf, x0 + x, y0 + 8, C.paint, only); }
  }
}
function pebbleAt(buf, put, x, y, only) {
  put(buf, x, y, C.pebble, only); put(buf, x + 1, y, C.pebble, only);
  put(buf, x, y + 1, C.pebbleShade, only); put(buf, x + 1, y + 1, C.pebbleShade, only);
}

// Lane and asphalt share a straight tile border: each side reaches 0 to 3 base pixels into the other by its own noise.
function frayTile(over, put, g, seed, tx, ty, c) {
  const other = c === 'lane' ? 'asphalt' : 'lane';
  const col = other === 'lane' ? C.laneBase : C.asphaltBase;
  const sides = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let s = 0; s < 4; s++) {
    const [dx, dy] = sides[s];
    if (g.cls(tx + dx, ty + dy) !== other) continue;
    const line = dy !== 0 ? ty + (dy > 0 ? 1 : 0) : tx + (dx > 0 ? 1 : 0) + 4096;
    for (let a = 0; a < BASE; a++) {
      const gx = tx * BASE + (dy !== 0 ? a : dx > 0 ? BASE - 1 : 0);
      const gy = ty * BASE + (dx !== 0 ? a : dy > 0 ? BASE - 1 : 0);
      const n = vnoise(seed + (c === 'lane' ? 81 : 82), dy !== 0 ? gx : gy, line * 37, 5);
      const depth = Math.floor(n * 4.2);
      for (let d = 0; d < depth; d++) {
        const px = gx - (dx > 0 ? d : dx < 0 ? -d : 0);
        const py = gy - (dy > 0 ? d : dy < 0 ? -d : 0);
        if (d < depth - 1 || (px + py) & 1) put(over, px, py, col, [c]);
      }
    }
  }
}

// Worn dirt along a grass/path border: a noisy band of 0 to 3 base pixels on both sides, bigger at path corners.
function wearTile(over, put, g, seed, tx, ty, c) {
  const other = c === 'path' ? 'grass' : 'path';
  const sides = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const both = ['grass', 'path'];
  for (let s = 0; s < 4; s++) {
    const [dx, dy] = sides[s];
    if (g.cls(tx + dx, ty + dy) !== other) continue;
    for (let a = 0; a < BASE; a++) {
      const gx = tx * BASE + (dy !== 0 ? a : dx > 0 ? BASE - 1 : 0);
      const gy = ty * BASE + (dx !== 0 ? a : dy > 0 ? BASE - 1 : 0);
      const line = dy !== 0 ? ty + (dy > 0 ? 1 : 0) : tx + (dx > 0 ? 1 : 0) + 4096; // both tiles of a border read the same noise
      const n = vnoise(seed + 70, dy !== 0 ? gx : gy, line * 37, 6);
      const depth = n > 0.62 ? 1 + Math.floor((n - 0.62) * 9) : 0;
      for (let d = 0; d < depth; d++) {
        const px = gx - (dx > 0 ? d : dx < 0 ? -d : 0);
        const py = gy - (dy > 0 ? d : dy < 0 ? -d : 0);
        put(over, px, py, (px + py) & 1 ? C.dirt : C.dirtDark, both);
      }
    }
  }
  for (let k = 0; k < 4; k++) { // outer corners: the path bends and the grass is trodden flat
    const cx = k === 0 || k === 3 ? -1 : 1;
    const cy = k < 2 ? -1 : 1;
    if (g.cls(tx + cx, ty + cy) !== other || g.cls(tx + cx, ty) === other || g.cls(tx, ty + cy) === other) continue;
    const bx = tx * BASE + (cx > 0 ? BASE : 0);
    const by = ty * BASE + (cy > 0 ? BASE : 0);
    const rad = 3.2 + hash2(seed + 71, tx, ty) * 1.6;
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
      if (Math.hypot(x + 0.5, y + 0.5) > rad) continue;
      const px = cx > 0 ? bx + x : bx + x - 1;
      const py = cy > 0 ? by + y : by + y - 1;
      if (((px + py) & 1) === 0 || Math.hypot(x + 0.5, y + 0.5) < rad - 1.4) put(over, px, py, (px * 3 + py) % 5 === 0 ? C.dirtDark : C.dirt, both);
    }
  }
}
