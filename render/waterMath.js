// Water maths (story 16.8, AD-31). Pure, no Phaser: scripts/check-water.mjs runs it in node.
// A body of water is a connected block of water tiles. Its edge is not the tile edge: the signed distance to the tile outline is bent by
// seeded value noise, so the shore wanders by a few base pixels and a pond or canal is no framed rectangle. From that field this module
// builds, once per map: the mask the water pipeline draws (R = depth in 1/8 px, G = per pixel noise), the static shore layer (wet mud and
// sand banks next to soft ground, stone coping next to paving, stones, reeds and bridge piers) and, for Low and Canvas, looping frames
// of the water itself. `waterColor` is the one formula of the water surface; render/pipelines/WaterFx.js is its shader twin.
// Everything is a function of the map and its seed. Collision, pathfinding and the map data are never touched.

import { hex, rgba, smoothT } from './baseMath.js';

export const TILE = 16;
export const K = { NONE: 0, WATER: 1, HARD: 2, SOFT: 3, BRIDGE: 4 };
const HARD = new Set(['asphalt', 'lane', 'concrete', 'cobble', 'path', 'puddle', 'fence', 'wall', 'dumpster', 'booth']);
const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const TAU = Math.PI * 2;

export function hash01(a, b, c = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
// Value noise in -1..1 on a lattice with cells of `cell` px.
function vnoise(x, y, cell, seed) {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smoothT(fx - ix);
  const ty = smoothT(fy - iy);
  const v = (a, b) => hash01(a, b, seed) * 2 - 1;
  const top = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * tx;
  const bot = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * tx;
  return top + (bot - top) * ty;
}

const idAt = (map, x, y) => (x < 0 || y < 0 || y >= map.rows.length || x >= map.rows[0].length ? null : map.legend[map.rows[y][x]]);
const isWater = (map, x, y) => idAt(map, x, y) === 'water';

// A path tile with water beside it and more water within two tiles on its far side carries a bridge (the canal crossings).
export function isBridge(map, tx, ty) {
  if (idAt(map, tx, ty) !== 'path') return false;
  for (const [dx, dy] of SIDES) {
    if (isWater(map, tx + dx, ty + dy) && (isWater(map, tx - dx, ty - dy) || isWater(map, tx - 2 * dx, ty - 2 * dy))) return true;
  }
  return false;
}

export function tileKind(map, tx, ty) {
  const id = idAt(map, tx, ty);
  if (id === null) return K.SOFT;
  if (id === 'water') return K.WATER;
  if (isBridge(map, tx, ty)) return K.BRIDGE;
  return HARD.has(id) ? K.HARD : K.SOFT;
}

// Connected water tiles (4 neighbours), in reading order of their first tile.
export function waterBodies(map) {
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const seen = new Uint8Array(rows * cols);
  const out = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (seen[y * cols + x] || !isWater(map, x, y)) continue;
    const b = { index: out.length, tiles: [], x0: x, y0: y, x1: x, y1: y };
    const stack = [[x, y]];
    seen[y * cols + x] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      b.tiles.push([cx, cy]);
      b.x0 = Math.min(b.x0, cx); b.x1 = Math.max(b.x1, cx); b.y0 = Math.min(b.y0, cy); b.y1 = Math.max(b.y1, cy);
      for (const [dx, dy] of SIDES) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isWater(map, nx, ny) || seen[ny * cols + nx]) continue;
        seen[ny * cols + nx] = 1;
        stack.push([nx, ny]);
      }
    }
    out.push(b);
  }
  return out;
}

// Exact squared distance transform (Felzenszwalb), in place on a grid of w x h where sources hold 0 and the rest a large value.
function edt(g, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const run = (len, get, set) => {
    for (let i = 0; i < len; i++) f[i] = get(i);
    let k = 0;
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s;
      for (;;) {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s <= z[k] && k > 0) k--; else break;
      }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      d[q] = (q - p) * (q - p) + f[p];
    }
    for (let i = 0; i < len; i++) set(i, d[i]);
  };
  for (let x = 0; x < w; x++) run(h, i => g[i * w + x], (i, val) => { g[i * w + x] = val; });
  for (let y = 0; y < h; y++) run(w, i => g[y * w + i], (i, val) => { g[y * w + i] = val; });
}
const BIG = 1e12;

