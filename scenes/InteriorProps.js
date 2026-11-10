// The furniture atlas of the interiors (story 16.10, CAP-35): shelves, desks, plants, toys, benches, lamps and the shafts of
// daylight, drawn once at boot into one texture (`int-atlas`) and placed by render/Interiors.js from data/interiors.json.
// Frames are authored in base pixels (half pixels allowed) with a one pixel margin that carries the outline (OUT) of every piece,
// light from the top left: lit top and left edges, shaded bottom and right, a dithered contact shadow under what stands on the floor.
import { OUT } from './HiResArt.js';
import { shade, rng, hash } from './EnvDraw.js';

export const ATLAS = 'int-atlas';
export const GLOW = 'int-glow';

const WOOD = { shadow: '#3d2814', dark: '#5e3e22', base: '#8c5f2e', light: '#c4915a', hi: '#e2b684' };
const BOOKS = ['#c0392b', '#2f6fb0', '#e8b830', '#3f8a3c', '#8e5bb0', '#e07a3a', '#f2ead6', '#3aa6a0'];
const CLAY = { dark: '#8a4a2e', base: '#b9653f', light: '#d98a5e' };

// Placement kinds: wall pieces stand against the wall in front of the floor row y (bottom 8 px into the row, `lift` higher for
// things on the wall), floor pieces stand in the tile (x may be fractional), desks sit where the old School.js desks were.
export const PROPS = {
  shelf: { n: 3, w: 32, h: 22, kind: 'wall' },
  bookcase: { n: 2, w: 32, h: 15, kind: 'wall' },
  drawings: { n: 2, w: 16, h: 12, kind: 'wall', lift: 10 },
  hooks: { n: 3, w: 16, h: 18, kind: 'wall', lift: 3 },
  dresser: { n: 1, w: 32, h: 15, kind: 'wall' },
  cabinet: { n: 1, w: 32, h: 14, kind: 'wall' },
  bokken: { n: 1, w: 14, h: 22, kind: 'wall' },
  bench: { n: 2, w: 30, h: 10, kind: 'floor' },
  'plant-tall': { n: 2, w: 14, h: 26, kind: 'floor' },
  'plant-pot': { n: 2, w: 10, h: 12, kind: 'floor' },
  toybox: { n: 1, w: 16, h: 10, kind: 'floor' },
  toys: { n: 2, w: 14, h: 6, kind: 'floor' },
  shoes: { n: 1, w: 18, h: 7, kind: 'floor' },
  umbrella: { n: 1, w: 8, h: 13, kind: 'floor' },
  'teacher-desk': { n: 1, w: 44, h: 17, kind: 'floor' },
  desk: { n: 3, w: 32, h: 27, kind: 'desk' },
  cushion: { n: 3, w: 12, h: 7, kind: 'floor' },
  bin: { n: 1, w: 9, h: 12, kind: 'floor' },
  bonsai: { n: 2, w: 13, h: 17, kind: 'floor' },
  andon: { n: 1, w: 10, h: 22, kind: 'floor' },
  zabuton: { n: 3, w: 12, h: 6, kind: 'floor' },
  shoji: { n: 1, w: 30, h: 12, kind: 'wall', lift: 10 },
  geta: { n: 2, w: 12, h: 5, kind: 'floor' }
};
// Lamps: `base` frames are always drawn, `lit` frames fade in over them; `lift` is how far above its floor position a hanging lamp
// floats (the light falls on the floor below it).
export const LAMPS = {
  pendant: { w: 12, h: 16, lift: 20, base: true },
  tube: { w: 26, h: 8, lift: 22, base: true },
  paper: { w: 14, h: 17, lift: 22, base: true },
  table: { w: 8, h: 9, lift: 0, base: false },
  andon: { w: 10, h: 22, lift: 0, base: false }
};
export const SHAFT = { w: [20, 36], h: 36, skew: [-6, 0, 6] };

// ---------------------------------------------------------------------------------------------------------- drawing helpers

function pen(c) {
  const R = (col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(Math.round((x + 1) * 2), Math.round((y + 1) * 2), Math.max(1, Math.round(w * 2)), Math.max(1, Math.round(h * 2))); };
  const E = (col, cx, cy, rx, ry) => {
    for (let y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) >= 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
      if (x1 > x0) R(col, x0, y, x1 - x0, 1);
    }
  };
  return { R, E };
}

