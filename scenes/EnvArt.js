// Environment art rendered from the map grid (AD-30, story 15.1 and 15.3).
//
// The ground used to be one texture per tile, so every surface boundary was a hard seam. This module draws
// transitions, curbs, water shores and banks, and orientation-aware fences and hedges *from each tile's
// neighbours*, once, when the ground texture is built (services/World.js). Nothing here runs per frame and
// nothing changes collision, pathfinding or map data.
//
// Everything is authored on a 32 unit grid and written out at the real tile texture size (32 on Medium and
// High, 16 on Low), so both resolutions get matching art. Strips are drawn for the north side and rotated
// for the other three, so a strip set costs one drawing and every strip shares the same depth at its ends,
// which keeps a run of strips continuous across tiles.
const U = 32;
const SIDES = ['n', 'e', 's', 'w'];
const OFF = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const CORNERS = ['nw', 'ne', 'se', 'sw']; // rotation index 0..3, like SIDES
const CORNER_OFF = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };
const CORNER_SIDES = { nw: ['n', 'w'], ne: ['n', 'e'], se: ['s', 'e'], sw: ['s', 'w'] };
const VARIANTS = 2;

// Surface class a tile id blends as. Higher rank bleeds over lower rank.
const CLASS = { asphalt: 'asphalt', puddle: 'asphalt', lane: 'lane', concrete: 'concrete', fence: 'concrete', cobble: 'cobble', path: 'path', grass: 'grass', water: 'water' };
const RANK = { asphalt: 1, lane: 1, concrete: 2, cobble: 3, path: 4, grass: 5 };
// Tiles that carry no blend of their own but sit on a surface, so their neighbours blend against it.
const GIVES_AS = { tree: 'grass', dumpster: 'concrete', booth: 'concrete' };
const STYLE = { grass: 'tuft', path: 'soft', cobble: 'stone', concrete: 'curb' };
const HARD = new Set(['asphalt', 'lane', 'concrete', 'cobble']); // water meets these with a stone edge, soft ground with a mud bank

const STATE = { ready: false, variants: {} };

function rng(seed) {
  let s = (seed * 2654435761 + 12345) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const hash = s => [...s].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);

function rgbOf(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function shade(c, t) { // t > 0 lightens, t < 0 darkens
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return '#' + rgbOf(c).map(v => Math.round(v + (target - v) * k).toString(16).padStart(2, '0')).join('');
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = U;
  return c;
}
const px = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
function ell(c, col, cx, cy, rx, ry) {
  c.fillStyle = col;
  for (let y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) >= 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    if (x1 > x0) c.fillRect(x0, y, x1 - x0, 1);
  }
}

// Writes the 32 unit canvas to a texture of the real size, rotated by quarter turns (0 n, 1 e, 2 s, 3 w).
function emit(scene, key, src, size, rot = 0) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, size, size);
  const c = tex.getContext();
  c.imageSmoothingEnabled = size < U;
  if (rot === 1) c.translate(size, 0);
  else if (rot === 2) c.translate(size, size);
  else if (rot === 3) c.translate(0, size);
  c.rotate((rot * Math.PI) / 2);
  c.drawImage(src, 0, 0, size, size);
  tex.refresh();
}

// A 32 unit copy of an existing tile texture (variant v when the tier has variants).
function sourceTile(scene, id, v) {
  const key = v > 0 && scene.textures.exists(`tile-${id}-${v}`) ? `tile-${id}-${v}` : `tile-${id}`;
  const out = canvas();
  const c = out.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.drawImage(scene.textures.get(key).getSourceImage(), 0, 0, U, U);
  return out;
}

// Per-column strip depth in units. Both ends share one value so neighbouring strips join without a notch.
function depthProfile(style, r) {
  const d = new Array(U);
  if (style === 'tuft') {
    for (let x = 0; x < U; x++) d[x] = 4 + Math.floor(r() * 3);
    for (let x = 3; x < U - 3; x += 5 + Math.floor(r() * 4)) { d[x] += 3; d[x + 1] += 2; d[x - 1] += 1; } // grass blades poking out
    d[0] = d[U - 1] = 5;
  } else if (style === 'soft') {
    const phase = r() * 6;
    for (let x = 0; x < U; x++) d[x] = Math.max(4, Math.min(10, Math.round(6 + 2.2 * Math.sin(x * 0.4 + phase) + r() * 1.5)));
    d[0] = d[U - 1] = 6;
  } else { // stone: loose stones, four units each
    const blocks = [];
    for (let b = 0; b < 8; b++) blocks.push(4 + Math.floor(r() * 4));
    blocks[0] = blocks[7] = 5;
    for (let x = 0; x < U; x++) d[x] = blocks[x >> 2];
  }
  return d;
}

// Keeps the source texture above the depth profile; the last opaque row gets a darker rim.
function maskStrip(tmp, depth, rim, dither) {
  const c = tmp.getContext('2d');
  const im = c.getImageData(0, 0, U, U);
  const a = im.data;
  for (let x = 0; x < U; x++) {
    const d = depth[x];
    for (let y = 0; y < U; y++) {
      const i = (y * U + x) * 4;
      if (y < d) continue;
      if (dither && ((y === d && ((x + y) & 1) === 0) || (y === d + 1 && x % 4 === 1) || (dither > 1 && y === d + 2 && x % 8 === 3))) continue;
      a[i + 3] = 0;
    }
    const last = d - 1;
    for (let y = Math.max(0, last); y <= last; y++) {
      const i = (y * U + x) * 4;
      if (a[i + 3] === 0) continue;
      const f = 1 - rim;
      a[i] *= f; a[i + 1] *= f; a[i + 2] *= f;
    }
  }
  c.putImageData(im, 0, 0);
}

// Loose blades / pebbles just past the edge, copied from the source texture, so the border dissolves.
function scatter(c, src, depth, r, count, w, h) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(r() * (U - w));
    const y = depth[x] + 1 + Math.floor(r() * 2);
    if (y + h > U) continue;
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
      const o = ((y + j) * U + x + k) * 4;
      c.fillStyle = `rgb(${src[o]},${src[o + 1]},${src[o + 2]})`;
      c.fillRect(x + k, y + j, 1, 1);
    }
  }
}

function maskCorner(tmp, radius, rim, r) {
  const c = tmp.getContext('2d');
  const im = c.getImageData(0, 0, U, U);
  const a = im.data;
  const rad = new Array(U).fill(0).map(() => radius + (r() - 0.5) * 1.6);
  const inside = (x, y) => x < 12 && y < 12 && Math.hypot(x + 0.5, y + 0.5) < rad[x];
  for (let y = 0; y < U; y++) for (let x = 0; x < U; x++) {
    const i = (y * U + x) * 4;
    if (!inside(x, y)) { a[i + 3] = 0; continue; }
    if (!inside(x + 1, y) || !inside(x, y + 1)) { const f = 1 - rim; a[i] *= f; a[i + 1] *= f; a[i + 2] *= f; }
  }
  c.putImageData(im, 0, 0);
}

// -------------------------------------------------------------------------------------- strips

