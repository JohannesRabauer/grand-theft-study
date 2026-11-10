// Interior art of the home, school and dojo maps (AD-30, story 16.10, CAP-35). Everything is drawn on the 32 unit tile grid
// (1 unit = half a base pixel, structures in whole base pixels) into the ground bake, so nothing here costs a frame:
// - Walls have height: a cornice, wallpaper / paint / timber, a dado rail and a wainscot on the wall face tile, and the wall
//   keeps going 7 base pixels into the first floor row in front of it (`env-iwall-*`: wainscot, skirting board, radiator or
//   lockers, soft ambient occlusion where it meets the floor). Windows have frames, sills, curtains; lockers, boards and notice
//   boards are part of the face.
// - Floors by material: plank boards with a tone per board and butt joints (home, dojo), school linoleum, hall tiles with
//   grout and chips, tatami with hems; worn tiles along the walked paths; rugs; corner occlusion.
// - The furniture atlas (`int-atlas`) holds the pieces that stand in the room (shelves, desks, plants, toys, benches, lamps,
//   shafts of daylight); render/Interiors.js places them from data/interiors.json.
// The theme comes from the map id. Pure maths (which wall shows what, wear, lamps) is render/interiorMath.js.
import { U, rng, hash, shade, canvas, px, ell, emit } from './EnvDraw.js';
import { faceVariant, hash2, INTERIOR_MAPS, wearTiles } from '../render/interiorMath.js';
import { OUT } from './HiResArt.js';

const SIDES = ['n', 'e', 's', 'w'];
const CORNERS = ['nw', 'ne', 'se', 'sw'];
const OFF = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

const THEMES = {
  home: { wall: '#ead9bd', paper: '#dcc59e', cap: '#4a3b3f', base: '#6e4a33', rail: '#8a6a4a', trim: '#fff4dc', accent: '#c05a45', hall: ['#d8cdb8', '#c4b8a0'], wood: ['#bf8f58', '#ad7e4a', '#c99a63', '#b48552'] },
  school: { wall: '#e1eadf', paper: '#cfdccf', cap: '#3f4a52', base: '#58707a', rail: '#7f979e', trim: '#ffffff', accent: '#4f9b7a', hall: ['#cdd6d1', '#b7c2bd'], wood: ['#aab59a', '#9aa98c', '#b4bba0', '#a1ad92'] },
  dojo: { wall: '#d9c79c', paper: '#c9b484', cap: '#3a2a1e', base: '#4a3322', rail: '#6b4a30', trim: '#f5ecd2', accent: '#a43a2e', hall: ['#b79a6a', '#a88a5c'], wood: ['#b5854e', '#a47843', '#bd8e57', '#9c703f'] },
  default: { wall: '#d7d9de', paper: '#c8cbd2', cap: '#3d4350', base: '#5c6272', rail: '#7a8396', trim: '#ffffff', accent: '#4f7fb5', hall: ['#c9ccd2', '#b4b8c0'], wood: ['#b0824c', '#a37640', '#b98a53', '#9d7141'] }
};
const THEME_IDS = Object.keys(THEMES);
const FACES = ['plain', 'window', 'picture', 'clock', 'locker', 'notice', 'board-l', 'board-m', 'board-r', 'shoji', 'scroll'];
const FOOTS = ['plain', 'window', 'locker'];
const RUGS = {
  home: [{ x: 3, y: 2, w: 6, h: 5, style: 'home' }, { x: 10, y: 10, w: 4, h: 6, style: 'runner' }],
  school: [{ x: 1, y: 6, w: 4, h: 4, style: 'kids' }]
};
const RUG_STYLES = {
  home: { body: '#b5513c', band: '#f0dfb8', dark: '#7d2f27' },
  runner: { body: '#3f6f8f', band: '#e8dcc0', dark: '#27465e' },
  kids: { body: '#e3b447', band: '#f4ead0', dark: '#2f6b52' }
};

const themeName = mapId => (THEMES[mapId] ? mapId : 'default');
const isRoom = mapId => INTERIOR_MAPS.includes(mapId);

// ------------------------------------------------------------------------------------------------ walls

