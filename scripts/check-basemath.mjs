// Shared render helpers (story 16.16): the values of render/baseMath.js and EnvDraw.mix/shade, and a guard that the render and art
// modules keep importing them instead of growing their own copy of a colour parser or an easing curve again.
// Run: node scripts/check-basemath.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { clamp01, lerp, smoothT, hex, rgb01, rgba } from '../render/baseMath.js';
import { smooth } from '../render/atmosphereMath.js';

assert.equal(clamp01(-3), 0);
assert.equal(clamp01(0.4), 0.4);
assert.equal(clamp01(9), 1);
assert.equal(lerp(10, 20, 0.25), 12.5);
assert.equal(smoothT(0), 0);
assert.equal(smoothT(1), 1);
assert.equal(smoothT(0.5), 0.5);
assert.equal(smooth(2, 4, 3), 0.5);
assert.equal(smooth(2, 4, 9), 1);
assert.equal(hex('#ffd9a0'), 0xffd9a0);
assert.deepEqual(rgb01(0xff0080), [1, 0, 128 / 255]);
assert.deepEqual(rgba(0x102030), [16, 32, 48, 255]);

// EnvDraw uses `document` only in canvas(); the colour maths run in node. shade is mix towards white or black.
const { mix, shade, rgbOf, rng } = await import('../scenes/EnvDraw.js');
assert.deepEqual(rgbOf('#102030'), [16, 32, 48]);
assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
assert.equal(shade('#808080', 0), '#808080');
assert.equal(shade('#808080', 1), '#ffffff');
assert.equal(shade('#808080', -1), '#000000');
assert.equal(shade('#204060', 0.5), mix('#204060', '#ffffff', 0.5));
assert.equal(shade('#204060', -0.25), mix('#204060', '#000000', 0.25));
const a = rng(7), b = rng(7);
assert.deepEqual([a(), a(), a()], [b(), b(), b()]);

// no second copy of the helpers in the render and art modules
const dirs = ['render', 'scenes', 'ui/screens'];
const banned = [
  [/^(?:export )?const hex\s*=/m, 'hex parser'],
  [/^(?:export )?const lerp\s*=/m, 'lerp'],
  [/^(?:export )?const clamp01\s*=/m, 'clamp01'],
  [/^(?:export )?const rgb01\s*=/m, 'rgb01'],
  [/^(?:export )?const smooth\s*=\s*t\s*=>\s*t \* t/m, 'smoothstep']
];
const owners = new Set(['render/baseMath.js']);
for (const d of dirs) {
  for (const f of readdirSync(new URL(`../${d}/`, import.meta.url)).filter(n => n.endsWith('.js'))) {
    const path = `${d}/${f}`;
    if (owners.has(path)) continue;
    const src = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    for (const [re, what] of banned) assert.ok(!re.test(src), `${path} defines its own ${what}; import it from render/baseMath.js`);
  }
}
console.log('check-basemath: ok');