// the contact shadow: a dithered ellipse, solid core and checker rim, in whole base pixels
function contact(p, cx, cy, rx, ry) {
  p.E('rgba(26,32,70,0.42)', cx, cy, rx, ry);
  for (let x = Math.round(cx - rx - 1); x <= Math.round(cx + rx); x++) if ((x & 1) === 0) p.R('rgba(26,32,70,0.22)', x, Math.round(cy + ry - 1), 1, 1);
}

function outline(src, w, h) {
  const c = src.getContext('2d');
  const d = c.getImageData(0, 0, w * 2, h * 2).data;
  const on = (i, j) => i >= 0 && j >= 0 && i < w && j < h && d[((j * 2) * w * 2 + i * 2) * 4 + 3] > 120;
  c.fillStyle = OUT;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) c.fillRect(i * 2, j * 2, 2, 2);
}

function books(p, x0, x1, y, h, r, tall = 1) {
  let x = x0;
  while (x < x1 - 1) {
    const w = 2 + (r() < 0.35 ? 1 : 0);
    if (x + w > x1) break;
    if (r() < 0.12) { x += 1; continue; }
    const ht = Math.max(3, h - 1 - Math.floor(r() * 2 * tall));
    const col = BOOKS[Math.floor(r() * BOOKS.length)];
    p.R(col, x, y + h - ht, w, ht);
    p.R(shade(col, 0.28), x, y + h - ht, 1, ht);
    p.R(shade(col, -0.3), x + w - 1, y + h - ht, 1, ht);
    if (r() < 0.4) p.R('#f4efe2', x, y + h - ht + 1, w, 1);
    x += w;
  }
}

function box(p, x, y, w, h, tone) {
  p.R(tone.base, x, y, w, h);
  p.R(tone.light, x, y, w, 1); p.R(tone.light, x, y, 1, h);
  p.R(tone.dark, x + w - 1, y + 1, 1, h - 1); p.R(tone.dark, x, y + h - 1, w, 1);
}

// ---------------------------------------------------------------------------------------------------------- pieces

