// Street dressing art (story 16.9, AD-30/AD-31): the standing props (planters, bollards, hydrants, letterboxes, recycling bins,
// parked bikes, street signs, the kiosk and the Pfand machine) as frames of one atlas, and the ground decals (kerb weeds,
// leaves in the gutter, chalk drawings, playground markings, posters) as tile textures for the ground bake. Props are authored in
// base pixels on a ScaledPen (feet at the middle of the bottom row minus 2), light from the top left, hard edges, the outline
// and the dithered contact shadow last. Decals are authored on the 16 base pixel tile (two units per pixel, like EnvArt).
// Which tile or tile edge gets what comes from render/streetMath.js. Everything is seeded; nothing runs per frame.
import { ScaledPen } from './NpcArt.js';
import { OUT } from './HiResArt.js';
import { rng, hash, canvas, px, emit } from './EnvDraw.js';
import { PROP_VARIANTS, POSTERS, CHALKS, PLAYS, SIDES, WEED_VARIANTS, LEAF_VARIANTS } from '../render/streetMath.js';

export const STREET_ATLAS = 'street-atlas';
export const frameKey = (kind, v) => `${kind}-${v}`;
export const FRAME_SIZE = { planter: [14, 12], bollard: [6, 12], hydrant: [8, 12], letterbox: [8, 14], recycle: [22, 16], bike: [22, 14], sign: [14, 30], kiosk: [34, 34], pfand: [14, 20] };

const IRON = { shadow: '#2c2e38', dark: '#3c3f48', base: '#4a4d55', light: '#5a5d66', high: '#7c7f88' };
const STONE = { dark: '#7d8087', base: '#9a9ea6', light: '#b9bcc2', high: '#d6d6cc' };
const WOOD = { dark: '#6e4426', base: '#8a5a3c', light: '#a9783f', high: '#c9955a' };
const GREEN = ['#1f5a26', '#2c6a2c', '#3f8a3c', '#5aa84c', '#7fcb66'];
const LEAF_COLS = ['#8a5a2a', '#b9801f', '#6e6a2a', '#d27a26', '#a0441d'];

const ring = (p, col, cx, cy, r) => { for (let a = 0; a < 40; a++) p.px(col, Math.round(cx + Math.cos((a / 40) * 6.2832) * r - 0.5), Math.round(cy + Math.sin((a / 40) * 6.2832) * r - 0.5)); };

