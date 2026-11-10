// Pure maths of the atmosphere passes (AD-31, story 16.12): the layer targets from weather, clock and daylight, easing, the wet
// ground (which tiles shine, how much), the seeded noise banks of the Low and Canvas fallback, ripples and reflection picks.
// No Phaser: scripts/check-atmosphere.mjs runs it in node.

export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

const hash01 = (a, b, c = 0) => {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
export { hash01 };

// Moves `cur` towards `target` by at most dt / secs (a layer takes `secs` seconds from nothing to full, so no layer pops).
export function approach(cur, target, dt, secs) {
  const step = dt / Math.max(0.001, secs);
  return cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
}

// 0..1 trapezoid over a window in game minutes: rises over `ramp` minutes from `from`, falls over `ramp` minutes to `to`.
export function windowShare(minute, from, to, ramp) {
  if (minute <= from - 0.001 || minute >= to) return 0;
  return clamp01(Math.min((minute - from) / ramp, (to - minute) / ramp));
}

// The targets (0..1) of the layers. s: { state, minute, dark, indoor, rain }. Indoors everything is off; the morning mist also hangs
// in rain and snow (thinner); cloud shadows need a clear sky and daylight.
export function layerTargets(cfg, s) {
  if (s.indoor) return { fog: 0, mist: 0, clouds: 0, curtain: 0 };
  const clear = s.state === 'clear' || s.state === 'fog';
  const m = cfg.mist;
  return {
    fog: s.state === 'fog' ? 1 : 0,
    mist: windowShare(s.minute, m.from, m.to, m.ramp) * (clear ? 1 : m.wetShare),
    clouds: s.state === 'clear' ? 1 - smooth(cfg.clouds.fadeFrom, cfg.clouds.fadeTo, s.dark) : 0,
    curtain: s.rain
  };
}

// The single haze layer both fog and mist draw: density, band thresholds, noise scale and colour, blended by the layer weights.
export function hazeBlend(cfg, fog, mist, out = { density: 0, lo: 0, hi: 1, scale: 1, color: [1, 1, 1] }) {
  const f = fog * cfg.fog.density;
  const m = mist * cfg.mist.density;
  out.density = Math.max(f, m);
  const w = f + m > 0 ? f / (f + m) : 0; // the share of fog in the mix
  out.lo = lerp(cfg.mist.lo, cfg.fog.lo, w);
  out.hi = lerp(cfg.mist.hi, cfg.fog.hi, w);
  out.scale = lerp(cfg.mist.scale, cfg.fog.scale, w);
  for (let i = 0; i < 3; i++) out.color[i] = lerp(cfg.mist.rgb[i], cfg.fog.rgb[i], w);
  return out;
}

// ---- wet ground: tiles shine one after the other, each at its own wetness threshold
export function wetStep(wet, rain, dt, cfg) {
  return rain > 0.05 ? Math.min(1, wet + dt * rain / cfg.wet.rise) : Math.max(0, wet - dt / cfg.wet.dry);
}
export const wetThreshold = (tx, ty) => 0.04 + hash01(tx, ty, 7) * 0.9;
export const wetAlpha = (wet, th, soft = 0.12) => clamp01((wet - th) / soft);
export const wetVariant = (tx, ty, n) => Math.floor(hash01(tx, ty, 3) * n);

// Class of sheen a surface gets (-1: none): 0 dark (asphalt, lane), 1 light (concrete, path, cobble). `classes`: { surface: class }.
export function sheenClass(classes, surface) {
  const c = classes[surface];
  return c === undefined ? -1 : c;
}

// Fills `out` (Int32Array of x,y,class,variant quadruples, flat) with the wet tiles of the view; returns the count (capped).
export function collectWet(out, cap, view, ts, cols, rows, baseAt, overAt, classes, variants) {
  const x0 = Math.max(0, Math.floor(view.x / ts) - 1);
  const y0 = Math.max(0, Math.floor(view.y / ts) - 1);
  const x1 = Math.min(cols - 1, Math.floor(view.right / ts) + 1);
  const y1 = Math.min(rows - 1, Math.floor(view.bottom / ts) + 1);
  let n = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (n >= cap) return n;
      const base = baseAt(tx, ty);
      const cl = sheenClass(classes, base);
      if (cl < 0 || overAt(tx, ty) !== base) continue; // puddles, snow and ice keep their own look
      out[n * 4] = tx;
      out[n * 4 + 1] = ty;
      out[n * 4 + 2] = cl;
      out[n * 4 + 3] = wetVariant(tx, ty, variants);
      n++;
    }
  }
  return n;
}

// ---- seeded tileable noise for the Low and Canvas fallback (the shader computes the same kind of field on the GPU)
export function noiseTile(size, seed, octaves = 3, cells = 4) {
  const out = new Float32Array(size * size);
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const g = cells << o;
    const amp = 1 / (1 << o);
    total += amp;
    const val = (ix, iy) => hash01(((ix % g) + g) % g, ((iy % g) + g) % g, seed + o * 101);
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * g;
      const iy = Math.floor(fy);
      const ty = smooth(0, 1, fy - iy);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * g;
        const ix = Math.floor(fx);
        const tx = smooth(0, 1, fx - ix);
        const a = lerp(val(ix, iy), val(ix + 1, iy), tx);
        const b = lerp(val(ix, iy + 1), val(ix + 1, iy + 1), tx);
        out[y * size + x] += lerp(a, b, ty) * amp;
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer4 = (x, y) => (BAYER[(x & 3) + 4 * (y & 3)] + 0.5) / 16;

// A density 0..1 cut into `steps` flat levels with ordered dither at the band edges: returns the level 0..steps.
export function bandLevel(d, steps, x, y) {
  return Math.max(0, Math.min(steps, Math.floor(d * steps + bayer4(x, y))));
}

// RGBA pixels of a haze bank: alpha = posterised band of the noise, `rgb` the colour (the sprite alpha scales the density).
export function hazePixels(noise, size, lo, hi, steps, rgb) {
  const px = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const lvl = bandLevel(smooth(lo, hi, noise[y * size + x]), steps, x, y);
      const i = (y * size + x) * 4;
      px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = Math.round(lvl / steps * 255);
    }
  }
  return px;
}

// RGBA pixels of a cloud shadow bank: a dithered two-tone edge (core and a speckled rim), the sprite alpha is the strength.
export function shadowPixels(noise, size, lo, hi, rgb) {
  const px = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = smooth(lo, hi, noise[y * size + x]);
      const on = s > 0.8 || (s > 0.02 && s + (bayer4(x, y) - 0.5) * 0.9 > 0.5);
      const i = (y * size + x) * 4;
      px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = on ? 255 : 0;
    }
  }
  return px;
}

// ---- ripples on puddles: a ring that grows through `frames` pictures over `life` seconds
export const rippleFrame = (age, life, frames) => (age >= life ? -1 : Math.min(frames - 1, Math.floor((age / life) * frames)));

// ---- reflections: the first `cap` lamps for which `reflects(lamp)` holds (lit, in view, standing on wettable ground)
export function pickReflections(lamps, cap, out, reflects) {
  let n = 0;
  for (let i = 0; i < lamps.length && n < cap; i++) {
    const l = lamps[i];
    if (reflects(l)) out[n++] = l;
  }
  return n;
}

// Drift of the clouds and haze: world units per second along the wind, plus a slow constant so a calm day still moves.
export function drift(wind, cfg) {
  return { x: cfg.driftBase + wind.x * cfg.driftWind, y: cfg.driftBase * 0.35 + wind.y * cfg.driftWind };
}
