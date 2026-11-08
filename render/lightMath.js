// Pure light maths and the light pool (AD-31, story 16.2). No Phaser: scripts/check-lighting.mjs runs it in node.
// A light is a radial pool with stepped (posterized) falloff, so its edge stays pixel art; the pool hands out
// handles (add / move / release) and never allocates per frame.

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// Light level 0..1 at distance d from a light of the given radius: 1 - (d/r)^2 falloff cut into `steps` flat bands
// (levels 1/steps .. 1, 0 outside the radius), so the pool has crisp stepped rings. `bias` shifts the value before the
// cut (ordered dithering).
export function lightLevel(d, radius, steps, bias = 0) {
  if (d >= radius) return 0;
  const q = d / radius;
  const s = Math.min(1, 1 - q * q + bias);
  return s <= 0 ? 0 : Math.ceil(s * steps) / steps;
}

// Pixels (0..255, row by row) of a light texture of 2*radius square pixels. `dither` 0..1 is the strength of the ordered
// dithering at the band edges (0 = hard bands).
export function lightPixels(radius, steps, dither = 0) {
  const size = radius * 2;
  const px = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - radius, y + 0.5 - radius);
      const bias = dither ? ((BAYER4[(x & 3) + 4 * (y & 3)] + 0.5) / 16 - 0.5) * dither / steps : 0;
      px[y * size + x] = Math.round(lightLevel(d, radius, steps, bias) * 255);
    }
  }
  return px;
}

// The multiply colour (0..1 per channel) of the ambient light for a day tint { rgb, alpha } (services/dayTime.js tintAt):
// white at alpha 0 (the world is not touched), the tint colour at full strength, never darker than `floor`.
export function ambientFor(tint, cfg, out = { r: 1, g: 1, b: 1 }) {
  const a = Math.min(1, Math.max(0, tint.alpha * cfg.strength));
  const ch = shift => {
    const c = ((tint.rgb >> shift) & 255) / 255;
    return Math.max(cfg.floor, 1 - a + c * a);
  };
  out.r = ch(16);
  out.g = ch(8);
  out.b = ch(0);
  return out;
}

export const ambientRgb = c => (Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255);
export const darkness = c => Math.max(0, 1 - (0.299 * c.r + 0.587 * c.g + 0.114 * c.b));

// ---- lamp schedules (story 16.3): street lamps and signs switch on at dusk and off at dawn, each a little earlier or later
// than the next (`jitter` 0..1 is the lamp's own offset), so the street does not light up in one frame.
const hash01 = (a, b) => {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

// Is a lamp with this jitter lit at `minute`? `sched`: { on, onSpread, off, offSpread } in game minutes. Lit from `on` in the
// evening until `off` the next morning (the day clock runs from the morning to bedtime, so both windows are in one day).
export function lampLit(minute, sched, jitter) {
  return minute >= sched.on + jitter * sched.onSpread || minute < sched.off + jitter * sched.offSpread;
}

export const WARMUP_CELL = 0.4; // seconds; a lamp changes its state at most once per cell (2.5 Hz, under the 3 Hz limit)

// Light level 0..1 of a lamp `since` seconds after it was switched on: a short flicker that settles (`warm` seconds), then 1.
export function warmupLevel(since, warm, seed = 0) {
  if (since >= warm) return 1;
  if (since < 0) return 0;
  const ramp = since / warm;
  const on = hash01(seed, Math.floor(since / WARMUP_CELL)) < 0.25 + ramp * 0.75;
  return on ? 0.5 + 0.5 * ramp : 0.12;
}

// Lights a tier may spend on fixed things (lamps, signs): the tier limit minus the reserve kept for moving lights.
export const fixedBudget = (limit, reserve) => Math.max(0, limit - reserve);

// The light pool: `cap` slots, `limit` of them usable (the quality tier). add() returns a handle or null when full.
export class LightPool {
  constructor(cap) {
    this.cap = cap;
    this.limit = cap;
    this.slots = Array.from({ length: cap }, (_, i) => ({ i, x: 0, y: 0, radius: 0, color: 0xffffff, intensity: 1, flicker: 0, phase: 0, at: -1, handle: null }));
    this.free = this.slots.slice().reverse();
    this.active = []; // dense list of live slots; the light map walks it each frame
  }

  get count() { return this.active.length; }

  add(o) {
    if (!this.free.length || this.active.length >= this.limit) return null;
    const s = this.free.pop();
    s.x = o.x; s.y = o.y; s.radius = o.radius ?? 48;
    s.color = o.color ?? 0xffffff; s.intensity = o.intensity ?? 1; s.flicker = o.flicker ?? 0;
    s.phase = o.phase ?? s.i * 1.7;
    s.at = this.active.push(s) - 1;
    const pool = this;
    s.handle = {
      get alive() { return s.at >= 0; },
      move(x, y) { s.x = x; s.y = y; return this; },
      setIntensity(v) { s.intensity = v; return this; },
      set(p) { for (const k in p) if (k in s && k !== 'at' && k !== 'i' && k !== 'handle') s[k] = p[k]; return this; },
      release() { pool.#release(s); }
    };
    return s.handle;
  }

  #release(s) {
    if (s.at < 0) return;
    const last = this.active.pop();
    if (last !== s) { this.active[s.at] = last; last.at = s.at; }
    s.at = -1;
    s.handle = null;
    this.free.push(s);
  }

  // Lowers the usable count (a quality switch): lights above the limit stay allocated but are not drawn.
  setLimit(n) { this.limit = Math.max(0, Math.min(this.cap, n)); }

  releaseAll() { while (this.active.length) this.#release(this.active[this.active.length - 1]); }
}
