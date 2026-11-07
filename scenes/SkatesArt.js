// Procedural art for the inline skates (story 5.3): the skates lying on the ground, the rider poses and the grabbable bus.
// Top-down, facing right, on the 40x24 grid of the other riders (bus: 64x26), drawn like scenes/HiResArt.js `skate`.
// Rider poses (suffix of the texture key): '' glide (feet side by side), '-pushA' / '-pushB' (one foot kicks out behind, the
// arms swing), '-crouch' (hop) and '-grab' (low, one arm stretched to the bus handle). The rider has no baked shadow:
// the sprite lifts off it (entities/Skates.js).
import { lighten } from './HiResArt.js';
import { ScaledPen } from './NpcArt.js';

const WHEEL = '#0e0e12';

// One inline skate: a boot over a wheel frame, `len` px long; `shear` tilts it (px of y per px of x).
function skate(p, o, x, y, shear, len = 11) {
  for (let k = -2; k < len + 2; k++) p.px(WHEEL, x + k, Math.round(y + shear * k) + 1, 1, 2);
  for (let k = 0; k < len; k++) {
    const yy = Math.round(y + shear * k);
    p.px(o.frameDark, x + k, yy, 1, 4);
    p.px(o.frame, x + k, yy, 1, 3);
  }
  p.px(lighten(o.frame, 0.35), x + len - 3, Math.round(y + shear * (len - 3)), 3, 1);
  for (const k of [-1, 2, 5, 8, 11]) p.px('#c8c8d2', x + k, Math.round(y + shear * k) + 1, 1, 1);
  if (o.inline) {
    for (const k of [0, 3, 6, 9]) p.px('#edf3fa', x + k, Math.round(y + shear * k) + 3, 2, 2);
    p.px('#233c70', x + 2, Math.round(y + shear * 2) - 1, 4, 3);
    p.px('#9edfea', x + 3, Math.round(y + shear * 3), 2, 1);
  }
}

export function skates(p, o) {
  if (!o.rider) {
    skate(p, o, 12, 6, 0);
    skate(p, o, 12, 14, 0);
    return;
  }
  const pose = o.pose;
  const push = pose === 'pushA' ? -1 : pose === 'pushB' ? 1 : 0;
  const low = pose === 'crouch' || pose === 'grab';
  // feet first, the torso covers their middle
  if (push) {
    skate(p, o, 5, push < 0 ? 4 : 17, push * 0.45);            // the kicking foot, out and back
    skate(p, o, 17, push < 0 ? 15 : 5, 0);                     // the gliding foot, ahead
  } else {
    skate(p, o, 12, 6, 0);
    skate(p, o, 12, 14, 0);
  }
  const ty = low ? 6.2 : 7.6;
  const lean = push ? 0.6 : 0;
  p.ell(o.jacketDark, 17 + lean, 12.5, 5, ty);
  p.ell(o.jacket, 16.6 + lean, 11.8, 4.5, ty - 0.7);
  p.px(o.jacketLight, 13 + lean, 8, 1, 7);
  if (pose === 'grab') {
    p.px(o.jacket, 17, 8, 12, 3);                              // reaching arm to the handle
    p.px('#f2c9a0', 29, 8, 3, 3);
    p.px(o.jacket, 15, 15, 4, 3);                              // the other tucked in
    p.px('#f2c9a0', 18, 16, 2, 2);
  } else if (push) {
    const fwd = push < 0 ? 3 : 18;                             // arm swing against the kicking leg
    p.px(o.jacket, 17, fwd, 6, 3);
    p.px('#f2c9a0', 22, fwd, 2, 2);
    const back = push < 0 ? 18 : 3;
    p.px(o.jacket, 9, back, 6, 3);
    p.px('#f2c9a0', 8, back + 1, 2, 2);
  } else {
    const arm = low ? 5 : 3;
    p.px(o.jacket, 15, arm, 4, 3); p.px(o.jacket, 15, 24 - arm - 3, 4, 3);
    p.px('#f2c9a0', 18, arm + (low ? 1 : 0), 2, 2); p.px('#f2c9a0', 18, 24 - arm - 3 + 1, 2, 2);
  }
  p.ell(o.hair, 17.5 + lean, 12, 4.7, 4.7);
  p.px(o.hairLight, 14 + lean, 9, 4, 1);
  p.px('#f2c9a0', 21 + lean, 10, 2, 4);
  o.cap?.(p);
}

// The grabbable bus, rear on the left, drawn on a 64x26 grid of world pixels (the riders' grids are twice their world size);
// the body centre is (34, 13) (sprite origin, see entities/GrabTargets.js) and the yellow handle bar sticks out of the rear.
export function bus(p) {
  p.px('#7a1717', 6, 2, 56, 22);
  p.px('#d83a2e', 7, 3, 54, 19);
  p.px('#f0574a', 8, 3, 52, 1);
  p.px('#f4f1e8', 8, 12, 46, 2);                               // white roof stripe
  for (const x of [13, 25, 37]) { p.px('#b8b8c0', x, 6, 8, 5); p.px('#d6d6de', x + 1, 7, 6, 1); p.px('#b8b8c0', x, 15, 8, 5); }
  p.px('#2a2a33', 6, 3, 2, 20);                                // rear
  p.px('#ff5050', 6, 4, 2, 3); p.px('#ff5050', 6, 19, 2, 3);
  p.px('#1d3a4a', 55, 3, 7, 20);                               // windscreen
  p.px('#7fc4e0', 56, 4, 5, 18);
  p.px('#e8f6fb', 57, 5, 1, 6);
  p.px('#2a2a33', 58, 0, 3, 2); p.px('#2a2a33', 58, 24, 3, 2); // mirrors
  p.px('#fff3a0', 61, 5, 2, 3); p.px('#fff3a0', 61, 18, 2, 3); // headlights
  p.px('#555560', 3, 6, 4, 2); p.px('#555560', 3, 18, 4, 2);   // handle arms
  p.px('#ffd23f', 1, 5, 3, 16);                                // handle bar
  for (const y of [7, 11, 15]) p.px('#2a2a33', 1, y, 3, 2);
}

export function makeBusArt(scene, scale) {
  const p = new ScaledPen(scene, 'bus', 64, 26, scale);
  bus(p);
  if (scale > 1) p.outline('#16161e');
  p.shadow(34, 24.5, 29, 2, 0.25);
  p.done();
}
