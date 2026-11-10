// Procedural vegetation art (story 16.6, AD-30/AD-31): tree crowns (3 species x 3 shapes x seasons), hedge runs and the trunks
// that stand in the ground under the crowns. Drawn on the 2x authoring grid (one unit = half a base pixel) and scaled to the
// render class like scenes/NpcArt.js, so Low (1x) and Medium/High (2x) share one definition. Light comes from the top left:
// the lit side gets the light steps, the lower right is dithered towards the shadow step, the edge is outlined in a dark
// step of the ramp. Nothing here runs per frame.
import { ScaledPen } from './NpcArt.js';
import { darken } from './HiResArt.js';
import { commonBox, seeded } from '../render/vegetationMath.js';

const B = 2; // authoring units per base pixel
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const HEDGE_MARGIN = { canvas: 8, left: 5, top: 7, right: 5, bottom: 5 }; // base pixels

function rng(seed) {
  let s = (Math.floor(seed * 4294967296) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// The look a season uses for a species (a pine has only summer and winter).
export const crownLook = (cfg, species, season) => (cfg.palettes[species][season] ? season : 'summer');
export const crownKey = (species, shape, look) => `veg-crown-${species}-${shape}-${look}`;
export const hedgeKey = id => `veg-hedge-${id}`;

const cell = (p, col, bx, by, w = 1, h = 1) => p.px(col, bx * B, by * B, w * B, h * B);

// Dithers one leaf mass: the lower right towards the shadow step, the upper left towards the light steps. Only paints where
// something is already drawn (source-atop), so the silhouette stays what the lobes made. (cx, cy, rx, ry) in base pixels.
function shade(p, pal, cx, cy, rx, ry, kx = 0.75, ky = 0.9) {
  p.c.globalCompositeOperation = 'source-atop';
  for (let by = Math.floor(cy - ry); by < cy + ry; by++) {
    for (let bx = Math.floor(cx - rx); bx < cx + rx; bx++) {
      const u = ((bx + 0.5 - cx) / rx) * kx + ((by + 0.5 - cy) / ry) * ky;
      const checker = (bx + by) & 1;
      if (u > 0.62 || (u > 0.3 && checker === 0)) cell(p, pal[0], bx, by);
      else if (u < -0.66 || (u < -0.34 && checker === 0)) cell(p, u < -0.66 ? pal[4] : pal[3], bx, by);
    }
  }
  p.c.globalCompositeOperation = 'source-over';
}

// Three passes over the same lobes: silhouette, lit body, light cap. lobes: [cx, cy, rx, ry] in base pixels.
function mass(p, pal, lobes) {
  for (const [cx, cy, rx, ry] of lobes) p.ell(pal[1], cx * B, cy * B, rx * B, ry * B);
  for (const [cx, cy, rx, ry] of lobes) p.ell(pal[2], (cx - 0.8) * B, (cy - 1) * B, Math.max(1, rx - 1.6) * B, Math.max(1, ry - 1.6) * B);
  for (const [cx, cy, rx, ry] of lobes) p.ell(pal[3], (cx - 2) * B, (cy - 2.4) * B, rx * 0.5 * B, ry * 0.42 * B);
}

// Leaf texture: single-pixel dashes of the dark and light steps, only inside the mass.
function speckle(p, pal, r, n, cx, cy, rx, ry) {
  p.c.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < n; i++) {
    const bx = Math.floor(cx - rx + r() * rx * 2);
    const by = Math.floor(cy - ry + r() * ry * 2);
    cell(p, r() < 0.5 ? pal[1] : pal[3], bx, by, r() < 0.3 ? 2 : 1, 1);
  }
  p.c.globalCompositeOperation = 'source-over';
}

function dots(p, col, r, n, cx, cy, rx, ry) {
  p.c.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < n; i++) cell(p, col, Math.floor(cx - rx * 0.8 + r() * rx * 1.6), Math.floor(cy - ry * 0.7 + r() * ry * 1.5));
  p.c.globalCompositeOperation = 'source-over';
}

