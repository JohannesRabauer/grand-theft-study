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
import { hash2, edgeLevel, mapSeed } from './GroundArt.js';
import { SPECIES, speciesOf } from '../render/vegetationMath.js';

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

const STATE = { ready: false, variants: {} };

import { U, rng, hash, rgbOf, shade, canvas, px, ell, emit } from './EnvDraw.js';
import { makeOutdoorArt, wallKeys, outdoorInfo } from './BuildingArt.js';
import { binAt } from '../render/buildingMath.js';
import { makeInteriorArt, indoorKeys, indoorInfo } from './InteriorArt.js'; // story 16.10: walls, floors and rugs of the interiors

// A 32 unit copy of an existing tile texture (variant v when the tier has variants).
function sourceTile(scene, id, v) {
  const key = v > 0 && scene.textures.exists(`tile-${id}-${v}`) ? `tile-${id}-${v}` : `tile-${id}`;
  const out = canvas();
  const c = out.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.drawImage(scene.textures.get(key).getSourceImage(), 0, 0, U, U);
  return out;
}

// Border strips follow a seeded noise curve (story 16.5): the depth runs from the noise level (0..2) of the strip's first
// lattice vertex to that of its last, so any two strips with a shared vertex join without a notch and a long border wanders
// by several base pixels instead of repeating once per tile.
const LEVELS = { tuft: [3, 7, 11], soft: [5, 9, 12], stone: [4, 7, 10], curb: [3, 5, 7] };
const smooth = t => t * t * (3 - 2 * t);
function depthProfile(style, r, a, b) {
  const d = new Array(U);
  const [da, db] = [LEVELS[style][a], LEVELS[style][b]];
  if (style === 'curb') { // a kerb jogs by one unit every 5 to 9 units
    let cur = da;
    let next = 3 + Math.floor(r() * 4);
    for (let x = 0; x < U; x++) {
      if (x === next) { const want = 3 + Math.floor(r() * 5); cur += Math.max(-2, Math.min(2, want - cur)); next += 5 + Math.floor(r() * 5); }
      d[x] = cur;
    }
    d[U - 1] = db;
    return d;
  }
  if (style === 'stone') { // loose stones, four units each
    const blocks = [da];
    for (let i = 1; i < 7; i++) blocks.push(Math.max(3, Math.round(da + (db - da) * (i / 7) + (r() - 0.5) * 5)));
    blocks.push(db);
    for (let x = 0; x < U; x++) d[x] = blocks[x >> 2];
    return d;
  }
  const amp = style === 'tuft' ? 2.4 : 1.6;
  const [p1, p2] = [r() * 6, r() * 6];
  for (let x = 0; x < U; x++) {
    const t = x / (U - 1);
    const bump = amp * (0.6 * Math.sin(x * 0.45 + p1) + 0.4 * Math.sin(x * 0.9 + p2)) * Math.sin(Math.PI * t);
    d[x] = Math.max(2, Math.round(da + (db - da) * smooth(t) + bump + (style === 'tuft' ? r() * 1.2 : 0)));
  }
  if (style === 'tuft') for (let x = 3; x < U - 3; x += 5 + Math.floor(r() * 4)) { d[x] += 3; d[x + 1] += 2; d[x - 1] += 1; } // grass blades poking out
  d[0] = da;
  d[U - 1] = db;
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

function surfaceStrip(scene, cls, a, b, k) {
  const style = STYLE[cls];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const v = (a + b + k) % VARIANTS;
  const r = rng(hash(`${cls}-edge`) + (a * 3 + b) * 977 + k * 131);
  const source = sourceTile(scene, cls, v);
  c.drawImage(source, 0, 0);
  const srcData = source.getContext('2d').getImageData(0, 0, U, U).data;
  const depth = depthProfile(style, r, a, b);
  if (style === 'curb') {
    maskStrip(tmp, depth, 0.0, false);
    for (let x = 0; x < U; x++) {
      const d = depth[x];
      px(c, 'rgba(255,255,255,0.34)', x, 0, 1, 2);    // lit top of the kerb
      px(c, 'rgba(0,0,0,0.38)', x, d - 1);             // kerb face
      px(c, 'rgba(0,0,0,0.24)', x, d);                 // soft shadow on the lower surface
      px(c, 'rgba(0,0,0,0.15)', x, d + 1);
      px(c, 'rgba(0,0,0,0.07)', x, d + 2);
    }
    for (let x = 6 + k * 3; x < U; x += 11) px(c, 'rgba(0,0,0,0.16)', x, 0, 1, depth[x] - 1); // joints
    for (let i = 0; i < 3; i++) { const x = 2 + Math.floor(r() * 28); px(c, i ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.22)', x, Math.floor(r() * 3), 2, 1); } // chips
  } else {
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
  maskCorner(tmp, style === 'curb' ? 8 : style === 'tuft' ? 8 : 7, style === 'soft' ? 0 : 0.25, rng(hash(`${cls}-corner`) + v * 31));
  if (style === 'curb') px(c, 'rgba(255,255,255,0.3)', 0, 0, 4, 1);
  return tmp;
}

// Bed of a water tile (story 16.8): wet mud. The water itself is drawn over it (render/Water.js) with a shore bent by noise, so
// wherever the shore recedes from the tile edge this is the bank that shows, and it matches the bank colours of the shore layer.
function waterBed(v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(515 + v * 37);
  px(c, '#6e5a3b', 0, 0, U, U);
  for (let i = 0; i < 40; i++) px(c, r() < 0.5 ? '#5a4731' : '#8a7048', Math.floor(r() * U), Math.floor(r() * U), 1 + Math.floor(r() * 3), 1);
  return tmp;
}

// -------------------------------------------------------------------------------------- fences

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

// -------------------------------------------------------------------------------------- garden dressing (15.3)
// Flower beds with small shrubs along the front of buildings, and potted plants beside doors. Drawn into the
// ground texture next to the neighbours they belong to; nothing here is an object, so nothing collides.
function bedTexture(v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(6100 + v * 53);
  px(c, 'rgba(0,0,0,0.25)', 0, 0, U, 3);                       // shade under the wall
  px(c, '#4b3220', 0, 3, U, 11); px(c, '#6a4930', 0, 3, U, 1); // soil bed
  px(c, '#2f2013', 0, 13, U, 1);
  for (let i = 0; i < 18; i++) px(c, '#5d4029', Math.floor(r() * U), 4 + Math.floor(r() * 9), 2, 1);
  const palette = [['#ff6f91', '#ffd0dc'], ['#ffd84d', '#fff2a6'], ['#b58cff', '#e0ccff'], ['#ffffff', '#f2ead0']][v % 4];
  let x = 2;
  while (x < U - 3) {
    const shrub = r() < 0.28;
    if (shrub) {
      ell(c, '#2c6a2c', x + 3, 9, 4.5, 4); ell(c, '#3f8a3c', x + 2.5, 8, 3.6, 3.2); ell(c, '#5aa84c', x + 2, 7, 1.8, 1.4);
      x += 9;
    } else {
      px(c, '#3f8a3c', x + 1, 8, 1, 4); px(c, '#3f8a3c', x, 9, 1, 2);
      px(c, palette[0], x, 6, 3, 3); px(c, palette[1], x + 1, 6, 1, 1); px(c, '#e8b830', x + 1, 7, 1, 1);
      x += 4 + Math.floor(r() * 3);
    }
  }
  px(c, '#cfcfc6', 0, 14, U, 1);                                // edging stones
  return tmp;
}

function potTexture(v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const palette = [['#ff6f91', '#ffd0dc'], ['#ffd84d', '#fff2a6']][v & 1];
  px(c, 'rgba(0,0,0,0.28)', 8, 24, 17, 4);
  px(c, '#a1502f', 10, 16, 13, 10); px(c, '#c3683f', 10, 16, 13, 2); px(c, '#7a3a20', 11, 25, 11, 1); px(c, '#7a3a20', 22, 18, 1, 8);
  px(c, '#c3683f', 9, 15, 15, 2);
  ell(c, '#2c6a2c', 16, 11, 8, 6); ell(c, '#3f8a3c', 15, 10, 6, 4.6); ell(c, '#5aa84c', 13, 8, 3, 2);
  for (const [x, y] of [[12, 6], [18, 5], [20, 10], [10, 11]]) { px(c, palette[0], x, y, 3, 3); px(c, palette[1], x + 1, y, 1, 1); px(c, '#e8b830', x + 1, y + 1, 1, 1); }
  return tmp;
}

// Trunk and root flare of a tree tile with a dithered contact shadow, in the ground under the crown (story 16.6). Units are
// half base pixels; the crown (render/Vegetation.js) hides the upper trunk.
const TRUNK = { oak: { base: '#5a3a1e', light: '#7a5230', dark: '#3b2412', half: 3 }, pine: { base: '#4a2f1c', light: '#664226', dark: '#2e1c10', half: 2 }, birch: { base: '#e8e4dc', light: '#f8f5ef', dark: '#a8a49c', half: 2 } };
function trunkTexture(species) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const t = TRUNK[species];
  const col = 'rgba(26,32,70,0.42)';
  for (let y = 24; y < 34; y += 2) {
    for (let x = 4; x < 28; x += 2) {
      const d = ((x + 1 - 16) / 12) ** 2 + ((y + 1 - 29) / 4) ** 2;
      if (d <= 0.5 || (d <= 1.1 && (((x + y) >> 1) & 1) === 0)) px(c, col, x, y, 2, 2);
    }
  }
  const w = t.half;
  px(c, '#16161e', 16 - w - 2, 17, w * 2 + 4, 14);                           // outline
  px(c, '#16161e', 16 - w - 4, 26, w * 2 + 8, 5);
  px(c, t.base, 16 - w, 18, w * 2, 12);                                       // trunk
  px(c, t.light, 16 - w, 18, 2, 12);
  px(c, t.dark, 16 + w - 2, 18, 2, 12);
  px(c, t.base, 16 - w - 2, 26, w * 2 + 4, 4);                                // root flare
  px(c, t.light, 16 - w - 2, 26, 2, 4);
  px(c, t.dark, 16 + w, 26, 2, 4);
  px(c, t.dark, 16 - w - 4, 28, 2, 2); px(c, t.dark, 16 + w + 2, 28, 2, 2);    // root tips
  px(c, t.base, 16 - w - 3, 29, 2, 1);
  if (species === 'birch') for (const y of [20, 23, 27]) px(c, '#3a3630', 16 - w + (y % 3) * 1, y, 2, 1);
  else for (const y of [20, 24]) px(c, t.dark, 16 - w + 2, y, 2, 1);          // bark
  return tmp;
}

// A clump of tall grass: blades that rise above the lawn, a seed head or a small flower on some.
function tuftTexture(v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(7300 + v * 41);
  const blades = ['#2c5f3a', '#3f8a3c', '#6bb85a'];
  const heads = ['#f4f4ee', '#f2d04a', '#b58ad8', '#d9b86a'];
  for (let k = 0; k < 2; k++) { // two clumps per tile
    const x0 = 4 + Math.floor(r() * 20);
    const y0 = 16 + Math.floor(r() * 12);
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * 2 + (i & 1);
      const h = 6 + Math.floor(r() * 7);
      const lean = r() < 0.5 ? -1 : 1;
      px(c, blades[i % 3], x, y0 - h, 2, h);
      px(c, blades[(i + 1) % 3], x + lean, y0 - h - 2, 2, 2);
      if (r() < 0.35) px(c, heads[Math.floor(r() * heads.length)], x + lean, y0 - h - 4, 2, 2);
    }
    px(c, '#2c5f3a', x0 - 1, y0, n * 2 + 3, 1);
  }
  return tmp;
}
function tramStopTexture() {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  px(c, '#b9b9b0', 2, 4, 28, 24); px(c, '#d6d6cc', 2, 4, 28, 1);          // platform slab
  px(c, '#8d8d85', 2, 27, 28, 1);
  for (let x = 3; x < 29; x += 4) px(c, x % 8 === 3 ? '#f2c230' : '#2b2b2b', x, 24, 4, 3); // safety stripe
  px(c, 'rgba(0,0,0,0.25)', 21, 18, 7, 3);                                 // pole shadow
  px(c, '#4a4f58', 22, 6, 2, 14);                                          // pole
  px(c, '#1f5fa8', 17, 4, 12, 8); px(c, '#ffffff', 18, 5, 10, 6);          // sign plate
  px(c, '#1f5fa8', 19, 6, 8, 2); px(c, '#1f5fa8', 20, 8, 2, 2); px(c, '#1f5fa8', 24, 8, 2, 2); // tram pictogram
  px(c, '#f2c230', 19, 5, 8, 1);
  return tmp;
}

function makeDecorArt(scene, size) {
  emit(scene, 'env-tramstop', tramStopTexture(), size);
  for (let v = 0; v < 4; v++) emit(scene, `env-bed-${v}`, bedTexture(v), size);
  for (let v = 0; v < 2; v++) emit(scene, `env-pot-${v}`, potTexture(v), size);
  for (const sp of SPECIES) emit(scene, `env-trunk-${sp}`, trunkTexture(sp), size);
  for (let v = 0; v < 4; v++) emit(scene, `env-tuft-${v}`, tuftTexture(v), size);
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
      const corner = surfaceCorner(scene, cls, v);
      CORNERS.forEach((s, rot) => emit(scene, `env-edgec-${cls}-${s}-${v}`, corner, size, rot));
    }
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let k = 0; k < VARIANTS; k++) {
      const strip = surfaceStrip(scene, cls, a, b, k);
      SIDES.forEach((s, rot) => emit(scene, `env-edge-${cls}-${s}-${a}${b}${k}`, strip, size, rot));
    }
  }
  for (let v = 0; v < VARIANTS; v++) emit(scene, `env-wbed-${v}`, waterBed(v), size);
  for (const k of ['h', 'v', 'x']) emit(scene, `env-fence-${k}`, fenceTile(k), size);
  for (const surface of PUDDLE_SURFACES) for (let v = 0; v < PUDDLE_VARIANTS; v++) emit(scene, `env-puddle-${surface}-${v}`, puddleTexture(surface, v), size);
  makeInteriorArt(scene, size);
  makeOutdoorArt(scene, size);
  makeDecorArt(scene, size);
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
const edgeVariant = (tx, ty) => (((tx * 2654435761) ^ (ty * 40503)) >>> 0) % VARIANTS;

