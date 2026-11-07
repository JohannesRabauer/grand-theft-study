import { Tool } from './Tool.js';
import { CAT, MASK } from '../physics/categories.js';
import { addProjectile } from '../physics/bodies.js';

// Slingshot (CAP-9). Hold toolUse to charge (power 0..1 over chargeSeconds), aim at intent.aim
// (or the last walking direction), release to fire. Top-down, so a shot is distance-limited travel
// with wind drift plus a fake height (arc) for the sprite and its shadow. The same function
// `flightPoint` draws the trajectory dots and moves the projectile (AD-7), so the dots are exact
// for the wind at release. Projectile bodies are PROJECTILE (collide only with PROP and STATIC),
// so people and animals are never touched; they are sensors, so hits are only reported here
// and nothing is ever pushed by Matter's solver. Pooled: bodies, sprites and dots are made once.
// Events: `tool:ammo` { ammo, max }, `tool:fire`; prop hits go through Props.knock (`prop:hit`).

// Position after t seconds: straight line plus constant wind acceleration (wx, wy in px/s^2).
export function flightPoint(out, sx, sy, dx, dy, speed, wx, wy, t) {
  out.x = sx + dx * speed * t + 0.5 * wx * t * t;
  out.y = sy + dy * speed * t + 0.5 * wy * t * t;
  return out;
}

const PARK = { x: -1000, y: -1000 };

export class Slingshot extends Tool {
  constructor(scene, ctx, cfg) {
    super('slingshot');
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg.slingshot;
    this.matter = scene.matter;
    this.max = this.cfg.maxAmmo;
    this.ammo = Math.min(this.cfg.startAmmo, this.max);
    this.power = 0;
    this.charging = false;
    this.cool = 0;
    this.dir = { x: 1, y: 0 };
    this.p0 = { x: 0, y: 0 };
    this.p1 = { x: 0, y: 0 };

    this.shots = [];
    for (let i = 0; i < this.cfg.pool; i++) this.shots.push(this.makeShot());
    this.byBody = new Map(this.shots.map(s => [s.body.id, s]));
    scene.matter.world.on('collisionstart', ev => this.onCollide(ev));

    this.band = scene.add.graphics().setDepth(9000);
    this.dots = [];
    for (let i = 0; i < ctx.quality.maxOf('aimDots'); i++) this.dots.push(scene.add.image(0, 0, 'aim-dot').setScale(ctx.res.inv).setDepth(8900).setVisible(false));
    this.dotsShown = 0;

    const self = this;
    ctx.pools.register('projectiles', { live: () => self.shots.filter(s => s.active).length, cap: this.cfg.pool });
    ctx.pools.register('aimDots', { live: () => self.dotsShown, get cap() { return ctx.quality.tier.aimDots; } });
  }

  makeShot() {
    const body = addProjectile(this.scene, 0, 0, this.cfg.radius, { frictionAir: 0, friction: 0, restitution: 0, isSensor: true });
    this.matter.body.setMass(body, 0.001);
    body.collisionFilter.mask = 0;
    this.matter.body.setPosition(body, PARK);
    return {
      body,
      active: false,
      dead: false,
      sprite: this.scene.add.image(0, 0, 'proj').setScale(this.ctx.res.inv).setVisible(false),
      shadow: this.scene.add.image(0, 0, 'proj-shadow').setScale(this.ctx.res.inv).setVisible(false),
      t: 0, life: 0, sx: 0, sy: 0, dx: 0, dy: 0, wx: 0, wy: 0
    };
  }

  equip() { this.emitAmmo(); }

  unequip() { this.endCharge(); }

  emitAmmo() { this.ctx.events.emit('tool:ammo', { ammo: this.ammo, max: this.max }); }

  // Returns how many were actually taken (the magazine has a cap).
  addAmmo(n) {
    const take = Math.min(n, this.max - this.ammo);
    if (take > 0) {
      this.ammo += take;
      this.emitAmmo();
    }
    return take;
  }

  life() { return this.cfg.lifeMin + (this.cfg.lifeMax - this.cfg.lifeMin) * this.power; }

  update(dt, intent, equipped) {
    this.updateShots(dt);
    if (!equipped) return;
    this.cool -= dt;
    this.updateAimDir(intent);
    if (intent.toolUse && this.ammo > 0 && this.cool <= 0) {
      this.charging = true;
      this.power = Math.min(1, this.power + dt / this.cfg.chargeSeconds);
      this.drawCharge();
    } else if (this.charging) {
      if (this.power >= this.cfg.minPower && this.ammo > 0) this.use(this.power);
      this.endCharge();
    }
  }

  // Aim at the pointer / stick point; without one, face the way the player last walked.
  updateAimDir(intent) {
    const { player } = this.ctx;
    const ax = intent.aim ? intent.aim.x - player.x : intent.move.x;
    const ay = intent.aim ? intent.aim.y - player.y : intent.move.y;
    const m = Math.hypot(ax, ay);
    if (m > (intent.aim ? 4 : 0.2)) {
      this.dir.x = ax / m;
      this.dir.y = ay / m;
    }
  }