function surfaceStrip(scene, cls, v) {
  const style = STYLE[cls];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(`${cls}-edge`) + v * 977);
  const source = sourceTile(scene, cls, v);
  c.drawImage(source, 0, 0);
  const srcData = source.getContext('2d').getImageData(0, 0, U, U).data;
  if (style === 'curb') {
    const depth = new Array(U).fill(5);
    maskStrip(tmp, depth, 0.0, false);
    px(c, 'rgba(255,255,255,0.34)', 0, 0, U, 2);   // lit top of the kerb
    px(c, 'rgba(0,0,0,0.38)', 0, 4, U, 1);          // kerb face
    for (let x = 6 + v * 3; x < U; x += 11) px(c, 'rgba(0,0,0,0.16)', x, 0, 1, 4); // joints
    px(c, 'rgba(0,0,0,0.24)', 0, 5, U, 1);          // soft shadow on the lower surface
    px(c, 'rgba(0,0,0,0.15)', 0, 6, U, 1);
    px(c, 'rgba(0,0,0,0.07)', 0, 7, U, 1);
  } else {
    const depth = depthProfile(style, r);
    maskStrip(tmp, depth, style === 'soft' ? 0 : style === 'stone' ? 0.3 : 0.16, style === 'stone' ? 0 : 2);
    if (style === 'tuft') scatter(c, srcData, depth, r, 6, 1, 2);
    else if (style === 'stone') scatter(c, srcData, depth, r, 4, 3, 2);
    else scatter(c, srcData, depth, r, 8, 1, 1);
  }
  return tmp;
}

function surfaceCorner(scene, cls, v) {
  const style = STYLE[cls];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  c.drawImage(sourceTile(scene, cls, v), 0, 0);
  maskCorner(tmp, style === 'curb' ? 5 : style === 'tuft' ? 6.5 : 6, style === 'soft' ? 0 : 0.25, rng(hash(`${cls}-corner`) + v * 31));
  if (style === 'curb') px(c, 'rgba(255,255,255,0.3)', 0, 0, 4, 1);
  return tmp;
}

// Shallow water on the water tile along a shore: foam line, then fading light water.
function shoreStrip(v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(404 + v * 59);
  const alphas = [0.9, 0.78, 0.62, 0.48, 0.36, 0.24, 0.12];
  alphas.forEach((a, y) => px(c, `rgba(150,205,242,${a})`, 0, y, U, 1));
  for (let x = 0; x < U; x++) {
    if (r() < 0.78) px(c, '#f2faff', x, 0);
    if (r() < 0.42) px(c, '#d4ecfb', x, 1);
    if (r() < 0.16) px(c, '#e8f5ff', x, 3);
  }
  return tmp;
}

function shoreCorner() {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const d = Math.hypot(x + 0.5, y + 0.5);
    if (d >= 7) continue;
    px(c, d < 2 ? '#f2faff' : `rgba(150,205,242,${(0.85 * (7 - d)) / 7})`, x, y);
  }
  return tmp;
}

// Bank on the land tile where it meets water: wet mud for soft ground, a stone coping for hard ground.
function bankStrip(kind, v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(808 + v * 71 + (kind === 'stone' ? 5 : 0));
  if (kind === 'stone') {
    px(c, '#43474f', 0, 0, U, 1);
    px(c, '#868a93', 0, 1, U, 1);
    px(c, '#a4a8b0', 0, 2, U, 1);
    px(c, 'rgba(0,0,0,0.2)', 0, 3, U, 1);
    for (let x = 5 + v * 4; x < U; x += 9) px(c, '#5b5f68', x, 1, 1, 2);
  } else {
    const d = depthProfile('soft', r).map(n => Math.max(3, Math.min(5, n - 1)));
    d[0] = d[U - 1] = 3;
    for (let x = 0; x < U; x++) {
      for (let y = 0; y < d[x]; y++) {
        const col = y === 0 ? '#3d3226' : y === 1 ? '#5a4731' : r() < 0.3 ? '#8a7048' : '#6e5a3b';
        px(c, col, x, y);
      }
    }
  }
  return tmp;
}

function bankCorner(kind) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const d = Math.hypot(x + 0.5, y + 0.5);
    if (d >= 4.3) continue;
    px(c, kind === 'stone' ? (d < 2 ? '#43474f' : d < 3.2 ? '#868a93' : '#a4a8b0') : (d < 2 ? '#3d3226' : '#6e5a3b'), x, y);
  }
  return tmp;
}

// Convex water corner (land on both sides): the corner is filled with the neighbouring land's texture,
// cut by a quarter circle, with a bank rim and a thin foam ring.
function roundCorner(scene, cls, kind) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  c.drawImage(sourceTile(scene, cls, 0), 0, 0);
  const im = c.getImageData(0, 0, U, U);
  const a = im.data;
  const R = 10;
  const rim = kind === 'stone' ? [0x43, 0x47, 0x4f] : [0x3d, 0x32, 0x26];
  const mid = kind === 'stone' ? [0x86, 0x8a, 0x93] : [0x6e, 0x5a, 0x3b];
  for (let y = 0; y < U; y++) for (let x = 0; x < U; x++) {
    const i = (y * U + x) * 4;
    const d = Math.hypot(x + 0.5, y + 0.5);
    if (d > R + 2) { a[i + 3] = 0; continue; }
    if (d > R) { a[i] = 0xf2; a[i + 1] = 0xfa; a[i + 2] = 0xff; a[i + 3] = 150; continue; } // foam ring
    if (d > R - 1.5) { a[i] = rim[0]; a[i + 1] = rim[1]; a[i + 2] = rim[2]; }
    else if (d > R - 3) { a[i] = mid[0]; a[i + 1] = mid[1]; a[i + 2] = mid[2]; }
  }
  c.putImageData(im, 0, 0);
  return tmp;
}

function deepWater() {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  px(c, 'rgba(10,36,84,0.2)', 0, 0, U, U);
  const r = rng(515);
  for (let i = 0; i < 6; i++) px(c, 'rgba(10,36,84,0.18)', Math.floor(r() * 24), 3 + Math.floor(r() * 26), 6 + Math.floor(r() * 6), 1);
  return tmp;
}

// -------------------------------------------------------------------------------------- fences and hedges

function postH(c, x) {
  px(c, 'rgba(0,0,0,0.22)', x, 19, 5, 4);
  px(c, '#3e4248', x, 5, 4, 19);
  px(c, '#6a6e76', x, 5, 3, 18);
  px(c, '#9aa0a8', x, 5, 1, 18);
  px(c, '#c4c8d0', x, 4, 3, 2);
}

function fenceH() {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  px(c, 'rgba(0,0,0,0.25)', 0, 18, U, 3);
  px(c, '#6a6e76', 0, 16, U, 2);
  px(c, '#c4c8d0', 0, 12, U, 4);
  px(c, '#e6e9ee', 0, 12, U, 1);
  px(c, '#8a8e96', 0, 15, U, 1);
  for (let x = 2; x < U; x += 8) postH(c, x);
  return tmp;
}

function fenceV(c) {
  px(c, 'rgba(0,0,0,0.25)', 17, 0, 4, U);
  px(c, '#8a8e96', 13, 0, 1, U);
  px(c, '#c4c8d0', 14, 0, 2, U);
  px(c, '#6a6e76', 16, 0, 1, U);
  for (let y = 2; y < U; y += 8) {
    px(c, 'rgba(0,0,0,0.25)', 12, y + 4, 9, 3);
    px(c, '#3e4248', 11, y - 1, 7, 6);
    px(c, '#6a6e76', 12, y, 5, 4);
    px(c, '#c4c8d0', 12, y - 1, 5, 2);
  }
}

function fenceTile(kind) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  if (kind === 'h' || kind === 'x') c.drawImage(fenceH(), 0, 0);
  if (kind === 'v' || kind === 'x') fenceV(c);
  return tmp;
}

