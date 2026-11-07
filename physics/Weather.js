// Weather service: state 'clear' | 'rain', following the schedule of ctx.day (AD-17); the `weather`
// intent (T) is a debug override that holds until the schedule changes. Owns the ambient
// time-of-day tint (updated once per game minute) and the darker rain tint
// overlay and the temporary puddles: while it rains, dry tiles near the camera become 'puddle'
// through the surfaces override API (AD-6), drawn by a fixed pool of tile images; when it
// stops they dry out again, oldest first. Rain particles belong to ParticleHub (it reads this).
// Emits `weather:changed` ({ state }).
export class Weather {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.scheduled = ctx.day.weather;
    this.state = this.scheduled;
    this.intensity = 0; // 0..1, eased so rain fades in and out
    this.ambient = scene.add.rectangle(0, 0, 1, 1, 0xffffff).setOrigin(0).setDepth(9299).setVisible(false);
    this.ambientAlpha = 0;
    ctx.events.on('clock:tick', () => this.syncClock());
    this.syncClock();
    this.overlay = scene.add.rectangle(0, 0, 1, 1, parseInt(cfg.overlayColor.slice(1), 16)).setOrigin(0).setDepth(9300).setVisible(false);
    this.wet = [];
    for (let i = 0; i < cfg.maxWet; i++) this.wet.push(scene.add.image(0, 0, 'tile-puddle').setOrigin(0).setScale(ctx.res.inv).setDepth(-0.9).setAlpha(0.85).setVisible(false));
    this.tx = new Int16Array(cfg.maxWet);
    this.ty = new Int16Array(cfg.maxWet);
    this.count = 0; // wet tiles in use, oldest first in a ring starting at `head`
    this.head = 0;
    this.timer = 0;
  }

  get raining() { return this.state === 'rain'; }

  toggle() { this.set(this.raining ? 'clear' : 'rain'); }

  set(state) {
    if (state === this.state) return;
    this.state = state;
    this.ctx.events.emit('weather:changed', { state });
  }

  // Once per game minute: a changed schedule replaces any manual override, and the ambient tint follows the time.
  syncClock() {
    const { day } = this.ctx;
    if (day.weather !== this.scheduled) {
      this.scheduled = day.weather;
      this.set(this.scheduled);
    }
    const tint = day.tint;
    this.ambient.setFillStyle(tint.rgb);
    this.ambientAlpha = tint.alpha;
  }

  update(dt) {
    const c = this.cfg;
    const amb = this.ambient;
    amb.setVisible(this.ambientAlpha > 0.005);
    if (amb.visible) {
      const v = this.scene.cameras.main.worldView;
      amb.setPosition(v.x, v.y).setSize(v.width, v.height).setAlpha(this.ambientAlpha);
    }
    const target = this.raining ? 1 : 0;
    this.intensity += Math.max(-dt / c.fade, Math.min(dt / c.fade, target - this.intensity));
    const ov = this.overlay;
    ov.setVisible(this.intensity > 0);
    if (this.intensity > 0) {
      const v = this.scene.cameras.main.worldView;
      ov.setPosition(v.x, v.y).setSize(v.width, v.height).setAlpha(c.overlayAlpha * this.intensity);
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.raining) {
      this.timer = c.puddleEvery;
      this.addPuddle();
    } else if (this.count > 0) {
      this.timer = c.dryEvery;
      this.dryOne();
    }
  }

  // A random dry tile within range of the camera centre becomes a puddle.
  addPuddle() {
    const { surfaces } = this.ctx;
    const c = this.cfg;
    if (this.count >= c.maxWet) this.dryOne(); // recycle the oldest
    const mid = this.scene.cameras.main.midPoint;
    const ts = surfaces.tileSize;
    const r = c.range;
    for (let tries = 0; tries < 8; tries++) {
      const tx = Math.floor(mid.x / ts) + Math.floor((Math.random() * 2 - 1) * r);
      const ty = Math.floor(mid.y / ts) + Math.floor((Math.random() * 2 - 1) * r);
      if (tx < 0 || ty < 0 || tx >= surfaces.cols || ty >= surfaces.rowCount) continue;
      if (surfaces.at(tx * ts, ty * ts) !== surfaces.base(tx, ty) || !c.wettable.includes(surfaces.base(tx, ty))) continue;
      const i = (this.head + this.count) % c.maxWet;
      this.tx[i] = tx;
      this.ty[i] = ty;
      this.count++;
      surfaces.override(tx, ty, 'puddle');
      this.wet[i].setPosition(tx * ts, ty * ts).setVisible(true);
      return;
    }
  }

  dryOne() {
    const i = this.head;
    this.ctx.surfaces.clear(this.tx[i], this.ty[i]);
    this.wet[i].setVisible(false);
    this.head = (i + 1) % this.cfg.maxWet;
    this.count--;
  }
}