// The wainscot (the lower wall): panels in the base colour, the same pattern on the face tile (y 28..31) and the wall foot (y 0..9),
// so both halves line up. Vertical boards in the home and the dojo, painted wood with a joint every tile half in the school.
function wain(c, th, theme, y0, y1) {
  const h = y1 - y0;
  px(c, th.base, 0, y0, U, h);
  const step = theme === 'school' ? 16 : 8;
  for (let x = 0; x < U; x += step) { px(c, shade(th.base, -0.3), x, y0, 1, h); px(c, shade(th.base, 0.16), x + 1, y0, 1, h); }
  if (theme === 'dojo') for (let x = 4; x < U; x += 8) px(c, shade(th.base, 0.07), x, y0, 2, h);
}

function wallBase(c, th, theme, seed) {
  const r = rng(seed);
  px(c, th.cap, 0, 0, U, 2);                                   // the top edge, where the ceiling meets the wall
  px(c, th.trim, 0, 2, U, 2);                                  // cornice
  px(c, shade(th.trim, -0.18), 0, 3, U, 1);
  px(c, th.wall, 0, 4, U, 20);                                 // the wall surface
  if (theme === 'home') {                                      // striped wallpaper with small sprigs
    for (let x = 0; x < U; x += 8) px(c, th.paper, x, 4, 4, 20);
    for (let x = 2; x < U; x += 8) for (let y = 9; y < 22; y += 6) px(c, shade(th.paper, -0.12), x, y + (x % 16 ? 3 : 0), 2, 2);
  } else if (theme === 'school') {                             // painted wall: two tones and a stripe, speckled
    px(c, th.paper, 0, 18, U, 6);
    px(c, th.accent, 0, 18, U, 2);
    for (let i = 0; i < 18; i++) px(c, shade(th.wall, r() < 0.5 ? -0.07 : 0.05), Math.floor(r() * U), 6 + Math.floor(r() * 11), 2, 1);
  } else {                                                     // dojo: plaster between timber posts
    for (let i = 0; i < 20; i++) px(c, shade(th.wall, r() < 0.5 ? -0.07 : 0.06), Math.floor(r() * U), 6 + Math.floor(r() * 16), 2, 1);
  }
  px(c, 'rgba(0,0,0,0.2)', 0, 4, U, 2);                        // soft shadow under the cornice
  px(c, 'rgba(0,0,0,0.09)', 0, 6, U, 2);
  px(c, shade(th.rail, 0.28), 0, 24, U, 1);                    // dado rail
  px(c, th.rail, 0, 25, U, 2);
  px(c, shade(th.rail, -0.38), 0, 27, U, 1);
  wain(c, th, theme, 28, 32);
}