function hedgeTile(base, v, top, bottom) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash('hedge') + v * 977);
  px(c, shade(base, -0.25), 0, 0, U, U);
  const light = shade(base, 0.3);
  for (let i = 0; i < 28; i++) {
    const cx = Math.floor(r() * U);
    const cy = Math.floor(r() * U);
    const rad = 2 + Math.floor(r() * 3);
    for (const dx of [0, cx < rad ? U : cx > U - rad ? -U : 0]) {
      for (const dy of [0, cy < rad ? U : cy > U - rad ? -U : 0]) { // wraps both ways so stacked tiles join up
        ell(c, shade(base, -0.1), cx + dx, cy + dy + 1, rad + 0.5, rad);
        ell(c, base, cx + dx, cy + dy, rad, rad);
        ell(c, shade(base, 0.15), cx + dx - 1, cy + dy - 1, rad * 0.55, rad * 0.5);
        if (rad > 2) px(c, light, cx + dx - 1, cy + dy - 1, 1, 1);
      }
    }
  }
  if (top) { px(c, shade(base, -0.5), 0, 0, U, 3); px(c, shade(base, -0.35), 0, 3, U, 1); }
  if (bottom) { px(c, shade(base, -0.45), 0, U - 3, U, 3); }
  return tmp;
}

// Soft shadow on the tile south of a hedge or fence.
function castShadow(kind) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const rows = kind === 'hedge' ? [0.3, 0.2, 0.12, 0.06] : [0.2, 0.1, 0.04];
  rows.forEach((a, y) => px(c, `rgba(0,0,0,${a})`, 0, y, U, 1));
  return tmp;
}

// Rain puddles (dynamic, see physics/Weather.js): a transparent overlay so the surface underneath shows through.
// Irregular blob (a lumpy ellipse), a darker wet halo, a sky reflection that brightens towards the top, a thin
// shaded rim, a glint and a couple of ripple rings. Four shapes per surface so no two puddles in a row match.
const PUDDLE_TINT = {
  asphalt: { top: '#9fc0e0', bottom: '#4d729b', halo: [8, 12, 24, 0.34], rim: '#2c4663' },
  lane: { top: '#b4c6de', bottom: '#6a85ad', halo: [40, 14, 18, 0.3], rim: '#3d3a52' },
  concrete: { top: '#b5d2ea', bottom: '#6f93b6', halo: [40, 50, 62, 0.3], rim: '#41607c' },
  path: { top: '#b9cbd6', bottom: '#7d98a8', halo: [70, 52, 24, 0.38], rim: '#5a5a52' }
};
export const PUDDLE_SURFACES = Object.keys(PUDDLE_TINT);
const PUDDLE_VARIANTS = 4;

function puddleTexture(surface, v) {
  const tint = PUDDLE_TINT[surface];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(`puddle-${surface}`) + v * 131);
  const im = c.createImageData(U, U);
  const a = im.data;
  const cx = 15 + (r() - 0.5) * 5;
  const cy = 16 + (r() - 0.5) * 5;
  const rx = 10 + r() * 5;
  const ry = 6 + r() * 4;
  const tilt = (r() - 0.5) * 0.7;
  const p1 = r() * 6;
  const p2 = r() * 6;
  const lump = 0.16 + r() * 0.1;
  const top = rgbOf(tint.top);
  const bottom = rgbOf(tint.bottom);
  const rim = rgbOf(tint.rim);
  const set = (x, y, col, alpha) => {
    const o = (y * U + x) * 4;
    a[o] = col[0]; a[o + 1] = col[1]; a[o + 2] = col[2]; a[o + 3] = Math.round(alpha * 255);
  };
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const dist = (x, y) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const ex = (dx * ct + dy * st) / rx;
    const ey = (-dx * st + dy * ct) / ry;
    const th = Math.atan2(ey, ex);
    return Math.hypot(ex, ey) / (1 + lump * Math.sin(2 * th + p1) + lump * 0.7 * Math.sin(3 * th + p2));
  };
  for (let y = 0; y < U; y++) for (let x = 0; x < U; x++) {
    const d = dist(x, y);
    if (d < 1) {
      const t = Math.min(1, Math.max(0, (y - (cy - ry)) / (2 * ry))); // sky at the far (top) edge, darker below
      const col = top.map((tv, i) => tv + (bottom[i] - tv) * t);
      let alpha = 0.86;
      if (d > 0.84) { set(x, y, rim, 0.9); continue; }       // rim
      if (d > 0.74) alpha = 0.95;
      set(x, y, col, alpha);
    } else if (d < 1.28) {
      const edge = (d - 1) / 0.28; // soft wet halo with a dithered fall-off
      if (edge < 0.45 || (edge < 0.8 && (x + y) % 2 === 0) || (edge < 1 && (x * 3 + y) % 5 === 0)) set(x, y, tint.halo, tint.halo[3] * (1 - edge * 0.6));
    }
  }
  c.putImageData(im, 0, 0);
  // glint and ripple rings
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fillRect(Math.round(cx - rx * 0.45), Math.round(cy - ry * 0.4), 4, 1);
  c.fillRect(Math.round(cx - rx * 0.45) + 1, Math.round(cy - ry * 0.4) + 1, 2, 1);
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    const rxp = cx + (r() - 0.5) * rx * 0.8;
    const ryp = cy + (r() - 0.5) * ry * 0.7;
    c.beginPath();
    c.ellipse(rxp, ryp, 2.5 + i * 1.5, 1.2 + i * 0.7, 0, 0, Math.PI * 2);
    c.stroke();
  }
  return tmp;
}

// Texture key for a rain puddle on `surface` at tile (tx, ty), or null when the surface cannot hold one.
export function puddleKey(surface, tx, ty) {
  if (!PUDDLE_TINT[surface]) return null;
  let h = Math.imul(tx, 83492791) ^ Math.imul(ty, 2971215073); // mixed, so the shape does not repeat with the coordinates
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return `env-puddle-${surface}-${(h >>> 0) % PUDDLE_VARIANTS}`;
}

// -------------------------------------------------------------------------------------- interiors (AD-30)
// Indoor maps used the outdoor brick walls, concrete and plain planks. Here they get plaster walls with a cap and a
// skirting board (windows, pictures, lockers, a blackboard, paper screens), a tiled hall floor, soft shading where
// floor meets wall, light patches under windows, rugs, door mats and a bright doorway for exits. All derived from
// the grid and the door objects; the theme comes from the map id.
const THEMES = {
  home: { wall: '#ead9bd', cap: '#4a3b3f', base: '#6e4a33', trim: '#fff4dc', accent: '#c05a45', hall: ['#d8cdb8', '#c4b8a0'] },
  school: { wall: '#dfe9e0', cap: '#3f4a52', base: '#58707a', trim: '#ffffff', accent: '#4f9b7a', hall: ['#cdd6d1', '#b7c2bd'] },
  dojo: { wall: '#d9c79c', cap: '#3a2a1e', base: '#4a3322', trim: '#f5ecd2', accent: '#a43a2e', hall: ['#b79a6a', '#a88a5c'] },
  default: { wall: '#d7d9de', cap: '#3d4350', base: '#5c6272', trim: '#ffffff', accent: '#4f7fb5', hall: ['#c9ccd2', '#b4b8c0'] }
};
const THEME_IDS = Object.keys(THEMES);
const FACES = ['plain', 'window', 'picture', 'clock', 'locker', 'notice', 'board-l', 'board-m', 'board-r', 'shoji', 'scroll'];
const RUGS = {
  home: [{ x: 3, y: 2, w: 6, h: 5, style: 'home' }, { x: 10, y: 10, w: 4, h: 6, style: 'runner' }]
};
const RUG_STYLES = { home: { body: '#b5513c', band: '#f0dfb8', dark: '#7d2f27' }, runner: { body: '#3f6f8f', band: '#e8dcc0', dark: '#27465e' } };

const themeOf = mapId => THEMES[mapId] ?? THEMES.default;
const themeName = mapId => (THEMES[mapId] ? mapId : 'default');

