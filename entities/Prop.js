// Props (cone, can, crate, ball) from map markers: Matter bodies made by the bodies factory in
// the PROP category, pushed by the player and bike (and bullies later). Top-down, so `frictionAir`
// stands in for ground friction. Per-kind numbers live in data/props.json.
//
// AD-8: props are created once; only those near the camera are awake (Matter sleeping), drawn and
// pushed by wind; the number awake never exceeds the tier's `maxProps`.
// AD-7: wind-affected kinds get a force scaled by mass from ctx.wind.vector.
// Emits `prop:hit` ({ prop, speed, radius, source, player, dist }) on strong impacts (radius = how far bullies hear it, optional;
// a tool adds its source ('slingshot', 'stick'), the player index and the shot distance in px; a thrown stick clatters
// louder: its `radiusMul` widens the radius). Crates and boxes break into debris (`debrisFx` names the emitter: wood splinters or
// paper scraps) and emit `prop:broken` { prop, x, y, source, player } (the loot of crates and boxes listens to it). Tools call `knock`; props with `perch` (cans on a
// fence, frisbees and kites stuck in trees) are static until knocked and then fall to the ground (`perchFly` seconds free of walls).
import { addCircle, addRect, setPropFlying } from '../physics/bodies.js';
import { CAT } from '../physics/categories.js';
import { ScaledPen } from '../scenes/NpcArt.js';

// One dithered contact-shadow texture under every prop (story 16.4), authored on the 24x32 grid of the figures.
function contactTexture(scene, res) {
  if (scene.textures.exists('prop-contact')) return;
  const p = new ScaledPen(scene, 'prop-contact', 24, 8, res.scale / 2);
  p.contact(12, 4, 11, 3, 0.32);
  p.done();
}