function oakLobes(r, shape, c, box) {
  const lobes = [];
  const n = 6 + shape;
  for (let i = 0; i < n; i++) {
    const a = ((i + r() * 0.5) / n) * Math.PI * 2;
    const rl = c.rx * (0.4 + r() * 0.14);
    const rv = rl * (c.ry / c.rx) * 1.08;
    lobes.push([box.ox + Math.cos(a) * (c.rx - rl) * (0.86 + r() * 0.14), box.oy + c.cy + Math.sin(a) * (c.ry - rv) * (0.86 + r() * 0.14), rl, rv]);
  }
  lobes.push([box.ox, box.oy + c.cy, c.rx * 0.6, c.ry * 0.6]);
  return lobes.sort((a, b) => a[1] - b[1]);
}

function birchLobes(r, shape, c, box) {
  const lobes = [];
  const n = 8 + shape;
  for (let i = 0; i < n; i++) {
    const a = ((i + r() * 0.6) / n) * Math.PI * 2;
    const rl = c.rx * (0.3 + r() * 0.1);
    const rv = rl * (c.ry / c.rx) * 1.1;
    lobes.push([box.ox + Math.cos(a) * (c.rx - rl) * (0.8 + r() * 0.2), box.oy + c.cy + Math.sin(a) * (c.ry - rv) * (0.8 + r() * 0.2), rl, rv]);
  }
  lobes.push([box.ox, box.oy + c.cy, c.rx * 0.55, c.ry * 0.55]);
  return lobes.sort((a, b) => a[1] - b[1]);
}

// Stacked, ragged tiers that widen downwards.
function pineLobes(r, shape, c, box) {
  const tiers = 5 + (shape & 1);
  const lobes = [];
  const ryT = 5;
  const top = c.cy - c.ry;
  const span = 2 * c.ry - 2 * ryT;
  for (let i = 0; i < tiers; i++) {
    const w = c.rx * (0.4 + (0.6 * i) / (tiers - 1)) * (0.9 + r() * 0.1);
    const y = box.oy + top + ryT + (span * i) / (tiers - 1);
    lobes.push([box.ox, y, w, ryT]);
    lobes.push([box.ox - w * 0.55, y + 1, w * 0.5, ryT * 0.8], [box.ox + w * 0.55, y + 1, w * 0.5, ryT * 0.8]);
  }
  return lobes;
}

const LOBES = { oak: oakLobes, pine: pineLobes, birch: birchLobes };

function drawCrown(scene, cfg, species, shape, look, f, box) {
  const c = cfg.species[species].crown;
  const pal = cfg.palettes[species][look];
  const p = new ScaledPen(scene, 'veg-crown-tmp', box.w * B, box.h * B, f);
  const r = rng(seeded(species.length * 31 + shape, look.length, 3));
  mass(p, pal, LOBES[species](r, shape, c, box));
  const cx = box.ox;
  const cy = box.oy + c.cy;
  shade(p, pal, cx, cy, c.rx, c.ry);
  speckle(p, pal, r, species === 'pine' ? 70 : 90, cx, cy, c.rx * 0.9, c.ry * 0.9);
  const blossom = cfg.seasonBlossom[species]?.[look];
  if (blossom) dots(p, blossom, r, 16, cx, cy, c.rx, c.ry);
  else if (species === 'oak' && look === 'summer') dots(p, '#e0483c', r, 3, cx, cy, c.rx * 0.8, c.ry * 0.8);
  p.outline(darken(pal[0], 0.45)).done();
  return p.tex.getSourceImage();
}

// Every crown is one frame of one atlas (frames stacked in a column, all the same size), so the wind pipeline can batch them.
export const CROWN_ATLAS = 'veg-crowns';
export function makeCrowns(scene, cfg, f) {
  const box = commonBox(cfg);
  const s = f * B;
  const list = [];
  for (const species of Object.keys(cfg.species)) {
    for (const season of SEASONS) {
      const look = crownLook(cfg, species, season);
      if (season !== look) continue; // a pine reuses its summer crown in spring and autumn
      for (let shape = 0; shape < cfg.shapes; shape++) list.push([species, shape, look]);
    }
  }
  const fw = box.w * s;
  const fh = box.h * s;
  const atlas = scene.textures.createCanvas(CROWN_ATLAS, fw, fh * list.length);
  list.forEach(([species, shape, look], row) => {
    atlas.getContext().drawImage(drawCrown(scene, cfg, species, shape, look, f, box), 0, row * fh);
    scene.textures.remove('veg-crown-tmp');
    atlas.add(crownKey(species, shape, look), 0, 0, row * fh, fw, fh);
  });
  atlas.refresh();
  return list.length;
}

