// Building art (story 16.7, AD-30/AD-31): the tile textures of outdoor walls (roofs in three materials with eaves, facades with
// windows, curtains, sills, gutters, ageing and plinths, doors) and the overlay atlas of the parts that hang over the ground around
// a building (eaves, chimneys, awnings) plus the lit window panes. Tiles are authored on the 32 unit grid like scenes/EnvArt.js
// (light from the top left: light edge on the left and top, shade on the right and bottom); the atlas frames are authored at two
// units per base pixel and scaled to the render class. Which tile gets what comes from render/buildingMath.js. Nothing here runs
// per frame, and nothing changes collision, pathfinding or map data.
import { U, rng, hash, shade, rgbOf, canvas, px, ell, emit } from './EnvDraw.js';
import { mapSeed } from './GroundArt.js';
import { ROOFS, STYLES, buildingInfo, buildingAt, isFacade, facadeLook, roofEdges, roofExtra } from '../render/buildingMath.js';

export const PALS = [
  { id: 'brick', roof: '#b2553a', wall: '#a2553c', brick: true, mortar: '#c99a86', trim: '#f0e8da', shutter: '#2f5f4a', base: '#3e2018' },
  { id: 'slate', roof: '#55657e', wall: '#dccaa0', brick: false, mortar: '#c9b78c', trim: '#ffffff', shutter: '#3f6aa0', base: '#6b5a44' },
  { id: 'honey', roof: '#7c4b2d', wall: '#e3c27c', brick: false, mortar: '#cfa95f', trim: '#fff6df', shutter: '#9a3d2e', base: '#6a4a2a' },
  { id: 'sage', roof: '#3f6f5a', wall: '#c3d1be', brick: false, mortar: '#a9bba5', trim: '#ffffff', shutter: '#8a4a3a', base: '#4e5a48' }
];
const DOOR_KINDS = ['home', 'school', 'dojo', 'plain'];
const DOOR_PARTS = ['c', 'l', 'r', 'sl', 'sr'];
const AWNINGS = [['#c0392b', '#f4efe2'], ['#2f6f9f', '#f4efe2'], ['#2f7a4a', '#f2e6b8'], ['#d68a1f', '#f4efe2']];
const BIN_COLORS = [['#3f7a46', '#5fa063', '#2a5530'], ['#6b7078', '#8e939b', '#4a4e55'], ['#3d63a8', '#5f86c8', '#284478']];
const GLASS_DAY = ['#5f86ad', '#2d3f55'];

