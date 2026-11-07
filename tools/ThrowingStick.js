import { Tool, updateAimDir } from './Tool.js';
import { CAT, MASK } from '../physics/categories.js';
import { addProjectile } from '../physics/bodies.js';
import { flightPoint } from './Slingshot.js';
import { throwParams, heightAt, contactCounts, settle, canPickup, stickStatus } from './stickLogic.js';

const DEG = Math.PI / 180;
const PARK = { x: -1000, y: -1000 };

// Throwing stick (story 6.1, CAP-17, AD-24): a boomerang-like stick. Hold toolUse to charge (power sets the distance, the
// `stickThrowRange` perk of the character stretches it), aim like the slingshot, release to throw. It flies a long fake-height
// arc (spinning sprite, shadow on the ground) along `flightPoint` with the wind (AD-7, own mass and drag in data/tool.json),
// affects only PROP and STATIC bodies (AD-3: PROJECTILE category; people and animals never feel it) and lands as a pickup that
// only its owner collects by walking over it: one stick, so there is nothing to throw until it is back. A dog can fetch it
// (ai/DogFetch.js); `ctx.sticks` lists every player's stick for it.
// The stick object `{ owner, state, x, y, dog, tool }` has state 'held' (in the hand) | 'flying' | 'landed' | 'carried' (by a dog).
// One instance per player. Events: `tool:throw` { player, power }, `tool:ammo` { player, ammo, max } on every change,
// `stick:landed` { player, x, y, dist }, `stick:pickup` { player }; prop hits go through Props.knock (`prop:hit`, source 'stick').
export class ThrowingStick extends Tool {
  constructor(scene, ctx, cfg, player) {
    super('throwing-stick');
    this.ctx = ctx;
    this.player = player;
    this.cfg = cfg.throwingStick;
    this.matter = scene.matter;
    this.max = 1;
    this.power = 0;
    this.charging = false;
    this.cool = 0;
    this.pulse = 0;
    this.dir = { x: 1, y: 0 };
    this.stick = { owner: player.index, state: 'held', x: 0, y: 0, dog: null, tool: this };
    (ctx.sticks ??= []).push(this.stick);
    this.path = { sx: 0, sy: 0, dx: 1, dy: 0, speed: 0, wx: 0, wy: 0 };
    this.params = { life: 0, speed: 0, wx: 0, wy: 0 };
    this.t = 0;
    this.life = 1;
    this.dead = false;
    this.spin = 0;
    this.p0 = { x: 0, y: 0 };
    this.p1 = { x: 0, y: 0 };
    this.shotInfo = { source: 'stick', player: player.index, dist: 0, radiusMul: this.cfg.hitRadiusMul };

    const inv = ctx.res.inv;
    this.body = addProjectile(scene, 0, 0, this.cfg.radius, { frictionAir: 0, friction: 0, restitution: 0, isSensor: true });
    this.matter.body.setMass(this.body, 0.001);
    this.park();
    this.sprite = scene.add.image(0, 0, 'stick').setScale(inv).setVisible(false);
    this.shadow = scene.add.image(0, 0, 'proj-shadow').setScale(inv * 1.4).setVisible(false);
    this.band = scene.add.graphics().setDepth(9000);
    this.dots = [];
    for (let i = 0; i < ctx.quality.maxOf('aimDots'); i++) this.dots.push(scene.add.image(0, 0, 'aim-dot').setScale(inv).setDepth(8900).setVisible(false));
    this.dotsShown = 0;
    scene.matter.world.on('collisionstart', ev => this.onCollide(ev));
    scene.matter.world.on('collisionactive', ev => this.onCollide(ev));

    const self = this;
    const sfx = player.index ? `.${player.index}` : '';
    ctx.pools.register(`stick${sfx}`, { live: () => (self.stick.state === 'held' ? 0 : 1), cap: 1 });
    ctx.pools.register(`stickDots${sfx}`, { live: () => self.dotsShown, get cap() { return ctx.quality.tier.aimDots; } });
    ctx.world.register(this);
  }