// Box blur (radius r, edges clamped) of a w x h field, in place: rounds the convex corners of a signed distance field and leaves straight edges alone.
function blur(a, w, h, r) {
  const tmp = new Float32Array(w * h);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc * k;
      acc += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      a[y * w + x] = acc * k;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
}

// The pixel field of one body: `t` is the signed distance to its (noise-bent) shore in px, positive in the water.
export function buildBody(map, body, cfg, seed) {
  const M = cfg.margin;
  const ox = body.x0 * TILE - M;
  const oy = body.y0 * TILE - M;
  const w = (body.x1 - body.x0 + 1) * TILE + 2 * M;
  const h = (body.y1 - body.y0 + 1) * TILE + 2 * M;
  const cols = map.rows[0].length;
  const mine = new Set(body.tiles.map(([x, y]) => y * cols + x));
  const inside = new Uint8Array(w * h);
  const gIn = new Float64Array(w * h);
  const gOut = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tx = Math.floor((ox + x) / TILE);
    const ty = Math.floor((oy + y) / TILE);
    const i = y * w + x;
    const inn = mine.has(ty * cols + tx) ? 1 : 0;
    inside[i] = inn;
    gIn[i] = inn ? BIG : 0; // distance of an inside pixel to the nearest outside one
    gOut[i] = inn ? 0 : BIG;
  }
  edt(gIn, w, h);
  edt(gOut, w, h);
  const t = new Float32Array(w * h);
  const n = new Uint8Array(w * h);
  const kinds = new Map(); // tile kinds near the body, for the banks
  const kindOf = (tx, ty) => {
    const key = ty * 65536 + tx;
    let k = kinds.get(key);
    if (k === undefined) { k = tileKind(map, tx, ty); kinds.set(key, k); }
    return k;
  };
  for (let i = 0; i < w * h; i++) t[i] = inside[i] ? Math.sqrt(gIn[i]) - 0.5 : -(Math.sqrt(gOut[i]) - 0.5);
  blur(t, w, h, cfg.round);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const wx = ox + x;
    const wy = oy + y;
    let s = t[i];
    let d = cfg.amp * (0.7 * vnoise(wx, wy, cfg.cell, seed) + 0.3 * vnoise(wx + 31, wy + 17, cfg.cell / 2, seed + 1)) + cfg.lobe.amp * vnoise(wx + 7, wy + 53, cfg.lobe.cell, seed + 2);
    s += d > 0 ? d * cfg.outward : d; // the water may pull back far from the tile edge but only creeps a little past it
    if (s > 0 && kindOf(Math.floor(wx / TILE), Math.floor(wy / TILE)) === K.BRIDGE) s = -0.5; // a bridge is never under water
    t[i] = s;
    n[i] = Math.floor(hash01(wx, wy, seed + 5) * 256) & 255;
  }
  return { index: body.index, w, h, ox, oy, t, n, kindOf, tiles: body.tiles, mine, cols };
}

// ---- the water surface ----------------------------------------------------------------------------------------------
const palCache = new WeakMap();
export function palette(cfg) {
  let p = palCache.get(cfg);
  if (!p) {
    p = { water: cfg.palette.water.map(hex), foam: cfg.palette.foam.map(hex), shimmer: hex(cfg.palette.shimmer), glint: hex(cfg.palette.glint) };
    palCache.set(cfg, p);
  }
  return p;
}
const BAYER = [[0.125, 0.625], [0.875, 0.375]];
export const bayer2 = (x, y) => BAYER[y & 1][x & 1];
const fract = v => v - Math.floor(v);

