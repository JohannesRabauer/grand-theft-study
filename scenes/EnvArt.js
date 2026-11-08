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
  emit(scene, 'env-shadow-hedge', castShadow('hedge'), size);
  emit(scene, 'env-shadow-fence', castShadow('fence'), size);
  const hedgeBase = tileDefs.hedge?.base ?? '#2e7a34';
  for (let v = 0; v < 3; v++) {
    for (const top of [0, 1]) for (const bottom of [0, 1]) emit(scene, `env-hedge-${top}${bottom}-${v}`, hedgeTile(hedgeBase, v, top, bottom), size);
  }
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
export function groundKeys(map, tx, ty, baseKey) {
  if (!STATE.ready) return [baseKey];
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const idAt = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? null : map.legend[map.rows[y][x]]);
  const id = idAt(tx, ty);
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
  return keys;
}