const PROPS = {
  planter(p, v) { // a stone box with a shrub, red flowers or daisies
    p.px(STONE.dark, 1, 5, 12, 6).px(STONE.base, 1, 5, 11, 5).px(STONE.light, 1, 5, 11, 1).px(STONE.high, 1, 5, 4, 1).px(STONE.dark, 12, 6, 1, 5).px('#5a4028', 2, 5, 9, 1);
    for (let x = 2; x < 12; x += 3) p.px(STONE.dark, x, 8, 2, 1); // a course of bricks
    if (v === 0) { p.ell(GREEN[1], 7, 3.5, 5, 3).ell(GREEN[2], 6, 3, 3.5, 2.2).px(GREEN[4], 4, 1, 2, 1).px(GREEN[3], 7, 2, 2, 1).px(GREEN[0], 9, 4, 3, 1); }
    else {
      const f = v === 1 ? ['#d94a3d', '#f08a7a'] : ['#f6f2dc', '#f2c230'];
      p.px(GREEN[1], 2, 3, 10, 2).px(GREEN[3], 3, 3, 3, 1);
      for (const [x, y] of [[3, 2], [6, 1], [9, 2], [5, 3], [11, 3], [8, 3]]) p.px(f[0], x, y, 2, 1).px(f[1], x, y - 1, 1, 1);
    }
    p.outline(OUT).shadow(7 * p.f, 11.5 * p.f, 7.5 * p.f, 1.8 * p.f, 0.28);
  },
  bollard(p, v) { // a short post: concrete with a yellow reflector band, or red and white
    const [a, b] = v === 0 ? ['#a9aeb6', '#f2c230'] : ['#e8e4dc', '#c0392b'];
    p.px(a, 1, 4, 4, 7).px('#ffffff', 1, 4, 1, 7).px('#7d8087', 4, 4, 1, 7).px(a, 2, 3, 2, 1).px(b, 1, 6, 4, 2).px('#00000026', 4, 6, 1, 2).px(v === 0 ? '#7d8087' : '#8a8e96', 1, 10, 4, 1);
    p.outline(OUT).shadow(3 * p.f, 11.5 * p.f, 3.4 * p.f, 1.3 * p.f, 0.26);
  },
  hydrant(p) {
    p.px('#8f2a20', 2, 9, 4, 2).px('#c0392b', 2, 4, 4, 6).px('#e0685a', 2, 4, 1, 6).px('#8f2a20', 5, 4, 1, 6).px('#c0392b', 0, 6, 2, 2).px('#c0392b', 6, 6, 2, 2).px('#e0685a', 0, 6, 1, 1).px('#8f2a20', 7, 6, 1, 2);
    p.ell('#c0392b', 4, 3.5, 2.5, 1.8).px('#e0685a', 3, 2, 1, 1).px('#6b717a', 3, 5, 2, 1).px('#f2c230', 3, 9, 2, 1);
    p.outline(OUT).shadow(4 * p.f, 11.5 * p.f, 4.4 * p.f, 1.4 * p.f, 0.28);
  },
  letterbox(p, v) { // a post box on a post
    const [a, b, c] = v === 0 ? ['#f2c230', '#fbe27a', '#b8901a'] : ['#3d63a8', '#6f93d4', '#284478'];
    p.px(IRON.dark, 3, 6, 2, 6).px(IRON.light, 3, 6, 1, 6).px(IRON.dark, 2, 11, 4, 1);
    p.px(a, 0, 1, 8, 6).px(b, 0, 1, 8, 1).px(b, 0, 1, 1, 6).px(c, 7, 1, 1, 6).px(c, 0, 6, 8, 1).px(IRON.shadow, 1, 3, 6, 1).px('#f4f1e8', 5, 5, 2, 1);
    p.outline(OUT).shadow(4 * p.f, 12.5 * p.f, 3.6 * p.f, 1.3 * p.f, 0.26);
  },
  recycle(p) { // yellow, blue and green containers with lids
    const sets = [['#e6c53a', '#f6e27a', '#b8981f'], ['#3d63a8', '#6f93d4', '#284478'], ['#3f7a46', '#6fb070', '#2a5530']];
    sets.forEach(([a, b, c], i) => {
      const x = 1 + i * 7;
      p.px(a, x, 5, 6, 8).px(b, x, 5, 1, 8).px(c, x + 5, 5, 1, 8).px(c, x, 12, 6, 1);
      p.px(b, x - 1, 3, 8, 2).px(c, x - 1, 4, 8, 1).px(b, x - 1, 3, 3, 1).px(IRON.dark, x + 2, 6, 2, 1).px('#ffffff', x + 1, 8, 3, 2).px(c, x + 2, 9, 1, 1);
    });
    p.outline(OUT).shadow(11 * p.f, 13.5 * p.f, 11.4 * p.f, 1.8 * p.f, 0.28);
  },
  bike(p, v) { // a bike parked sideways
    const col = [['#d94a3d', '#f08a7a'], ['#3d7dd8', '#7fb0f0'], ['#3f9a52', '#7fd08a']][v];
    ring(p, IRON.shadow, 5.5, 9, 4.2); ring(p, IRON.shadow, 16.5, 9, 4.2); ring(p, IRON.light, 5.5, 8.6, 3); ring(p, IRON.light, 16.5, 8.6, 3);
    p.px(IRON.base, 5, 9, 1, 1).px(IRON.base, 16, 9, 1, 1);
    p.line(col[0], 5, 9, 9, 5).line(col[0], 9, 5, 15, 5).line(col[0], 15, 5, 16, 9).line(col[0], 9, 5, 11, 9).line(col[0], 11, 9, 5, 9).line(col[1], 9, 4, 15, 4);
    p.px(IRON.dark, 15, 3, 3, 1).px(IRON.dark, 17, 2, 1, 2).px(IRON.dark, 7, 3, 3, 1).px(IRON.dark, 8, 4, 1, 1).px('#f2c230', 18, 3, 1, 1);
    p.outline(OUT).shadow(11 * p.f, 12.5 * p.f, 10.6 * p.f, 1.6 * p.f, 0.26);
  },
  sign(p, v) { // a pole with a plate on top: speed 30, stop, parking, children
    p.px(IRON.dark, 6, 11, 2, 17).px(IRON.light, 6, 11, 1, 17).px(IRON.dark, 5, 27, 4, 1).px(IRON.shadow, 7, 12, 1, 15);
    if (v === 0) { p.ell('#c0392b', 7, 6, 5.5, 5.5).ell('#ffffff', 7, 6, 3.8, 3.8); p.px(IRON.shadow, 5, 4, 2, 1).px(IRON.shadow, 6, 5, 1, 1).px(IRON.shadow, 5, 6, 2, 1).px(IRON.shadow, 5, 7, 2, 1).px(IRON.shadow, 8, 4, 2, 4).px('#ffffff', 9, 5, 1, 2); }
    else if (v === 1) { p.px('#c0392b', 2, 2, 10, 8).px('#c0392b', 3, 1, 8, 10).px('#e0685a', 3, 1, 6, 1).px('#ffffff', 4, 5, 6, 2).px('#a02d22', 10, 3, 1, 6); }
    else if (v === 2) { p.px('#2b6fb8', 2, 1, 10, 10).px('#4a8fd8', 2, 1, 10, 1).px('#ffffff', 5, 3, 1, 6).px('#ffffff', 6, 3, 3, 1).px('#ffffff', 8, 4, 1, 2).px('#ffffff', 6, 6, 3, 1); }
    else { for (let y = 0; y < 10; y++) { const half = Math.round(1 + y * 0.55); p.px('#c0392b', 7 - half, 1 + y, half * 2, 1); } for (let y = 3; y < 9; y++) { const half = Math.round(0.2 + y * 0.4); p.px('#f2c230', 7 - half, 1 + y, half * 2, 1); } p.px(IRON.shadow, 5, 6, 1, 3).px(IRON.shadow, 8, 5, 1, 4).px(IRON.shadow, 5, 5, 1, 1).px(IRON.shadow, 8, 4, 1, 1); }
    p.outline(OUT).shadow(7 * p.f, 27.5 * p.f, 5 * p.f, 1.4 * p.f, 0.26);
  },
  kiosk(p) { // a newspaper kiosk: counter, magazine rack and a striped awning
    p.px(WOOD.dark, 4, 12, 26, 20).px(WOOD.base, 4, 12, 24, 19).px(WOOD.light, 4, 12, 24, 1).px(WOOD.dark, 27, 13, 1, 18);
    p.px('#2f2118', 7, 15, 20, 9).px('#f4deb0', 7, 15, 20, 1);
    const cols = ['#d94a3d', '#f2c230', '#3d7dd8', '#f4f1e8', '#3f9a52', '#e08ac8'];
    for (let i = 0; i < 10; i++) p.px(cols[(i * 5) % cols.length], 8 + i * 2, 17, 2, 4).px('#ffffffb0', 8 + i * 2, 17, 1, 1);
    p.px(WOOD.high, 5, 24, 24, 2).px(WOOD.dark, 5, 26, 24, 1).px(WOOD.light, 6, 27, 22, 1);
    p.px('#3e2a18', 14, 28, 6, 4).px('#f2c230', 18, 30, 1, 1); // a hatch
    for (let i = 0; i < 9; i++) { p.px(i % 2 ? '#f4efe2' : '#c0392b', 2 + i * 3.5, 7, 4, 6); p.px(i % 2 ? '#d7d0c0' : '#8f2a20', 2 + i * 3.5, 12, 4, 1); }
    p.px('#8f2a20', 2, 5, 31, 2).px('#c0392b', 2, 5, 31, 1);
    p.px('#00000030', 4, 13, 28, 1);
    p.outline(OUT).shadow(17 * p.f, 31.5 * p.f, 16 * p.f, 2.2 * p.f, 0.3);
  },
  pfand(p) { // the bottle return machine
    p.px('#2a5a45', 1, 3, 12, 16).px('#4a8761', 1, 3, 11, 15).px('#6fae83', 1, 3, 11, 1).px('#6fae83', 1, 3, 1, 15).px('#2a5a45', 1, 17, 12, 1);
    p.px('#243d46', 3, 5, 8, 4).px('#9fd3e8', 4, 6, 6, 2).px('#cfe8f4', 4, 6, 3, 1);
    p.px('#16161e', 3, 11, 8, 3).px('#3c3f48', 3, 11, 8, 1).px('#d94a3d', 9, 15, 2, 1).px('#7fcb66', 3, 15, 2, 1).px('#f2c230', 6, 2, 2, 1);
    p.outline(OUT).shadow(7 * p.f, 18.5 * p.f, 7 * p.f, 1.7 * p.f, 0.28);
  }
};