// Colour (0xRRGGBB) of the water surface at world pixel (wx, wy), `t` px from the shore, per pixel noise `n` (0..1), animation phase
// `ph` in radians. Every phase term is a whole multiple of `ph`, so the frames of the fallback loop are seamless.
export function waterColor(wx, wy, t, n, ph, cfg) {
  const pal = palette(cfg);
  const b = cfg.bands;
  const tb = t + (bayer2(wx, wy) - 0.5) * 1.2;
  const level = tb < b[0] ? 0 : tb < b[1] ? 1 : tb < b[2] ? 2 : 3;
  let col = pal.water[level];
  if (t < cfg.caustic.depth) {
    const c = Math.sin(wx * 0.8 + ph + Math.sin(wy * 0.7 - ph) * 1.5) * Math.sin(wy * 0.8 - ph + Math.sin(wx * 0.6 + ph) * 1.5);
    if (c > cfg.caustic.threshold) col = pal.shimmer;
  }
  if (level > 0) { // a slow swell in wide bands, so the open water never forms one flat field
    const sw = Math.sin(wy * 0.55 + wx * 0.18 + 2.2 * Math.sin(wx * 0.06 + ph) - ph);
    if (sw > cfg.swell.up) col = pal.water[level - 1];
    else if (sw < -cfg.swell.down && level < 3) col = pal.water[level + 1];
  }
  if (t > cfg.ripple.minDepth) {
    const v = Math.sin((wy + 0.35 * wx) * 0.78 + 1.7 * Math.sin(wx * 0.21 + ph) - ph);
    if (v > cfg.ripple.threshold) col = level > 0 ? pal.water[level - 1] : pal.foam[1];
    else if (v < -cfg.ripple.threshold) col = level < 3 ? pal.water[level + 1] : pal.water[3];
  }
  if (fract(n * 37 + 0.37 + ph * 0.4774648) > 0.9965) col = pal.glint;
  const lim = cfg.foam.base + cfg.foam.swing * (0.5 + 0.5 * Math.sin(ph + wx * 0.3 + wy * 0.27));
  if (t < lim) col = n > 0.3 || t < 1 ? pal.foam[0] : pal.foam[1];
  else if (t < lim + cfg.foam.spread && n > 0.82) col = pal.foam[1];
  return col;
}

// The mask for the pipeline: R = depth in 1/8 px (0 = no water here), G = noise, A opaque (so the texture keeps its colour channels).
export function maskLayer(b) {
  const data = new Uint8ClampedArray(b.w * b.h * 4);
  for (let i = 0; i < b.w * b.h; i++) {
    const t = b.t[i];
    data[i * 4] = t > 0 ? Math.min(255, Math.max(1, Math.round(t * 8))) : 0;
    data[i * 4 + 1] = b.n[i];
    data[i * 4 + 3] = 255;
  }
  return data;
}

// One frame (of `frames`) of the water for Low and Canvas, as base-pixel RGBA.
export function fallbackFrame(b, cfg, frame, frames, out = new Uint8ClampedArray(b.w * b.h * 4)) {
  const ph = (TAU * frame) / frames;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const i = y * b.w + x;
    const t = b.t[i];
    if (t <= 0) { out[i * 4 + 3] = 0; continue; }
    const c = waterColor(b.ox + x, b.oy + y, t, b.n[i] / 255, ph, cfg);
    out[i * 4] = c >> 16; out[i * 4 + 1] = (c >> 8) & 255; out[i * 4 + 2] = c & 255; out[i * 4 + 3] = 255;
  }
  return out;
}

// Phase of the animation (radians) `time` seconds in, advancing in steps of 1/`step` s so the water moves in whole pixel steps of time.
export const flowPhase = (time, flow) => Math.floor(time * flow.step) / flow.step * flow.speed;

