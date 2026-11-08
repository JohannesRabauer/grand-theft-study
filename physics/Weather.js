// Weather service: state 'clear' | 'rain', following the schedule of ctx.day (AD-17); the `weather`
// intent (T) is a debug override that holds until the schedule changes. Owns the ambient
// time-of-day tint (updated once per game minute) and the darker rain tint
// overlay and the temporary puddles: while it rains, dry tiles near the camera become 'puddle'
// through the surfaces override API (AD-6), drawn by a fixed pool of tile images; when it
// stops they dry out again, oldest first. Rain particles belong to ParticleHub (it reads this).
// Story 12.1: a third state `snow` (the winter part of the day, data/weather.json `snow`): flakes drift down, a share of open tiles gets covered
// with snow (surface override 'snow', slows) and some of those with ice (override 'ice', very slippery); they melt away again oldest first
// when it stops. Emits `weather:changed` ({ state }).
import { puddleKey } from '../scenes/EnvArt.js';

// The snow, ice and flake pictures, drawn once (they belong to the game, not to a run): a lumpy white cover with sparkles, a pale glassy ice
// patch with highlight streaks, and a tiny flake. Fixed hashes, no random numbers.
function snowTextures(scene, res) {
  const px = 16 * res.scale;
  const hash = n => (Math.imul(n + 1, 2654435761) >>> 0) / 4294967296;
  const make = (key, draw, size = px) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, size, size);
    draw(tex.getContext(), size);
    tex.refresh();
  };
  for (let v = 0; v < 3; v++) {
    make(`weather-snow-${v}`, (c, s) => {
      c.fillStyle = 'rgba(244,248,255,0.92)';
      for (let k = 0; k < 7; k++) { c.beginPath(); c.ellipse(s * (0.2 + hash(v * 9 + k) * 0.6), s * (0.2 + hash(v * 9 + k + 40) * 0.6), s * (0.16 + hash(k + v) * 0.14), s * (0.12 + hash(k + v + 5) * 0.12), 0, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,1)';
      for (let k = 0; k < 6; k++) c.fillRect(Math.floor(s * hash(v * 5 + k + 90)), Math.floor(s * hash(v * 5 + k + 120)), Math.max(1, res.scale), Math.max(1, res.scale));
      c.fillStyle = 'rgba(170,190,220,0.45)';
      c.fillRect(0, s - Math.max(1, res.scale), s, Math.max(1, res.scale));
    });
  }
  for (let v = 0; v < 2; v++) {
    make(`weather-ice-${v}`, (c, s) => {
      c.fillStyle = 'rgba(190,225,245,0.62)';
      c.beginPath(); c.ellipse(s / 2, s / 2, s * (0.42 + v * 0.04), s * 0.36, 0.3 * v, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.lineWidth = Math.max(1, res.scale * 0.7);
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(s * (0.2 + k * 0.15), s * 0.7); c.lineTo(s * (0.4 + k * 0.15), s * 0.3); c.stroke(); }
    });
  }
  make('weather-flake', (c, s) => { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); c.fill(); }, Math.max(2, Math.round(2 * res.scale)));
}

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
    this.rainColor = parseInt(cfg.overlayColor.slice(1), 16);
    this.snowColor = parseInt(cfg.snow.overlayColor.slice(1), 16);
    this.overlay = scene.add.rectangle(0, 0, 1, 1, parseInt(cfg.overlayColor.slice(1), 16)).setOrigin(0).setDepth(9300).setVisible(false);
    this.wet = [];
    for (let i = 0; i < cfg.maxWet; i++) this.wet.push(scene.add.image(0, 0, 'tile-puddle').setOrigin(0).setScale(ctx.res.inv).setDepth(-0.9).setVisible(false));
    this.snowCfg = cfg.snow;
    this.snowTex = snowTextures(scene, ctx.res);
    const sc = cfg.snow;
    this.flakes = [];
    this.fx = new Float32Array(sc.flakes);
    this.fy = new Float32Array(sc.flakes);
    this.fp = new Float32Array(sc.flakes);
    for (let i = 0; i < sc.flakes; i++) {
      const h = Math.imul(i + 1, 2654435761) >>> 0; // fixed scatter: nothing here touches Math.random, the seeded runs stay repeatable
      this.fx[i] = (h % 1000) / 1000;
      this.fy[i] = ((h >>> 10) % 1000) / 1000;
      this.fp[i] = ((h >>> 20) % 628) / 100;
      this.flakes.push(scene.add.image(0, 0, 'weather-flake').setScale(ctx.res.inv).setDepth(9298).setVisible(false));
    }
    this.snowIntensity = 0;
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

  get snowing() { return this.state === 'snow'; }

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
      this.set(this.scheduled === 'snow' && window.SCHULWEG_GAME?.snowOff ? 'clear' : this.scheduled); // snowOff: test hook, the scripted school runs stay dry
    }
    const tint = day.tint;
    this.ambient.setFillStyle(tint.rgb);
    this.ambientAlpha = tint.alpha;
  }

  update(dt) {
    const c = this.cfg;
    const amb = this.ambient;
    const outdoor = !this.ctx.map.indoor;
    amb.setVisible(outdoor && this.ambientAlpha > 0.005 && !this.ctx.lights?.mapActive); // the light map (render/LightMap.js) replaces this tint overlay when it is active
    if (amb.visible) {
      const v = this.scene.cameras.main.worldView;
      amb.setPosition(v.x, v.y).setSize(v.width, v.height).setAlpha(this.ambientAlpha);
    }
    const target = this.raining && outdoor ? 1 : 0;
    this.intensity += Math.max(-dt / c.fade, Math.min(dt / c.fade, target - this.intensity));
    const snowTarget = this.snowing && outdoor ? 1 : 0;
    this.snowIntensity += Math.max(-dt / c.fade, Math.min(dt / c.fade, snowTarget - this.snowIntensity));
    const ov = this.overlay;
    const dim = this.intensity > 0 ? this.intensity : this.snowIntensity;
    ov.setVisible(dim > 0);
    if (dim > 0) {
      const v = this.scene.cameras.main.worldView;
      const snow = this.intensity <= 0;
      ov.setFillStyle(snow ? this.snowColor : this.rainColor);
      ov.setPosition(v.x, v.y).setSize(v.width, v.height).setAlpha((snow ? this.snowCfg.overlayAlpha : c.overlayAlpha) * dim);
    }
    this.flurry(dt);
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.raining && outdoor) {
      this.timer = c.puddleEvery;
      this.addPuddle();
    } else if (this.snowing && outdoor) {
      this.timer = this.snowCfg.patchEvery;
      this.addSnow();
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

  // Snowflakes drift down inside the camera view; positions are kept as shares of the view and moved without allocating.
  flurry(dt) {
    const sc = this.snowCfg;
    const show = this.snowIntensity > 0.01;
    const v = this.scene.cameras.main.worldView;
    const t = this.scene.time.now / 1000;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      if (f.visible !== show) f.setVisible(show);
      if (!show) continue;
      this.fy[i] += (sc.fall * (0.6 + (i % 5) * 0.12) * dt) / v.height;
      if (this.fy[i] > 1) this.fy[i] -= 1;
      f.setPosition(v.x + this.fx[i] * v.width + Math.sin(t * 0.9 + this.fp[i]) * sc.drift, v.y + this.fy[i] * v.height).setAlpha(this.snowIntensity);
    }
  }

  // Snow settles on open ground near the camera; some of it freezes to ice. Reuses the ring of wet tiles of the puddles.
  addSnow() {
    const { surfaces } = this.ctx;
    const c = this.cfg;
    const sc = this.snowCfg;
    if (this.count >= c.maxWet) this.dryOne();
    const mid = this.scene.cameras.main.midPoint;
    const ts = surfaces.tileSize;
    for (let tries = 0; tries < 40; tries++) {
      const tx = Math.floor(mid.x / ts) + Math.floor((Math.random() * 2 - 1) * c.range);
      const ty = Math.floor(mid.y / ts) + Math.floor((Math.random() * 2 - 1) * c.range);
      if (tx < 0 || ty < 0 || tx >= surfaces.cols || ty >= surfaces.rowCount) continue;
      if (surfaces.at(tx * ts, ty * ts) !== surfaces.base(tx, ty)) continue;
      const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
      if (!sc.wettable.includes(surfaces.base(tx, ty)) || (h % 1000) >= sc.spotShare * 1000) continue;
      const ice = ((h >>> 8) % 1000) < sc.iceShare * 1000;
      const i = (this.head + this.count) % c.maxWet;
      this.tx[i] = tx;
      this.ty[i] = ty;
      this.count++;
      surfaces.override(tx, ty, ice ? 'ice' : 'snow');
      this.wet[i].setTexture(ice ? `weather-ice-${h % 2}` : `weather-snow-${h % 3}`).setPosition(tx * ts, ty * ts).setVisible(true);
      return;
    }
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