  get ammo() { return this.stick.state === 'held' ? 1 : 0; }

  // 'ready' | 'flying' | 'ground' | 'dog' (the HUD shows it next to the tool)
  get status() { return stickStatus(this.stick); }

  equip() { this.emitAmmo(); }

  unequip() { this.endCharge(); }

  emitAmmo() { this.ctx.events.emit('tool:ammo', { player: this.player.index, ammo: this.ammo, max: this.max }); }

  setState(state) {
    this.stick.state = state;
    this.emitAmmo();
  }

  // A map switch takes the stick back into the hand: it would lie in the wrong place.
  unloadMap() {
    this.endCharge();
    this.stick.dog = null;
    this.park();
    this.sprite.setVisible(false);
    this.shadow.setVisible(false);
    if (this.stick.state !== 'held') this.setState('held');
  }

  loadMap() {}

  update(dt, intent, equipped) {
    const { stick } = this;
    if (stick.state === 'flying') this.updateFlight(dt);
    else if (stick.state !== 'held') this.updateGround(dt);
    if (!equipped) return;
    this.cool -= dt;
    updateAimDir(this.dir, this.player, intent);
    if (intent.toolUse && stick.state === 'held' && this.cool <= 0) {
      this.charging = true;
      this.power = Math.min(1, this.power + dt / this.cfg.chargeSeconds);
      this.drawCharge();
    } else if (this.charging) {
      if (this.power >= this.cfg.minPower && stick.state === 'held') this.use(this.power);
      this.endCharge();
    }
  }

  // Throw with `power` (0..1) along the current aim, scattered by the thrower's Zielen.
  use(power) {
    const { player, cfg, stick, path, params } = this;
    if (stick.state !== 'held') return;
    const ang = Math.atan2(this.dir.y, this.dir.x) + (Math.random() * 2 - 1) * cfg.spreadDeg * DEG * player.mods.spread;
    path.dx = Math.cos(ang);
    path.dy = Math.sin(ang);
    path.sx = player.x + path.dx * cfg.muzzle;
    path.sy = player.y + path.dy * cfg.muzzle;
    throwParams(params, cfg, power, player.perks.stickThrowRange ?? 1, this.ctx.wind.vector);
    path.speed = params.speed;
    path.wx = params.wx;
    path.wy = params.wy;
    this.life = params.life;
    this.t = 0;
    this.dead = false;
    this.power = power;
    this.cool = cfg.cooldown;
    this.matter.body.setPosition(this.body, { x: path.sx, y: path.sy });
    this.body.collisionFilter.mask = MASK.PROJECTILE;
    this.sprite.setVisible(true).setPosition(path.sx, path.sy - cfg.startHeight);
    this.shadow.setVisible(this.ctx.quality.tier.shadows).setPosition(path.sx, path.sy);
    stick.x = path.sx;
    stick.y = path.sy;
    this.setState('flying');
    this.ctx.events.emit('tool:throw', { player: player.index, power });
  }

  // The body sits on the flight curve (a sensor: nothing is ever pushed), the sprite spins in the air.
  updateFlight(dt) {
    const { cfg, path, sprite, shadow } = this;
    if (this.dead || this.t >= this.life) {
      this.land();
      return;
    }
    this.t = Math.min(this.t + dt, this.life);
    this.matter.body.setPosition(this.body, flightPoint(this.p1, path.sx, path.sy, path.dx, path.dy, path.speed, path.wx, path.wy, this.t));
    const pos = this.body.position;
    const h = heightAt(cfg, this.t / this.life);
    this.spin += cfg.spin * dt;
    sprite.setPosition(pos.x, pos.y - h).setRotation(this.spin).setDepth(pos.y + 20);
    shadow.setPosition(pos.x, pos.y + 1).setDepth(pos.y - 1).setAlpha(1 - h / (cfg.arcHeight * 2));
  }

