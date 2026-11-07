// Pools (AD-8). Everything is allocated once at the largest tier size; a tier change only moves
// the active cap, so nothing is created or destroyed after startup.

// Registry used by the debug overlay (and later systems): name -> pool exposing live() and cap.
export class Pools {
  constructor() { this.byName = new Map(); }
  register(name, pool) { this.byName.set(name, pool); }
}

// Ring of sprites that fade (and optionally grow/rise) over their life. No allocation in update.
export class FadePool {
  constructor(scene, ctx, key, depth, capKey) {
    this.capKey = capKey;
    this.inv = ctx.res.inv; // display scale of the texture (AD-14)
    const max = ctx.quality.maxOf(capKey);
    this.cap = ctx.quality.tier[capKey];
    this.next = 0;
    this.sprites = [];
    for (let i = 0; i < max; i++) this.sprites.push(scene.add.image(0, 0, key).setDepth(depth).setVisible(false));
    this.age = new Float32Array(max);
    this.life = new Float32Array(max); // 0 = free
    this.a0 = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.rise = new Float32Array(max);
    ctx.events.on('quality:changed', () => this.setCap(ctx.quality.tier[capKey]));
  }

  setCap(cap) {
    this.cap = cap;
    for (let i = cap; i < this.sprites.length; i++) { this.sprites[i].setVisible(false); this.life[i] = 0; }
    if (this.next >= cap) this.next = 0;
  }

  live() {
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (this.life[i] !== 0) n++;
    return n;
  }

  spawn(x, y, rot, life, a0, s0, s1, rise) {
    const i = this.next;
    this.next = (i + 1) % this.cap; // oldest entry is recycled when full
    this.age[i] = 0; this.life[i] = life; this.a0[i] = a0;
    this.s0[i] = s0; this.s1[i] = s1; this.rise[i] = rise;
    this.sprites[i].setPosition(x, y).setRotation(rot).setScale(s0 * this.inv).setAlpha(a0).setVisible(true);
  }

  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] === 0) continue;
      const t = (this.age[i] += dt) / this.life[i];
      const s = this.sprites[i];
      if (t >= 1) { s.setVisible(false); this.life[i] = 0; continue; }
      s.setAlpha(this.a0[i] * (1 - t)).setScale((this.s0[i] + (this.s1[i] - this.s0[i]) * t) * this.inv);
      if (this.rise[i]) s.y -= this.rise[i] * dt;
    }
  }
}
