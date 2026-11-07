// Particle registry (AD-8): a few shared pooled emitters, created once. Everything fires through
// ctx.particles.emit(name, x, y, opts); nothing is created per frame. Each emitter gets a share of
// the tier's `maxParticles` (re-read on `quality:changed`), and `particleMul` scales burst sizes.
// The hub also drives the effects that come from the world: surface effects under every player,
// rain, ambient steam, leaf swirl and fish ripples. Wind is applied here as emitter gravity (AD-7).
const DEG = Math.PI / 180;

export class ParticleHub {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.emitters = {};
    for (const [name, e] of Object.entries(cfg.emitters)) {
      // configs are written for 1x textures: scale them by the texture's display scale (AD-14)
      const sc = e.config.scale;
      const scale = sc ? { start: sc.start * ctx.res.inv, end: sc.end * ctx.res.inv } : ctx.res.inv;
      const emitter = scene.add.particles(0, 0, e.texture, { ...e.config, scale, emitting: false }).setDepth(e.depth);
      this.emitters[name] = { emitter, cfg: e, gravityY: e.config.gravityY ?? 0, tint: null };
    }
    this.list = Object.values(this.emitters);
    this.spots = ctx.map.objects.filter(o => o.type === 'ambient')
      .map(o => ({ x: (o.x + 0.5) * ctx.map.tileSize, y: (o.y + 0.5) * ctx.map.tileSize, chimney: o.kind === 'chimney', in: 0 }));
    this.water = this.findWater();
    this.fxIn = new Float64Array(ctx.maxPlayers); // per player emit timers
    this.ringIn = new Float64Array(ctx.maxPlayers);
    this.rainAcc = 0;
    this.impactAcc = 0;
    this.leafIn = 0;
    this.fishIn = 1;
    this.applyCaps();
    ctx.events.on('quality:changed', () => this.applyCaps());
    const self = this;
    ctx.pools.register('particles', { live: () => self.live(), get cap() { return ctx.quality.tier.maxParticles; } });
  }

  applyCaps() {
    const max = this.ctx.quality.tier.maxParticles;
    for (const e of this.list) {
      e.emitter.maxAliveParticles = Math.floor(max * e.cfg.share);
      // Shrinking the cap must not leave extra particles alive: kill the surplus now.
      let extra = e.emitter.getAliveParticleCount() - e.emitter.maxAliveParticles;
      if (extra > 0) e.emitter.forEachAlive(p => { if (extra-- > 0) p.lifeCurrent = 0; });
    }
  }

  live() {
    let n = 0;
    for (const e of this.list) n += e.emitter.getAliveParticleCount();
    return n;
  }

  // opts: { count, tint }. Burst sizes scale with the tier; the emitter's alive cap does the rest.
  emit(name, x, y, opts) {
    const e = this.emitters[name];
    if (!e) return;
    if (opts?.tint !== undefined && e.tint !== opts.tint) {
      e.emitter.setParticleTint(opts.tint);
      e.tint = opts.tint;
    }
    const n = Math.max(1, Math.round((opts?.count ?? e.cfg.count) * this.ctx.quality.tier.particleMul));
    e.emitter.emitParticleAt(x, y, n);
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
    this.surfaceFx(dt);
    if (weather.intensity > 0.01) this.rain(dt, view);
    this.ambient(dt, view);
  }

  // Dust (sprint, drifting), leaves (grass) and splash + ring (puddles) at every mover's feet.
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
    const fx = this.cfg.surfaceFx[this.ctx.surfaces.props(m.surface).particle];
    if (!fx) return;
    const speed = m.velSpeed;
    const wet = fx.name === 'splash';
    if (speed < (wet ? s.puddleMinSpeed : s.minSpeed)) return;
    if (fx.name === 'dust' && !m.sprinting && m.slip < s.dustSlipDeg * DEG) return;
    // a bike (faceHeading profile) kicks it up at the rear wheel, walkers at their feet
    const x = m.profile.faceHeading ? p.x - Math.cos(m.heading) * s.rearOffset : p.x;
    const y = m.profile.faceHeading ? p.y - Math.sin(m.heading) * s.rearOffset : p.y + s.feetOffset;
    if (this.fxIn[i] <= 0) {
      this.fxIn[i] = wet ? s.puddleInterval : s.interval;
      this.emit(fx.name, x, y, wet ? { count: 3 + Math.round(speed / 40) } : { tint: fx.tint });
    }
    if (fx.ring && this.ringIn[i] <= 0) {
      this.ringIn[i] = s.ringInterval;
      this.emit('ripple', x, y);
    }
  }

  // Drops anywhere in the view (short lives, wind-slanted by gravity) plus ground impacts.
  rain(dt, view) {
    const r = this.cfg.rain;
    const k = this.ctx.weather.intensity * this.ctx.quality.tier.rainDensity * (view.width * view.height) / r.refArea * dt;
    this.rainAcc += r.rate * k;
    this.impactAcc += r.impactRate * k;
    const drops = this.emitters.rain.emitter;
    for (; this.rainAcc >= 1; this.rainAcc--) drops.emitParticleAt(view.x + Math.random() * view.width, view.y + Math.random() * view.height, 1);
    const { surfaces } = this.ctx;
    for (; this.impactAcc >= 1; this.impactAcc--) {
      const x = view.x + Math.random() * view.width;
      const y = view.y + Math.random() * view.height;
      if (!surfaces.props(surfaces.at(x, y)).solid) this.emitters.impact.emitter.emitParticleAt(x, y, 1);
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
      this.emit('steam', s.x, s.y, { count: 1, tint: s.chimney ? 0x777777 : 0xffffff });
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
