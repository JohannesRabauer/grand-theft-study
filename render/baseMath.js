// Small Phaser-free helpers shared by the render maths and modules (story 16.16): colour strings, channel splits, easing.
// One copy each, so the passes cannot drift apart.

export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothT = t => t * t * (3 - 2 * t); // smoothstep of an already clamped 0..1

export const hex = s => parseInt(s.slice(1), 16); // '#rrggbb' to 0xRRGGBB
export const rgb01 = n => [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; // 0xRRGGBB to 0..1 channels
export const rgba = n => [n >> 16, (n >> 8) & 255, n & 255, 255]; // 0xRRGGBB to opaque 0..255 channels
