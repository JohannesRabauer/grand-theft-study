// Pure maths of the seasonal atmosphere (AD-31, story 16.19): layer targets from season, weather, clock and daylight, the snow cover
// (which tiles of a map take snow, how much each shows), the frost border of the Low and Canvas fallback and the picks of beams
// and heat wisps. No Phaser: scripts/check-season.mjs runs it in node. Easing and noise come from render/atmosphereMath.js.
import { approach, clamp01, smooth, windowShare, hash01, noiseTile, bandLevel } from './atmosphereMath.js';
import { buildingAt, isFacade } from './buildingMath.js';

export { approach, hash01 };

export const KIND_ROOF = 1;
export const KIND_KERB = 2;

// ---- the layer targets (0..1). Indoors everything goes to nothing, except the snow cover, which only waits.
export function coverTarget(cfg, s) {
  if (s.snowing) return 1;
  return cfg.cover.seasons.includes(s.season) ? cfg.cover.hold : 0;
}

// The cover rises over `rise` seconds and melts over `melt`; `cur` stays put indoors (the roofs are not there to melt).
export function coverStep(cur, target, dt, cfg, indoor) {
  if (indoor) return cur;
  return approach(cur, target, dt, target > cur ? cfg.cover.rise : cfg.cover.melt);
}

export function frostTarget(cfg, s) {
  if (s.indoor || s.season !== 'winter') return 0;
  return s.snowing ? cfg.frost.snowing : cfg.frost.winter;
}

// Hot, clear hours: the season's strength times a trapezoid over the afternoon.
export function heatTarget(cfg, s) {
  if (s.indoor || s.state !== 'clear') return 0;
  const k = cfg.heat.seasons[s.season] ?? 0;
  return k * windowShare(s.minute, cfg.heat.from, cfg.heat.to, cfg.heat.ramp);
}

export function raysTarget(cfg, s) {
  if (s.indoor) return 0;
  return (cfg.rays.weather[s.state] ?? 0) * (1 - smooth(cfg.rays.fadeFrom, cfg.rays.fadeTo, s.dark));
}

// ---- snow cover: each tile turns white at its own threshold, over a ramp `soft` wide, so a cover of 0.5 is patchy and 1 is complete.
export const snowThreshold = (tx, ty) => 0.04 + hash01(tx, ty, 41) * 0.9;
export const snowAlpha = (cover, th, soft) => clamp01((cover * (1 + soft) - th) / soft);

// Which tiles of a map take snow: roof tiles of buildings (not the front wall) and the kerb edge of pavement beside a road.
// Returns { kind, frame } as flat arrays (index ty * cols + tx). Frames: roofs 0..variants-1, kerbs variants + side mask (N 1, E 2, S 4, W 8).
const ROAD = new Set(['asphalt', 'lane']);
const PAVED = new Set(['concrete', 'path']);
export function snowTiles(map, info, variants) {
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const kind = new Uint8Array(rows * cols);
  const frame = new Uint8Array(rows * cols);
  const name = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? '' : map.legend[map.rows[y][x]]);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const i = ty * cols + tx;
      if (buildingAt(info, tx, ty)) {
        if (!isFacade(info, tx, ty)) { kind[i] = KIND_ROOF; frame[i] = Math.floor(hash01(tx, ty, 43) * variants); }
      } else if (PAVED.has(name(tx, ty))) {
        const mask = (ROAD.has(name(tx, ty - 1)) ? 1 : 0) | (ROAD.has(name(tx + 1, ty)) ? 2 : 0) | (ROAD.has(name(tx, ty + 1)) ? 4 : 0) | (ROAD.has(name(tx - 1, ty)) ? 8 : 0);
        if (mask) { kind[i] = KIND_KERB; frame[i] = variants + mask; }
      }
    }
  }
  return { kind, frame };
}

// Fills `out` (Int32Array of x, y, frame triples) with the snow tiles of the view; returns the count (capped).
export function collectSnow(out, cap, view, ts, cols, rows, tiles) {
  const x0 = Math.max(0, Math.floor(view.x / ts));
  const y0 = Math.max(0, Math.floor(view.y / ts));
  const x1 = Math.min(cols - 1, Math.floor(view.right / ts));
  const y1 = Math.min(rows - 1, Math.floor(view.bottom / ts));
  let n = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const i = ty * cols + tx;
      if (!tiles.kind[i]) continue;
      if (n >= cap) return n;
      out[n * 3] = tx; out[n * 3 + 1] = ty; out[n * 3 + 2] = tiles.frame[i];
      n++;
    }
  }
  return n;
}

// ---- frost border (Low and Canvas): the same field the grade shader computes, as RGBA pixels of a w x h picture.
// d: base px from the nearest edge, softened so corners freeze deeper (a harmonic mean of the two edge distances).
export const frostDepth = (x, y, w, h) => {
  const ex = Math.min(x + 0.5, w - x - 0.5);
  const ey = Math.min(y + 0.5, h - y - 0.5);
  return 2 / (1 / ex + 1 / ey);
};

export function frostPixels(w, h, cfg) {
  const f = cfg.frost;
  const N = 128;
  const noise = noiseTile(N, 61, 2, 8);
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const reach = f.reach * (0.5 + noise[(y % N) * N + (x % N)]);
      const s = clamp01(1 - frostDepth(x, y, w, h) / reach);
      const lvl = bandLevel(s, f.steps, x, y);
      const i = (y * w + x) * 4;
      px[i] = Math.round(f.rgb[0] * 255); px[i + 1] = Math.round(f.rgb[1] * 255); px[i + 2] = Math.round(f.rgb[2] * 255);
      px[i + 3] = Math.round((lvl / f.steps) * f.alpha * 255);
    }
  }
  return px;
}

// ---- picks: the beams under the crowns in view and the tiles that carry a heat wisp
// Fills `out` with trees (a stable share of them, by their tile hash) whose crown touches the view; returns the count, at most `cap`.
export function pickRays(trees, view, cap, out, share, margin = 24) {
  let n = 0;
  for (let i = 0; i < trees.length && n < cap; i++) {
    const t = trees[i];
    if (t.cx < view.x - margin || t.cx > view.right + margin || t.cy < view.y - margin || t.cy > view.bottom + margin) continue;
    if (hash01(t.tx, t.ty, 47) < share) out[n++] = t;
  }
  return n;
}

// Fills `out` (Int32Array of x, y pairs, base px) with road tiles in view that carry a wisp (a fixed share by hash); returns the count.
export function pickWisps(out, cap, view, ts, cols, rows, isRoad, share) {
  const x0 = Math.max(0, Math.floor(view.x / ts));
  const y0 = Math.max(0, Math.floor(view.y / ts));
  const x1 = Math.min(cols - 1, Math.floor(view.right / ts));
  const y1 = Math.min(rows - 1, Math.floor(view.bottom / ts));
  let n = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (n >= cap) return n;
      if (hash01(tx, ty, 53) >= share || !isRoad(tx, ty)) continue;
      out[n * 2] = tx * ts + Math.floor(hash01(tx, ty, 55) * 6);
      out[n * 2 + 1] = ty * ts + 3 + Math.floor(hash01(tx, ty, 57) * 10);
      n++;
    }
  }
  return n;
}
