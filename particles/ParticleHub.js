// Particle registry (AD-8): a few shared pooled emitters, created once. Everything fires through
// ctx.particles.emit(name, x, y, opts); nothing is created per frame. Each emitter gets a share of
// the tier's `maxParticles` (re-read on `quality:changed`), and `particleMul` scales burst sizes.
// The hub also drives the effects that come from the world: surface effects under every player (dust,
// footsteps, wheel dust, splash crowns, drips), rain, ambient smoke and steam, falling leaves and petals,
// dust motes in window light, lamp embers, fish ripples and the celebration bursts. Wind is applied here
// as emitter gravity (AD-7).
// Story 16.11: every emission goes through `put`, so the live total never passes the tier's `maxParticles`;
// glowing particles (data `glow`) hold a pooled ctx.lights handle for their life (GlowTracker); every new
// always-on effect has an `...Off` test flag (scripts/smoke/env.js).
import { FlashLights, GlowTracker, hexInt, holds, roomFor } from './particleMath.js';

const DEG = Math.PI / 180;
const flag = name => window.SCHULWEG_GAME?.[name];

export class ParticleHub {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.emitters = {};
    this.glow = new GlowTracker(ctx.lights); // glowing particles and their lights
    this.flashes = new FlashLights(ctx.lights); // the short light of a celebration
    for (const [name, e] of Object.entries(cfg.emitters)) {
      // configs are written for 1x textures: scale them by the texture's display scale (AD-14)
      const sc = e.config.scale;
      const scale = sc ? { start: sc.start * ctx.res.inv, end: sc.end * ctx.res.inv } : ctx.res.inv;
      const g = cfg.glow.emitters[name];
      const glow = g && { radius: g.radius, color: hexInt(g.color), intensity: g.intensity };
      const emitCallback = glow ? p => { if (this.glowOk()) this.glow.start(p, glow); } : undefined;
      const emitter = scene.add.particles(0, 0, e.texture, { ...e.config, scale, emitting: false, emitCallback }).setDepth(e.depth);
      if (glow) {
        const killAll = emitter.killAll;
        emitter.killAll = () => { this.glow.drop(emitter); return killAll.call(emitter); }; // clearing an emitter gives its lights back
      }
      this.emitters[name] = { emitter, cfg: e, gravityY: e.config.gravityY ?? 0, tint: null };
    }
    this.list = Object.values(this.emitters);
    this.readMap();
    this.fxIn = new Float64Array(ctx.maxPlayers); // per player emit timers
    this.ringIn = new Float64Array(ctx.maxPlayers);
    this.stepIn = new Float64Array(ctx.maxPlayers);
    this.dripIn = new Float64Array(ctx.maxPlayers);
    this.wetT = new Float64Array(ctx.maxPlayers); // seconds a kid still drips after leaving the water
    this.total = 0; // live particles this tick, counted against the tier budget
    this.px = 0; // the spot `place` found
    this.py = 0;
    this.rainAcc = 0;
    this.impactAcc = 0;
    this.leafIn = 0;
    this.seed = 0x1234abcd; // placement of the seasonal ambience: a fixed generator, never Math.random (story 12.2)
    this.seasonAcc = this.cfg.seasonal.list.map(() => 0);
    this.exhaustIn = 0;
    this.fishIn = 1;
    this.applyCaps();
    ctx.events.on('quality:changed', () => this.applyCaps());
    ctx.events.on('level:up', e => this.celebrate('levelup', e.player));
    ctx.events.on('achievement:unlocked', e => this.celebrate('achievement', e.player));
    ctx.events.on('sticker:collected', e => this.celebrate('sticker', e.player));
    ctx.events.on('trick:ollie', e => { if (e.phase === 'start') this.puffAt(ctx.players[e.player], e.x, e.y + 4, this.cfg.footsteps.ollie); });
    const self = this;
    ctx.pools.register('particles', { live: () => self.live(), get cap() { return ctx.quality.tier.maxParticles; } });
    ctx.world.register(this);
  }

  // A pooled emitter of the registry entry `name` living in another scene (the minigame scene draws its own sparkle).
  // It follows the tier like the hub's own emitters: burst sizes by `particleMul`, alive cap by `maxParticles` x `share`.
  createFor(scene, name, share = this.cfg.emitters[name].share) {
    const e = this.cfg.emitters[name];
    const sc = e.config.scale;
    const scale = sc ? { start: sc.start * this.ctx.res.inv, end: sc.end * this.ctx.res.inv } : this.ctx.res.inv;
    const emitter = scene.add.particles(0, 0, e.texture, { ...e.config, scale, emitting: false }).setDepth(e.depth);
    const tier = () => this.ctx.quality.tier;
    const fit = () => { emitter.maxAliveParticles = Math.floor(tier().maxParticles * share); };
    fit();
    this.ctx.events.on('quality:changed', fit);
    scene.events.once('shutdown', () => this.ctx.events.off('quality:changed', fit));
    return { emitter, burst: (x, y, count = e.count) => emitter.emitParticleAt(x, y, Math.max(1, Math.round(count * tier().particleMul))) };
  }

  // Ambient emitter spots and water tiles of the current map.
  readMap() {
    const { ctx } = this;
    const ts = ctx.map.tileSize;
    this.spots = ctx.map.objects.filter(o => o.type === 'ambient')
      .map(o => ({ x: (o.x + 0.5) * ts, y: (o.y + 0.5) * ts, chimney: o.kind === 'chimney', kind: o.kind, in: 0 }));
    this.water = this.findWater();
  }

  unloadMap() {
    for (const e of this.list) e.emitter.killAll();
    this.glow.clear();
    this.flashes.clear();
  }

  loadMap() { this.readMap(); }

  applyCaps() {
    const max = this.ctx.quality.tier.maxParticles;
    for (const e of this.list) {
      e.emitter.maxAliveParticles = Math.floor(max * e.cfg.share);
      // Shrinking the cap must not leave extra particles alive: kill the surplus now.
      let extra = e.emitter.getAliveParticleCount() - e.emitter.maxAliveParticles;
      if (extra > 0) e.emitter.forEachAlive(p => { if (extra-- > 0) p.lifeCurrent = 0; });
    }
    if (!this.ctx.quality.tier.particleLights) this.glow.clear();
  }

  live() {
    let n = 0;
    for (const e of this.list) n += e.emitter.getAliveParticleCount();
    return n;
  }

  // The tier's budget holds for all emitters together; each emitter's `share` is a cap on top of it.
  put(emitter, x, y, n) {
    n = roomFor(n, this.ctx.quality.tier.maxParticles, this.total);
    if (n <= 0) return;
    this.total += n;
    emitter.emitParticleAt(x, y, n);
  }

  // opts: { count, tint }. Burst sizes scale with the tier.
  emit(name, x, y, opts) {
    const e = this.emitters[name];
    if (!e) return;
    if (opts?.tint !== undefined && e.tint !== opts.tint) {
      e.emitter.setParticleTint(opts.tint);
      e.tint = opts.tint;
    }
    this.put(e.emitter, x, y, Math.max(1, Math.round((opts?.count ?? e.cfg.count) * this.ctx.quality.tier.particleMul)));
  }

  // Glowing particles take a light while it is dark (or indoors), on a tier with a light map and spare handles.
  glowOk() {
    const { lights, quality, map, day } = this.ctx;
    return lights.mapActive && this.glow.count < quality.tier.particleLights && !flag('glowOff') && (map.indoor || day.tint.alpha > 0.05);
  }

  // Bursts at the kid on level up, achievement and sticker, with a short warm flash of light.
  celebrate(name, index) {
    const p = this.ctx.players[index];
    const c = this.cfg.celebrate[name];
    if (!p || !c) return;
    for (const [emitter, count] of c.bursts) this.emit(emitter, p.x, p.y - 8, { count });
    const { lights } = this.ctx;
    if (lights.mapActive && !flag('glowOff')) this.flashes.add({ x: p.x, y: p.y - 8, radius: c.light.radius, color: hexInt(c.light.color), intensity: c.light.intensity }, c.light.seconds);
  }

  // A small puff in the tint of the ground the kid stands on (ollie take-off, bike skid).
  puffAt(player, x, y, count) {
    if (!player || flag('footstepsOff')) return;
    const key = this.ctx.surfaces.props(player.move.surface).particle;
    const tint = this.cfg.footsteps.tints[key];
    if (key === 'splash') this.emit('crown', x, y, { count });
    else if (tint !== undefined) this.emit('stepdust', x, y, { count, tint });
  }

  update(dt) {
    const { wind, weather } = this.ctx;
    const wv = wind.vector;
    for (const e of this.list) {
      if (e.cfg.windGain) e.emitter.setParticleGravity(wv.x * e.cfg.windGain, e.gravityY + wv.y * e.cfg.windGain);
    }
    // streaks lean with the wind (about the sideways drift a drop gathers during its life)
    this.emitters.rain.emitter.particleRotate = -Math.atan2(wv.x * this.emitters.rain.cfg.windGain * 0.17, 290) / DEG;
    const view = this.scene.cameras.main.worldView;
    this.total = this.live();
    this.glow.update();
    this.flashes.update(dt);
    this.surfaceFx(dt);
    if (weather.intensity > 0.01) this.rain(dt, view);
    this.ambient(dt, view);
    this.seasonal(dt, view);
    this.exhaust(dt, view);
  }

  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  // Does the effect's condition hold now? Season and phase come from the day clock, the weather from the weather service, daylight from the tint.
  holds(when) {
    const { day, weather } = this.ctx;
    return holds(when, { season: day.season, phase: day.phase, weather: weather.state, daylight: day.tint.alpha <= 0.05 });
  }

  // Where does the effect appear? Over the view by default (on `ground` only), at a lit street lamp (`lamp`) or in the daylight under a window (`shaft`).
  // Sets this.px / this.py; false when there is no such place now.
  place(e, view) {
    if (e.at === 'lamp') {
      const lamps = this.scene.streetLights?.live;
      if (!lamps?.length) return false;
      const start = Math.floor(this.rnd() * lamps.length);
      for (let j = 0; j < lamps.length; j++) { // the first lit lamp in view from a random start (the town has about 80)
        const l = lamps[(start + j) % lamps.length];
        if (!l.lit || l.radius < 50 || l.x < view.x || l.x > view.right || l.y < view.y || l.y > view.bottom) continue;
        this.px = l.x + (this.rnd() - 0.5) * 8;
        this.py = l.y + (this.rnd() - 0.5) * 4;
        return true;
      }
      return false;
    }
    if (e.at === 'shaft') {
      const rooms = this.scene.interiors;
      const wins = rooms?.wins;
      if (!wins?.length || rooms.day < 0.2) return false;
      const w = wins[Math.floor(this.rnd() * wins.length)];
      this.px = w.left + this.rnd() * w.sw;
      this.py = w.top + this.rnd() * 44;
      return true;
    }
    this.px = view.x + this.rnd() * view.width;
    this.py = view.y + this.rnd() * view.height;
    return !e.ground || this.ctx.surfaces.at(this.px, this.py) === e.ground;
  }

  // Pollen, butterflies, fireflies, fog, falling leaves and petals, lamp embers and dust motes: a steady trickle while their season, phase and weather fit.
  seasonal(dt, view) {
    const s = this.cfg.seasonal;
    if (flag('ambienceOff')) return; // ambienceOff: test hook, the scripted runs have no seasonal life
    const indoor = !!this.ctx.map.indoor;
    const mul = this.ctx.quality.tier.particleMul;
    for (let i = 0; i < s.list.length; i++) {
      const e = s.list[i];
      if (!!e.indoor !== indoor || (e.flag && flag(e.flag)) || !this.holds(e.when)) { this.seasonAcc[i] = 0; continue; }
      this.seasonAcc[i] += e.rate * mul * (e.at ? 1 : (view.width * view.height) / s.refArea) * dt;
      for (; this.seasonAcc[i] >= 1; this.seasonAcc[i]--) {
        if (this.place(e, view)) this.put(this.emitters[e.emitter].emitter, this.px, this.py, 1);
      }
    }
  }

  // Smoke behind every driving vehicle of the traffic services that is in view.
  exhaust(dt, view) {
    const t = this.ctx.traffic;
    const x = this.cfg.exhaust;
    this.exhaustIn -= dt;
    if (!t || this.exhaustIn > 0) return;
    this.exhaustIn = x.interval / this.ctx.quality.tier.particleMul;
    for (const src of t.sources) {
      for (const v of src.pool ?? []) {
        if (!v.active || v.speed < x.minSpeed || v.x < view.x || v.x > view.right || v.y < view.y || v.y > view.bottom) continue;
        this.emit('smoke', v.x - Math.cos(v.heading) * x.rear, v.y - Math.sin(v.heading) * x.rear, { count: 1 });
      }
    }
  }

  // Dust (sprint, drifting), footsteps and wheel dust per surface, leaves (grass), splash + crown + ring (puddles) and drips at every mover's feet.
  surfaceFx(dt) {
    const players = this.ctx.players;
    for (let i = 0; i < players.length; i++) this.playerFx(dt, players[i]);
  }

  playerFx(dt, p) {
    const m = p.move;
    const s = this.cfg.surfaceEmit;
    const i = p.index;
    this.fxIn[i] -= dt;
    this.ringIn[i] -= dt;
    this.stepIn[i] -= dt;
    const fx = this.cfg.surfaceFx[this.ctx.surfaces.props(m.surface).particle];
    const wet = fx?.name === 'splash';
    this.drips(dt, p, wet);
    if (!fx) return;
    const speed = m.velSpeed;
    const bike = m.profile.faceHeading;
    // a bike (faceHeading profile) kicks it up at the rear wheel, walkers at their feet
    const x = bike ? p.x - Math.cos(m.heading) * s.rearOffset : p.x;
    const y = bike ? p.y - Math.sin(m.heading) * s.rearOffset : p.y + s.feetOffset;
    if (fx.step && this.stepIn[i] <= 0 && speed >= (bike ? s.wheelMinSpeed : s.stepMinSpeed) && !flag('footstepsOff')) {
      this.stepIn[i] = (bike ? s.wheelInterval : wet ? s.crownInterval : s.stepInterval) / this.ctx.quality.tier.particleMul;
      this.emit(fx.step.name, x, y, fx.step.tint !== undefined ? { count: 1, tint: fx.step.tint } : { count: 3 + Math.round(speed / 60) });
    }
    if (speed < (wet ? s.puddleMinSpeed : s.minSpeed)) return;
    if (fx.name === 'dust' && !m.sprinting && m.slip < s.dustSlipDeg * DEG) return;
    if (this.fxIn[i] <= 0) {
      this.fxIn[i] = wet ? s.puddleInterval : s.interval;
      this.emit(fx.name, x, y, wet ? { count: 3 + Math.round(speed / 40) } : { tint: fx.tint });
    }
    if (fx.ring && this.ringIn[i] <= 0) {
      this.ringIn[i] = s.ringInterval;
      this.emit('ripple', x, y);
    }
  }

  // Water runs off a kid that just left a puddle or the shallows: a few drips from the feet.
  drips(dt, p, wet) {
    const i = p.index;
    const f = this.cfg.footsteps;
    if (wet) { this.wetT[i] = f.dripSeconds; return; }
    if (this.wetT[i] <= 0) return;
    this.wetT[i] -= dt;
    this.dripIn[i] -= dt;
    if (this.dripIn[i] > 0 || flag('dripsOff')) return;
    this.dripIn[i] = f.dripInterval;
    this.emit('drip', p.x + (this.rnd() - 0.5) * 5, p.y + this.cfg.surfaceEmit.feetOffset, { count: 1 });
  }

  // A burst of the surface's own effect (dust in its tint, splash, leaves) at a point: landings and skate clack.
  surfaceBurst(surface, x, y, count) {
    const fx = this.cfg.surfaceFx[this.ctx.surfaces.props(surface).particle];
    if (fx) this.emit(fx.name, x, y, fx.name === 'dust' ? { count, tint: fx.tint } : { count });
  }

  // Drops anywhere in the view (short lives, wind-slanted by gravity) plus ground impacts.
  rain(dt, view) {
    const r = this.cfg.rain;
    const k = this.ctx.weather.intensity * this.ctx.quality.tier.rainDensity * (view.width * view.height) / r.refArea * dt;
    this.rainAcc += r.rate * k;
    this.impactAcc += r.impactRate * k;
    const drops = this.emitters.rain.emitter;
    for (; this.rainAcc >= 1; this.rainAcc--) this.put(drops, view.x + Math.random() * view.width, view.y + Math.random() * view.height, 1);
    const { surfaces } = this.ctx;
    for (; this.impactAcc >= 1; this.impactAcc--) {
      const x = view.x + Math.random() * view.width;
      const y = view.y + Math.random() * view.height;
      const ground = surfaces.at(x, y);
      if (!surfaces.props(ground).solid) this.put(this.emitters.impact.emitter, x, y, 1);
      else if (ground === 'water') this.put(this.emitters.ripple.emitter, x, y, 1); // a drop on the pond or canal rings
    }
  }

  // Cheap life: steam and chimney smoke at map spots, drifting leaves over grass, fish ripples.
  ambient(dt, view) {
    const a = this.cfg.ambient;
    const mul = this.ctx.quality.tier.particleMul;
    const m = a.margin;
    for (const s of this.spots) {
      s.in -= dt;
      if (s.in > 0 || s.x < view.x - m || s.x > view.right + m || s.y < view.y - m || s.y > view.bottom + m) continue;
      s.in = a.steamInterval / mul;
      if (s.kind === 'sprinkler' || s.kind === 'fountain') {
        s.in = (s.kind === 'sprinkler' ? this.cfg.fountain.sprinklerEvery : this.cfg.fountain.fountainEvery) / mul;
        this.emit('splash', s.x, s.kind === 'fountain' ? s.y - 6 : s.y, { count: s.kind === 'fountain' ? 3 : 2 });
        if (this.ctx.surfaces.at(s.x, s.y) === 'water') this.emit('ripple', s.x, s.y); // splashes on water leave a ring
        continue;
      }
      if (s.chimney) this.emit('smoke', s.x, s.y, { count: 1 });
      else this.emit('steam', s.x, s.y, { count: 1, tint: 0xffffff });
    }
    this.leafIn -= dt;
    if (this.leafIn <= 0) {
      this.leafIn = a.leafInterval / mul;
      const x = view.x + Math.random() * view.width;
      const y = view.y + Math.random() * view.height;
      if (this.ctx.surfaces.at(x, y) === 'grass') this.emit('leaves', x, y, { count: 1 });
    }
    this.fishIn -= dt;
    if (this.fishIn <= 0 && this.water.length) {
      this.fishIn = a.fishEvery[0] + Math.random() * (a.fishEvery[1] - a.fishEvery[0]);
      const w = this.water[Math.floor(Math.random() * this.water.length)];
      if (w.x > view.x && w.x < view.right && w.y > view.y && w.y < view.bottom) {
        this.emit('ripple', w.x, w.y);
        this.emit('splash', w.x, w.y, { count: 3 });
      }
    }
  }

  findWater() {
    const { surfaces } = this.ctx;
    const ts = surfaces.tileSize;
    const out = [];
    for (let ty = 0; ty < surfaces.rowCount; ty++) {
      for (let tx = 0; tx < surfaces.cols; tx++) if (surfaces.base(tx, ty) === 'water') out.push({ x: (tx + 0.5) * ts, y: (ty + 0.5) * ts });
    }
    return out;
  }
}