// Strip variant "<a><b><k>" for side s of tile (tx, ty): a and b are the noise levels of the lattice vertices at the strip's
// start and end (after the quarter-turn rotation of the side), k picks one of the shapes with those ends.
const STRIP_ENDS = { n: [[0, 0], [1, 0]], e: [[1, 0], [1, 1]], s: [[1, 1], [0, 1]], w: [[0, 1], [0, 0]] };
export function stripVariant(seed, cls, s, tx, ty) {
  const [[ax, ay], [bx, by]] = STRIP_ENDS[s];
  const k = Math.floor(hash2(seed + 77, tx * 4 + SIDES.indexOf(s), ty) * VARIANTS);
  return `${edgeLevel(seed, cls, tx + ax, ty + ay)}${edgeLevel(seed, cls, tx + bx, ty + by)}${k}`;
}

// Texture keys to draw, in order, for the tile at (tx, ty). `baseKey` is the plain tile texture the caller
// would draw; without environment art (or on maps with no outdoor surfaces) it comes back unchanged.
export function groundKeys(map, tx, ty, baseKey, mapId) {
  if (!STATE.ready) return [baseKey];
  if (map.indoor) return indoorKeys(map, tx, ty, baseKey, mapId);
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const idAt = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? null : map.legend[map.rows[y][x]]);
  const id = idAt(tx, ty);
  if (id === 'wall') return wallKeys(map, tx, ty, baseKey, mapId);
  const v = edgeVariant(tx, ty);
  const seed = mapSeed(map, mapId);
  const keys = [];

  if (id === 'hedge') return [variantOf('grass', tx, ty)]; // the lumpy hedge itself is a sprite (render/Vegetation.js); the ground under it is lawn

  const cls = CLASS[id];
  if (id === 'fence') keys.push(variantOf('concrete', tx, ty));
  else keys.push(baseKey);

  if (cls === 'water') {
    keys[0] = `env-wbed-${v}`; // the water and its shore are drawn over this bed by render/Water.js
  } else if (cls) {
    const rank = RANK[cls];
    const giver = nid => {
      if (!nid) return null;
      const g = GIVES_AS[nid] ?? (nid === 'fence' || nid === 'puddle' || nid === 'lane' || nid === 'asphalt' || nid === 'water' ? null : CLASS[nid]);
      return g && STYLE[g] && RANK[g] > rank ? g : null;
    };
    const given = {};
    for (const s of SIDES) {
      const nid = idAt(tx + OFF[s][0], ty + OFF[s][1]);
      if (nid === 'water') continue; // the bank is part of the water's shore layer (render/Water.js)
      const g = giver(nid);
      if (g) { keys.push(`env-edge-${g}-${s}-${stripVariant(seed, g, s, tx, ty)}`); given[s] = g; }
    }
    for (const k of CORNERS) {
      const nid = idAt(tx + CORNER_OFF[k][0], ty + CORNER_OFF[k][1]);
      if (nid === 'water') continue;
      const g = giver(nid);
      if (g && !CORNER_SIDES[k].some(s => given[s] === g)) keys.push(`env-edgec-${g}-${k}-${v}`);
    }
  }

  if (id === 'tree') keys.push(`env-trunk-${speciesOf(tx, ty)}`); // the crown is a sprite that overlaps the neighbours (render/Vegetation.js)
  if (id === 'fence') {
    const same = (x, y) => idAt(x, y) === 'fence';
    const h = same(tx - 1, ty) || same(tx + 1, ty);
    const vert = same(tx, ty - 1) || same(tx, ty + 1);
    keys.push(`env-fence-${h && vert ? 'x' : vert ? 'v' : 'h'}`);
  }
  if (cls && cls !== 'water' && idAt(tx, ty - 1) === 'wall' && ty - 1 > 0 && tx > 0 && tx < cols - 1) { // dressing in front of a building
    const doors = indoorInfo(map).doorFloors;
    const h = (((tx * 2246822519) ^ (ty * 3266489917)) >>> 0) % 100;
    const nextToDoor = doors.has(`${tx - 1},${ty}`) || doors.has(`${tx + 1},${ty}`);
    if (!doors.has(`${tx},${ty}`) && nextToDoor && (cls === 'concrete' || cls === 'grass' || cls === 'cobble')) keys.push(`env-pot-${h & 1}`);
    else if (cls === 'grass' && h < 62) keys.push(`env-bed-${h % 4}`);
    else if (cls === 'concrete' || cls === 'cobble') { const bin = binAt(outdoorInfo(map, mapId), tx, ty); if (bin >= 0) keys.push(`env-bin-${bin}`); } // a wheelie bin along the wall
  }
  if (cls === 'grass' && !keys.some(k => k.startsWith('env-bed') || k.startsWith('env-pot'))) { // story 16.6: beds under hedges, tall grass where lawn meets trees, hedges and fences, some at random
    const g = (((tx * 3266489917) ^ (ty * 668265263)) >>> 0) % 100;
    const green = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([ox, oy]) => ['tree', 'hedge', 'fence'].includes(idAt(tx + ox, ty + oy)));
    if (idAt(tx, ty - 1) === 'hedge' && g < 55) keys.push(`env-bed-${g % 4}`);
    else if (g < (green ? 32 : 7)) keys.push(`env-tuft-${g % 4}`);
  }
  if (outdoorInfo(map, mapId).stops.has(`${tx},${ty}`)) keys.push('env-tramstop');
  const entrance = indoorInfo(map).doorFloors.get(`${tx},${ty}`); // a stone step and a mat in front of every door
  if (entrance) keys.push('env-ostep', `env-imat-${entrance}`);
  return keys;
}