function faceTile(theme, variant) {
  const th = THEMES[theme];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  wallBase(c, th, theme, hash(theme + variant));
  const frame = '#f4efe2';
  if (theme === 'dojo' && variant !== 'shoji') { // vertical timber boards
    for (let x = 0; x < U; x += 8) { px(c, shade(th.wall, -0.18), x, 4, 1, 20); px(c, shade(th.wall, 0.12), x + 1, 4, 1, 20); }
  }
  if (variant === 'window') {
    px(c, shade(th.base, -0.1), 4, 5, 24, 21);                 // the opening's reveal (wall thickness)
    px(c, frame, 5, 6, 22, 19);
    for (const [y, h, col] of [[8, 5, '#8fc7ee'], [13, 4, '#a9d8f4'], [17, 6, '#cbe9fa']]) px(c, col, 7, y, 18, h);
    px(c, '#ffffff', 10, 9, 4, 1); px(c, '#ffffff', 12, 10, 2, 1);
    px(c, frame, 15, 8, 2, 15); px(c, frame, 7, 15, 18, 2);   // the glazing bars
    px(c, shade(frame, -0.2), 5, 24, 22, 1);
    px(c, th.trim, 3, 26, 26, 2); px(c, shade(th.trim, -0.2), 3, 28, 26, 1);  // sill that reaches out over the dado
    px(c, 'rgba(0,0,0,0.22)', 3, 29, 26, 1);
    if (theme === 'home') {                                    // curtains with a tie-back
      for (const x of [3, 25]) { px(c, '#c05a45', x, 5, 4, 22); px(c, '#8a3a2e', x + (x < 10 ? 3 : 0), 5, 1, 22); px(c, '#e08a74', x + 1, 5, 1, 22); }
      px(c, '#6e4a33', 2, 5, 28, 1);
      px(c, '#e8b830', 3, 18, 4, 1); px(c, '#e8b830', 25, 18, 4, 1);
    }
  } else if (variant === 'picture') {
    px(c, '#2c1f14', 8, 7, 16, 13); px(c, '#6e4a33', 9, 8, 14, 11); px(c, '#f2ead6', 10, 9, 12, 9);
    px(c, '#8fc7ee', 11, 10, 10, 4); px(c, '#6cae5e', 11, 14, 10, 3); px(c, '#ffd84d', 17, 11, 2, 2);
    px(c, 'rgba(255,255,255,0.35)', 9, 8, 14, 1);
  } else if (variant === 'clock') {
    ell(c, '#2a2a2e', 16, 14, 8, 8); ell(c, '#f4f1e6', 16, 14, 6.5, 6.5);
    px(c, '#222', 16, 9, 1, 5); px(c, '#222', 16, 14, 4, 1); px(c, '#c0392b', 16, 14, 1, 1);
    for (const [x, y] of [[16, 8], [16, 19], [11, 14], [21, 14]]) px(c, '#222', x, y, 1, 1);
  } else if (variant === 'locker') {
    const col = '#4f7fb5';
    for (const x of [1, 17]) {
      px(c, '#2c4a6b', x, 5, 14, 27); px(c, col, x + 1, 6, 12, 25); px(c, shade(col, 0.25), x + 1, 6, 12, 1);
      for (let y = 8; y < 14; y += 2) px(c, '#2c4a6b', x + 3, y, 6, 1);
      px(c, '#d8dde3', x + 10, 17, 2, 4); px(c, '#2c4a6b', x + 1, 22, 12, 1);
      px(c, 'rgba(255,255,255,0.14)', x + 1, 6, 2, 25);
    }
  } else if (variant === 'notice') {
    px(c, '#6e4a33', 5, 6, 22, 17); px(c, '#c9955a', 6, 7, 20, 15);
    px(c, '#fff3b0', 8, 9, 6, 5); px(c, '#f4a6b8', 16, 8, 7, 6); px(c, '#b9e3f5', 11, 15, 8, 4); px(c, '#d33', 11, 9, 1, 1); px(c, '#d33', 19, 9, 1, 1);
  } else if (variant.startsWith('board')) {
    const l = variant === 'board-l';
    const rr = variant === 'board-r';
    const x0 = l ? 3 : 0;
    const w = U - x0 - (rr ? 3 : 0);
    px(c, '#5a3d2b', x0, 6, w, 18);
    px(c, '#27493f', x0 + (l ? 1 : 0), 7, w - (l ? 1 : 0) - (rr ? 1 : 0), 14);
    px(c, '#34594d', x0 + (l ? 1 : 0), 7, w - (l ? 1 : 0) - (rr ? 1 : 0), 1);
    px(c, '#8a6b4a', x0, 22, w, 2); px(c, '#b08a5e', x0, 22, w, 1); // chalk tray
    if (variant === 'board-m') {
      for (const [x, y, ww] of [[3, 10, 12], [6, 13, 18], [12, 16, 10]]) px(c, 'rgba(240,240,230,0.72)', x, y, ww, 1);
      px(c, '#f4f1e6', 24, 21, 3, 1); px(c, '#e8e0c8', 20, 21, 3, 1); px(c, '#3b3b3f', 4, 21, 5, 1);   // chalk and a sponge
    }
    if (l) px(c, 'rgba(240,240,230,0.72)', 8, 11, 10, 1);
    px(c, 'rgba(240,240,230,0.2)', x0 + 4, 8, 6, 3); // chalk dust smear
  } else if (variant === 'shoji') {
    px(c, '#3a2a1e', 3, 6, 26, 22); px(c, '#f6f0dc', 4, 7, 24, 20);
    for (const x of [10, 16, 22]) px(c, '#3a2a1e', x, 7, 1, 20);
    for (const y of [13, 20]) px(c, '#3a2a1e', 4, y, 24, 1);
    px(c, 'rgba(255,255,255,0.5)', 5, 8, 4, 1);
  } else if (variant === 'scroll') {
    px(c, '#3a2a1e', 11, 6, 10, 1); px(c, '#3a2a1e', 11, 23, 10, 2);
    px(c, '#efe4c4', 12, 7, 8, 16);
    for (const [y, w] of [[10, 4], [13, 5], [16, 3], [19, 4]]) px(c, '#2a1d14', 14, y, w, 2);
    px(c, th.accent, 17, 20, 2, 2);
  }
  return tmp;
}