// Authors the atlas: every frame on a pen of its own, packed row by row into one texture (one texture means one batch).
export function makeStreetAtlas(scene, f) {
  const placed = [];
  let x = 0, y = 0, rowH = 0;
  const W = 512;
  const tmp = [];
  for (const kind of Object.keys(PROP_VARIANTS)) {
    const [w, h] = FRAME_SIZE[kind];
    for (let v = 0; v < PROP_VARIANTS[kind]; v++) {
      const key = `street-tmp-${kind}-${v}`;
      const p = new ScaledPen(scene, key, w, h, f);
      PROPS[kind](p, v);
      const fw = p.w, fh = p.h;
      if (x + fw > W) { x = 0; y += rowH; rowH = 0; }
      placed.push({ name: frameKey(kind, v), src: p.c.canvas, x, y, fw, fh });
      tmp.push(key);
      x += fw; rowH = Math.max(rowH, fh);
    }
  }
  if (scene.textures.exists(STREET_ATLAS)) scene.textures.remove(STREET_ATLAS);
  const tex = scene.textures.createCanvas(STREET_ATLAS, W, y + rowH);
  const c = tex.getContext();
  for (const q of placed) { c.drawImage(q.src, q.x, q.y); tex.add(q.name, 0, q.x, q.y, q.fw, q.fh); }
  tex.refresh();
  for (const key of tmp) scene.textures.remove(key);
}