function faceVariant(mapId, tx, southId) {
  const hall = southId === 'concrete';
  if (mapId === 'home') return hall ? (tx % 6 === 1 ? 'picture' : tx % 9 === 5 ? 'clock' : 'plain') : (tx % 5 === 2 ? 'window' : tx % 7 === 4 ? 'picture' : 'plain');
  if (mapId === 'school') {
    if (hall) return tx % 6 < 3 ? 'locker' : tx % 6 === 4 ? 'notice' : tx % 6 === 5 ? 'window' : 'plain';
    if (tx >= 13 && tx <= 18) return tx === 13 ? 'board-l' : tx === 18 ? 'board-r' : 'board-m';
    return tx % 3 === 1 ? 'window' : tx === 3 || tx === 28 ? 'clock' : 'plain';
  }
  if (mapId === 'dojo') return tx % 4 === 1 ? 'shoji' : tx % 8 === 5 ? 'scroll' : 'plain';
  return 'plain';
}

function plasterFace(c, th, seed) {
  const r = rng(seed);
  px(c, th.cap, 0, 0, U, 6);
  px(c, shade(th.cap, 0.28), 0, 0, U, 1);
  px(c, shade(th.cap, -0.3), 0, 5, U, 1);
  px(c, th.wall, 0, 6, U, 21);
  for (let i = 0; i < 26; i++) px(c, shade(th.wall, r() < 0.5 ? -0.05 : 0.05), Math.floor(r() * U), 7 + Math.floor(r() * 19), 2, 1);
  px(c, 'rgba(0,0,0,0.16)', 0, 6, U, 2);
  px(c, 'rgba(0,0,0,0.07)', 0, 8, U, 2);
  px(c, th.base, 0, 27, U, 5);
  px(c, shade(th.base, 0.3), 0, 27, U, 1);
  px(c, shade(th.base, -0.35), 0, 31, U, 1);
}

function faceTile(theme, variant) {
  const th = THEMES[theme];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const wood = theme === 'dojo';
  if (wood && variant !== 'shoji') { // vertical timber boards
    plasterFace(c, th, hash(theme + variant));
    for (let x = 0; x < U; x += 8) { px(c, shade(th.wall, -0.18), x, 6, 1, 21); px(c, shade(th.wall, 0.12), x + 1, 6, 1, 21); }
    px(c, th.cap, 0, 6, U, 1);
  } else plasterFace(c, th, hash(theme + variant));
  const frame = '#f4efe2';
  if (variant === 'window') {
    px(c, shade(th.base, -0.1), 5, 8, 22, 17);
    px(c, frame, 6, 9, 20, 15);
    const sky = c.createLinearGradient(0, 10, 0, 23);
    sky.addColorStop(0, '#8fc7ee'); sky.addColorStop(1, '#dff2ff');
    c.fillStyle = sky; c.fillRect(8, 11, 16, 11);
    px(c, frame, 15, 10, 2, 13); px(c, frame, 7, 16, 18, 1);
    px(c, 'rgba(255,255,255,0.5)', 9, 12, 3, 1);
    px(c, shade(th.base, 0.2), 4, 24, 24, 2); // sill
    if (theme === 'home') { px(c, '#c05a45', 5, 8, 4, 16); px(c, '#c05a45', 23, 8, 4, 16); px(c, '#8a3a2e', 5, 8, 1, 16); px(c, '#8a3a2e', 26, 8, 1, 16); }
  } else if (variant === 'picture') {
    px(c, '#3c2a1c', 9, 9, 14, 11); px(c, '#f2ead6', 10, 10, 12, 9);
    px(c, '#8fc7ee', 11, 11, 10, 4); px(c, '#6cae5e', 11, 15, 10, 3); px(c, '#ffd84d', 17, 12, 2, 2);
  } else if (variant === 'clock') {
    ell(c, '#2a2a2e', 16, 15, 7, 7); ell(c, '#f4f1e6', 16, 15, 6, 6);
    px(c, '#222', 16, 10, 1, 5); px(c, '#222', 16, 15, 4, 1); px(c, '#c0392b', 16, 15, 1, 1);
  } else if (variant === 'locker') {
    const col = '#4f7fb5';
    for (const x of [1, 17]) {
      px(c, '#2c4a6b', x, 7, 14, 20); px(c, col, x + 1, 8, 12, 18); px(c, shade(col, 0.25), x + 1, 8, 12, 1);
      for (let y = 10; y < 15; y += 2) px(c, '#2c4a6b', x + 3, y, 6, 1);
      px(c, '#d8dde3', x + 10, 18, 2, 3); px(c, '#2c4a6b', x + 1, 16, 12, 1);
    }
  } else if (variant === 'notice') {
    px(c, '#6e4a33', 5, 8, 22, 16); px(c, '#c9955a', 6, 9, 20, 14);
    px(c, '#fff3b0', 8, 11, 6, 5); px(c, '#f4a6b8', 16, 10, 7, 6); px(c, '#b9e3f5', 11, 17, 8, 4); px(c, '#d33', 11, 11, 1, 1); px(c, '#d33', 19, 11, 1, 1);
  } else if (variant.startsWith('board')) {
    const l = variant === 'board-l';
    const rr = variant === 'board-r';
    px(c, '#5a3d2b', l ? 3 : 0, 8, U - (l ? 3 : 0) - (rr ? 3 : 0), 16);
    px(c, '#27493f', l ? 4 : 0, 9, U - (l ? 4 : 0) - (rr ? 4 : 0), 13);
    px(c, '#34594d', l ? 4 : 0, 9, U - (l ? 4 : 0) - (rr ? 4 : 0), 1);
    px(c, '#8a6b4a', l ? 3 : 0, 22, U - (l ? 3 : 0) - (rr ? 3 : 0), 2); // chalk tray
    if (variant === 'board-m') { for (const [x, y, w] of [[3, 12, 12], [6, 15, 18], [12, 18, 10]]) px(c, 'rgba(240,240,230,0.7)', x, y, w, 1); px(c, '#f4f1e6', 24, 22, 3, 1); }
    if (l) px(c, 'rgba(240,240,230,0.7)', 8, 13, 10, 1);
  } else if (variant === 'shoji') {
    px(c, '#3a2a1e', 3, 7, 26, 20); px(c, '#f6f0dc', 4, 8, 24, 18);
    for (const x of [10, 16, 22]) px(c, '#3a2a1e', x, 8, 1, 18);
    for (const y of [14, 20]) px(c, '#3a2a1e', 4, y, 24, 1);
    px(c, 'rgba(255,255,255,0.5)', 5, 9, 4, 1);
  } else if (variant === 'scroll') {
    px(c, '#3a2a1e', 11, 8, 10, 1); px(c, '#3a2a1e', 11, 24, 10, 2);
    px(c, '#efe4c4', 12, 9, 8, 15);
    for (const [y, w] of [[11, 4], [14, 5], [17, 3], [20, 4]]) px(c, '#2a1d14', 14, y, w, 2);
    px(c, th.accent, 17, 21, 2, 2);
  }
  return tmp;
}

function capTile(theme) {
  const th = THEMES[theme];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(theme + 'cap'));
  px(c, th.cap, 0, 0, U, U);
  for (let i = 0; i < 30; i++) px(c, shade(th.cap, r() < 0.5 ? -0.1 : 0.1), Math.floor(r() * U), Math.floor(r() * U), 2, 1);
  px(c, shade(th.cap, 0.22), 0, 0, U, 1);
  px(c, shade(th.cap, -0.3), 0, U - 2, U, 2);
  return tmp;
}

function hallFloor(theme, parity) {
  const th = THEMES[theme];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(theme + 'hall') + parity);
  for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
    const col = th.hall[(sx + sy + parity) & 1];
    px(c, col, sx * 16, sy * 16, 16, 16);
    for (let i = 0; i < 14; i++) px(c, shade(col, r() < 0.5 ? -0.05 : 0.06), sx * 16 + Math.floor(r() * 15), sy * 16 + Math.floor(r() * 15), 2, 1);
    px(c, shade(col, 0.16), sx * 16, sy * 16, 16, 1);
    px(c, shade(col, 0.1), sx * 16, sy * 16, 1, 16);
    px(c, shade(col, -0.2), sx * 16, sy * 16 + 15, 16, 1);
    px(c, shade(col, -0.14), sx * 16 + 15, sy * 16, 1, 16);
  }
  return tmp;
}