// The wall foot: the wall carries on 7 base pixels into the floor tile in front of it (wainscot, skirting board), with soft
// occlusion on the floor. Transparent below the occlusion, drawn on top of the floor.
function wallFoot(theme, kind) {
  const th = THEMES[theme];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  wain(c, th, theme, 0, 10);
  if (kind === 'window' && theme !== 'dojo') {                // a radiator under the window
    px(c, 'rgba(0,0,0,0.2)', 6, 2, 22, 8);
    px(c, '#e9ecef', 6, 0, 20, 9); px(c, '#ffffff', 6, 0, 20, 1);
    for (let x = 7; x < 25; x += 3) px(c, '#c4c9ce', x, 1, 1, 8);
    px(c, '#8d949b', 6, 9, 20, 1); px(c, '#8d949b', 25, 1, 1, 8);
    px(c, '#c05a45', 4, 6, 2, 2);
  }
  if (kind === 'locker') {                                    // the lockers reach the floor, vents low down, feet
    const col = '#4f7fb5';
    px(c, th.cap, 0, 0, U, 14);
    for (const x of [1, 17]) {
      px(c, '#2c4a6b', x, 0, 14, 13); px(c, col, x + 1, 0, 12, 11); px(c, 'rgba(255,255,255,0.14)', x + 1, 0, 2, 11);
      for (let y = 6; y < 11; y += 2) px(c, '#2c4a6b', x + 3, y, 6, 1);
      px(c, '#1c3045', x, 12, 14, 2);
    }
  } else {
    px(c, shade(th.base, 0.3), 0, 10, U, 1);                  // skirting board
    px(c, th.base, 0, 11, U, 2);
    px(c, shade(th.base, -0.38), 0, 13, U, 1);
  }
  const ao = [0.36, 0.24, 0.14, 0.06];                       // occlusion on the floor, one band per base pixel
  ao.forEach((a, i) => px(c, `rgba(22,14,16,${a})`, 0, 14 + i * 2, U, 2));
  for (let x = 0; x < U; x += 4) px(c, 'rgba(22,14,16,0.05)', x, 22, 2, 1);
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
  for (let x = 0; x < U; x += 16) px(c, shade(th.cap, 0.08), x, 8, 1, 16); // brick joints of the wall top
  return tmp;
}

// ------------------------------------------------------------------------------------------------ floors

// Plank boards: four boards a tile, each with a butt joint somewhere and a tone of its own on either side of it, grain strokes,
// knots and nail heads, so no two neighbours repeat and no board seam runs for a whole room.
function plankFloor(theme, v) {
  const th = THEMES[theme];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(theme + 'plank') + v * 131);
  for (let row = 0; row < 4; row++) {
    const y = row * 8;
    const joint = 6 + Math.floor(r() * 20);
    let last = -1;
    [[0, joint], [joint, U]].forEach(([x0, x1]) => {
      let k = Math.floor(r() * th.wood.length);
      if (k === last) k = (k + 1) % th.wood.length;
      last = k;
      const tone = th.wood[k];
      px(c, tone, x0, y, x1 - x0, 8);
      px(c, shade(tone, 0.12), x0, y, x1 - x0, 2);             // the lit edge of the board
      px(c, shade(tone, -0.3), x0, y + 7, x1 - x0, 1);         // the seam
      px(c, shade(tone, -0.12), x0, y + 6, x1 - x0, 1);
      for (let g = 0; g < 3; g++) {
        const gx = x0 + 1 + Math.floor(r() * Math.max(1, x1 - x0 - 8));
        px(c, shade(tone, r() < 0.5 ? -0.1 : 0.08), gx, y + 2 + Math.floor(r() * 4), 4 + Math.floor(r() * 6), 1);
      }
      if (r() < 0.2) { ell(c, shade(tone, -0.22), x0 + 4 + r() * (x1 - x0 - 8), y + 4, 2.2, 1.5); }
      px(c, shade(tone, -0.4), x0 + 1, y + 3, 1, 1); px(c, shade(tone, -0.4), x1 - 2, y + 3, 1, 1);
    });
    px(c, shade(th.wood[0], -0.34), joint, y, 1, 8);
  }
  return tmp;
}