const DRAW = {
  shelf(p, v) {
    const r = rng(hash('shelf') + v * 7);
    p.R(WOOD.dark, 0, 0, 32, 22);
    p.R(WOOD.shadow, 1, 1, 30, 20);
    for (const y of [7, 14, 21]) p.R(WOOD.light, 0, y, 32, 1);
    p.R(WOOD.hi, 0, 0, 32, 1); p.R(WOOD.light, 0, 0, 1, 22); p.R(WOOD.dark, 31, 1, 1, 21);
    books(p, 1, v === 1 ? 20 : 30, 1, 6, r);
    books(p, 1, v === 2 ? 22 : 30, 8, 6, r);
    books(p, 1, 20, 15, 6, r);
    if (v === 0) { p.R(CLAY.base, 24, 4, 4, 3); p.R(CLAY.light, 24, 4, 4, 1); p.E('#3f8a3c', 26, 3, 3, 2); p.E('#5aa84c', 25.5, 2.5, 1.8, 1.2); }
    if (v === 1) { p.R('#d98a5e', 22, 4, 5, 3); p.E('#d98a5e', 24.5, 3, 2.5, 2); p.R(OUT, 23, 2.5, 1, 1); p.R(OUT, 25, 2.5, 1, 1); p.R('#e8b830', 28, 5, 2, 2); p.R('#c0392b', 28, 3, 2, 2); }
    if (v === 2) { p.E('#2f6fb0', 26, 11, 3, 3); p.E('#6cae5e', 25, 10, 1.6, 1.5); p.R(WOOD.base, 25, 13, 2, 1); }
    p.R('#e8b830', 23, 16, 4, 4); p.R('#b9653f', 24, 17, 2, 2); p.R('#f2ead6', 27, 17, 3, 3);
  },
  bookcase(p, v) {
    const r = rng(hash('bookcase') + v * 5);
    p.R(WOOD.dark, 0, 0, 32, 15);
    p.R(WOOD.shadow, 1, 1, 30, 13);
    p.R(WOOD.hi, 0, 0, 32, 1); p.R(WOOD.light, 0, 7, 32, 1);
    if (v === 1) {
      for (let x = 1; x < 30; x += 3) { const col = ['#2f6fb0', '#3f8a3c', '#c0392b', '#e8b830'][(x / 3 | 0) % 4]; p.R(col, x, 1, 2, 6); p.R('#f4efe2', x, 3, 2, 2); p.R(col, x, 8, 2, 6); p.R('#f4efe2', x, 10, 2, 2); }
    } else { books(p, 1, 30, 1, 6, r); books(p, 1, 30, 8, 6, r); }
    p.R(WOOD.light, 0, 14, 32, 1);
  },
  drawings(p, v) {
    const paper = (x, y, w, h, col) => { p.R('#f6f1e2', x, y, w, h); p.R(col, x + 1, y + 1, w - 2, h - 2); };
    if (v === 0) {
      p.R('#f6f1e2', 1, 2, 7, 8); p.R('#c0392b', 2, 5, 5, 4); p.R('#8c5f2e', 3, 6, 1, 3); p.R('#8fc7ee', 4.5, 7, 1.5, 1.5); p.R('#ffd84d', 5, 3, 2, 2);
      p.R('#f6f1e2', 9, 1, 6, 9); p.E('#3f8a3c', 12, 4, 2.4, 2.4); p.R('#8c5f2e', 11.5, 5.5, 1, 4); p.R('#e8b830', 10, 2, 1, 1);
      p.R('#e04a4a', 4, 1.5, 1, 1); p.R('#4a8ae0', 11.5, 0.5, 1, 1);
    } else {
      paper(0, 3, 5, 6, '#b9e3f5'); p.R('#f4a6b8', 1, 6, 3, 2);
      paper(6, 1, 5, 7, '#fff3b0'); p.R('#e04a4a', 7, 3, 3, 1); p.R('#4a8ae0', 7, 5, 2, 1);
      paper(11, 4, 5, 6, '#c9f0c0'); p.R('#e07a3a', 12, 6, 3, 2);
      p.R('#e04a4a', 2.5, 2.5, 1, 1); p.R('#4a8ae0', 8, 0.5, 1, 1);
    }
  },
  hooks(p, v) {
    p.R(WOOD.base, 0, 1, 16, 2); p.R(WOOD.hi, 0, 1, 16, 1); p.R(WOOD.dark, 0, 3, 16, 1);
    const jacket = (x, col) => { p.R(col, x, 4, 5, 9); p.R(shade(col, 0.22), x, 4, 1, 9); p.R(shade(col, -0.3), x + 4, 4, 1, 9); p.R(shade(col, -0.35), x + 2, 4, 1, 8); p.R(col, x - 1, 6, 1, 5); p.R(col, x + 5, 6, 1, 5); p.R('#f2ead6', x + 1, 4, 3, 1); };
    const bag = (x, col) => { p.R(col, x, 5, 5, 7); p.R(shade(col, 0.22), x, 5, 5, 1); p.R(shade(col, -0.3), x, 11, 5, 1); p.R('#e8b830', x + 1, 7, 3, 2); p.R(shade(col, -0.3), x + 1, 4, 3, 1); };
    const cap = (x, col) => { p.E(col, x + 2.5, 6, 3, 2); p.R(shade(col, -0.3), x, 7, 6, 1); };
    const sets = [[() => jacket(1, '#2f6fb0'), () => bag(8, '#c0392b'), () => cap(2, '#e8b830')], [() => bag(1, '#3f8a3c'), () => jacket(9, '#e07a3a')], [() => jacket(2, '#8e5bb0'), () => jacket(9, '#3aa6a0')]][v];
    sets.forEach(f => f());
    for (const x of [3, 8, 13]) p.R('#d8dde3', x, 2, 1, 1);
  },
  dresser(p) {
    p.R(WOOD.base, 0, 2, 32, 13); p.R(WOOD.hi, 0, 2, 32, 2); p.R(WOOD.light, 0, 4, 32, 1); p.R(WOOD.dark, 0, 14, 32, 1); p.R(WOOD.dark, 31, 4, 1, 10);
    for (const x of [1, 11, 21]) { p.R(WOOD.dark, x, 6, 10, 7); p.R(WOOD.light, x + 1, 7, 8, 5); p.R(WOOD.hi, x + 1, 7, 8, 1); p.R('#e8b830', x + 4, 9, 2, 1); }
    p.R('#3c2a1c', 3, 0, 5, 3); p.R('#f2ead6', 4, 0.5, 3, 2); p.R('#8fc7ee', 4.5, 1, 2, 1);                       // a photo frame
    p.R('#b9e3f5', 25, 0, 3, 3); p.R('#3f8a3c', 26, -0.5, 1, 1.5);                                               // a glass with a twig
  },
  cabinet(p) {
    p.R(WOOD.dark, 0, 2, 32, 12); p.R(WOOD.base, 1, 3, 30, 10); p.R(WOOD.hi, 0, 2, 32, 1); p.R(WOOD.light, 1, 3, 30, 1);
    for (const x of [2, 12, 22]) { p.R(WOOD.shadow, x, 5, 8, 7); p.R('#8fc7ee', x + 1, 6, 6, 5); p.R('#cbe9fa', x + 1, 6, 3, 1); }
    p.R('#c05a45', 4, 0, 3, 2); p.R('#e08a74', 4, 0, 3, 1);                                                      // a bowl
    p.R('#b9e3f5', 22, -0.5, 3, 3); p.E('#e04a4a', 23.5, -1, 1.5, 1.2);                                         // a vase with a flower
  },
  bokken(p) {
    p.R(WOOD.dark, 0, 0, 14, 2); p.R(WOOD.hi, 0, 0, 14, 1); p.R(WOOD.dark, 0, 17, 14, 2); p.R(WOOD.dark, 0, 0, 2, 22); p.R(WOOD.dark, 12, 0, 2, 22);
    p.R(WOOD.shadow, 2, 2, 10, 15);
    for (const [x, tone] of [[3, '#d9b07a'], [6, '#c9a06a'], [9, '#d4a972']]) { p.R(tone, x, 3, 2, 16); p.R(shade(tone, 0.2), x, 3, 1, 16); p.R('#3a2a1e', x, 3, 2, 3); }
    p.R('#a43a2e', 3, 8, 8, 1);
  },
  bench(p, v) {
    if (v === 1) { // low dojo bench
      p.R(WOOD.base, 0, 0, 30, 4); p.R(WOOD.hi, 0, 0, 30, 1); p.R(WOOD.light, 0, 1, 30, 1); p.R(WOOD.dark, 0, 4, 30, 1);
      p.R(WOOD.dark, 2, 5, 3, 3); p.R(WOOD.dark, 25, 5, 3, 3); p.R(WOOD.shadow, 2, 8, 26, 1);
    } else {      // school hall bench
      p.R(WOOD.light, 0, 0, 28, 3); p.R(WOOD.hi, 0, 0, 28, 1); p.R(WOOD.dark, 0, 3, 28, 1);
      p.R('#58707a', 1, 4, 3, 5); p.R('#58707a', 24, 4, 3, 5); p.R('#3f4f55', 3, 4, 1, 5);
      p.R('#3f4f55', 0, 9, 28, 1);
    }
  },
  'plant-tall'(p, v) {
    p.E('#3f8a3c', 7, 8, 5.5, 6); p.E('#2e7a34', 4.5, 11, 3.5, 3.5); p.E('#47a04a', 9, 6, 3.6, 4); p.E('#7cc65a', 6, 4.5, 2, 1.8);
    if (v === 1) { p.E('#3f8a3c', 7, 3, 3.5, 3); p.R('#ffd84d', 6, 2, 2, 2); p.R('#ff6f91', 10, 7, 2, 2); p.R('#ff6f91', 3, 9, 2, 2); }
    p.R(WOOD.dark, 6.5, 12, 1, 4);
    p.R(CLAY.base, 3, 16, 8, 7); p.R(CLAY.light, 3, 16, 8, 1); p.R(CLAY.dark, 9, 17, 2, 6); p.R(CLAY.dark, 3, 22, 8, 1);
  },
  'plant-pot'(p, v) {
    if (v === 1) { p.E('#3f8a3c', 5, 4, 3.5, 3); for (const [x, y, c] of [[2.5, 2, '#ff6f91'], [6, 1.5, '#ffd84d'], [7, 4, '#b58cff'], [3, 4.5, '#ffffff']]) p.R(c, x, y, 2, 2); }
    else { p.E('#2e7a34', 5, 4.5, 4, 3.5); p.E('#47a04a', 4, 3.5, 2.5, 2); p.E('#7cc65a', 3.5, 3, 1.2, 1); }
    p.R(CLAY.base, 2, 7, 6, 4); p.R(CLAY.light, 2, 7, 6, 1); p.R(CLAY.dark, 7, 8, 1, 3); p.R(CLAY.dark, 2, 10, 6, 1);
  },
  toybox(p) {
    box(p, 0, 3, 16, 7, { base: '#4a8ae0', light: '#7fb0f0', dark: '#2f5aa0' });
    p.R('#e8b830', 0, 5, 16, 1); p.R('#c0392b', 3, 0, 4, 4); p.R('#3f8a3c', 8, 1, 4, 3); p.R('#ffd84d', 12, 0, 3, 3); p.R('#fff', 4, 1, 1, 1);
    p.E('#e04a4a', 13, 1.5, 1.5, 1.5);
  },
  toys(p, v) {
    if (v === 0) { p.R('#c0392b', 1, 3, 3, 3); p.R('#e8b830', 4, 4, 3, 2); p.R('#2f6fb0', 2, 1, 3, 3); p.E('#3f8a3c', 10, 4, 2.5, 2); p.R('#ffffff', 9, 3, 1, 1); }
    else { p.R('#e04a4a', 2, 2, 7, 3); p.R('#f4a6b8', 3, 1, 3, 2); p.R(OUT, 3, 5, 2, 1); p.R(OUT, 7, 5, 2, 1); p.E('#d98a5e', 11, 3.5, 2, 2); p.R(OUT, 10.5, 3, 1, 1); p.R(OUT, 12, 3, 1, 1); }
  },
  shoes(p) {
    p.R(WOOD.dark, 0, 5, 18, 2); p.R(WOOD.light, 0, 5, 18, 1);
    for (const [x, c] of [[1, '#c0392b'], [7, '#2f6fb0'], [13, '#e8b830']]) { p.R(c, x, 2, 4, 3); p.R(shade(c, 0.25), x, 2, 4, 1); p.R(OUT, x, 5, 4, 1); p.R('#f2ead6', x + 3, 3, 1, 2); }
  },
  umbrella(p) {
    p.R('#5a5d66', 1, 7, 6, 6); p.R('#7c7f88', 1, 7, 6, 1); p.R('#3c3f48', 1, 12, 6, 1);
    p.R('#c0392b', 1, 1, 2, 7); p.R('#2f6fb0', 3, 0, 2, 8); p.R('#3f8a3c', 5, 2, 2, 6); p.R(WOOD.dark, 3.5, 0, 1, 2);
  },
  'teacher-desk'(p) {
    p.R(WOOD.light, 0, 2, 44, 6); p.R(WOOD.hi, 0, 2, 44, 2); p.R(WOOD.base, 0, 8, 44, 7); p.R(WOOD.dark, 0, 15, 44, 2); p.R(WOOD.dark, 43, 3, 1, 12);
    p.R(WOOD.dark, 3, 9, 12, 5); p.R(WOOD.light, 4, 10, 10, 3); p.R('#e8b830', 8, 11, 2, 1);
    p.R(WOOD.dark, 29, 9, 12, 5); p.R(WOOD.light, 30, 10, 10, 3); p.R('#e8b830', 34, 11, 2, 1);
    p.R('#f6f1e2', 6, 0, 8, 4); p.R('#2f6fb0', 7, 1, 6, 1); p.R('#c0392b', 20, 0.5, 4, 3); p.R('#3f8a3c', 22, -0.5, 1, 1); // papers, an apple
    p.E('#2f6fb0', 34, 2, 3, 2.5); p.R('#e8b830', 33, 4, 2, 1);                                                      // a globe
  },
  desk(p, v) {
    const bag = ['#c0392b', '#2f6fb0', '#3f8a3c'][v];
    p.R(WOOD.light, 0, 1, 30, 8); p.R(WOOD.hi, 0, 1, 30, 2); p.R(WOOD.base, 0, 9, 30, 3); p.R(WOOD.dark, 0, 12, 30, 1);
    p.R(WOOD.dark, 1, 13, 2, 5); p.R(WOOD.dark, 27, 13, 2, 5);
    p.R('#f6f1e2', 4, 2, 7, 5); p.R('#2f6fb0', 4, 2, 7, 1); p.R(OUT, 7.5, 2, 1, 5);                              // an open book
    p.R('#e8b830', 15, 4, 8, 1); p.R('#c0392b', 24, 3, 3, 2);                                                  // a pencil, an eraser
    p.R('#446c86', 8, 14, 12, 6); p.R('#5d86a2', 8, 14, 12, 1); p.R('#2f4a5c', 8, 19, 12, 1); p.R('#446c86', 9, 20, 2, 5); p.R('#446c86', 17, 20, 2, 5); // the chair
    p.R(bag, 21, 14, 7, 8); p.R(shade(bag, 0.25), 21, 14, 7, 1); p.R(shade(bag, -0.3), 21, 21, 7, 1); p.R('#e8b830', 23, 17, 3, 2); // the school bag beside the chair
  },
  cushion(p, v) {
    const c = ['#c0392b', '#3f8a3c', '#2f6fb0'][v];
    p.E(shade(c, -0.3), 6, 4.5, 5.5, 2.8); p.E(c, 6, 3.5, 5.5, 2.8); p.E(shade(c, 0.28), 5, 2.8, 3, 1.4); p.R(shade(c, -0.4), 6, 3, 1, 1);
  },
  bin(p) {
    p.R('#7c7f88', 1, 1, 7, 2); p.R('#9aa0a8', 1, 1, 7, 1); p.R('#5a5d66', 1, 3, 7, 8); p.R('#7c7f88', 1, 3, 1, 8); p.R('#3c3f48', 7, 3, 1, 8); p.R('#3c3f48', 1, 10, 7, 1);
    p.R('#4f9b7a', 3, 5, 3, 3);
  },
  bonsai(p, v) {
    p.R('#3a2a1e', 5.5, 6, 2, 6); p.R('#3a2a1e', 4, 8, 2, 1);
    p.E('#2e7a34', 6.5, 4, 5.5, 3.5); p.E('#3f8a3c', 5.5, 3, 3.5, 2.2); p.E('#6cae5e', 4.5, 2.5, 1.8, 1); if (v === 1) { p.R('#ffd0dc', 8, 2, 1, 1); p.R('#ffd0dc', 4, 4, 1, 1); p.R('#ffd0dc', 9, 4, 1, 1); }
    p.R('#3a5a8a', 2, 12, 9, 4); p.R('#5a7cb0', 2, 12, 9, 1); p.R('#243b5a', 2, 15, 9, 1); p.R(WOOD.base, 3, 16, 7, 1);
  },
  andon(p) {
    p.R(WOOD.dark, 1, 1, 8, 1); p.R(WOOD.dark, 1, 1, 1, 17); p.R(WOOD.dark, 8, 1, 1, 17); p.R(WOOD.dark, 1, 17, 8, 3); p.R(WOOD.dark, 4, 0, 2, 1);
    p.R('#efe4c4', 2, 2, 6, 15); p.R('#ffffff', 2, 2, 1, 15); p.R(WOOD.base, 4, 2, 1, 15); p.R(WOOD.base, 2, 9, 6, 1);
    p.R(WOOD.shadow, 0, 19, 10, 2); p.R(WOOD.light, 0, 19, 10, 1);
  },
  zabuton(p, v) {
    const c = ['#7a3a8a', '#a43a2e', '#2a3f8f'][v];
    p.R(shade(c, -0.3), 0, 1, 12, 5); p.R(c, 0, 0, 12, 4); p.R(shade(c, 0.28), 0, 0, 12, 1); p.R(shade(c, 0.18), 0, 0, 1, 4); p.R('#e8b830', 5.5, 1.5, 1, 1);
  },
  shoji(p) {
    p.R('#3a2a1e', 0, 0, 30, 12); p.R('#f6f0dc', 1, 1, 28, 10);
    for (const x of [7, 14, 21]) p.R('#3a2a1e', x, 1, 1, 10);
    p.R('#3a2a1e', 1, 6, 28, 1); p.R('rgba(255,255,255,0.6)', 2, 2, 4, 1);
  },
  geta(p, v) {
    for (const x of [0, 6]) { p.R(WOOD.light, x, 0, 5, 3); p.R(WOOD.hi, x, 0, 5, 1); p.R(WOOD.dark, x + 1, 3, 1, 2); p.R(WOOD.dark, x + 3, 3, 1, 2); p.R(v ? '#a43a2e' : '#2a3f8f', x + 1, 1, 3, 1); }
  }
};