function floorShade(side) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const rows = side === 'n' ? [0.38, 0.3, 0.22, 0.15, 0.09, 0.05] : [0.24, 0.14, 0.07];
  rows.forEach((a, y) => px(c, `rgba(20,12,10,${a})`, 0, y, U, 1));
  return tmp; // drawn for the north side and rotated for the others
}

function lightPatch() {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  c.fillStyle = 'rgba(255,240,180,0.2)';
  c.beginPath(); c.moveTo(6, 0); c.lineTo(26, 0); c.lineTo(31, 16); c.lineTo(11, 16); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,240,180,0.12)';
  c.beginPath(); c.moveTo(11, 16); c.lineTo(31, 16); c.lineTo(31, 22); c.lineTo(16, 22); c.closePath(); c.fill();
  return tmp;
}

// Exit doorway seen from inside: dark jambs at both ends, a bright opening between, threshold stone below.
function doorWall(theme, part) {
  const th = THEMES[theme];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  px(c, th.cap, 0, 0, U, U);
  const left = part === 'l';
  const right = part === 'r';
  const x0 = left ? 8 : 0;
  const x1 = right ? U - 8 : U;
  const g = c.createLinearGradient(0, 0, 0, U);
  g.addColorStop(0, '#fff4c0'); g.addColorStop(1, '#fbd980');
  c.fillStyle = g; c.fillRect(x0, 3, x1 - x0, U - 3);
  px(c, 'rgba(255,255,255,0.45)', x0, 3, x1 - x0, 2);
  px(c, '#2a2118', x0, 0, x1 - x0, 3);
  if (left) { px(c, '#6e4a33', 5, 0, 4, U); px(c, '#9a7048', 5, 0, 1, U); }
  if (right) { px(c, '#6e4a33', U - 9, 0, 4, U); px(c, '#9a7048', U - 9, 0, 1, U); }
  px(c, '#8f8678', x0, U - 5, x1 - x0, 5); px(c, '#b3ab9d', x0, U - 5, x1 - x0, 1);
  return tmp;
}

function doorMat(part) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const x0 = part === 'l' ? 4 : 0;
  const x1 = part === 'r' ? U - 4 : U;
  px(c, 'rgba(0,0,0,0.25)', x0, 9, x1 - x0, 18);
  px(c, '#6b4a2e', x0, 8, x1 - x0, 17);
  px(c, '#8a6540', x0, 8, x1 - x0, 1);
  for (let y = 11; y < 23; y += 3) px(c, '#563a22', x0 + 1, y, x1 - x0 - 2, 1);
  return tmp;
}

// A rug part: 'm' inner, edges n/e/s/w (drawn for n, rotated), corners nw/ne/se/sw (drawn for nw, rotated).
function rugPart(style, part) {
  const st = RUG_STYLES[style];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const edge = part === 'n';
  const corner = part === 'nw';
  const x0 = corner ? 4 : 0;
  const y0 = edge || corner ? 4 : 0;
  px(c, st.body, x0, y0, U - x0, U - y0);
  const r = rng(hash(style + part));
  for (let i = 0; i < 22; i++) px(c, shade(st.body, r() < 0.5 ? -0.08 : 0.08), x0 + Math.floor(r() * (U - x0)), y0 + Math.floor(r() * (U - y0)), 2, 1);
  if (part === 'm') { // faint diamond motif
    for (let i = 0; i < 6; i++) { px(c, shade(st.body, 0.14), 16 - i, 10 + i, 1 + i * 2, 1); px(c, shade(st.body, 0.14), 16 - i, 22 - i, 1 + i * 2, 1); }
  }
  if (edge || corner) {
    px(c, st.dark, x0, y0, U - x0, 1);                       // outer line
    px(c, st.band, x0, y0 + 2, U - x0, 2);                   // band
    px(c, st.dark, x0, y0 + 4, U - x0, 1);
    for (let x = x0 + 1; x < U; x += 2) px(c, st.band, x, y0 - 2, 1, 2); // fringe
  }
  if (corner) {
    px(c, st.dark, x0, y0, 1, U - y0);
    px(c, st.band, x0 + 2, y0, 2, U - y0);
    px(c, st.dark, x0 + 4, y0, 1, U - y0);
    for (let y = y0 + 1; y < U; y += 2) px(c, st.band, x0 - 2, y, 2, 1);
  }
  return tmp;
}

function makeInteriorArt(scene, size) {
  for (const theme of THEME_IDS) {
    for (const v of FACES) emit(scene, `env-iface-${theme}-${v}`, faceTile(theme, v), size);
    emit(scene, `env-icap-${theme}`, capTile(theme), size);
    for (let p = 0; p < 2; p++) emit(scene, `env-ihall-${theme}-${p}`, hallFloor(theme, p), size);
    for (const part of ['l', 'm', 'r']) emit(scene, `env-idoor-${theme}-${part}`, doorWall(theme, part), size);
  }
  const shadeN = floorShade('n');
  const shadeSide = floorShade('s');
  SIDES.forEach((s, rot) => emit(scene, `env-ishade-${s}`, s === 'n' ? shadeN : shadeSide, size, rot));
  emit(scene, 'env-ilight', lightPatch(), size);
  for (const part of ['l', 'm', 'r']) emit(scene, `env-imat-${part}`, doorMat(part), size);
  for (const style of Object.keys(RUG_STYLES)) {
    emit(scene, `env-rug-${style}-m`, rugPart(style, 'm'), size);
    const e = rugPart(style, 'n');
    SIDES.forEach((s, rot) => emit(scene, `env-rug-${style}-${s}`, e, size, rot));
    const k = rugPart(style, 'nw');
    CORNERS.forEach((s, rot) => emit(scene, `env-rug-${style}-${s}`, k, size, rot));
  }
}

const INDOOR = new WeakMap(); // map -> { doorWalls, doorFloors } derived once from the door objects

function indoorInfo(map) {
  let info = INDOOR.get(map);
  if (info) return info;
  info = { doorWalls: new Map(), doorFloors: new Map() };
  for (const o of map.objects ?? []) {
    if (o.type !== 'door') continue;
    for (let i = 0; i < o.w; i++) {
      const part = o.w === 1 ? 'm' : i === 0 ? 'l' : i === o.w - 1 ? 'r' : 'm';
      info.doorWalls.set(`${o.x + i},${o.y + o.h}`, part);
      for (let j = 0; j < o.h; j++) info.doorFloors.set(`${o.x + i},${o.y + j}`, part);
    }
  }
  INDOOR.set(map, info);
  return info;
}