// School linoleum: 16 unit squares in three greens with jointed edges, flecks and chips.
function linoFloor(theme, v) {
  const th = THEMES[theme];
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(theme + 'lino') + v * 71);
  for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
    const tone = th.wood[(sx * 2 + sy + v) % th.wood.length];
    const x0 = sx * 16, y0 = sy * 16;
    px(c, tone, x0, y0, 16, 16);
    for (let i = 0; i < 10; i++) px(c, shade(tone, r() < 0.5 ? -0.1 : 0.1), x0 + 1 + Math.floor(r() * 13), y0 + 1 + Math.floor(r() * 13), 2, 1);
    for (let i = 0; i < 3; i++) px(c, r() < 0.5 ? '#d9d4b8' : '#7e8f74', x0 + 1 + Math.floor(r() * 13), y0 + 1 + Math.floor(r() * 13), 1, 1);
    px(c, shade(tone, 0.14), x0, y0, 16, 1);
    px(c, shade(tone, -0.26), x0, y0 + 15, 16, 1);
    px(c, shade(tone, -0.18), x0 + 15, y0, 1, 16);
  }
  return tmp;
}

// Hall tiles: 16 unit squares in two tones, a bevel and grout; variants 2 and 3 are cracked / chipped.
function hallFloor(theme, k) {
  const th = THEMES[theme];
  const parity = k & 1;
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(theme + 'hall') + k * 17);
  for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
    const col = th.hall[(sx + sy + parity) & 1];
    const x0 = sx * 16, y0 = sy * 16;
    px(c, col, x0, y0, 16, 16);
    for (let i = 0; i < 14; i++) px(c, shade(col, r() < 0.5 ? -0.05 : 0.06), x0 + Math.floor(r() * 15), y0 + Math.floor(r() * 15), 2, 1);
    px(c, shade(col, 0.16), x0, y0, 16, 1);
    px(c, shade(col, 0.1), x0, y0, 1, 16);
    px(c, shade(col, -0.2), x0, y0 + 15, 16, 1);
    px(c, shade(col, -0.14), x0 + 15, y0, 1, 16);
  }
  if (k & 2) {                                                  // a hairline crack and a chipped corner
    let x = 5 + Math.floor(r() * 8), y = 2;
    for (; y < 30; y += 2) { px(c, 'rgba(40,36,36,0.45)', x, y, 1, 2); x += r() < 0.5 ? 1 : -1; if (r() < 0.2) break; }
    px(c, shade(th.hall[0], -0.28), 30, 30, 2, 2);
  }
  return tmp;
}

// Tatami: 4 unit weave bands with fibre ticks, a binding along both long edges and a dark end on the mat's ends.
function tatamiTile(side, v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const tones = [['#c9c27c', '#bdb66f'], ['#c4bd77', '#b8b16a'], ['#cdc683', '#c1ba75']][v];
  px(c, tones[0], 0, 0, U, U);
  for (let y = 0; y < U; y += 8) px(c, tones[1], 0, y + 4, U, 4);
  for (let y = 0; y < U; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < U; x += 8) px(c, shade(tones[0], 0.1), x, y + 1, 2, 1);
  px(c, '#4d5c30', 0, 0, U, 2); px(c, '#6d7e43', 0, 2, U, 1);   // binding on both long edges
  px(c, '#4d5c30', 0, U - 3, U, 3); px(c, '#38441f', 0, U - 1, U, 1);
  const x = side === 'L' ? 0 : U - 2;
  px(c, '#2b3a1c', x, 0, 2, U);
  return tmp;
}

// Wear: scuffs and a polished sheen along the walked tiles (drawn translucent over the floor), three variants, two strengths.
function wearTile(k, strong) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(9100 + k * 37 + (strong ? 400 : 0));
  const n = strong ? 9 : 5;
  for (let i = 0; i < n; i++) px(c, 'rgba(255,244,214,0.14)', Math.floor(r() * 24), Math.floor(r() * 30), 4 + Math.floor(r() * 6), 2);
  for (let i = 0; i < n - 1; i++) px(c, 'rgba(70,46,24,0.06)', Math.floor(r() * 26), Math.floor(r() * 30), 3 + Math.floor(r() * 5), 1);
  if (strong) px(c, 'rgba(255,244,214,0.1)', 4, 8 + k * 4, 24, 6);
  return tmp;
}

function aoCorner() {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  [[0.3, 6], [0.2, 4], [0.1, 2]].forEach(([a, s]) => px(c, `rgba(22,14,16,${a})`, 0, 0, s, s));
  return tmp;
}