// lamp frames: base (the fixture, unlit) and lit (drawn over it, faded in)
const LAMP_DRAW = {
  pendant: (p, lit) => {
    if (!lit) { p.R('#3c3f48', 5.5, 0, 1, 5); p.E('#e8dfc8', 6, 8, 5, 3.5); p.R('#e8dfc8', 1, 8, 10, 3); p.R('#ffffff', 2, 6.5, 3, 1); p.R('#9a8f78', 1, 11, 10, 1); p.R('#9a8f78', 9, 8, 2, 3); }
    else { p.R('#ffe9a8', 1.5, 10, 9, 2); p.R('#fff7d6', 3, 11, 6, 1); p.R('#ffd9a0', 2, 12, 8, 1); p.R('#ffffff', 4, 11, 4, 1); }
  },
  tube: (p, lit) => {
    if (!lit) { p.R('#9aa0a8', 0, 1, 24, 4); p.R('#c9ced4', 0, 1, 24, 1); p.R('#5a5d66', 0, 5, 24, 1); p.R('#e9ecef', 2, 2, 20, 2); p.R('#3c3f48', 4, 0, 1, 1); p.R('#3c3f48', 19, 0, 1, 1); }
    else { p.R('#fffbe6', 2, 2, 20, 2); p.R('#ffffff', 3, 2, 18, 1); p.R('#ffe9a8', 1, 3, 22, 3); p.R('#ffd9a0', 2, 5.5, 20, 1); }
  },
  paper: (p, lit) => {
    if (!lit) { p.R('#3c3f48', 6.5, 0, 1, 3); p.E('#efe4c4', 7, 9, 6, 6); p.R('#a43a2e', 3, 3, 8, 1); p.R('#a43a2e', 3, 14, 8, 1); p.R('#d8cba6', 8, 5, 1, 9); p.R('#d8cba6', 5, 5, 1, 9); p.R('#ffffff', 4, 6, 2, 3); }
    else { p.E('#ffe9a8', 7, 9, 5, 5); p.E('#fff7d6', 6.5, 8.5, 3, 3); p.R('#ffd9a0', 3, 14, 8, 1); p.R('#a43a2e', 3, 3, 8, 1); p.R('#a43a2e', 3, 14.5, 8, 1); }
  },
  table: (p, lit) => {
    if (lit) { p.R('#3c3f48', 3, 6, 2, 3); p.R('#3c3f48', 2, 8, 4, 1); p.R('#ffe9a8', 1, 1, 6, 5); p.R('#fff7d6', 2, 2, 4, 3); p.R('#ffffff', 3, 3, 2, 1); p.R('#ffd9a0', 1, 5, 6, 1); }
  },
  andon: (p, lit) => {
    if (lit) { p.R(WOOD.dark, 1, 1, 8, 1); p.R(WOOD.dark, 1, 1, 1, 17); p.R(WOOD.dark, 8, 1, 1, 17); p.R(WOOD.dark, 1, 17, 8, 3); p.R(WOOD.dark, 4, 0, 2, 1); p.R('#ffe9a8', 2, 2, 6, 15); p.R('#fff7d6', 3, 4, 4, 9); p.R('#ffffff', 4, 6, 2, 4); p.R('#e0a850', 4, 2, 1, 15); p.R('#e0a850', 2, 9, 6, 1); p.R(WOOD.shadow, 0, 19, 10, 2); p.R(WOOD.light, 0, 19, 10, 1); }
  }
};