function indoorKeys(map, tx, ty, baseKey, mapId) {
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const idAt = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? null : map.legend[map.rows[y][x]]);
  const theme = themeName(mapId);
  const id = idAt(tx, ty);
  const info = indoorInfo(map);
  if (id === 'wall') {
    const door = info.doorWalls.get(`${tx},${ty}`);
    if (door) return [`env-idoor-${theme}-${door}`];
    const south = idAt(tx, ty + 1);
    if (south && south !== 'wall') return [`env-iface-${theme}-${faceVariant(mapId, tx, south)}`];
    return [`env-icap-${theme}`];
  }
  const keys = [id === 'concrete' ? `env-ihall-${theme}-${(tx + ty) & 1}` : baseKey];
  const wallAt = (x, y) => idAt(x, y) === 'wall';
  if (wallAt(tx, ty - 1)) keys.push('env-ishade-n');
  if (wallAt(tx + 1, ty)) keys.push('env-ishade-e');
  if (wallAt(tx - 1, ty)) keys.push('env-ishade-w');
  if (wallAt(tx, ty + 1)) keys.push('env-ishade-s');
  const above = idAt(tx, ty - 1);
  if (above === 'wall' && ['window', 'shoji'].includes(faceVariant(mapId, tx, id))) keys.push('env-ilight');
  for (const rug of RUGS[mapId] ?? []) {
    const ix = tx - rug.x;
    const iy = ty - rug.y;
    if (ix < 0 || iy < 0 || ix >= rug.w || iy >= rug.h) continue;
    const n = iy === 0;
    const s = iy === rug.h - 1;
    const w = ix === 0;
    const e = ix === rug.w - 1;
    const part = n && w ? 'nw' : n && e ? 'ne' : s && e ? 'se' : s && w ? 'sw' : n ? 'n' : s ? 's' : w ? 'w' : e ? 'e' : 'm';
    keys.push(`env-rug-${rug.style}-${part}`);
  }
  const mat = info.doorFloors.get(`${tx},${ty}`);
  if (mat) keys.push(`env-imat-${mat}`);
  return keys;
}

// -------------------------------------------------------------------------------------- buildings outdoors (AD-30, 15.2)
// Walls used to be one brick roof and one brick facade for the whole town. Each building (a connected block of wall
// tiles, found once per map) now gets its own palette: roof colour, plaster or brick, shutters or flower boxes at the
// windows, a chimney here and there, and doors with a frame, awning or canopy, a leaf in the style of where it leads,
// a stone step and a mat. Derived from the grid and the door objects only; collision is untouched.
const PALS = [
  { id: 'brick', roof: '#b2553a', wall: '#a2553c', brick: true, mortar: '#c99a86', trim: '#f0e8da', shutter: '#2f5f4a', base: '#3e2018' },
  { id: 'slate', roof: '#55657e', wall: '#dccaa0', brick: false, mortar: '#c9b78c', trim: '#ffffff', shutter: '#3f6aa0', base: '#6b5a44' },
  { id: 'honey', roof: '#7c4b2d', wall: '#e3c27c', brick: false, mortar: '#cfa95f', trim: '#fff6df', shutter: '#9a3d2e', base: '#6a4a2a' },
  { id: 'sage', roof: '#3f6f5a', wall: '#c3d1be', brick: false, mortar: '#a9bba5', trim: '#ffffff', shutter: '#8a4a3a', base: '#4e5a48' }
];
const OUT_FACES = ['plain', 'window', 'shutter', 'flowers'];
const DOOR_KINDS = ['home', 'school', 'dojo', 'plain'];
const DOOR_PARTS = ['c', 'l', 'r', 'sl', 'sr'];

function roofTexture(pal, top, chimney) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(pal.id + 'roof') + (top ? 7 : 0));
  px(c, pal.roof, 0, 0, U, U);
  for (let row = 0; row < 8; row++) {
    const y = row * 4;
    const off = row % 2 ? 4 : 0;
    px(c, shade(pal.roof, -0.3), 0, y + 3, U, 1);
    for (let k = -1; k < 4; k++) {
      const x = off + k * 8;
      px(c, shade(pal.roof, -0.3), x, y, 1, 3);
      const col = shade(pal.roof, (r() - 0.45) * 0.3);
      px(c, col, x + 1, y, 7, 3);
      px(c, shade(col, 0.2), x + 1, y, 7, 1);
    }
  }
  if (top) { px(c, shade(pal.roof, 0.38), 0, 0, U, 2); px(c, shade(pal.roof, -0.45), 0, 2, U, 1); }
  if (chimney) {
    px(c, 'rgba(0,0,0,0.28)', 12, 15, 11, 13);
    px(c, '#6e3d2d', 11, 8, 9, 15); px(c, '#8b4f3a', 11, 8, 3, 15);
    for (let y = 10; y < 22; y += 4) px(c, '#4a2a20', 11, y, 9, 1);
    px(c, '#3a3f48', 9, 5, 13, 4); px(c, '#59606b', 9, 5, 13, 1);
  }
  return tmp;
}

function wallBase(c, pal, seed) {
  const r = rng(seed);
  if (pal.brick) {
    px(c, pal.mortar, 0, 0, U, U);
    for (let row = 0; row < 7; row++) {
      const y = row * 4;
      const off = row % 2 ? 4 : 0;
      for (let k = -1; k < 4; k++) {
        const col = shade(pal.wall, (r() - 0.45) * 0.28);
        px(c, col, off + k * 8 + 1, y + 1, 7, 3);
        px(c, shade(col, -0.18), off + k * 8 + 1, y + 3, 7, 1);
      }
    }
  } else {
    px(c, pal.wall, 0, 0, U, U);
    for (let i = 0; i < 40; i++) px(c, shade(pal.wall, r() < 0.5 ? -0.06 : 0.05), Math.floor(r() * U), Math.floor(r() * 27), 2, 1);
    px(c, shade(pal.wall, -0.12), 0, 14, U, 1); // moulding
    px(c, shade(pal.wall, 0.15), 0, 15, U, 1);
  }
  px(c, pal.base, 0, 28, U, 4);                      // plinth
  px(c, shade(pal.base, 0.25), 0, 28, U, 1);
  px(c, 'rgba(0,0,0,0.3)', 0, 0, U, 1);              // eave shadow
  px(c, 'rgba(0,0,0,0.14)', 0, 1, U, 2);
}

function facadeTexture(pal, variant) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  wallBase(c, pal, hash(pal.id + 'wall'));
  if (variant === 'plain') return tmp;
  if (variant === 'shutter') { for (const x of [3, 23]) { px(c, pal.shutter, x, 5, 6, 18); px(c, shade(pal.shutter, 0.2), x, 5, 1, 18); for (let y = 7; y < 22; y += 3) px(c, shade(pal.shutter, -0.3), x + 1, y, 4, 1); } }
  px(c, '#2a1a14', 8, 4, 16, 18);
  px(c, pal.trim, 8, 4, 16, 17);
  const sky = c.createLinearGradient(0, 6, 0, 19);
  sky.addColorStop(0, '#5f86ad'); sky.addColorStop(1, '#2d3f55');
  c.fillStyle = sky; c.fillRect(10, 6, 12, 13);
  px(c, '#8fb4d6', 11, 7, 4, 3); px(c, '#cfe3f4', 11, 7, 2, 1);
  px(c, pal.trim, 15, 6, 2, 13); px(c, pal.trim, 10, 12, 12, 1);
  px(c, '#b8b0a2', 7, 21, 18, 2); px(c, '#8a8274', 7, 23, 18, 1);
  if (variant === 'flowers') {
    px(c, '#6e4a33', 8, 22, 16, 4); px(c, '#8b6244', 8, 22, 16, 1);
    for (let x = 9; x < 24; x += 3) { px(c, '#3f8a3c', x, 20, 1, 3); px(c, x % 2 ? '#ff6f91' : '#ffd84d', x - 1, 19, 3, 2); }
  }
  return tmp;
}