function floorShadeSide() {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  [0.28, 0.17, 0.08].forEach((a, i) => px(c, `rgba(22,14,16,${a})`, 0, i * 2, U, 2));
  return tmp;
}

function lightPatch() {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  c.fillStyle = 'rgba(255,240,180,0.2)';
  c.beginPath(); c.moveTo(6, 0); c.lineTo(26, 0); c.lineTo(31, 16); c.lineTo(11, 16); c.closePath(); c.fill();
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

// A rug part: 'm' inner, edges n/e/s/w (drawn for n, rotated), corners nw/ne/se/sw (drawn for nw, rotated). The inner part is quilted
// in 8 base pixel squares so a big rug is never one flat field.
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
  if (part === 'm') {
    for (const [x, y] of [[0, 0], [16, 16]]) px(c, shade(st.body, 0.17), x, y, 16, 16);   // quilting
    px(c, shade(st.body, -0.2), 0, 0, U, 1); px(c, shade(st.body, -0.2), 0, 16, U, 1);
    px(c, shade(st.body, -0.2), 0, 0, 1, U); px(c, shade(st.body, -0.2), 16, 0, 1, U);
    for (let i = 0; i < 5; i++) { px(c, st.band, 8 - i, 5 + i, 1 + i * 2, 1); px(c, st.band, 24 - i, 21 + i, 1 + i * 2, 1); }
  }
  if (edge || corner) {
    px(c, st.dark, x0, y0, U - x0, 1);
    px(c, st.band, x0, y0 + 2, U - x0, 2);
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

// What lies beyond the walls (seen when the room is smaller than the view): the masonry of the building's outside, in
// 8 x 4 base pixel bricks in four tones, so the margin is never a flat black field. Tiled by a tile sprite.
function backdropTile() {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const tones = ['#2c2630', '#4c3e50', '#605060', '#3e3434'];
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 8 : 0;
    for (let x = -16 + off; x < U; x += 16) {
      const k = Math.floor(hash2(x + 40, row + 9) * 4);
      px(c, tones[k], x, row * 8, 16, 8);
      px(c, shade(tones[k], 0.1), x, row * 8, 16, 1);
      px(c, shade(tones[k], -0.2), x + 15, row * 8, 1, 8);
    }
  }
  return tmp;
}

export const BACKDROP = 'int-backdrop';

export function makeInteriorArt(scene, size) {
  for (const theme of THEME_IDS) {
    for (const v of FACES) emit(scene, `env-iface-${theme}-${v}`, faceTile(theme, v), size);
    for (const k of FOOTS) emit(scene, `env-iwall-${theme}-${k}`, wallFoot(theme, k), size);
    emit(scene, `env-icap-${theme}`, capTile(theme), size);
    for (let p = 0; p < 4; p++) emit(scene, `env-ihall-${theme}-${p}`, hallFloor(theme, p), size);
    for (const part of ['l', 'm', 'r']) emit(scene, `env-idoor-${theme}-${part}`, doorWall(theme, part), size);
    for (let v = 0; v < 3; v++) { emit(scene, `env-iplank-${theme}-${v}`, plankFloor(theme, v), size); emit(scene, `env-ilino-${theme}-${v}`, linoFloor(theme, v), size); }
  }
  const side = floorShadeSide();
  SIDES.forEach((s, rot) => emit(scene, `env-ishade-${s}`, side, size, rot)); // drawn for the north side, rotated for the others
  const ao = aoCorner();
  CORNERS.forEach((s, rot) => emit(scene, `env-iaoc-${s}`, ao, size, rot));
  emit(scene, 'env-ilight', lightPatch(), size);
  for (const part of ['l', 'm', 'r']) emit(scene, `env-imat-${part}`, doorMat(part), size);
  for (const side2 of ['L', 'R']) for (let v = 0; v < 3; v++) emit(scene, `env-itatami-${side2}-${v}`, tatamiTile(side2, v), size);
  for (let k = 0; k < 3; k++) for (const s of [0, 1]) emit(scene, `env-iwear-${k}-${s}`, wearTile(k, !!s), size);
  for (const style of Object.keys(RUG_STYLES)) {
    emit(scene, `env-rug-${style}-m`, rugPart(style, 'm'), size);
    const e = rugPart(style, 'n');
    SIDES.forEach((s, rot) => emit(scene, `env-rug-${style}-${s}`, e, size, rot));
    const k = rugPart(style, 'nw');
    CORNERS.forEach((s, rot) => emit(scene, `env-rug-${style}-${s}`, k, size, rot));
  }
  emit(scene, BACKDROP, backdropTile(), size);
}

// ------------------------------------------------------------------------------------------------ per map keys

const INDOOR = new WeakMap(); // map -> { doorWalls, doorFloors, wear, mats } derived once from the objects

export function indoorInfo(map, mapId) {
  let info = INDOOR.get(map);
  if (info) return info;
  info = { doorWalls: new Map(), doorFloors: new Map(), wear: new Map(), mats: null };
  for (const o of map.objects ?? []) {
    if (o.type === 'door') {
      for (let i = 0; i < o.w; i++) {
        const part = o.w === 1 ? 'm' : i === 0 ? 'l' : i === o.w - 1 ? 'r' : 'm';
        info.doorWalls.set(`${o.x + i},${o.y + o.h}`, part);
        for (let j = 0; j < o.h; j++) info.doorFloors.set(`${o.x + i},${o.y + j}`, part);
      }
    } else if (o.type === 'dojo' && o.role === 'mats') info.mats = o;
  }
  INDOOR.set(map, info);
  return info;
}

// Wear paths need the room data; set once by the boot code (data/interiors.json) before the first map is drawn.
let ROOMS = null;
export const setInteriorRooms = rooms => { ROOMS = rooms; };

export function indoorKeys(map, tx, ty, baseKey, mapId) {
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const idAt = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? null : map.legend[map.rows[y][x]]);
  const theme = themeName(mapId);
  const room = isRoom(mapId);
  const id = idAt(tx, ty);
  const info = indoorInfo(map, mapId);
  if (id === 'wall') {
    const door = info.doorWalls.get(`${tx},${ty}`);
    if (door) return [`env-idoor-${theme}-${door}`];
    const south = idAt(tx, ty + 1);
    if (south && south !== 'wall') return [`env-iface-${theme}-${faceVariant(mapId, tx, south)}`];
    return [`env-icap-${theme}`];
  }
  const h = hash2(tx, ty);
  const keys = [];
  if (id === 'concrete') keys.push(`env-ihall-${theme}-${((tx + ty) & 1) | (room && h < 0.22 ? 2 : 0)}`);
  else if (room && id === 'tatami' && info.mats) {
    const m = info.mats;
    const rel = tx - m.x, r = ty - m.y;
    keys.push(`env-itatami-${(rel + (r % 2)) % 2 === 0 ? 'L' : 'R'}-${Math.floor(hash2(tx + 11, ty) * 3)}`);
  } else if (room && id === 'wood') keys.push(mapId === 'school' ? `env-ilino-school-${Math.floor(h * 3)}` : `env-iplank-${theme}-${Math.floor(h * 3)}`);
  else keys.push(baseKey);
  if (room && ROOMS) {
    let wear = info.wear.get(mapId);
    if (!wear) { wear = wearTiles(map, ROOMS[mapId]); info.wear.set(mapId, wear); }
    const lv = wear.get(`${tx},${ty}`);
    if (lv && id !== 'tatami') keys.push(`env-iwear-${Math.floor(hash2(tx, ty + 3) * 3)}-${lv > 1 ? 1 : 0}`);
  }
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
  const wallAt = (x, y) => idAt(x, y) === 'wall';
  if (wallAt(tx, ty - 1)) {
    const v = faceVariant(mapId, tx, id);
    keys.push(`env-iwall-${theme}-${v === 'window' ? 'window' : v === 'locker' ? 'locker' : 'plain'}`);
  }
  for (const s of ['e', 'w', 's']) if (wallAt(tx + OFF[s][0], ty + OFF[s][1])) keys.push(`env-ishade-${s}`);
  for (const k of CORNERS) {
    const [dx, dy] = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] }[k];
    const [a, b] = { nw: ['n', 'w'], ne: ['n', 'e'], se: ['s', 'e'], sw: ['s', 'w'] }[k];
    if (wallAt(tx + dx, ty + dy) && !wallAt(tx + OFF[a][0], ty + OFF[a][1]) && !wallAt(tx + OFF[b][0], ty + OFF[b][1])) keys.push(`env-iaoc-${k}`);
  }
  const mat = info.doorFloors.get(`${tx},${ty}`);
  if (mat) keys.push(`env-imat-${mat}`);
  return keys;
}