// ------------------------------------------------------------------------------------------------ ground decals
// Authored in base pixels (b) on the 16 pixel tile.
const b = (c, col, x, y, w = 1, h = 1) => px(c, col, x * 2, y * 2, w * 2, h * 2);

function tuft(c, r, cols, x, root, hgt) {
  for (let k = 0; k < 3; k++) {
    const bx = x + k - 1;
    const h2 = Math.max(1, hgt - (k === 1 ? 0 : 1) - (r() < 0.3 ? 1 : 0));
    b(c, cols[k % 2], bx, root - h2, 1, h2);
    if (k === 1) b(c, cols[2], bx, root - h2, 1, 1);
  }
}

// Weeds growing from the crack along a kerb: tufts, a flower now and then, a darker crack line. Side n/e/s/w is where the road is.
function weeds(side, v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(`weed${side}${v}`));
  const cols = [GREEN[1], GREEN[2], GREEN[3]];
  const n = 2 + (v % 2);
  for (let i = 0; i < n; i++) {
    const t = 2 + Math.floor(r() * 12);
    const hgt = 2 + Math.floor(r() * 3);
    if (side === 'n') tuft(c, r, cols, t, 4, hgt);
    else if (side === 's') tuft(c, r, cols, t, 15, hgt);
    else tuft(c, r, cols, side === 'e' ? 14 : 2, 3 + Math.floor(r() * 12), hgt);
    if (r() < 0.28) b(c, r() < 0.5 ? '#f2d24a' : '#f4f1e8', t, (side === 'n' ? 4 : side === 's' ? 15 : 8) - hgt - 1);
  }
  const crackY = side === 'n' ? 3 : 14;
  if (side === 'n' || side === 's') for (let x = 1 + v; x < 15; x += 3 + (v % 2)) b(c, '#6e7279', x, crackY + (x % 2), 1, 1);
  return tmp;
}