function doorTexture(pal, kind, part) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  wallBase(c, pal, hash(pal.id + 'wall'));
  px(c, pal.base, 0, 28, U, 4);
  const side = part === 'sl' || part === 'sr';
  if (side) { // a narrow side window beside the door
    px(c, '#2a1a14', 7, 6, 18, 22); px(c, pal.trim, 8, 7, 16, 20);
    px(c, kind === 'school' ? '#9fcfe8' : '#3a5472', 10, 9, 12, 16); px(c, 'rgba(255,255,255,0.35)', 11, 10, 3, 1);
    px(c, pal.trim, 15, 9, 2, 16);
  } else {
    const x0 = part === 'c' ? 5 : part === 'l' ? 6 : 0;
    const x1 = part === 'c' ? 27 : part === 'l' ? 32 : 26;
    const w = x1 - x0;
    px(c, '#241810', x0 - 1, 5, w + 2, 27);                          // frame shadow
    if (kind === 'home') {
      px(c, '#3f6f9a', x0, 6, w, 26);
      px(c, '#5b8fba', x0, 6, w, 1);
      px(c, '#2b4d6c', x0 + 3, 11, w - 6, 8); px(c, '#2b4d6c', x0 + 3, 21, w - 6, 8); // panels
      px(c, '#9fcfe8', x0 + 4, 12, w - 8, 6);
      px(c, '#e8c15a', part === 'l' ? x1 - 4 : part === 'r' ? x0 + 2 : x1 - 6, 20, 2, 2);  // handle
    } else if (kind === 'school') {
      px(c, '#2f4a58', x0, 6, w, 26);
      px(c, '#9fcfe8', x0 + 2, 8, w - 4, 20);
      px(c, 'rgba(255,255,255,0.4)', x0 + 3, 9, 4, 1);
      px(c, '#d8dde3', x0 + 2, 19, w - 4, 2);                          // push bar
      if (part !== 'c') px(c, '#2f4a58', part === 'l' ? x1 - 1 : x0, 6, 1, 26);
    } else if (kind === 'dojo') {
      px(c, '#a43a2e', x0, 6, w, 26);
      px(c, '#3a2a1e', x0, 6, w, 1);
      for (let x = x0 + 3; x < x1 - 1; x += 4) px(c, '#7d2a22', x, 7, 1, 25);
      px(c, '#e8c15a', part === 'l' ? x1 - 4 : x0 + 2, 19, 2, 3);
    } else {
      px(c, '#7d838c', x0, 6, w, 26); px(c, '#9aa1ab', x0, 6, w, 1);
      px(c, '#5d636c', x0 + 3, 12, w - 6, 16); px(c, '#d8dde3', x0 + 3, 20, 2, 2);
    }
    px(c, pal.trim, x0 - 1, 4, w + 2, 2);                              // lintel
  }
  // covering over the entrance: striped awning (home), concrete canopy (school), tiled eave (dojo)
  if (kind === 'home') {
    for (let x = 0; x < U; x += 4) px(c, (x / 4) % 2 ? '#f4efe2' : '#c0392b', x, 0, 4, 6);
    px(c, 'rgba(0,0,0,0.3)', 0, 6, U, 2); px(c, 'rgba(0,0,0,0.15)', 0, 8, U, 1);
  } else if (kind === 'school') {
    px(c, '#aab1ba', 0, 0, U, 5); px(c, '#d4d9df', 0, 0, U, 1); px(c, 'rgba(0,0,0,0.3)', 0, 5, U, 3);
  } else if (kind === 'dojo') {
    px(c, '#3a2a1e', 0, 0, U, 4); px(c, '#6d4a31', 0, 0, U, 1); px(c, 'rgba(0,0,0,0.3)', 0, 4, U, 2);
  }
  return tmp;
}

function stepTexture() {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  px(c, '#a7a79f', 0, 0, U, 5); px(c, '#cfcfc6', 0, 0, U, 1); px(c, '#7c7c75', 0, 4, U, 1);
  px(c, 'rgba(0,0,0,0.22)', 0, 5, U, 2); px(c, 'rgba(0,0,0,0.1)', 0, 7, U, 1);
  return tmp;
}

function makeOutdoorArt(scene, size) {
  for (const pal of PALS) {
    emit(scene, `env-roof-${pal.id}-0`, roofTexture(pal, false, false), size);
    emit(scene, `env-roof-${pal.id}-1`, roofTexture(pal, true, false), size);
    emit(scene, `env-roof-${pal.id}-c`, roofTexture(pal, false, true), size);
    for (const v of OUT_FACES) emit(scene, `env-facade-${pal.id}-${v}`, facadeTexture(pal, v), size);
    for (const kind of DOOR_KINDS) for (const part of DOOR_PARTS) emit(scene, `env-odoor-${pal.id}-${kind}-${part}`, doorTexture(pal, kind, part), size);
  }
  emit(scene, 'env-ostep', stepTexture(), size);
}

const OUTDOOR = new WeakMap(); // map -> { pal: Uint8Array per tile (building palette), doors: Map "x,y" -> { kind, part } }

function outdoorInfo(map) {
  let info = OUTDOOR.get(map);
  if (info) return info;
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const wall = (x, y) => map.legend[map.rows[y][x]] === 'wall';
  const border = (x, y) => x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
  const pal = new Uint8Array(rows * cols);
  const seen = new Uint8Array(rows * cols);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (seen[y * cols + x] || !wall(x, y) || border(x, y)) continue;
    const stack = [[x, y]];
    const cells = [];
    seen[y * cols + x] = 1;
    while (stack.length) { // one building: connected wall tiles that are not the map border
      const [cx, cy] = stack.pop();
      cells.push(cy * cols + cx);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[ny * cols + nx] || !wall(nx, ny) || border(nx, ny)) continue;
        seen[ny * cols + nx] = 1;
        stack.push([nx, ny]);
      }
    }
    const first = Math.min(...cells);
    const p = (((first % cols) * 73856093) ^ (Math.floor(first / cols) * 19349663)) >>> 0;
    for (const i of cells) pal[i] = p % PALS.length;
  }
  const doors = new Map();
  for (const o of map.objects ?? []) {
    if (o.type !== 'door') continue;
    const kind = DOOR_KINDS.includes(o.to) ? o.to : o.to === 'test-room' ? 'plain' : 'plain';
    for (let i = 0; i < o.w; i++) {
      const part = o.w === 1 ? 'c' : o.w === 2 ? (i === 0 ? 'l' : 'r') : i === 0 ? 'sl' : i === o.w - 1 ? 'sr' : 'c';
      doors.set(`${o.x + i},${o.y - 1}`, { kind, part });
    }
  }
  info = { pal, doors, cols };
  OUTDOOR.set(map, info);
  return info;
}

// Keys for an outdoor wall tile: roof, facade (with windows) or a door; the map border stays plain brick.
function wallKeys(map, tx, ty, baseKey, idAt) {
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  if (tx === 0 || ty === 0 || tx === cols - 1 || ty === rows - 1) return [baseKey];
  const info = outdoorInfo(map);
  const pal = PALS[info.pal[ty * cols + tx]];
  const door = info.doors.get(`${tx},${ty}`);
  if (door) return [`env-odoor-${pal.id}-${door.kind}-${door.part}`];
  const south = idAt(tx, ty + 1);
  if (south !== 'wall') {
    if (tx % 2 !== 0) return [`env-facade-${pal.id}-plain`];
    const v = (((tx * 2654435761) ^ (ty * 40503)) >>> 0) % 3;
    return [`env-facade-${pal.id}-${['window', 'shutter', 'flowers'][v]}`];
  }
  if (idAt(tx, ty - 1) !== 'wall') return [`env-roof-${pal.id}-1`];
  const chimney = (((tx * 83492791) ^ (ty * 2971215073)) >>> 0) % 31 === 4;
  return [`env-roof-${pal.id}-${chimney ? 'c' : 0}`];
}

// -------------------------------------------------------------------------------------- public API