// A shaft of daylight (added to the floor): the window's panes thrown down the floor, leaning with the sun, in four bands of
// strength with a dithered edge, the mullions and the bar between the panes left dark. `skew` is the lean at the far end.
function shaft(c, w, h, skew) {
  const x0 = Math.max(0, -skew);
  for (let y = 0; y < h; y++) {
    const dx = Math.round((skew * y) / h) + x0;
    const a = [0.8, 0.58, 0.4, 0.24][Math.min(3, Math.floor((y / h) * 4))];
    const bar = Math.abs(y - h * 0.38) < 0.8;
    for (let x = 0; x < w; x++) {
      if (bar || Math.abs(x - w / 2) < 0.6) continue;
      const edge = x < 1 || x >= w - 1;
      if (edge && ((x + y) & 1)) continue;
      c.fillStyle = `rgba(255,236,176,${a})`;
      c.fillRect((x + dx) * 2, y * 2, 2, 2);
    }
  }
}

export const shaftKey = (wide, skew) => `shaft-${wide ? 2 : 1}-${skew}`;
export const lampKey = (t, lit) => `lamp-${t}${lit ? '-lit' : ''}`;
export const propKey = (t, v) => `${t}-${v}`;

// Builds int-atlas (f = render scale: 2 on Medium and High, 1 on Low) and the Low glow texture.
export function makeInteriorAtlas(scene, f) {
  const frames = [];
  const add = (name, w, h, draw) => frames.push({ name, w, h, draw });
  for (const [t, m] of Object.entries(PROPS)) {
    for (let v = 0; v < m.n; v++) {
      add(propKey(t, v), m.w + 2, m.h + 2, (c, w, h) => {
        const p = pen(c);
        if (m.kind === 'floor') contact(p, m.w / 2, m.h - 0.5, m.w / 2 - 0.5, 1.4);
        DRAW[t](p, v);
        outline(c.canvas, w, h);
      });
    }
  }
  for (const [t, m] of Object.entries(LAMPS)) {
    for (const lit of [false, true]) {
      if (!lit && !m.base) continue;
      add(lampKey(t, lit), m.w + 2, m.h + 2, (c, w, h) => { LAMP_DRAW[t](pen(c), lit); if (!lit) outline(c.canvas, w, h); });
    }
  }
  SHAFT.skew.forEach((sk, i) => SHAFT.w.forEach((sw, wi) => add(shaftKey(wi === 1, i), sw + Math.abs(sk), SHAFT.h, c => shaft(c, sw, SHAFT.h, sk))));
  const W = 1024;
  let x = 0, y = 0, rowH = 0;
  const placed = frames.map(fr => {
    const fw = Math.round(fr.w * f), fh = Math.round(fr.h * f);
    if (x + fw > W) { x = 0; y += rowH; rowH = 0; }
    const q = { fr, x, y, fw, fh };
    x += fw; rowH = Math.max(rowH, fh);
    return q;
  });
  if (scene.textures.exists(ATLAS)) scene.textures.remove(ATLAS);
  const tex = scene.textures.createCanvas(ATLAS, W, y + rowH);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  for (const { fr, x: px0, y: py0, fw, fh } of placed) {
    const src = document.createElement('canvas');
    src.width = fr.w * 2;
    src.height = fr.h * 2;
    fr.draw(src.getContext('2d'), fr.w, fr.h);
    ctx.drawImage(src, 0, 0, src.width, src.height, px0, py0, fw, fh);
    tex.add(fr.name, 0, px0, py0, fw, fh);
  }
  tex.refresh();
  // the glow of a lamp on Low and Canvas (no light map): a stepped warm pool, drawn added over the room
  if (scene.textures.exists(GLOW)) scene.textures.remove(GLOW);
  const R = 48 * f;
  const g = scene.textures.createCanvas(GLOW, R * 2, R * 2);
  const gc = g.getContext();
  const img = gc.createImageData(R * 2, R * 2);
  for (let y = 0; y < R * 2; y++) for (let x = 0; x < R * 2; x++) {
    const q = Math.hypot(x + 0.5 - R, y + 0.5 - R) / R;
    const band = q >= 1 ? 0 : Math.ceil((1 - q * q) * 5);
    const i = (y * R * 2 + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 214; img.data[i + 2] = 150; img.data[i + 3] = band * 20;
  }
  gc.putImageData(img, 0, 0);
  g.refresh();
}