// Leaves that collected along the gutter of a road tile: a loose band of brown and amber pixels.
function leaves(side, v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(`leaf${side}${v}`));
  const n = 6 + v * 2;
  for (let i = 0; i < n; i++) {
    const along = 1 + Math.floor(r() * 14);
    const away = Math.floor(r() * r() * 4); // most of them hug the kerb
    const [x, y] = side === 'n' ? [along, away] : side === 's' ? [along, 15 - away] : side === 'w' ? [away, along] : [15 - away, along];
    b(c, LEAF_COLS[Math.floor(r() * LEAF_COLS.length)], x, y, r() < 0.4 ? 2 : 1, 1);
  }
  return tmp;
}

// Chalk drawings of the kids on the pavement.
const CHALK = ['#f5a3c7', '#ffe27a', '#8fd4ff', '#f4f1e8', '#b9f08f'];
function chalk(v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(`chalk${v}`));
  const col = i => CHALK[(v + i) % CHALK.length];
  const ox = 2 + Math.floor(r() * 3), oy = 2 + Math.floor(r() * 3);
  if (v === 0) { for (let a = 0; a < 8; a++) b(c, col(1), Math.round(ox + 5 + Math.cos(a * 0.785) * 4), Math.round(oy + 5 + Math.sin(a * 0.785) * 4)); for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5], [6, 5], [5, 6]]) b(c, col(1), ox + x + 1, oy + y); }
  else if (v === 1) { for (const [x, y] of [[2, 3], [3, 2], [4, 2], [5, 3], [6, 2], [7, 2], [8, 3], [8, 4], [7, 5], [6, 6], [5, 7], [4, 6], [3, 5], [2, 4]]) b(c, col(0), ox + x, oy + y); b(c, col(0), ox + 5, oy + 5); }
  else if (v === 2) { b(c, col(2), ox + 4, oy + 4, 2, 2); for (const [x, y] of [[4, 2], [6, 2], [3, 4], [7, 4], [4, 6], [6, 6], [5, 1], [5, 7]]) b(c, col(0), ox + x, oy + y); b(c, GREEN[3], ox + 5, oy + 8, 1, 4); }
  else if (v === 3) { for (let x = 3; x < 9; x++) b(c, col(3), ox + x, oy + 7); for (let y = 4; y < 8; y++) { b(c, col(3), ox + 3, oy + y); b(c, col(3), ox + 8, oy + y); } for (let i = 0; i < 3; i++) { b(c, col(1), ox + 4 + i, oy + 3 - i); b(c, col(1), ox + 8 - i, oy + 3 - i); } b(c, col(2), ox + 5, oy + 5, 2, 2); }
  else if (v === 4) { b(c, col(3), ox + 5, oy + 2, 2, 2); for (let y = 4; y < 8; y++) b(c, col(3), ox + 5, oy + y); b(c, col(3), ox + 3, oy + 5, 2, 1); b(c, col(3), ox + 6, oy + 5, 2, 1); b(c, col(3), ox + 4, oy + 8); b(c, col(3), ox + 5, oy + 8); b(c, col(3), ox + 3, oy + 9); b(c, col(3), ox + 6, oy + 9); }
  else { for (let k = 0; k < 4; k++) for (let a = 0; a < 7; a++) b(c, CHALK[k], Math.round(ox + 2 + a), Math.round(oy + 7 - Math.sin((a / 6) * 3.14) * (7 - k * 1.5))); }
  return tmp;
}

