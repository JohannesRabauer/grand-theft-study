// Props (cone, can, crate, ball) from map markers: Matter bodies made by the bodies factory in
// the PROP category, pushed by the player and bike (and bullies later). Top-down, so `frictionAir`
// stands in for ground friction. Per-kind numbers live in data/props.json.
//
// AD-8: props are created once; only those near the camera are awake (Matter sleeping), drawn and
// pushed by wind; the number awake never exceeds the tier's `maxProps`.
// AD-7: wind-affected kinds get a force scaled by mass from ctx.wind.vector.
// Emits `prop:hit` ({ prop, speed }) on strong impacts; crates break into debris.
import { addCircle, addRect } from '../physics/bodies.js';

export class Props {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.matter = scene.matter;
    this.sleeping = Phaser.Physics.Matter.Matter.Sleeping;
    const ts = ctx.map.tileSize;
    this.props = ctx.map.objects.filter(o => o.type === 'prop').map(o => this.create(o, (o.x + 0.5) * ts, (o.y + 0.5) * ts));
    this.byBody = new Map(this.props.map(p => [p.body.id, p]));
    this.order = this.props.slice(); // scratch list for the nearest-first wake-up
    this.force = { x: 0, y: 0 };
    this.awake = 0;
    this.cullIn = 0;
    this.cull();
    scene.matter.world.on('collisionstart', ev => this.onCollide(ev));
    ctx.events.on('quality:changed', () => this.cull());
    const self = this;
    ctx.pools.register('props', { live: () => self.awake, get cap() { return ctx.quality.tier.maxProps; } });
  }

  create(o, x, y) {
    const k = this.cfg.kinds[o.kind];
    const opts = { restitution: k.restitution, friction: k.friction, frictionAir: k.frictionAir };
    const body = k.shape === 'circle' ? addCircle(this.scene, x, y, k.size, 'PROP', opts) : addRect(this.scene, x, y, k.size, k.size, 'PROP', opts);
    this.matter.body.setMass(body, k.mass);
    const sprite = this.scene.add.image(x, y, k.texture).setVisible(false);
    const prop = { id: o.id, kind: o.kind, k, body, sprite, alive: true, awake: false, tipped: false, cool: 0 };
    this.sleeping.set(body, true);
    return prop;
  }

  // Relative speed of the two bodies at first contact, in px/s.
  onCollide(ev) {
    const { hitSpeed, hitCooldown } = this.cfg;
    for (const pair of ev.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y) * 60;
      if (speed < hitSpeed) continue;
      for (const body of [a, b]) {
        const p = this.byBody.get(body.id);
        if (!p || !p.alive || p.cool > 0) continue;
        p.cool = hitCooldown;
        this.hit(p, speed);
      }
    }
  }

  hit(p, speed) {
    const { events, particles } = this.ctx;
    const { k, body } = p;
    events.emit('prop:hit', { prop: p, speed });
    if (k.breakSpeed && speed >= k.breakSpeed) {
      p.alive = false;
      p.sprite.setVisible(false);
      this.matter.world.remove(body);
      particles.emit('debris', body.position.x, body.position.y, { count: k.debris });
      return;
    }
    if (k.tipped && !p.tipped && speed >= k.tipSpeed) {
      p.tipped = true;
      p.sprite.setTexture(k.tipped);
    }
    if (k.debris) particles.emit('debris', body.position.x, body.position.y, { count: Math.ceil(k.debris / 2) });
  }

  // Wake props near the camera (nearest first, up to the tier cap); put the rest to sleep.
  cull() {
    const cam = this.scene.cameras.main;
    const v = cam.worldView;
    const m = this.cfg.margin;
    const mid = cam.midPoint;
    const cap = this.ctx.quality.tier.maxProps;
    const list = this.order;
    list.sort((a, b) => dist2(a, mid) - dist2(b, mid));
    let awake = 0;
    for (const p of list) {
      if (!p.alive) continue;
      const { x, y } = p.body.position;
      const near = x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m;
      const want = near && awake < cap;
      if (want) awake++;
      if (want === p.awake) continue;
      p.awake = want;
      this.sleeping.set(p.body, !want);
      p.sprite.setVisible(want);
      if (want) this.sync(p);
    }
    this.awake = awake;
  }

  sync(p) {
    const b = p.body;
    p.sprite.setPosition(b.position.x, b.position.y).setRotation(b.angle).setDepth(b.position.y);
  }

  update(dt) {
    this.cullIn -= dt;
    if (this.cullIn <= 0) {
      this.cullIn = this.cfg.cullEvery;
      this.cull();
    }
    const w = this.ctx.wind.vector;
    const f = this.force;
    for (const p of this.props) {
      if (!p.awake) continue;
      p.cool -= dt;
      if (p.k.windAccel) {
        // px/s^2 -> Matter force: mass * accel, with Matter's time unit being ms
        const s = (p.body.mass * p.k.windAccel) / 1e6;
        f.x = w.x * s;
        f.y = w.y * s;
        this.matter.body.applyForce(p.body, p.body.position, f);
      }
      this.sync(p);
    }
  }
}

function dist2(p, mid) {
  const dx = p.body.position.x - mid.x;
  const dy = p.body.position.y - mid.y;
  return dx * dx + dy * dy;
}