  // The stick comes down where it is (a prop or wall was hit, or the throw ended); in a wall, water or a tree it rests just before.
  land() {
    const { path, stick } = this;
    const { surfaces, particles } = this.ctx;
    settle(this.p0, path, this.dead ? this.t : this.life, (x, y) => !surfaces.solid(surfaces.at(x, y)));
    stick.x = this.p0.x;
    stick.y = this.p0.y;
    this.park();
    this.sprite.setPosition(stick.x, stick.y).setRotation(this.spin).setDepth(stick.y - 1);
    this.shadow.setVisible(false);
    particles.emit('dust', stick.x, stick.y, { count: 2 });
    this.setState('landed');
    this.ctx.events.emit('stick:landed', { player: this.player.index, x: stick.x, y: stick.y, dist: Math.hypot(stick.x - path.sx, stick.y - path.sy) });
  }

  // Idle bodies stay in the world, far away and colliding with nothing (see Slingshot.park).
  park() {
    this.body.collisionFilter.mask = 0;
    this.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    this.matter.body.setPosition(this.body, PARK);
  }

  // Lying on the ground the stick waits (with a small pulse) for its owner to walk over it; a dog carries it in its mouth.
  updateGround(dt) {
    const { stick, sprite } = this;
    if (stick.state === 'carried') {
      sprite.setPosition(stick.x, stick.y).setDepth(stick.y + 6); // in a dog's mouth, in front of it
      return;
    }
    if (canPickup(stick, this.player, this.cfg)) {
      sprite.setVisible(false);
      this.setState('held');
      this.ctx.events.emit('stick:pickup', { player: this.player.index });
      return;
    }
    this.pulse += dt;
    sprite.setPosition(stick.x, stick.y).setDepth(stick.y - 1).setScale(this.ctx.res.inv * (1 + 0.1 * Math.sin(this.pulse * 6)));
  }

  // Contacts of the stick with props and walls (people and animals are not in its mask at all).
  onCollide(ev) {
    if (this.stick.state !== 'flying' || this.dead) return;
    const { body } = this;
    const h = heightAt(this.cfg, this.t / this.life);
    for (const pair of ev.pairs) {
      const other = pair.bodyA === body ? pair.bodyB : pair.bodyB === body ? pair.bodyA : null;
      if (!other) continue;
      const cat = other.collisionFilter.category;
      const prop = cat === CAT.PROP ? this.ctx.props.byBody.get(other.id) : null;
      if (!contactCounts(this.cfg, h, cat, !!prop?.body.isStatic)) continue;
      this.dead = true;
      if (!prop?.alive) continue;
      this.shotInfo.dist = Math.hypot(body.position.x - this.path.sx, body.position.y - this.path.sy);
      this.ctx.props.knock(prop, this.path.dx, this.path.dy, this.shotInfo);
    }
    if (this.dead) this.ctx.particles.emit('spark', body.position.x, body.position.y, { count: 4 });
  }

  // Power ring and the predicted path (bent by the wind exactly like the stick) while charging.
  drawCharge() {
    const { player, dir, power, cfg, params } = this;
    this.band.clear().lineStyle(1, power >= 1 ? 0xffe14d : 0xffffff, 0.8).beginPath()
      .arc(player.x, player.y + 2, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * power).strokePath();
    const n = this.ctx.quality.tier.aimDots;
    throwParams(params, cfg, power, player.perks.stickThrowRange ?? 1, this.ctx.wind.vector);
    const sx = player.x + dir.x * cfg.muzzle;
    const sy = player.y + dir.y * cfg.muzzle;
    for (let i = 0; i < n; i++) {
      const p = flightPoint(this.p0, sx, sy, dir.x, dir.y, params.speed, params.wx, params.wy, (params.life * (i + 1)) / n);
      this.dots[i].setPosition(p.x, p.y).setAlpha(1 - 0.6 * (i / n)).setScale((i === n - 1 ? 1.8 : 1) * this.ctx.res.inv).setVisible(true);
    }
    this.dotsShown = n;
  }

  endCharge() {
    this.charging = false;
    this.power = 0;
    if (this.dotsShown === 0) return;
    this.band.clear();
    for (let i = 0; i < this.dotsShown; i++) this.dots[i].setVisible(false);
    this.dotsShown = 0;
  }
}
