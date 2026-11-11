import { ScaledPen } from './NpcArt.js';
import { darken, lighten } from './HiResArt.js';

const OUT = '#16161e';
const GLASS = '#8fd0e0';
const GLASS_DARK = '#3d6f8a';

// Top-down road vehicles facing right (story 16.20): rounded body in a lit/shaded ramp, wheels under arches, glass with a
// glint, headlights at the nose and tail lights at the back. The grid is (length + 8) x (width + 6); the body sits at (4, 3).
function wheels(p, xs, width) {
  for (const x of xs) for (const y of [1, width + 3]) {
    p.px(OUT, x, y, 6, 3);
    p.px('#3a3a44', x + 1, y, 4, 1);
  }
}

function shell(p, length, width, color) {
  const x = 4, y = 3, d = darken(color, 0.28), l = lighten(color, 0.3);
  p.px(d, x + 1, y, length - 2, width);                          // rounded body: corners left out
  p.px(d, x, y + 1, length, width - 2);
  p.px(color, x + 1, y + 1, length - 3, width - 3);
  p.px(color, x + 2, y, length - 5, 1);
  p.px(l, x + 3, y + 1, length - 8, 1);                          // lit top edge
  p.px(darken(color, 0.12), x + 1, y + width - 3, length - 3, 1); // shade towards the bottom
  p.px('#fff2a0', x + length - 2, y + 2, 2, 3);                   // headlights
  p.px('#fff2a0', x + length - 2, y + width - 5, 2, 3);
  p.px('#c8352f', x, y + 2, 1, 3);                                // tail lights
  p.px('#c8352f', x, y + width - 5, 1, 3);
  p.px('#2c2c36', x, y + 5, 1, width - 10);                       // bumpers
  p.px('#2c2c36', x + length - 1, y + 5, 1, width - 10);
}

function glass(p, x, y, w, h) {
  p.px(GLASS_DARK, x, y, w, h);
  p.px(GLASS, x + 1, y + 1, w - 2, h - 2);
  p.px('#e6f8fb', x + 1, y + 1, Math.max(1, w - 4), 1);
}

function car(p, length, width, color) {
  wheels(p, [8, length - 8], width);
  shell(p, length, width, color);
  const y = 3;
  p.px(darken(color, 0.12), 25, y + 1, 9, width - 2);               // bonnet seam
  p.px(lighten(color, 0.25), 26, y + 2, 7, 1);
  glass(p, 22, y + 2, 4, width - 4);                               // windscreen
  glass(p, 10, y + 3, 3, width - 6);                               // rear window
  p.px(lighten(color, 0.18), 14, y + 3, 8, width - 6);             // roof
  p.px(darken(color, 0.2), 14, y + width - 4, 8, 1);
  p.px(darken(color, 0.3), 17, y + 3, 1, width - 6);              // door line
  p.px(darken(color, 0.4), 26, y - 1, 3, 1); p.px(darken(color, 0.4), 26, y + width, 3, 1); // mirrors
}

function van(p, length, width, color) {
  wheels(p, [9, length - 8], width);
  shell(p, length, width, color);
  const y = 3;
  glass(p, 33, y + 2, 4, width - 4);                               // short windscreen over a stubby bonnet
  p.px(lighten(color, 0.22), 9, y + 2, 22, width - 4);             // cargo roof
  p.px(darken(color, 0.2), 9, y + width - 3, 22, 1);
  p.px(darken(color, 0.32), 9, y + 2, 1, width - 4);              // rear doors
  p.px(darken(color, 0.3), 20, y + 4, 1, width - 8);              // roof ribs
  p.px(darken(color, 0.3), 26, y + 4, 1, width - 8);
  p.px('#f4f1e8', 12, y + 7, 7, 2);                                // stripe
  p.px(darken(color, 0.4), 33, y - 1, 3, 1); p.px(darken(color, 0.4), 33, y + width, 3, 1);
}

