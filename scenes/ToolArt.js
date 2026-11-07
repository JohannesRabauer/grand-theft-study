// Procedural art for the throwing stick and what it plays with (story 6.1): the boomerang-like stick, a frisbee and a kite
// stuck in a tree (prop kinds `frisbee` / `kite-stuck`), and the heart particle of a happy dog. Drawn on a 2x authoring grid
// and scaled to the render class like scenes/NpcArt.js, so Low (1x) and Medium/High (2x, outlined) share one definition.
import { darken, lighten } from './HiResArt.js';
import { ScaledPen } from './NpcArt.js';

const OUT = '#16161e';

// A line of `w` px thick squares from (x0, y0) to (x1, y1).
function stroke(p, col, x0, y0, x1, y1, w) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) p.px(col, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), w, w);
}

function stick(p) {
  const wood = '#b9854a';
  stroke(p, darken(wood, 0.3), 2, 4, 7, 12, 3);
  stroke(p, darken(wood, 0.3), 7, 12, 13, 6, 3);
  stroke(p, wood, 2, 3, 7, 11, 2);
  stroke(p, wood, 7, 11, 13, 5, 2);
  stroke(p, lighten(wood, 0.35), 3, 3, 6, 8, 1);
  stroke(p, lighten(wood, 0.35), 8, 10, 12, 6, 1);
  p.px('#d84a3a', 6, 10, 3, 2); // grip tape at the bend
  p.px('#f4f0e6', 6, 10, 3, 1);
}

function frisbee(p) {
  p.ell('#1c7f86', 7, 7, 6.5, 6.5);
  p.ell('#2fb5bd', 7, 6.6, 5.8, 5.8);
  p.ell('#1c7f86', 7, 7, 3.4, 3.4);
  p.ell('#8be6ea', 7, 7, 2.6, 2.6);
  p.px('#ffffff', 3, 3, 3, 1);
}

function kite(p) {
  const red = '#d9453a';
  const yellow = '#f2c23a';
  for (let i = 0; i < 9; i++) { // diamond
    const half = i < 5 ? i + 1 : 9 - i;
    p.px(i % 2 ? red : yellow, 8 - half, 1 + i, half * 2, 1);
  }
  p.px('#ffffff', 8, 1, 1, 9);
  p.px('#ffffff', 4, 5, 9, 1);
  stroke(p, '#e8e0cf', 8, 10, 6, 15, 1); // string and ribbon bows
  p.px(red, 5, 13, 3, 2);
  p.px(yellow, 7, 16, 3, 2);
}

function heart(p) {
  p.px('#ffffff', 1, 0, 2, 1);
  p.px('#ffffff', 5, 0, 2, 1);
  p.px('#ffffff', 0, 1, 8, 2);
  p.px('#ffffff', 1, 3, 6, 1);
  p.px('#ffffff', 2, 4, 4, 1);
  p.px('#ffffff', 3, 5, 2, 1);
}

export function makeToolArt(scene, scale) {
  const f = scale / 2;
  const mk = (key, w, h, draw, outline = true) => {
    const p = new ScaledPen(scene, key, w, h, f);
    draw(p);
    if (outline && scale > 1) p.outline(OUT);
    p.done();
  };
  mk('stick', 16, 16, stick);
  mk('prop-frisbee', 14, 14, frisbee);
  mk('prop-kite', 16, 18, kite);
  mk('p-heart', 8, 6, heart, false);
}