// Playground markings painted on the schoolyard: hopscotch, a circle, four square, a running line, a snail.
function play(v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const r = rng(hash(`play${v}`));
  const white = '#e9e5da';
  const w = (x, y, n = 1, m = 1) => { if (r() > 0.12) b(c, white, x, y, n, m); };
  if (v === 0) { for (let i = 0; i < 4; i++) { const y = 1 + i * 4; for (let x = 4; x < 12; x++) { w(x, y); } for (const x of [4, 11]) for (let k = 0; k < 4; k++) w(x, y + k); } for (let x = 4; x < 12; x++) w(x, 17 - 1); b(c, '#f2c230', 7, 3, 2, 1); b(c, '#f2c230', 7, 7, 2, 1); }
  else if (v === 1) { for (let a = 0; a < 36; a++) w(Math.round(8 + Math.cos(a * 0.1745) * 6.5), Math.round(8 + Math.sin(a * 0.1745) * 6.5)); b(c, '#f2c230', 7, 7, 2, 2); }
  else if (v === 2) { for (let i = 2; i < 14; i++) { w(i, 2); w(i, 13); w(2, i); w(13, i); w(i, 7); w(8, i); } for (const [x, y] of [[4, 4], [10, 4], [4, 10], [10, 10]]) b(c, '#f2c230', x, y, 2, 2); }
  else if (v === 3) { for (let x = 0; x < 16; x += 3) { w(x, 4, 2); w(x, 11, 2); } b(c, '#f2c230', 1, 7, 3, 1); b(c, '#f2c230', 12, 7, 3, 1); }
  else { let x = 8, y = 8, dx = 1, dy = 0, len = 1, turn = 0; for (let i = 0; i < 40; i++) { w(x, y); x += dx; y += dy; if (++turn >= len) { turn = 0; [dx, dy] = [-dy, dx]; if (dy === 0) len++; } if (x < 1 || x > 14 || y < 1 || y > 14) break; } }
  return tmp;
}

// Posters on a plain bit of facade: paper with tape corners, a headline and a picture; each a different colour.
function poster(v) {
  const tmp = canvas();
  const c = tmp.getContext('2d');
  const paper = ['#f4f1e8', '#ffe27a', '#f5a3c7', '#bfe3ff', '#c7efa8', '#f4f1e8'][v];
  const ink = ['#c0392b', '#2b4a8a', '#8f2a5a', '#2f5f4a', '#a05a1a', '#3d63a8'][v];
  const x = 5, y = 4;
  b(c, 'rgba(22,22,30,0.32)', x + 1, y + 1, 6, 8);
  b(c, paper, x, y, 6, 8); b(c, '#ffffffb0', x, y, 6, 1); b(c, 'rgba(22,22,30,0.16)', x + 5, y, 1, 8);
  b(c, ink, x + 1, y + 1, 4, 1);
  if (v === 0) { b(c, ink, x + 1, y + 3, 4, 3); b(c, paper, x + 2, y + 4, 2, 1); }
  else if (v === 1) { b(c, ink, x + 2, y + 3, 2, 3); b(c, '#d94a3d', x + 1, y + 6, 4, 1); }
  else if (v === 2) { b(c, ink, x + 1, y + 3, 2, 1); b(c, ink, x + 3, y + 3, 2, 1); b(c, ink, x + 1, y + 4, 4, 1); b(c, ink, x + 2, y + 5, 2, 1); }
  else if (v === 3) { b(c, ink, x + 2, y + 4, 2, 2); b(c, ink, x + 1, y + 3, 1, 1); b(c, ink, x + 4, y + 3, 1, 1); }
  else if (v === 4) { b(c, '#f2c230', x + 2, y + 3, 2, 2); b(c, ink, x + 1, y + 6, 4, 1); }
  else { for (let i = 0; i < 3; i++) b(c, i % 2 ? '#d94a3d' : ink, x + 1, y + 3 + i * 2, 4, 1); }
  b(c, ink, x + 1, y + 7, 3, 1);
  b(c, '#d6d6cc', x - 1, y - 1, 2, 1); b(c, '#d6d6cc', x + 5, y + 7, 2, 1); // tape
  return tmp;
}

export function makeStreetDecals(scene, size) {
  for (let v = 0; v < POSTERS; v++) emit(scene, `env-poster-${v}`, poster(v), size);
  for (let v = 0; v < CHALKS; v++) emit(scene, `env-chalk-${v}`, chalk(v), size);
  for (let v = 0; v < PLAYS; v++) emit(scene, `env-play-${v}`, play(v), size);
  for (const s of SIDES) for (let v = 0; v < WEED_VARIANTS; v++) emit(scene, `env-kweed-${s}-${v}`, weeds(s, v), size);
  for (const s of SIDES) for (let v = 0; v < LEAF_VARIANTS; v++) emit(scene, `env-gleaf-${s}-${v}`, leaves(s, v), size);
}
