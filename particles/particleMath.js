// Pure particle maths (story 16.11, AD-31). No Phaser: scripts/check-particles.mjs runs it in node.
// The hub (ParticleHub.js) uses the budget rule, the season conditions and the glow tracker that keeps a pooled light handle on every glowing particle.

export const hexInt = s => parseInt(String(s).replace('#', ''), 16);

// How many of `n` more particles fit: the live total never goes past the tier's `max`.
export const roomFor = (n, max, total) => Math.max(0, Math.min(n, max - total));

// Does a seasonal effect's condition hold? `state`: { season, phase, weather, daylight (bool) }.
export function holds(when, state) {
  if (when.seasons && !when.seasons.includes(state.season)) return false;
  if (when.phases && !when.phases.includes(state.phase)) return false;
  if (when.notWeather && when.notWeather.includes(state.weather)) return false;
  if (when.day && !state.daylight) return false;
  return true;
}

// Lights that follow glowing particles. `lights` is the pool of render/lightMath.js (ctx.lights); a particle is anything with
// x, y, alpha, isAlive() and an `emitter`. start() takes a handle (nothing when the pool is full), update() moves it with the
// particle and fades it with the particle's alpha, and gives it back when the particle died or the pool was cleared;
// drop(emitter) and clear() give back at once (an emitter cleared, a map unloaded).
export class GlowTracker {
  constructor(lights) {
    this.lights = lights;
    this.list = [];
  }

  get count() { return this.list.length; }

  start(p, g) {
    if (p.glowH) return true; // re-emitted before the sweep let go of its light
    const h = this.lights.add({ x: p.x, y: p.y, radius: g.radius, color: g.color, intensity: g.intensity });
    if (!h) return false;
    p.glowH = h;
    p.glowBase = g.intensity;
    this.list.push(p);
    return true;
  }

  update() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const h = p.glowH;
      if (h?.alive && p.isAlive()) { h.move(p.x, p.y).setIntensity(p.glowBase * Math.min(1, Math.max(0, p.alpha))); continue; }
      this.#free(i);
    }
  }

  drop(emitter) {
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].emitter === emitter) this.#free(i);
  }

  clear() {
    for (let i = this.list.length - 1; i >= 0; i--) this.#free(i);
  }

  #free(i) {
    const p = this.list[i];
    p.glowH?.release();
    p.glowH = null;
    this.list[i] = this.list[this.list.length - 1];
    this.list.pop();
  }
}

// Short lights of the celebration bursts: `add` returns false when `cap` are running or the pool is full; they fade out over their last half second.
export class FlashLights {
  constructor(lights, cap = 3) {
    this.lights = lights;
    this.cap = cap;
    this.list = [];
  }

  get count() { return this.list.length; }

  add(o, seconds) {
    if (this.list.length >= this.cap) return false;
    const h = this.lights.add(o);
    if (!h) return false;
    this.list.push({ h, t: seconds, base: o.intensity });
    return true;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t -= dt;
      if (f.t > 0 && f.h.alive) { f.h.setIntensity(f.base * Math.min(1, f.t * 2)); continue; }
      f.h.release();
      this.list[i] = this.list[this.list.length - 1];
      this.list.pop();
    }
  }

  clear() {
    for (const f of this.list) f.h.release();
    this.list.length = 0;
  }
}