const mixc = (a, b, t) => '#' + rgbOf(a).map((v, i) => Math.round(v + (rgbOf(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

// The three roof materials as colour ramps: clay tiles keep the palette's roof colour, slate is cooler and darker, a flat roof is tar grey.
export function roofColors(pal, kind) {
  const base = kind === 'tile' ? pal.roof : kind === 'slate' ? mixc(pal.roof, '#454d5c', 0.62) : mixc(pal.roof, '#767b84', 0.85);
  return { base, light: shade(base, 0.38), dark: shade(base, -0.3), deep: shade(base, -0.5) };
}

function roofTexture(pal, kind, mask) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(pal.id + kind + 'roof'));
  const col = roofColors(pal, kind);
  px(c, col.base, 0, 0, U, U);
  if (kind === 'tile') {
    for (let row = 0; row < 8; row++) {
      const y = row * 4;
      const off = row % 2 ? 4 : 0;
      px(c, col.dark, 0, y + 3, U, 1);
      for (let k = -1; k < 4; k++) {
        const x = off + k * 8;
        px(c, col.dark, x, y, 1, 3);
        const t = shade(col.base, (r() - 0.45) * 0.3);
        px(c, t, x + 1, y, 7, 3);
        px(c, shade(t, 0.2), x + 1, y, 7, 1);
      }
    }
  } else if (kind === 'slate') {
    for (let row = 0; row < 8; row++) {
      const y = row * 4;
      const off = row % 2 ? 3 : 0;
      for (let k = -1; k < 6; k++) {
        const x = off + k * 6;
        const t = shade(col.base, (r() - 0.5) * 0.22);
        px(c, t, x, y, 6, 4);
        px(c, shade(t, 0.08), x, y, 6, 1);
        px(c, shade(t, -0.16), x + 5, y, 1, 4);
        px(c, shade(t, -0.16), x, y + 3, 6, 1);
      }
    }
  } else {
    for (const [x, w, t] of [[0, 10, 0.1], [11, 10, -0.1], [22, 10, 0.1]]) px(c, shade(col.base, t), x, 0, w, U); // strips of roofing felt in two tones
    for (let i = 0; i < 90; i++) px(c, shade(col.base, r() < 0.5 ? -0.16 : 0.16), Math.floor(r() * U), Math.floor(r() * U), 2, 1); // gravel
    for (const x of [10, 21]) { px(c, col.dark, x, 0, 1, U); px(c, col.light, x + 1, 0, 1, U); }  // seams
    for (let y = 6; y < U; y += 12) px(c, col.dark, 0, y, U, 1);                                    // overlaps
  }
  // where the roof ends, an edge: a lit lip on the north and west, a shaded one on the east, ragged (the lip is 2 or 3 units
  // thick per group of 4), so a long roof edge is never one straight colour line; a flat roof gets a parapet
  const lip = kind === 'flat' ? '#b9bcc2' : col.light;
  const run = fn => { for (let t = 0; t < U; t += 4) fn(t, r() < 0.5 ? 2 : 3); };
  if (mask & 1) run((x, n) => { px(c, lip, x, 0, 4, n); px(c, col.deep, x, n, 4, 1); if (kind === 'flat') px(c, col.dark, x, n + 1, 4, 1); });
  if (mask & 2) run((y, n) => { px(c, lip, 0, y, n, 4); px(c, col.deep, n, y, 1, 4); if (kind === 'flat') px(c, col.dark, n + 1, y, 1, 4); });
  if (mask & 4) run((y, n) => { px(c, kind === 'flat' ? '#8f939a' : shade(col.base, -0.2), U - n, y, n, 4); px(c, col.deep, U - n - 1, y, 1, 4); if (kind === 'flat') px(c, col.dark, U - n - 2, y, 1, 4); });
  return tmp;
}

// Vent pipe, air unit and skylight on a flat roof.
function roofExtraTexture(v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  px(c, 'rgba(0,0,0,0.28)', 13, 19, 14, 5);
  if (v === 0) {
    px(c, '#5a6068', 12, 8, 6, 12); px(c, '#9aa1ab', 12, 8, 2, 12); px(c, '#3a3f48', 16, 8, 2, 12);
    px(c, '#7c838c', 10, 6, 10, 3); px(c, '#b9bcc2', 10, 6, 10, 1);
  } else if (v === 1) {
    px(c, '#8d939c', 8, 9, 16, 11); px(c, '#b9bcc2', 8, 9, 16, 2); px(c, '#6b717a', 8, 18, 16, 2);
    ell(c, '#3a3f48', 16, 14, 4.5, 3.5); for (let x = 12; x < 20; x += 2) px(c, '#59606b', x, 12, 1, 5);
  } else {
    px(c, '#59606b', 7, 9, 18, 12); px(c, '#9fcfe8', 9, 11, 14, 8); px(c, '#cfe8f4', 9, 11, 14, 2);
    px(c, '#59606b', 15, 11, 1, 8); px(c, '#59606b', 9, 15, 14, 1);
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
  px(c, pal.base, 0, 28, U, 4);                      // plinth of stone blocks
  px(c, shade(pal.base, 0.25), 0, 28, U, 1);
  for (let x = 4; x < U; x += 8) px(c, shade(pal.base, -0.3), x + ((x >> 3) & 1) * 2, 29, 1, 2);
}

// The underside of the eave and a gutter along the top of the facade.
function eaves(c, pal) {
  px(c, 'rgba(0,0,0,0.34)', 0, 0, U, 3);                       // shade under the overhanging roof
  px(c, shade(pal.trim, -0.12), 0, 3, U, 1); px(c, '#59606b', 0, 4, U, 1);   // fascia board and gutter
  px(c, 'rgba(0,0,0,0.16)', 0, 5, U, 2);
}

function curtains(c, pal, which, x0, x1, y0, y1) {
  const col = shade(pal.shutter, 0.35);
  if (which === 1 || which === 2) {
    px(c, col, x0, y0, 4, y1 - y0); px(c, shade(col, -0.25), x0 + 2, y0, 1, y1 - y0); px(c, shade(col, 0.25), x0, y0, 1, y1 - y0);
    px(c, shade(col, -0.35), x0, y0 + 8, 4, 1);
    if (which === 2) { px(c, col, x1 - 4, y0, 4, y1 - y0); px(c, shade(col, -0.25), x1 - 2, y0, 1, y1 - y0); px(c, shade(col, -0.35), x1 - 4, y0 + 8, 4, 1); }
  } else if (which === 3) {
    px(c, '#efe8d4', x0, y0, x1 - x0, 6); px(c, '#b9ae94', x0, y0 + 5, x1 - x0, 1); px(c, '#d8cfb6', x0 + 5, y0 + 6, 2, 2);
  }
}

function facadeTexture(pal, style, curtain, sign) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  wallBase(c, pal, hash(pal.id + 'wall'));
  eaves(c, pal);
  if (style === 'plain') return tmp;
  if (style === 'shop') return shopTexture(tmp, c, pal, sign);
  if (style === 'shutter') { for (const x of [3, 23]) { px(c, pal.shutter, x, 6, 6, 17); px(c, shade(pal.shutter, 0.2), x, 6, 1, 17); for (let y = 8; y < 22; y += 3) px(c, shade(pal.shutter, -0.3), x + 1, y, 4, 1); } }
  px(c, '#2a1a14', 8, 5, 16, 17);
  px(c, pal.trim, 8, 5, 16, 16);
  const sky = c.createLinearGradient(0, 7, 0, 19);
  sky.addColorStop(0, GLASS_DAY[0]); sky.addColorStop(1, GLASS_DAY[1]);
  c.fillStyle = sky; c.fillRect(10, 7, 12, 12);
  px(c, '#8fb4d6', 11, 8, 4, 3); px(c, '#cfe3f4', 11, 8, 2, 1);
  curtains(c, pal, curtain, 10, 22, 7, 19);
  px(c, pal.trim, 15, 7, 2, 12); px(c, pal.trim, 10, 12, 12, 1);
  px(c, '#b8b0a2', 7, 21, 18, 2); px(c, '#d9d2c4', 7, 21, 18, 1); px(c, '#8a8274', 7, 23, 18, 1); // sill with a drip edge
  if (style === 'flowers') {
    px(c, '#6e4a33', 8, 22, 16, 5); px(c, '#8b6244', 8, 22, 16, 1); px(c, '#4a2f20', 8, 26, 16, 1);
    for (let x = 9; x < 24; x += 3) { px(c, '#3f8a3c', x, 19, 1, 4); px(c, x % 2 ? '#ff6f91' : '#ffd84d', x - 1, 18, 3, 2); }
  } else if (style === 'balcony') {
    px(c, '#c9c2b3', 5, 22, 22, 3); px(c, '#e3ddd0', 5, 22, 22, 1); px(c, '#6e685c', 5, 25, 22, 1);
    px(c, 'rgba(0,0,0,0.2)', 5, 26, 22, 2);
    px(c, '#2a2f38', 6, 26, 20, 1);
    for (let x = 6; x < 26; x += 3) px(c, '#2a2f38', x, 26, 1, 3);
  }
  return tmp;
}

// Shopfront: a sign board with a pictogram (loaf, cup, shears, wheel), a wide display window and a counter ledge.
function shopTexture(tmp, c, pal, sign) {
  px(c, '#2a1a14', 3, 6, 26, 7); px(c, pal.shutter, 4, 7, 24, 5); px(c, shade(pal.shutter, 0.25), 4, 7, 24, 1);
  const g = '#f6ecd0';
  const cx = 16;
  if (sign === 1) { ell(c, g, cx, 9.5, 5, 2); px(c, shade(pal.shutter, -0.3), cx - 2, 9, 1, 1); px(c, shade(pal.shutter, -0.3), cx + 1, 9, 1, 1); }          // loaf
  else if (sign === 2) { px(c, g, cx - 3, 8, 6, 3); px(c, g, cx + 3, 8, 2, 2); px(c, shade(pal.shutter, -0.2), cx - 2, 9, 4, 1); }                         // cup
  else if (sign === 3) { px(c, g, cx - 4, 8, 2, 1); px(c, g, cx + 2, 8, 2, 1); px(c, g, cx - 3, 9, 2, 1); px(c, g, cx + 1, 9, 2, 1); px(c, g, cx - 1, 10, 2, 1); px(c, g, cx - 3, 11, 2, 1); px(c, g, cx + 1, 11, 2, 1); } // shears
  else if (sign === 4) { ell(c, g, cx, 9.5, 2.5, 2.5); ell(c, pal.shutter, cx, 9.5, 1.4, 1.4); px(c, g, cx - 4, 9, 9, 1); }                              // wheel
  px(c, '#2a1a14', 4, 14, 24, 11); px(c, pal.trim, 4, 14, 24, 1);
  const sky = c.createLinearGradient(0, 15, 0, 24);
  sky.addColorStop(0, GLASS_DAY[0]); sky.addColorStop(1, GLASS_DAY[1]);
  c.fillStyle = sky; c.fillRect(6, 15, 20, 9);
  px(c, '#8fb4d6', 7, 16, 5, 3); px(c, '#cfe3f4', 7, 16, 2, 1);
  px(c, pal.trim, 15, 15, 2, 9);
  px(c, '#6e4a33', 4, 25, 24, 3); px(c, '#8b6244', 4, 25, 24, 1);
  px(c, '#e8b830', 8, 22, 3, 2); px(c, '#c3683f', 20, 21, 4, 3);                       // wares in the window
  return tmp;
}

// Overlays drawn on top of a facade, a roof or the ground in front of a wall (translucent, so they sit on any palette).
const OVERLAYS = {
  pipe: (c, side) => {
    const x = side === 'w' ? 1 : 28;
    px(c, '#4a4f58', x - 1, 10, 5, 1); px(c, '#4a4f58', x - 1, 21, 5, 1); // brackets
    px(c, '#6d737c', x, 5, 3, 24); px(c, '#9aa1ab', x, 5, 1, 24); px(c, '#4a4f58', x + 2, 5, 1, 24);
    px(c, '#6d737c', side === 'w' ? x : x - 3, 28, 6, 2); px(c, '#4a4f58', side === 'w' ? x : x - 3, 29, 6, 1);
  },
  age: (c, v) => {
    const r = rng(5100 + v * 37);
    if (v === 0) { // rain streaks under the sill
      for (const x of [9, 21]) { px(c, 'rgba(40,36,30,0.2)', x, 23, 2, 8); px(c, 'rgba(40,36,30,0.14)', x + 1, 29, 1, 3); }
      for (let i = 0; i < 6; i++) px(c, 'rgba(40,36,30,0.18)', 8 + Math.floor(r() * 16), 24 + Math.floor(r() * 6), 1, 2);
    } else if (v === 1) { // moss climbing from the plinth
      for (let i = 0; i < 26; i++) { const x = Math.floor(r() * 30); const y = 27 - Math.floor(r() * r() * 9); px(c, i % 3 ? 'rgba(64,112,48,0.62)' : 'rgba(110,150,70,0.6)', x, y, 2, 1); }
    } else if (v === 2) { // a plaster patch with the masonry showing
      px(c, 'rgba(232,222,200,0.5)', 18, 8, 10, 8); px(c, 'rgba(232,222,200,0.5)', 17, 10, 12, 4);
      px(c, 'rgba(150,84,62,0.55)', 20, 9, 5, 4); px(c, 'rgba(110,60,44,0.5)', 20, 12, 5, 1);
    } else { // damp climbing the wall, dithered edge
      for (let y = 18; y < 28; y++) for (let x = 0; x < U; x += 2) if (y > 21 || ((x + y) & 3) === 0) px(c, 'rgba(36,52,64,0.17)', x + (y & 1), y, 2, 1);
    }
  },
  bin: (c, v) => {
    const [base, light, dark] = BIN_COLORS[v];
    for (let y = 14; y < 18; y += 2) for (let x = 3; x < 17; x += 2) px(c, 'rgba(26,32,70,0.35)', x, y, 2, 2);
    px(c, '#16161e', 4, 3, 10, 13);
    px(c, base, 5, 5, 8, 10); px(c, light, 5, 5, 2, 10); px(c, dark, 11, 5, 2, 10);
    px(c, shade(base, -0.2), 4, 3, 10, 3); px(c, light, 4, 3, 10, 1); px(c, dark, 12, 3, 2, 3);
    px(c, dark, 7, 9, 4, 1);
  }
};

function doorTexture(pal, kind, part) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  wallBase(c, pal, hash(pal.id + 'wall'));
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


export function makeOutdoorArt(scene, size) {
  for (const pal of PALS) {
    for (const kind of ROOFS) for (let mask = 0; mask < 8; mask++) emit(scene, `env-roof-${pal.id}-${kind}-${mask}`, roofTexture(pal, kind, mask), size);
    emit(scene, `env-facade-${pal.id}-plain`, facadeTexture(pal, 'plain', 0, 0), size);
    for (const style of STYLES.slice(0, 4)) for (let cu = 0; cu < 4; cu++) emit(scene, `env-facade-${pal.id}-${style}-${cu}`, facadeTexture(pal, style, cu, 0), size);
    for (let sign = 0; sign < 5; sign++) emit(scene, `env-facade-${pal.id}-shop-${sign}`, facadeTexture(pal, 'shop', 0, sign), size);
    for (const kind of DOOR_KINDS) for (const part of DOOR_PARTS) emit(scene, `env-odoor-${pal.id}-${kind}-${part}`, doorTexture(pal, kind, part), size);
  }
  emit(scene, 'env-ostep', stepTexture(), size);
  for (const side of ['w', 'e']) emit(scene, `env-pipe-${side}`, overlay(OVERLAYS.pipe, side), size);
  for (let v = 0; v < 4; v++) emit(scene, `env-age-${v}`, overlay(OVERLAYS.age, v), size);
  for (let v = 0; v < 3; v++) { emit(scene, `env-bin-${v}`, overlay(OVERLAYS.bin, v), size); emit(scene, `env-vent-${v}`, roofExtraTexture(v), size); }
}

function overlay(draw, arg) {
  const tmp = canvas();
  draw(tmp.getContext('2d'), arg);
  return tmp;
}

// The info of one map (buildings, looks, doors, tram stops), cached by the map object.
export const outdoorInfo = (map, mapId) => buildingInfo(map, mapSeed(map, mapId), PALS.length);

const facadeKey = (pal, look) => look.style < 0 ? `env-facade-${pal}-plain` : look.style === 4 ? `env-facade-${pal}-shop-${look.sign + 1}` : `env-facade-${pal}-${STYLES[look.style]}-${look.curtain}`;

// Keys for an outdoor wall tile: roof (with its edges), facade (window, drainpipe, ageing) or a door; the map border stays plain brick.
export function wallKeys(map, tx, ty, baseKey, mapId) {
  const info = outdoorInfo(map, mapId);
  const b = buildingAt(info, tx, ty);
  if (!b) return [baseKey];
  const pal = PALS[b.pal].id;
  const door = info.doors.get(`${tx},${ty}`);
  if (door) return [`env-odoor-${pal}-${door.kind}-${door.part}`];
  if (isFacade(info, tx, ty)) {
    const look = facadeLook(info, tx, ty);
    const keys = [facadeKey(pal, look)];
    if (look.pipe) keys.push(`env-pipe-${look.pipe}`);
    if (look.age >= 0) keys.push(`env-age-${look.age}`);
    return keys;
  }
  const keys = [`env-roof-${pal}-${ROOFS[b.roof]}-${roofEdges(info, tx, ty)}`];
  const extra = roofExtra(info, tx, ty);
  if (extra >= 0) keys.push(`env-vent-${extra}`);
  return keys;
}

// ------------------------------------------------------------------------------------------------ overlay atlas
// Frames that hang over the ground beside a wall: the eaves that overhang the roof edge (per palette, roof material and open
// sides), chimneys, shop awnings and the lit window panes. One atlas, so they batch.
export const BLD_ATLAS = 'bld-atlas';
export const rimKey = (pal, kind, mask) => `rim-${pal}-${kind}-${mask}`;
export const litKey = (kind, curtain, tone) => `lit-${kind}-${curtain}-${tone}`;
export const CHIMNEY = { w: 13, h: 24 }; // base pixels; the base of the chimney is the bottom middle
export const AWNING = { w: 18, h: 10, dx: -1, dy: 9 }; // base pixels, offset from the tile's top left corner

function rimFrame(c, cfg, pal, kind, mask) {
  const { side, top } = cfg.overhang;
  const col = roofColors(pal, kind);
  const flat = kind === 'flat';
  const body = flat ? '#a5a9b0' : col.base;
  const edge = flat ? '#8a8e96' : col.dark;
  const sw = side * 2;
  const th = top * 2;
  const x0 = mask & 2 ? 0 : sw;
  const x1 = sw + U + (mask & 4 ? sw : 0);
  const lip = flat ? '#c9ccd2' : col.light;
  const shaded = flat ? '#8f939a' : shade(col.base, -0.2);
  const r = rng(hash(pal.id + kind + mask + 'rim'));
  // the outer edge is ragged (tiles and boards end a base pixel earlier or later), so a long roof never ends in one straight line
  const run = (from, to, fn) => { for (let t = from; t < to; t += 4) fn(t, Math.min(4, to - t), r() < 0.5 ? 0 : 2); };
  if (mask & 1) run(x0, x1, (x, w, d) => { px(c, body, x, d, w, th - d); px(c, edge, x, d, w, 1); px(c, lip, x, th - 2, w, 2); }); // north: the roof carries on past the edge
  const y0 = mask & 1 ? 0 : th;
  if (mask & 2) run(y0, th + U, (y, h, d) => { px(c, body, d, y, sw - d, h); px(c, edge, d, y, 1, h); px(c, lip, d + 1, y, 1, h); });
  if (mask & 4) run(y0, th + U, (y, h, d) => { const x = sw + U; px(c, shaded, x, y, sw - d, h); px(c, edge, x + sw - d - 1, y, 1, h); px(c, col.dark, x, y, 1, h); });
}

function chimneyFrame(c, pal) {
  const body = pal.brick ? '#8b4f3a' : mixc(pal.wall, '#5a3a2a', 0.55);
  for (let x = 4; x < 24; x += 2) px(c, 'rgba(0,0,0,0.3)', x, 43, 2, 2);
  px(c, '#16161e', 3, 11, 20, 34);
  px(c, body, 4, 14, 18, 30); px(c, shade(body, 0.22), 4, 14, 4, 30); px(c, shade(body, -0.3), 18, 14, 4, 30);
  for (let y = 17; y < 43; y += 4) px(c, shade(body, -0.35), 4, y, 18, 1);
  px(c, '#3a3f48', 1, 9, 24, 5); px(c, '#6b717a', 1, 9, 24, 1); px(c, '#22252b', 1, 13, 24, 1);
  px(c, '#16161e', 5, 10, 16, 2);
}

function awningFrame(c, set) {
  const [a, b] = AWNINGS[set];
  px(c, '#3a3f48', 2, 0, 32, 1);
  for (let x = 0; x < 32; x += 4) {
    const col = (x / 4) % 2 ? b : a;
    px(c, shade(col, 0.12), 2 + x, 1, 4, 3); px(c, col, 2 + x, 4, 4, 5); px(c, shade(col, -0.18), 2 + x, 9, 4, 3);
    px(c, shade(col, -0.2), 2 + x, 12, 4, 1); px(c, shade(col, -0.3), 2 + x + 3, 12, 1, 1);
  }
  for (let y = 13; y < 20; y++) for (let x = 2 + (y & 1); x < 34; x += 2) if (y < 17 || (x + y) % 4 === 0) px(c, 'rgba(10,16,40,0.3)', x, y, 1, 1);
}

function litFrame(c, kind, curtain, tone) {
  const t = tone ? { fill: '#a9d4ff', glow: '#e8f6ff', bar: '#4f78a8', edge: '#7fb2e8' } : { fill: '#ffcf6e', glow: '#ffeaa8', bar: '#b8741f', edge: '#f09a3a' };
  if (kind === 's') { // display window of a shop
    px(c, t.fill, 6, 15, 20, 9); px(c, t.glow, 8, 16, 10, 5); px(c, t.edge, 6, 23, 20, 1);
    px(c, t.bar, 15, 15, 2, 9);
    px(c, '#ffe9b0', 8, 22, 3, 2); px(c, '#ffd27a', 20, 21, 4, 3);
    return;
  }
  px(c, t.fill, 10, 7, 12, 12); px(c, t.glow, 11, 8, 8, 8); px(c, t.edge, 10, 18, 12, 1);
  const drape = tone ? '#5f86b8' : '#c4632d';
  if (curtain === 1 || curtain === 2) { px(c, drape, 10, 7, 4, 12); px(c, shade(drape, -0.25), 12, 7, 1, 12); if (curtain === 2) { px(c, drape, 18, 7, 4, 12); px(c, shade(drape, -0.25), 20, 7, 1, 12); } }
  if (curtain === 3) { px(c, '#fff3c8', 10, 7, 12, 6); px(c, t.edge, 10, 12, 12, 1); }
  px(c, t.bar, 15, 7, 2, 12); px(c, t.bar, 10, 12, 12, 1);
}

export function makeBuildingAtlas(scene, cfg, f) {
  const frames = [];
  const add = (name, w, h, draw) => frames.push({ name, w, h, draw });
  const { side, top } = cfg.overhang;
  for (const pal of PALS) {
    for (const kind of ROOFS) for (let mask = 1; mask < 8; mask++) add(rimKey(pal.id, kind, mask), 16 + 2 * side, 16 + top, c => rimFrame(c, cfg, pal, kind, mask));
    add(`chim-${pal.id}`, CHIMNEY.w, CHIMNEY.h, c => chimneyFrame(c, pal));
  }
  AWNINGS.forEach((_, set) => add(`awning-${set}`, AWNING.w, AWNING.h, c => awningFrame(c, set)));
  for (const tone of [0, 1]) {
    for (let cu = 0; cu < 4; cu++) add(litKey('w', cu, tone), 16, 16, c => litFrame(c, 'w', cu, tone));
    add(litKey('s', 0, tone), 16, 16, c => litFrame(c, 's', 0, tone));
  }
  const W = 512;
  let x = 0, y = 0, rowH = 0;
  const placed = frames.map(fr => {
    const fw = Math.round(fr.w * f);
    const fh = Math.round(fr.h * f);
    if (x + fw > W) { x = 0; y += rowH; rowH = 0; }
    const p = { fr, x, y, fw, fh };
    x += fw; rowH = Math.max(rowH, fh);
    return p;
  });
  if (scene.textures.exists(BLD_ATLAS)) scene.textures.remove(BLD_ATLAS);
  const tex = scene.textures.createCanvas(BLD_ATLAS, W, y + rowH);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  for (const { fr, x: px0, y: py0, fw, fh } of placed) {
    const src = document.createElement('canvas');
    src.width = fr.w * 2;
    src.height = fr.h * 2;
    fr.draw(src.getContext('2d'));
    ctx.drawImage(src, 0, 0, src.width, src.height, px0, py0, fw, fh);
    tex.add(fr.name, 0, px0, py0, fw, fh);
  }
  tex.refresh();
}