export class Props {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.matter = scene.matter;
    this.sleeping = Phaser.Physics.Matter.Matter.Sleeping;
    this.props = [];
    this.byBody = new Map();
    this.order = []; // scratch list for the nearest-first wake-up
    this.force = { x: 0, y: 0 };
    this.awake = 0;
    this.cullGeneration = 0;
    this.cullIn = 0;
    ctx.props = this;
    contactTexture(scene, ctx.res);
    this.loadMap();
    ctx.world.register(this);
    scene.matter.world.on('collisionstart', ev => this.onCollide(ev));
    ctx.events.on('quality:changed', () => this.cull());
    const self = this;
    ctx.pools.register('props', { live: () => self.awake, get cap() { return ctx.quality.tier.maxProps; } });
  }

  loadMap() {
    const ts = this.ctx.map.tileSize;
    this.props = this.ctx.map.objects.filter(o => o.type === 'prop').map(o => this.create(o, (o.x + 0.5) * ts, (o.y + 0.5) * ts));
    this.byBody = new Map(this.props.map(p => [p.body.id, p]));
    this.order = this.props.slice();
    this.cull();
  }

  unloadMap() {
    for (const p of this.props) {
      if (p.alive) this.matter.world.remove(p.body);
      p.sprite.destroy();
      p.shade.destroy();
    }
    this.props = [];
    this.byBody.clear();
    this.order = [];
    this.awake = 0;
  }

  create(o, x, y) {
    const k = this.cfg.kinds[o.kind];
    const opts = { restitution: k.restitution, friction: k.friction, frictionAir: k.frictionAir };
    const body = k.shape === 'circle' ? addCircle(this.scene, x, y, k.size, 'PROP', opts) : addRect(this.scene, x, y, k.size, k.size, 'PROP', opts);
    this.matter.body.setMass(body, k.mass);
    if (o.perch) this.matter.body.setStatic(body, true);
    const sprite = this.scene.add.image(x, y, k.texture).setScale(this.ctx.res.inv).setVisible(false);
    const shade = this.scene.add.image(x, y, 'prop-contact').setScale(this.ctx.res.inv * Math.max(0.5, k.size / 8), this.ctx.res.inv).setVisible(false);
    const prop = { id: o.id, kind: o.kind, k, body, sprite, shade, alive: true, awake: false, tipped: false, cool: 0, hp: k.hp ?? Infinity, flyT: 0 };
    this.sleeping.set(body, true);
    return prop;
  }

  addPlay(o, k, x, y) {
    const prop = this.create({ id: o.id, kind: 'crate' }, x, y);
    prop.k = { ...prop.k, texture: k.texture, hp: Infinity, breakSpeed: 0, debris: 0, loot: null, windAccel: k.wind ?? 0 };
    prop.hp = Infinity;
    prop.sprite.setTexture(k.texture);
    prop.body.collisionFilter.mask &= ~(CAT.NPC | CAT.ANIMAL | CAT.BULLY);
    this.matter.body.setMass(prop.body, 0.08);
    prop.body.frictionAir = 0.025;
    this.props.push(prop);
    this.order.push(prop);
    this.byBody.set(prop.body.id, prop);
    return prop;
  }

  // Relative speed of the two bodies at first contact, in px/s.
  onCollide(ev) {
    const { hitSpeed, hitCooldown } = this.cfg;
    for (const pair of ev.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (a.collisionFilter.category === CAT.PROJECTILE || b.collisionFilter.category === CAT.PROJECTILE) continue; // see knock
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

  hit(p, speed, shot) {
    const { events, particles } = this.ctx;
    const { k, body } = p;
    events.emit('prop:hit', { prop: p, speed, radius: k.hitRadius && k.hitRadius * (shot?.radiusMul ?? 1), source: shot?.source, player: shot?.player, dist: shot?.dist });
    if ((k.breakSpeed && speed >= k.breakSpeed) || p.hp <= 0) {
      p.alive = false;
      p.sprite.setVisible(false);
      p.shade.setVisible(false);
      this.matter.world.remove(body);
      particles.emit(k.debrisFx ?? 'debris', body.position.x, body.position.y, { count: k.debris });
      events.emit('prop:broken', { prop: p, x: body.position.x, y: body.position.y, source: shot?.source, player: shot?.player });
      return;
    }
    if (k.tipped && !p.tipped && speed >= k.tipSpeed) {
      p.tipped = true;
      p.sprite.setTexture(k.tipped);
    }
    if (k.debris) particles.emit(k.debrisFx ?? 'debris', body.position.x, body.position.y, { count: Math.ceil(k.debris / 2) });
  }

  // A tool (slingshot pebble, thrown stick, swung stick) hit `p` travelling in direction (dx, dy): a push of `knock` px/s
  // (times `shot.knockMul`), `shot.damage` points (default 1) for props with hp, and a perched prop falls off its perch.
  // `shot` ({ source, player, dist, radiusMul?, damage?, knockMul? }) is passed on to `prop:hit`.
  knock(p, dx, dy, shot) {
    if (!p.alive) return;
    const { k, body } = p;
    if (body.isStatic) {
      this.matter.body.setStatic(body, false);
      setPropFlying(body, true);
      p.flyT = k.perchFly ?? this.cfg.perchFly;
    }
    this.sleeping.set(body, false);
    const push = (k.knock * (shot?.knockMul ?? 1)) / 60;
    this.matter.body.setVelocity(body, { x: dx * push, y: dy * push });
    p.hp -= shot?.damage ?? 1;
    p.cool = this.cfg.hitCooldown;
    this.hit(p, k.knock, shot);
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
    const generation = ++this.cullGeneration;
    for (const p of list) {
      if (!p.alive) continue;
      if (p.cullGeneration === generation) continue;
      const { x, y } = p.body.position;
      const near = (x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m) || this.nearBully(x, y);
      const group = p.playGroup?.parts;
      const count = group?.length ?? 1;
      const want = near && awake + count <= cap;
      if (want) awake += count;
      if (group) for (const member of group) this.setAwake(member, want, generation);
      else this.setAwake(p, want, generation);
    }
    this.awake = awake;
  }

  setAwake(prop, want, generation) {
    prop.cullGeneration = generation;
    if (prop.awake === want) return;
    prop.awake = want;
    this.sleeping.set(prop.body, !want);
    prop.sprite.setVisible(want);
    prop.shade.setVisible(want);
    if (want) this.sync(prop);
  }

  // Bullies run offscreen too, so props in their way must be awake (sleeping bodies block them).
  nearBully(x, y) {
    const list = this.ctx.chase?.bullies;
    if (!list) return false;
    const r = this.cfg.bullyWakeRadius;
    for (const b of list) if (b.active && Math.abs(b.x - x) < r && Math.abs(b.y - y) < r) return true;
    return false;
  }

  sync(p) {
    const b = p.body;
    p.sprite.setPosition(b.position.x, b.position.y).setRotation(b.angle).setDepth(b.position.y);
    p.shade.setPosition(b.position.x, b.position.y + p.k.size * 0.45).setDepth(b.position.y - 0.5);
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
      if (p.flyT > 0 && (p.flyT -= dt) <= 0) setPropFlying(p.body, false);
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
