// Procedural art of vehicle ownership and parking (story 5.5, AD-14): the padlock above vehicles that are not owned yet, the
// closed lock of a bike chained at a rack, the open lock of a bike left unlocked, the chain around a locked bike and the
// garage door (closed and open). Same ScaledPen drawing as scenes/SkatesArt.js; shown at ctx.res.inv.
import { darken, lighten } from './HiResArt.js';
import { ScaledPen } from './NpcArt.js';

const OUTLINE = '#16161e';

// 9 x 11 padlock: shackle on top (lifted and shifted when open), body below.
function lock(scene, scale, key, body, open) {
  const p = new ScaledPen(scene, key, 9, 11, scale);
  const sx = open ? 3 : 0;
  const top = open ? 0 : 1;
  p.px('#c4c9d4', 2 + sx, top + 1, 1, 4 - top);
  p.px('#c4c9d4', 6 + sx, top + 1, 1, open ? 2 : 4);
  p.px('#c4c9d4', 3 + sx, top, 3, 1);
  p.px(body, 1, 5, 7, 5);
  p.px(lighten(body, 0.3), 1, 5, 7, 1);
  p.px(darken(body, 0.3), 1, 9, 7, 1);
  p.px('#1c1c24', 4, 6, 1, 2);
  if (scale > 1) p.outline(OUTLINE);
  p.done();
}

// 26 x 12 chain ring lying around a bike, alternating links; the padlock sits at the front.
function chain(scene, scale) {
  const p = new ScaledPen(scene, 'bike-chain', 26, 12, scale);
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = 13 + Math.cos(a) * 11.5;
    const y = 6 + Math.sin(a) * 4.5;
    p.px(i % 2 ? '#8c93a3' : '#c4c9d4', Math.round(x) - 1, Math.round(y), 2, 1);
  }
  p.px('#3fae5a', 22, 4, 3, 4);
  if (scale > 1) p.outline(OUTLINE);
  p.done();
}

// 48 x 34 front view of a garage: plaster wall, flat roof, sectional door (closed: slats, open: rolled up over a dark inside).
function garage(scene, scale, key, open) {
  const p = new ScaledPen(scene, key, 48, 34, scale);
  p.px('#d3c3a0', 0, 5, 48, 29);
  p.px(lighten('#d3c3a0', 0.25), 0, 5, 48, 2);
  p.px('#7b4b3c', 0, 0, 48, 5);
  p.px(darken('#7b4b3c', 0.3), 0, 4, 48, 1);
  p.px('#4a4f5a', 5, 10, 38, 24);
  if (open) {
    p.px('#2a2630', 6, 11, 36, 23);
    p.px('#6e7482', 6, 11, 36, 4);
    for (let x = 6; x < 42; x += 6) p.px('#555b68', x, 11, 1, 4);
    p.px('#e0a63a', 16, 29, 14, 2); p.px('#c43d3d', 17, 28, 12, 1); // a board leaning inside
    p.px('#16161e', 17, 31, 3, 2); p.px('#16161e', 26, 31, 3, 2);
  } else {
    for (let y = 11; y < 34; y += 6) {
      p.px('#9aa4b4', 6, y, 36, 5);
      p.px(lighten('#9aa4b4', 0.3), 6, y, 36, 1);
      p.px(darken('#9aa4b4', 0.25), 6, y + 4, 36, 1);
    }
    p.px('#3a3f4a', 22, 30, 4, 2);
  }
  if (scale > 1) p.outline(OUTLINE);
  p.shadow(24, 33.5, 22, 1.5, 0.25);
  p.done();
}

export function makeVehicleArt(scene, scale) {
  lock(scene, scale, 'lock-padlock', '#d64545', false);
  lock(scene, scale, 'lock-closed', '#3fae5a', false);
  lock(scene, scale, 'lock-open', '#e0a63a', true);
  chain(scene, scale);
  garage(scene, scale, 'garage-closed', false);
  garage(scene, scale, 'garage-open', true);
}