// ---- the static shore layer ----------------------------------------------------------------------------------------------
// Kind of the land under a pixel: its own tile, or for a pixel in a water tile the shore beyond it, taken from the nearest tile edge
// that has land behind it.
function landKind(b, x, y) {
  const wx = b.ox + x;
  const wy = b.oy + y;
  const tx = Math.floor(wx / TILE);
  const ty = Math.floor(wy / TILE);
  const own = b.kindOf(tx, ty);
  if (own !== K.WATER) return own;
  const lx = wx - tx * TILE;
  const ly = wy - ty * TILE;
  let best = Infinity;
  let kind = K.SOFT;
  const sides = [[ly, 0, -1], [TILE - 1 - lx, 1, 0], [TILE - 1 - ly, 0, 1], [lx, -1, 0]];
  for (const [dist, dx, dy] of sides) {
    const k = b.kindOf(tx + dx, ty + dy);
    if (k !== K.WATER && dist < best) { best = dist; kind = k; }
  }
  return kind;
}

const parse = s => {
  if (s[0] === '#') return rgba(hex(s));
  const m = s.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
  return [+m[1], +m[2], +m[3], Math.round(+m[4] * 255)];
};

export function shoreLayer(b, cfg, seed) {
  const { w, h } = b;
  const data = new Uint8ClampedArray(w * h * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3];
  };
  const soft = cfg.bank.soft.map(parse);
  const stone = cfg.bank.stone.map(parse);
  const kinds = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const t = b.t[i];
    if (t > 0) continue;
    const kind = landKind(b, x, y);
    kinds[i] = kind;
    if (kind === K.BRIDGE) continue;
    const u = -t;
    const wx = b.ox + x;
    const wy = b.oy + y;
    const nz = b.n[i] / 255;
    if (kind === K.HARD) {
      const e = cfg.bank.stoneEdge;
      if (u >= e[2]) continue;
      const joint = (Math.floor(wx / 6) + Math.floor(wy / 6) * 3) % 5 === 0 && ((wx ^ wy) & 5) === 0;
      set(x, y, u < e[0] ? stone[0] : u < e[1] ? (joint ? stone[3] : stone[1]) : (nz < 0.25 ? stone[1] : stone[2]));
    } else {
      const s = cfg.bank.sand;
      if (u >= s[2]) continue;
      if (u < cfg.bank.wet) set(x, y, soft[0]);
      else if (u < s[0]) set(x, y, soft[1]);
      else if (u < s[1]) set(x, y, nz < 0.3 ? soft[2] : soft[3]);
      else if (bayer2(wx, wy) < (s[2] - u) / (s[2] - s[1])) set(x, y, nz < 0.5 ? soft[4] : soft[3]);
    }
  }
  // stones on the bank
  const st = cfg.stones.colors.map(hex).map(rgba);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 3; x++) {
    if (hash01(b.ox + x, b.oy + y, seed + 11) >= cfg.stones.rate) continue;
    const big = hash01(b.ox + x, b.oy + y, seed + 12) < 0.4;
    const sw = big ? 3 : 2;
    const sh = big ? 3 : 2;
    let ok = true;
    for (let dy = 0; dy < sh && ok; dy++) for (let dx = 0; dx < sw; dx++) {
      const i = (y + dy) * w + x + dx;
      if (b.t[i] > -1.5 || b.t[i] < -4.5 || kinds[i] === K.BRIDGE || kinds[i] === K.HARD) { ok = false; break; }
    }
    if (!ok) continue;
    for (let dy = 0; dy < sh; dy++) for (let dx = 0; dx < sw; dx++) {
      const edge = dy === sh - 1 || dx === sw - 1;
      if (big && dx === sw - 1 && dy === 0) continue; // a rounded corner
      set(x + dx, y + dy, edge ? st[big ? 2 : 3] : dy === 0 || dx === 0 ? st[1] : st[0]);
    }
  }
  // reeds along soft banks, at least `spacing` px apart
  const taken = new Map();
  const sp = cfg.reeds.spacing;
  const stalk = cfg.reeds.stalk.map(hex).map(rgba);
  const head = parse(cfg.reeds.head);
  for (let y = 4; y < h - 1; y++) for (let x = 3; x < w - 3; x++) {
    const i = y * w + x;
    if (b.t[i] > 0.4 || b.t[i] < -2.5 || kinds[i] !== K.SOFT) continue;
    if (hash01(b.ox + x, b.oy + y, seed + 21) >= cfg.reeds.rate) continue;
    const cx = Math.floor(x / sp);
    const cy = Math.floor(y / sp);
    let clash = false;
    for (let dy = -1; dy <= 1 && !clash; dy++) for (let dx = -1; dx <= 1; dx++) {
      const o = taken.get((cy + dy) * 65536 + cx + dx);
      if (o && Math.abs(o[0] - x) < sp && Math.abs(o[1] - y) < sp) { clash = true; break; }
    }
    if (clash) continue;
    taken.set(cy * 65536 + cx, [x, y]);
    const count = 3 + Math.floor(hash01(x, y, seed + 22) * 3);
    for (let k = 0; k < count; k++) {
      const sx = x + k - Math.floor(count / 2);
      const height = cfg.reeds.min + Math.floor(hash01(sx, y, seed + 23) * (cfg.reeds.max - cfg.reeds.min + 1));
      const lean = hash01(sx, y, seed + 24) < 0.5 ? -1 : 1;
      const tall = height - 1;
      for (let j = 0; j < height; j++) {
        const off = j > tall - 2 ? lean : 0;
        set(sx + off, y - j + (k % 2), j < 2 ? stalk[2] : (j + k) % 3 === 0 ? stalk[1] : stalk[0]);
      }
      if (hash01(sx, y, seed + 25) < 0.55) { set(sx + lean, y - height + (k % 2), head); set(sx + lean, y - height - 1 + (k % 2), head); }
    }
  }
  // bridge piers: stone faces and posts in the water beside a bridge tile, with a shadow on the water
  const pier = cfg.pier;
  const pst = pier.stone.map(hex).map(rgba);
  const psh = parse(pier.shadow);
  for (const [tx, ty] of b.tiles) {
    for (const [dx, dy] of SIDES) {
      if (b.kindOf(tx + dx, ty + dy) !== K.BRIDGE) continue;
      // along the shared edge of the water tile (tx, ty) and the bridge tile beside it
      for (let a = 0; a < TILE; a++) {
        const post = pier.posts.includes(a);
        for (let k = 0; k < pier.reach + 2; k++) {
          const wx = dx === 0 ? tx * TILE + a : dx < 0 ? tx * TILE + k : tx * TILE + TILE - 1 - k;
          const wy = dy === 0 ? ty * TILE + a : dy < 0 ? ty * TILE + k : ty * TILE + TILE - 1 - k;
          const x = wx - b.ox;
          const y = wy - b.oy;
          if (k < pier.width) set(x, y, k === 0 ? pst[1] : k === 1 ? pst[2] : pst[0]);
          else if (post && k < pier.reach) set(x, y, k === pier.width ? pst[2] : pst[0]);
          else if (k < pier.width + 2) set(x, y, psh);
        }
      }
    }
  }
  return data;
}

