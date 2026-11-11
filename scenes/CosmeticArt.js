import { ScaledPen } from './NpcArt.js';

// Pixel art of the shop's cosmetics (story 10.1): hats that sit above the head and glow rings under the feet. Drawn on the
// 1x grid and scaled to the tier like the other procedural art (keys `cosm-<item id>`).
const OUT = '#16161e';

const HATS = {
  'hat-cap': p => {
    p.px(OUT, 2, 3, 12, 6);
    p.px('#d6453d', 3, 3, 10, 5); p.px('#ee6a5f', 3, 3, 10, 1);
    p.px(OUT, 9, 7, 6, 3); p.px('#a8302a', 10, 7, 4, 2);          // brim
    p.px('#ffffff', 7, 4, 2, 2);                                    // badge
  },
  'hat-party': p => {
    p.px(OUT, 5, 0, 6, 1); p.px(OUT, 4, 1, 8, 2); p.px(OUT, 3, 3, 10, 6);
    p.px('#9b5de5', 6, 1, 4, 2); p.px('#b983ff', 5, 3, 6, 2); p.px('#9b5de5', 4, 5, 8, 2); p.px('#ffd84d', 4, 7, 8, 1);
    p.px('#ffd84d', 7, 0, 2, 1); p.px('#ffffff', 6, 4, 1, 1); p.px('#ff6f91', 9, 6, 1, 1);
  },
  'hat-crown': p => {
    p.px(OUT, 1, 2, 14, 8);
    p.px('#ffcf3d', 2, 6, 12, 3); p.px('#fff0a0', 2, 6, 12, 1);
    for (const x of [2, 6, 10]) { p.px('#ffcf3d', x, 3, 3, 3); p.px('#fff0a0', x + 1, 3, 1, 1); }
    p.px('#e0483c', 7, 7, 2, 2); p.px('#4dd2ff', 3, 7, 1, 1); p.px('#4dd2ff', 12, 7, 1, 1);
  }
};

const RINGS = { 'ring-blue': ['#4dd2ff', '#bff0ff'], 'ring-gold': ['#ffcf3d', '#fff0a0'] };

export function makeCosmeticArt(scene, scale) {
  for (const [id, draw] of Object.entries(HATS)) {
    const p = new ScaledPen(scene, `cosm-${id}`, 16, 11, scale);
    draw(p);
    p.lit(null, scale > 1);
    p.done();
  }
  for (const [id, [main, light]] of Object.entries(RINGS)) {
    const p = new ScaledPen(scene, `cosm-${id}`, 30, 14, scale);
    p.ell(main, 15, 7, 14, 6);
    p.done();
    // a ring: draw the outer ellipse, then clear the inner one
    const tex = scene.textures.get(`cosm-${id}`);
    const c = tex.getContext();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    const f = scale;
    c.beginPath(); c.ellipse(15 * f, 7 * f, 10 * f, 4 * f, 0, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = light;
    for (let x = 4; x < 27; x += 5) c.fillRect(Math.round(x * f), Math.round(2 * f), Math.max(1, Math.round(2 * f)), Math.max(1, Math.round(f)));
    tex.refresh();
  }
}
