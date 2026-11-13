// The backdrop of the main menu (story 16.14): a dusk over the town, drawn once from code in base pixels (AD-30, no files): dithered sky bands, a low sun,
// a skyline with lit windows, a street with a kerb. Seeded, so it never changes between visits and never touches the game's random sequence.
import { uiRng } from './uiKit.js';

const SKY = ['#16213f', '#1f2c52', '#2b3a68', '#3d4577', '#5a4f80', '#8a5f80', '#c4707a', '#e89a6a', '#ffc27a'];
const HORIZON = 176;
const HOUSE = ['#2b3850', '#232e45', '#1f2940', '#343f5a'];

// Rectangles [x, y, w, h, colour, alpha] of the whole backdrop for a w x h view.
export function backdropRects(w, h, seed = 5) {
  const rnd = uiRng(seed);
  const out = [];
  const band = HORIZON / SKY.length;
  SKY.forEach((c, i) => {
    const y0 = Math.round(i * band);
    const y1 = Math.round((i + 1) * band);
    out.push([0, y0, w, y1 - y0, c, 1]);
    // two rows of 2 px dashes of the next colour at the lower edge: a dither, not a smooth blend
    if (i + 1 < SKY.length) for (let x = 0; x < w; x += 4) out.push([x + (i % 2) * 2, y1 - 1, 2, 1, SKY[i + 1], 1], [x + 2 - (i % 2) * 2, y1 - 2, 2, 1, SKY[i + 1], 1]);
  });
  for (let i = 0; i < 26; i++) out.push([Math.floor(rnd() * w), Math.floor(rnd() * 70), 1, 1, '#fff1c4', 1]); // a few early stars
  // the low sun, as stacked pixel rows with a dithered rim
  const sx = Math.round(w * 0.74);
  const sy = HORIZON - 14;
  for (let dy = -14; dy <= 14; dy++) {
    const half = Math.floor(Math.sqrt(15 * 15 - dy * dy));
    out.push([sx - half, sy + dy, half * 2, 1, '#fff1c4', 1]);
    if (dy % 2 === 0) out.push([sx - half - 1, sy + dy, 1, 1, '#ffc27a', 1], [sx + half, sy + dy, 1, 1, '#ffc27a', 1]);
  }
  // the skyline: houses of different heights, some with a gable, windows lit at random
  let x = -6;
  while (x < w) {
    const bw = 24 + Math.floor(rnd() * 26);
    const bh = 36 + Math.floor(rnd() * 58);
    const c = HOUSE[Math.floor(rnd() * HOUSE.length)];
    const top = HORIZON - bh;
    out.push([x, top, bw, bh, c, 1], [x, top, bw, 1, '#4a5f7f', 1], [x + bw - 1, top + 1, 1, bh - 1, '#16161e', 1]);
    if (rnd() < 0.6) for (let g = 0; g < 8; g++) out.push([x + g * 2, top - 1 - Math.min(g, 7 - g), 2, 1 + Math.min(g, 7 - g), c, 1]); // a gable
    for (let wy = top + 6; wy < HORIZON - 8; wy += 9) for (let wx = x + 5; wx < x + bw - 7; wx += 9) {
      const lit = rnd() < 0.42;
      out.push([wx, wy, 4, 5, lit ? '#ffd36b' : '#16161e', 1]);
      if (lit) out.push([wx, wy, 4, 1, '#fff1c4', 1]);
    }
    x += bw + (rnd() < 0.3 ? 2 : 0);
  }
  // the street: dark asphalt, a pale kerb, a dashed line, a dark foreground
  out.push([0, HORIZON, w, h - HORIZON, '#2c2e38', 1], [0, HORIZON, w, 3, '#7c7f88', 1], [0, HORIZON + 3, w, 1, '#16161e', 1]);
  for (let dx = 0; dx < w; dx += 28) out.push([dx + Math.floor(rnd() * 3), HORIZON + 30, 14, 2, '#7c7f88', 1]);
  for (let dx = 0; dx < w; dx += 6) out.push([dx, HORIZON + 4 + (Math.floor(dx / 6) % 2), 3, 1, '#3c3f48', 1]);
  return out;
}

// Painted once into a canvas texture at the render scale (a few thousand rectangles are too many to replay as Graphics every frame).
export function drawBackdrop(scene, res) {
  const key = `menu-backdrop-${res.scale}`;
  if (!scene.textures.exists(key)) {
    const canvas = scene.textures.createCanvas(key, res.w * res.scale, res.h * res.scale);
    const c = canvas.getContext();
    for (const [x, y, w, h, color, alpha] of backdropRects(res.w, res.h)) {
      c.globalAlpha = alpha;
      c.fillStyle = color;
      c.fillRect(x * res.scale, y * res.scale, w * res.scale, h * res.scale);
    }
    canvas.refresh();
  }
  return scene.add.image(0, 0, key).setOrigin(0).setScale(res.inv).setDepth(-10);
}