// Draws every environment texture for the current resolution. `size` is the tile texture size in pixels.
export function makeEnvArt(scene, tileDefs, size) {
  STATE.variants = {};
  for (const id in tileDefs) {
    let n = 1;
    while (scene.textures.exists(`tile-${id}-${n}`)) n++;
    STATE.variants[id] = n;
  }
  for (const cls of Object.keys(STYLE)) {
    for (let v = 0; v < VARIANTS; v++) {
      const strip = surfaceStrip(scene, cls, v);
      const corner = surfaceCorner(scene, cls, v);
      SIDES.forEach((s, rot) => emit(scene, `env-edge-${cls}-${s}-${v}`, strip, size, rot));
      CORNERS.forEach((s, rot) => emit(scene, `env-edgec-${cls}-${s}-${v}`, corner, size, rot));
    }
  }
  for (let v = 0; v < VARIANTS; v++) {
    const shore = shoreStrip(v);
    SIDES.forEach((s, rot) => emit(scene, `env-shore-${s}-${v}`, shore, size, rot));
    for (const kind of ['mud', 'stone']) {
      const bank = bankStrip(kind, v);
      SIDES.forEach((s, rot) => emit(scene, `env-bank-${kind}-${s}-${v}`, bank, size, rot));
    }
  }
  const shoreC = shoreCorner();
  CORNERS.forEach((s, rot) => emit(scene, `env-shorec-${s}`, shoreC, size, rot));
  for (const kind of ['mud', 'stone']) {
    const bc = bankCorner(kind);
    CORNERS.forEach((s, rot) => emit(scene, `env-bankc-${kind}-${s}`, bc, size, rot));
  }
  emit(scene, 'env-deep', deepWater(), size);
  for (const cls of ['grass', 'path', 'cobble', 'concrete', 'asphalt']) {
    const kind = HARD.has(cls) ? 'stone' : 'mud';
    const rc = roundCorner(scene, cls, kind);
    CORNERS.forEach((k, rot) => emit(scene, `env-round-${cls}-${k}`, rc, size, rot));
  }
  for (const k of ['h', 'v', 'x']) emit(scene, `env-fence-${k}`, fenceTile(k), size);
  for (const surface of PUDDLE_SURFACES) for (let v = 0; v < PUDDLE_VARIANTS; v++) emit(scene, `env-puddle-${surface}-${v}`, puddleTexture(surface, v), size);
  emit(scene, 'env-shadow-hedge', castShadow('hedge'), size);
  emit(scene, 'env-shadow-fence', castShadow('fence'), size);
  const hedgeBase = tileDefs.hedge?.base ?? '#2e7a34';
  for (let v = 0; v < 3; v++) {
    for (const top of [0, 1]) for (const bottom of [0, 1]) emit(scene, `env-hedge-${top}${bottom}-${v}`, hedgeTile(hedgeBase, v, top, bottom), size);
  }
  makeInteriorArt(scene, size);
  makeOutdoorArt(scene, size);
  STATE.ready = true;
}

// Lets node checks exercise groundKeys without a Phaser scene (the textures are only named, never drawn).
export function prepareEnvArtForTest(variantCounts = {}) {
  STATE.variants = { ...variantCounts };
  STATE.ready = true;
}

function variantOf(id, tx, ty) {
  const n = STATE.variants[id] ?? 1;
  const v = (((tx * 73856093) ^ (ty * 19349663)) >>> 0) % n;
  return v === 0 ? `tile-${id}` : `tile-${id}-${v}`;
}
function landClass(id) {
  const c = GIVES_AS[id] ?? CLASS[id];
  return c === 'lane' || c === 'asphalt' ? 'asphalt' : STYLE[c] ? c : 'concrete';
}
const edgeVariant = (tx, ty) => (((tx * 2654435761) ^ (ty * 40503)) >>> 0) % VARIANTS;

// Texture keys to draw, in order, for the tile at (tx, ty). `baseKey` is the plain tile texture the caller
// would draw; without environment art (or on maps with no outdoor surfaces) it comes back unchanged.
export function groundKeys(map, tx, ty, baseKey, mapId) {
  if (!STATE.ready) return [baseKey];
  if (map.indoor) return indoorKeys(map, tx, ty, baseKey, mapId);
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const idAt = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? null : map.legend[map.rows[y][x]]);
  const id = idAt(tx, ty);
  if (id === 'wall') return wallKeys(map, tx, ty, baseKey, idAt);
  const v = edgeVariant(tx, ty);
  const keys = [];

  if (id === 'hedge') {
    const top = idAt(tx, ty - 1) === 'hedge' ? 0 : 1;
    const bottom = idAt(tx, ty + 1) === 'hedge' ? 0 : 1;
    return [`env-hedge-${top}${bottom}-${(((tx * 73856093) ^ (ty * 19349663)) >>> 0) % 3}`];
  }
  const cls = CLASS[id];
  if (id === 'fence') keys.push(variantOf('concrete', tx, ty));
  else keys.push(baseKey);

  // north neighbour casting a soft shadow onto this tile
  const above = idAt(tx, ty - 1);
  if (cls && cls !== 'water' && (above === 'hedge' || above === 'fence')) keys.push(`env-shadow-${above}`);

  if (cls === 'water') {
    let near = false;
    for (const s of SIDES) {
      const nid = idAt(tx + OFF[s][0], ty + OFF[s][1]);
      if (nid && nid !== 'water') { keys.push(`env-shore-${s}-${v}`); near = true; }
    }
    const rounds = [];
    for (const k of CORNERS) {
      const [sa, sb] = CORNER_SIDES[k].map(s => idAt(tx + OFF[s][0], ty + OFF[s][1]));
      if (sa && sb && sa !== 'water' && sb !== 'water') { rounds.push(`env-round-${landClass(sa)}-${k}`); continue; }
      const nid = idAt(tx + CORNER_OFF[k][0], ty + CORNER_OFF[k][1]);
      if (!nid || nid === 'water') continue;
      near = true;
      if (sa === 'water' && sb === 'water') keys.push(`env-shorec-${k}`);
    }
    keys.push(...rounds);
    if (!near) {
      let deep = true;
      for (let dy = -2; dy <= 2 && deep; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nid = idAt(tx + dx, ty + dy);
        if (nid && nid !== 'water') { deep = false; break; }
      }
      if (deep) keys.push('env-deep');
    }
  } else if (cls) {
    const rank = RANK[cls];
    const giver = nid => {
      if (!nid) return null;
      const g = GIVES_AS[nid] ?? (nid === 'fence' || nid === 'puddle' || nid === 'lane' || nid === 'asphalt' || nid === 'water' ? null : CLASS[nid]);
      return g && STYLE[g] && RANK[g] > rank ? g : null;
    };
    const waterKind = HARD.has(cls) ? 'stone' : 'mud';
    const given = {};
    for (const s of SIDES) {
      const nid = idAt(tx + OFF[s][0], ty + OFF[s][1]);
      if (nid === 'water') { keys.push(`env-bank-${waterKind}-${s}-${v}`); given[s] = 'water'; continue; }
      const g = giver(nid);
      if (g) { keys.push(`env-edge-${g}-${s}-${v}`); given[s] = g; }
    }
    for (const k of CORNERS) {
      const nid = idAt(tx + CORNER_OFF[k][0], ty + CORNER_OFF[k][1]);
      if (nid === 'water') {
        if (!CORNER_SIDES[k].some(s => given[s] === 'water')) keys.push(`env-bankc-${waterKind}-${k}`);
        continue;
      }
      const g = giver(nid);
      if (g && !CORNER_SIDES[k].some(s => given[s] === g)) keys.push(`env-edgec-${g}-${k}-${v}`);
    }
  }

  if (id === 'fence') {
    const same = (x, y) => idAt(x, y) === 'fence';
    const h = same(tx - 1, ty) || same(tx + 1, ty);
    const vert = same(tx, ty - 1) || same(tx, ty + 1);
    keys.push(`env-fence-${h && vert ? 'x' : vert ? 'v' : 'h'}`);
  }
  const entrance = indoorInfo(map).doorFloors.get(`${tx},${ty}`); // a stone step and a mat in front of every door
  if (entrance) keys.push('env-ostep', `env-imat-${entrance}`);
  return keys;
}