function tram(p, length, width, color) {
  wheels(p, [8, 24, length - 28, length - 12], width);
  shell(p, length, width, color);
  const y = 3, mid = length / 2 + 4;
  p.px(darken(color, 0.1), 6, y + 1, length - 3, width - 2);
  p.px('#9aa0ac', 10, y + 3, mid - 14, width - 6);               // two roof sections with air units
  p.px('#9aa0ac', mid + 5, y + 3, length - mid - 10 + 4, width - 6);
  p.px('#c4c9d4', 10, y + 3, mid - 14, 1); p.px('#c4c9d4', mid + 5, y + 3, length - mid - 10 + 4, 1);
  for (const x of [15, 26, mid + 12, mid + 24]) { p.px('#7a808c', x, y + 6, 5, width - 12); p.px('#b8bec9', x, y + 6, 5, 1); }
  p.px('#2c2c36', mid - 3, y + 1, 7, width - 2);                  // the bellows of the joint
  for (let k = 0; k < 7; k += 2) p.px('#555a66', mid - 3 + k, y + 1, 1, width - 2);
  p.px('#2c2c36', mid - 5, y + 3, 2, width - 6); p.px('#2c2c36', mid + 4, y + 3, 2, width - 6);
  glass(p, length - 3, y + 2, 5, width - 4);                       // driver cabs at both ends
  glass(p, 5, y + 2, 4, width - 4);
  p.px('#f4f1e8', 12, y + 1, length - 18, 1);                      // white roof edge stripe
  p.px('#f4f1e8', 12, y + width - 2, length - 18, 1);
  p.px('#2c2c36', mid - 11, y + 6, 3, 1); p.px('#2c2c36', mid - 11, y + 6, 1, width - 12); // pantograph
  p.px('#2c2c36', mid - 11, y + width - 7, 3, 1); p.px('#2c2c36', mid - 9, y + 6, 1, width - 12);
}



export function makeExpansionArt(scene, scale) {
  for (const [key, color, kind] of [
    ['play-swing', '#f3c66b', 'seat'], ['play-sign', '#669ac9', 'sign'], ['play-plank', '#ba905c', 'plank'],
    ['play-kite', '#ea6c88', 'kite'], ['play-flag', '#65c79a', 'flag'], ['play-cart', '#de8f4c', 'cart'],
    ['play-crate', '#bd976a', 'crate'], ['play-floater', '#82bddd', 'boat']
  ]) {
    const p = new ScaledPen(scene, key, 18, 18, scale);
    p.px('#273744', 2, 4, 14, 11);
    p.px(color, 3, 5, 12, 9);
    p.px('#ffe8b3', 4, 6, 10, 1);
    if (['seat', 'plank'].includes(kind)) p.px('#273744', 2, 10, 14, 5);
    if (kind === 'sign') { p.px('#fff4cf', 5, 8, 8, 1); p.px('#645346', 8, 14, 2, 4); }
    if (kind === 'kite') { p.px('#fff4cf', 8, 3, 1, 13); p.px('#fff4cf', 2, 9, 14, 1); }
    if (kind === 'cart') for (const x of [2, 13]) { p.px('#17242e', x, 2, 3, 3); p.px('#17242e', x, 14, 3, 3); }
    if (kind === 'crate') { p.px('#62462d', 8, 5, 2, 9); p.px('#62462d', 3, 9, 12, 2); }
    if (kind === 'boat') { p.px('#fff0cc', 8, 1, 1, 13); p.px('#f4cb63', 9, 2, 5, 7); }
    p.done();
  }
  const draw = { car, van, tram };
  for (const [kind, length, width, color] of [['car', 34, 18, '#e87567'], ['van', 42, 20, '#75b6d5'], ['tram', 72, 22, '#d8bd58']]) {
    const p = new ScaledPen(scene, kind, length + 8, width + 6, scale);
    draw[kind](p, length, width, color);
    p.lit(OUT, scale > 1, true);
    p.done();
  }
}
