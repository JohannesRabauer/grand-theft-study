// Sprite shading pass (story 16.18) without Phaser: render/spriteShadeMath.js on a small bitmap. Run: node scripts/check-spriteshade.mjs
import assert from 'node:assert/strict';
import { shadeSprite } from '../render/spriteShadeMath.js';

const W = 24, H = 24;
const make = (fill = [200, 80, 60]) => {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) d.set([...fill, 255], (y * W + x) * 4);
  return d;
};
const px = (d, x, y) => [...d.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];
const lum = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const OUT = [22, 22, 30];

// the same input gives the same output, and nothing outside the sprite changes except the outline ring
const a = make(); shadeSprite(a, W, H, { hi: true, out: OUT });
const b = make(); shadeSprite(b, W, H, { hi: true, out: OUT });
assert.deepEqual([...a], [...b], 'deterministic');
assert.deepEqual(px(a, 0, 0), [0, 0, 0, 0], 'far corners stay empty');

// light from the top left: the rim at the top and left edge is lighter than the rim at the bottom and right
assert.ok(lum(px(a, 10, 4)) > lum(px(a, 10, 19)), 'top rim lighter than bottom rim');
assert.ok(lum(px(a, 4, 10)) > lum(px(a, 19, 10)), 'left rim lighter than right rim');
// the lower right of the body is a step darker than the upper left (ramp), and every shaded colour keeps its alpha
let lo = 0, hi = 0;
for (let y = 6; y < 12; y++) for (let x = 6; x < 12; x++) hi += lum(px(a, x, y));
for (let y = 12; y < 18; y++) for (let x = 12; x < 18; x++) lo += lum(px(a, x, y));
assert.ok(hi > lo, 'upper left lighter than lower right');
assert.ok(a.every((v, i) => i % 4 !== 3 || v === 0 || v === 255), 'no semi-transparent pixels');

// selective outline: the lit side borrows the colour it borders, the shaded side is the plain outline colour
assert.notDeepEqual(px(a, 3, 10).slice(0, 3), OUT, 'lit-side outline is tinted');
assert.deepEqual(px(a, 20, 10).slice(0, 3), OUT, 'shaded-side outline is the plain colour');
assert.ok(px(a, 10, 3)[3] === 255 && px(a, 10, 20)[3] === 255, 'outline ring exists on both sides');

// Low: no outline, no rim
const low = make(); shadeSprite(low, W, H, { hi: false, out: OUT });
assert.equal(px(low, 3, 10)[3], 0, 'Low draws no outline');

// turning sprites carry no light direction: the four edges shade alike
const t = make(); shadeSprite(t, W, H, { hi: true, turn: true, out: OUT });
assert.equal(Math.round(lum(px(t, 10, 4))), Math.round(lum(px(t, 10, 19))), 'turning sprite: top and bottom edge alike');
assert.deepEqual(px(t, 3, 10), px(t, 20, 10), 'turning sprite: outline alike on every side');

// emissive pixels are never shaded and tint their neighbours
const e = make(); e.set([255, 242, 160, 255], (10 * W + 19) * 4);
const before = px(e, 19, 10);
shadeSprite(e, W, H, { hi: true, out: OUT });
assert.deepEqual(px(e, 19, 10), before, 'headlight pixel untouched');
const plain = make(); shadeSprite(plain, W, H, { hi: true, out: OUT });
assert.notDeepEqual(px(e, 19, 9), px(plain, 19, 9), 'the body next to a lamp picks up its colour');

// very dark parts (tyres, outlines baked into the art) are left as drawn
const dark = make([14, 14, 18]); shadeSprite(dark, W, H, { hi: true, out: OUT });
assert.deepEqual(px(dark, 12, 12).slice(0, 3), [14, 14, 18], 'dark pixels untouched');

console.log('spriteshade: ok');