// Lights (x, y, radius, intensity from ctx.lights slots) near a body in its own pixel coordinates, nearest to its centre first, at most `max`.
export function pickLights(active, b, cfg, out) {
  const r = cfg.reflect;
  out.length = 0;
  const x0 = b.ox;
  const y0 = b.oy;
  const x1 = b.ox + b.w;
  const y1 = b.oy + b.h;
  for (let i = 0; i < active.length; i++) {
    const s = active[i];
    if (s.intensity <= 0.02) continue;
    const reach = s.radius * r.reach;
    if (s.x < x0 - reach || s.x > x1 + reach || s.y < y0 - reach || s.y > y1 + reach) continue;
    out.push(s);
  }
  if (out.length > r.max) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    out.sort((p, q) => (p.x - cx) ** 2 + (p.y - cy) ** 2 - ((q.x - cx) ** 2 + (q.y - cy) ** 2));
    out.length = r.max;
  }
  return out;
}

// Brightness 0..1 of a reflection `d` px (stretched along y) from a light of reach `reach`, in `steps` flat bands.
export function glintLevel(dx, dy, reach, steps) {
  const d = Math.hypot(dx, dy > 0 ? dy * 0.55 : dy * 1.4);
  const s = 1 - d / reach;
  return s <= 0 ? 0 : Math.ceil(s * steps) / steps;
}
