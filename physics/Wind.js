// Wind service (AD-7): one slowly varying vector, strength 0..1. It never touches bodies or
// emitters; every consumer (particles, props, flags) reads `ctx.wind.vector` and applies it.
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export class Wind {
  constructor(cfg) {
    this.cfg = cfg;
    this.t = cfg.startTime;
    this.vector = { x: 0, y: 0 };
    this.strength = 0;
    this.update(0);
  }

  // Three sines of unrelated periods make gusts that never repeat visibly.
  update(dt) {
    const c = this.cfg;
    const t = (this.t += dt);
    const [p1, p2, p3] = c.periods;
    const gust = 0.5 * Math.sin(TAU * t / p1) + 0.3 * Math.sin(TAU * t / p2 + 1.3) + 0.2 * Math.sin(TAU * t / p3 + 2.1);
    this.strength = Math.max(0, Math.min(1, c.base + c.gust * gust));
    const a = (c.baseAngle + c.swing * Math.sin(TAU * t / c.swingPeriod)) * DEG;
    this.vector.x = Math.cos(a) * this.strength;
    this.vector.y = Math.sin(a) * this.strength;
  }
}