  // Fire one pebble in the current direction with the given power (0..1).
  use(power) {
    const s = this.shots.find(sh => !sh.active);
    if (!s) return;
    const c = this.cfg;
    const { player, wind } = this.ctx;
    this.power = power;
    s.sx = player.x + this.dir.x * c.muzzle;
    s.sy = player.y + this.dir.y * c.muzzle;
    s.dx = this.dir.x;
    s.dy = this.dir.y;
    s.wx = wind.vector.x * c.windAccel;
    s.wy = wind.vector.y * c.windAccel;
    s.life = this.life();
    s.t = 0;
    s.active = true;
    s.dead = false;
    this.matter.body.setPosition(s.body, { x: s.sx, y: s.sy });
    s.body.collisionFilter.mask = MASK.PROJECTILE;
    s.sprite.setVisible(true).setPosition(s.sx, s.sy - c.startHeight);
    s.shadow.setVisible(this.ctx.quality.tier.shadows).setPosition(s.sx, s.sy);
    this.ammo--;
    this.cool = c.cooldown;
    this.emitAmmo();
    this.ctx.events.emit('tool:fire', { x: s.sx, y: s.sy, power });
  }

  // The body is placed on the flight curve every frame (a sensor, so it never needs integrating).
  updateShots(dt) {
    const c = this.cfg;
    for (const s of this.shots) {
      if (!s.active) continue;
      if (s.dead || s.t >= s.life) {
        this.release(s);
        continue;
      }
      s.t = Math.min(s.t + dt, s.life);
      this.matter.body.setPosition(s.body, flightPoint(this.p1, s.sx, s.sy, s.dx, s.dy, c.speed, s.wx, s.wy, s.t));
      const u = s.t / s.life;
      const h = c.startHeight * (1 - u) + c.arcHeight * Math.sin(Math.PI * u);
      const pos = s.body.position;
      s.sprite.setPosition(pos.x, pos.y - h).setDepth(pos.y + 20);
      s.shadow.setPosition(pos.x, pos.y + 1).setDepth(pos.y - 1);
    }
  }

  // Idle bodies stay in the world, far away and colliding with nothing: adding and removing bodies
  // mid-game left a re-added body frozen in place.
  park(body) {
    body.collisionFilter.mask = 0;
    this.matter.body.setVelocity(body, { x: 0, y: 0 });
    this.matter.body.setPosition(body, PARK);
  }

  release(s) {
    s.active = false;
    s.sprite.setVisible(false);
    s.shadow.setVisible(false);
    this.park(s.body);
  }

  onCollide(ev) {
    for (const pair of ev.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      const s = this.byBody.get(a.id) ?? this.byBody.get(b.id);
      if (!s || !s.active || s.dead) continue;
      const other = this.byBody.has(a.id) ? b : a;
      if (other.collisionFilter.category === CAT.STATIC && this.cfg.passFence && this.overFence(s)) continue;
      s.dead = true;
      if (other.collisionFilter.category === CAT.PROP) {
        const p = this.ctx.props.byBody.get(other.id);
        if (p) this.ctx.props.knock(p, s.dx, s.dy);
      }
      this.ctx.particles.emit('spark', s.body.position.x, s.body.position.y, { count: 4 });
    }
  }

  // Pebbles fly through fences: is the shot (a few pixels ahead) over a fence tile?
  overFence(s) {
    const pos = s.body.position;
    return this.ctx.surfaces.at(pos.x + s.dx * 3, pos.y + s.dy * 3) === 'fence';
  }

  // Rubber band, power ring and predicted path while charging.
  drawCharge() {
    const { player } = this.ctx;
    const d = this.dir;
    const g = this.band.clear();
    const fx = player.x + d.x * 5;
    const fy = player.y - 3 + d.y * 5;
    const px = -d.y * 3;
    const py = d.x * 3;
    const mx = fx - d.x * (1 + this.power * 6);
    const my = fy - d.y * (1 + this.power * 6);
    g.lineStyle(1, 0xc99a5a, 1).lineBetween(fx + px, fy + py, fx - px, fy - py);
    g.lineStyle(1, 0xe8d2a0, 1).lineBetween(fx + px, fy + py, mx, my).lineBetween(fx - px, fy - py, mx, my);
    g.fillStyle(0xffffff, 1).fillRect(Math.round(mx) - 1, Math.round(my) - 1, 2, 2);
    g.lineStyle(1, this.power >= 1 ? 0xffe14d : 0xffffff, 0.8).beginPath()
      .arc(player.x, player.y + 2, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.power).strokePath();
    this.drawDots();
  }

  // Dots follow the same flightPoint as the shot, so wind bends them exactly like the pebble.
  drawDots() {
    const { player, wind, quality } = this.ctx;
    const c = this.cfg;
    const n = quality.tier.aimDots;
    const life = this.life();
    const sx = player.x + this.dir.x * c.muzzle;
    const sy = player.y + this.dir.y * c.muzzle;
    const wx = wind.vector.x * c.windAccel;
    const wy = wind.vector.y * c.windAccel;
    for (let i = 0; i < n; i++) {
      const p = flightPoint(this.p0, sx, sy, this.dir.x, this.dir.y, c.speed, wx, wy, (life * (i + 1)) / n);
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
