// Weather service: state 'clear' | 'rain', following the schedule of ctx.day (AD-17); the `weather`
// intent (T) is a debug override that holds until the schedule changes. Owns the ambient
// time-of-day tint (updated once per game minute) and the darker rain tint
// overlay and the temporary puddles: while it rains, dry tiles near the camera become 'puddle'
// through the surfaces override API (AD-6), drawn by a fixed pool of tile images; when it
// stops they dry out again, oldest first. Rain particles belong to ParticleHub (it reads this).
// Emits `weather:changed` ({ state }).
import { puddleKey } from '../scenes/EnvArt.js';

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
    for (let i = 0; i < cfg.maxWet; i++) this.wet.push(scene.add.image(0, 0, 'tile-puddle').setOrigin(0).setScale(ctx.res.inv).setDepth(-0.9).setVisible(false));
    this.tx = new Int16Array(cfg.maxWet);
    this.ty = new Int16Array(cfg.maxWet);
    this.count = 0; // wet tiles in use, oldest first in a ring starting at `head`
    this.head = 0;
    this.timer = 0;
    ctx.world.register(this);
  }

  // Puddles belong to the map they dried on; indoors there is no rain and no daylight tint.
  unloadMap() {
    for (let i = 0; i < this.cfg.maxWet; i++) this.wet[i].setVisible(false);
    this.count = 0;
    this.head = 0;
  }

  loadMap() {
    if (this.ctx.map.indoor) this.intensity = 0;
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
    const outdoor = !this.ctx.map.indoor;
    amb.setVisible(outdoor && this.ambientAlpha > 0.005);
    if (amb.visible) {
      const v = this.scene.cameras.main.worldView;
      amb.setPosition(v.x, v.y).setSize(v.width, v.height).setAlpha(this.ambientAlpha);
    }
    const target = this.raining && outdoor ? 1 : 0;
    this.intensity += Math.max(-dt / c.fade, Math.min(dt / c.fade, target - this.intensity));
    const ov = this.overlay;
    ov.setVisible(this.intensity > 0);
    if (this.intensity > 0) {
      const v = this.scene.cameras.main.worldView;
      ov.setPosition(v.x, v.y).setSize(v.width, v.height).setAlpha(c.overlayAlpha * this.intensity);
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.raining && outdoor) {
      this.timer = c.puddleEvery;
      this.addPuddle();
    } else if (this.count > 0) {
      this.timer = c.dryEvery;
      this.dryOne();
    }
  }

  // Puddles gather in low spots, not everywhere: a fixed minority of tiles (by coordinate hash) that lie inside an
  // area of one surface, so they never straddle a kerb, edge or door mat.
  spot(tx, ty) {
    const { surfaces } = this.ctx;
    const base = surfaces.base(tx, ty);
    if (!this.cfg.wettable.includes(base) || ((((tx * 73856093) ^ (ty * 19349663)) >>> 0) % 1000) >= this.cfg.spotShare * 1000) return null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      if (x < 0 || y < 0 || x >= surfaces.cols || y >= surfaces.rowCount || surfaces.base(x, y) !== base) return null;
    }
    return base;
  }

  // A low spot within range of the camera centre, still dry, becomes a puddle.
  addPuddle() {
    const { surfaces } = this.ctx;
    const c = this.cfg;
    if (this.count >= c.maxWet) this.dryOne(); // recycle the oldest
    const mid = this.scene.cameras.main.midPoint;
    const ts = surfaces.tileSize;
    const r = c.range;
    for (let tries = 0; tries < 40; tries++) {
      const tx = Math.floor(mid.x / ts) + Math.floor((Math.random() * 2 - 1) * r);
      const ty = Math.floor(mid.y / ts) + Math.floor((Math.random() * 2 - 1) * r);
      if (tx < 0 || ty < 0 || tx >= surfaces.cols || ty >= surfaces.rowCount) continue;
      if (surfaces.at(tx * ts, ty * ts) !== surfaces.base(tx, ty)) continue;
      const base = this.spot(tx, ty);
      const key = base && puddleKey(base, tx, ty);
      if (!key || !this.scene.textures.exists(key)) continue;
      const i = (this.head + this.count) % c.maxWet;
      this.tx[i] = tx;
      this.ty[i] = ty;
      this.count++;
      surfaces.override(tx, ty, 'puddle');
      this.wet[i].setTexture(key).setPosition(tx * ts, ty * ts).setVisible(true);
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
