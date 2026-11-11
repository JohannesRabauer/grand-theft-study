// Sprite shading pass (story 16.18, AD-31, art bible 4): turns a finished sprite bitmap (RGBA bytes, before the baked contact
// shadow) into one that matches the lit world, without touching its design. Pure bytes in, bytes out, no Phaser, so
// scripts/check-spriteshade.mjs can run it in node.
//  - Sprites that turn with their heading (vehicles, riders, bikes: `o.turn`) cannot carry a baked light direction, so they get the
//    rotation-proof part only: a cool one-texel edge shade, the tinted outline on every side and the emissive halos.
//  - ramp: a diagonal from the lit top left to the shaded bottom right, posterised with a 4x4 Bayer matrix in whole base pixels,
//    one cool step darker towards the lower right and one warm step lighter at the top left (hue-shifted, never grey);
//  - rim: on Medium and High a one-texel warm rim where the silhouette faces the light (top and left) and a cool one where it
//    turns away (bottom and right);
//  - selective outline: the lit sides take a dark version of the colour they border, the shaded sides keep the plain outline
//    colour, so the figure does not sit in a uniform black box;
//  - emissive parts (lamps, tail lights, glints) are never shaded, and the body pixels next to them pick up a little of their colour.
// Everything is deterministic and runs once at texture build time.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const COOL = [28, 34, 80];
const WARM = [255, 238, 204];
const EMISSIVE = new Set(['fff2a0', 'fff3a0', 'ff4a4a', 'ff5050', 'c8352f', 'e6f8fb', 'fff1c8', 'ffd23f', 'ffe14d', 'fff6b0']);
const DARK_LIMIT = 40;

const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
const mixc = (r, g, b, to, t) => [Math.round(r + (to[0] - r) * t), Math.round(g + (to[1] - g) * t), Math.round(b + (to[2] - b) * t)];
const hexOf = (d, i) => ((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).padStart(6, '0');

export const SHADE = { edge: 0.16, rampDark: 0.1, rampLight: 0.1, rimLight: 0.24, rimDark: 0.2, halo: 0.4, outlineTint: 0.72 };

// `o`: { hi: Medium/High (rim, outline and 2-texel dither cells), turn: the sprite rotates in game, out: [r, g, b] outline colour or null }.
// Mutates `d`.
export function shadeSprite(d, w, h, o) {
  const cell = o.hi ? 1 : 0;
  const src = d.slice();
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 60;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) return;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const emissiveAt = (x, y) => solid(x, y) && src[(y * w + x) * 4 + 3] >= 250 && EMISSIVE.has(hexOf(src, (y * w + x) * 4));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] < 250 || emissiveAt(x, y)) continue;
      let r = src[i], g = src[i + 1], b = src[i + 2];
      let halo = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (emissiveAt(x + dx, y + dy)) { const j = ((y + dy) * w + x + dx) * 4; halo = [src[j], src[j + 1], src[j + 2]]; }
      if (halo) [r, g, b] = mixc(r, g, b, halo, SHADE.halo);
      else if (lum(r, g, b) >= DARK_LIMIT && o.turn) {
        if (o.hi && (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1))) [r, g, b] = mixc(r, g, b, COOL, SHADE.edge);
      } else if (lum(r, g, b) >= DARK_LIMIT) {
        const t = ((x - x0 + 0.5) / bw + (y - y0 + 0.5) / bh) / 2 + (BAYER[((y >> cell) & 3) * 4 + ((x >> cell) & 3)] / 16 - 0.5) * 0.3;
        if (t > 0.6) [r, g, b] = mixc(r, g, b, COOL, SHADE.rampDark * (t > 0.78 ? 2 : 1));
        else if (t < 0.1) [r, g, b] = mixc(r, g, b, WARM, SHADE.rampLight);
        if (o.hi) {
          if (!solid(x - 1, y) || !solid(x, y - 1)) [r, g, b] = mixc(r, g, b, WARM, SHADE.rimLight);
          else if (!solid(x + 1, y) || !solid(x, y + 1)) [r, g, b] = mixc(r, g, b, COOL, SHADE.rimDark);
        }
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  }
  if (!o.out || !o.hi) return;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      let col = null;
      // an outline texel on the lit side (the sprite lies below or to its right) borrows the colour it borders
      for (const [dx, dy] of o.turn ? [[1, 0], [0, 1], [-1, 0], [0, -1]] : [[1, 0], [0, 1]]) if (!col && solid(x + dx, y + dy)) { const j = ((y + dy) * w + x + dx) * 4; col = mixc(d[j], d[j + 1], d[j + 2], o.out, SHADE.outlineTint); }
      if (!col && !o.turn && (solid(x - 1, y) || solid(x, y - 1))) col = o.out;
      if (!col) continue;
      const i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
}