// One run of hedge tiles as a lumpy leaf mass on a canvas of its own, cut into one frame per tile (named `<tx>_<ty>`) so each
// tile sorts by its own base line while the lumps still overshoot the tile border. `seed` makes runs differ.
export function makeHedgeRun(scene, cfg, run, seed, f) {
  const m = HEDGE_MARGIN;
  if (scene.textures.exists(hedgeKey(run.id))) scene.textures.remove(hedgeKey(run.id)); // a run that ended left its hedges behind
  const wt = run.x1 - run.x0 + 1;
  const ht = run.y1 - run.y0 + 1;
  const p = new ScaledPen(scene, hedgeKey(run.id), (wt * 16 + 2 * m.canvas) * B, (ht * 16 + 2 * m.canvas) * B, f);
  const pal = cfg.palettes.hedge;
  const r = rng(seeded(run.x0, run.y0, seed));
  const own = new Set(run.tiles.map(([x, y]) => `${x},${y}`));
  const has = (x, y) => own.has(`${x},${y}`);
  const lobes = [];
  for (const [tx, ty] of run.tiles) {
    const ox = (tx - run.x0) * 16 + m.canvas;
    const oy = (ty - run.y0) * 16 + m.canvas;
    const edge = (x, y) => lobes.push([ox + x, oy + y, 3.4 + r() * 2.2, 3.2 + r() * 2]); // a lump on the tile's edge: it overshoots
    for (let i = 0; i < 5; i++) lobes.push([ox + 2 + r() * 12, oy + 3 + r() * 11, 3.6 + r() * 2.6, 3.4 + r() * 2.4]);
    for (let i = 0; i < 3; i++) {
      const t = 2 + r() * 12;
      if (!has(tx, ty - 1)) edge(t, 1 + r() * 2);
      if (!has(tx, ty + 1)) edge(t, 13 + r() * 2);
      if (!has(tx - 1, ty)) edge(1 + r() * 2, 2 + r() * 12);
      if (!has(tx + 1, ty)) edge(13 + r() * 2, 2 + r() * 12);
    }
    const x0 = has(tx - 1, ty) ? 0 : 3; // a solid core keeps the mass closed; the lumps make the edge
    const x1 = has(tx + 1, ty) ? 16 : 13;
    const y0 = has(tx, ty - 1) ? 0 : 3;
    const y1 = has(tx, ty + 1) ? 16 : 13;
    p.px(pal[1], (ox + x0) * B, (oy + y0) * B, (x1 - x0) * B, (y1 - y0) * B);
  }
  mass(p, pal, lobes);
  for (const [cx, cy, rx, ry] of lobes) shade(p, pal, cx, cy, rx, ry, 0.85, 0.85);
  for (const [tx, ty] of run.tiles) {
    const ox = (tx - run.x0) * 16 + m.canvas;
    const oy = (ty - run.y0) * 16 + m.canvas;
    speckle(p, pal, r, 22, ox + 8, oy + 8, 8, 8);
    if (!has(tx, ty + 1)) { // the front foot of the hedge sits in shadow
      p.c.globalCompositeOperation = 'source-atop';
      for (let bx = 0; bx < 16; bx++) { cell(p, pal[0], ox + bx, oy + 14); if (bx & 1) cell(p, pal[0], ox + bx, oy + 13); cell(p, pal[0], ox + bx, oy + 15); }
      p.c.globalCompositeOperation = 'source-over';
    }
  }
  p.outline(darken(pal[0], 0.45)).done();
  const s = f * B;
  for (const [tx, ty] of run.tiles) {
    const fx = (tx - run.x0) * 16 + m.canvas - m.left;
    const fy = (ty - run.y0) * 16 + m.canvas - m.top;
    p.tex.add(`${tx}_${ty}`, 0, fx * s, fy * s, (16 + m.left + m.right) * s, (16 + m.top + m.bottom) * s);
  }
  return hedgeKey(run.id);
}
