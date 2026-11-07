import { addCircle } from '../physics/bodies.js';

// Pedestrian states (AD-15). The state machine itself lives in ai/CrowdDirector.js.
export const S = { WALK: 'WALK', STAND: 'STAND', REACT: 'REACT', FLEE: 'FLEE' };

const PI = Math.PI;
const DOG_KEYS = ['npc-dog-0', 'npc-dog-1', 'npc-dog-2'];

// A pedestrian: sprite + NPC body, driven by velocity. Pooled: bodies live in the Matter world only
// while active. NPC bodies are feather-light (data/npcs.json `mass`), so the player shoves them aside
// instead of getting stuck; they collide with walls and props but never with bullies or each other.
export class Npc {
  constructor(scene, ctx, cfg) {
    this.matter = scene.matter;
    this.world = scene.matter.world;
    this.cfg = cfg;
    this.sprite = scene.add.image(0, 0, `npc-${cfg.outfits[0].id}-2`).setScale(ctx.res.inv).setOrigin(0.5, 0.88).setVisible(false);
    this.body = addCircle(scene, 0, 0, cfg.radius, 'NPC', { frictionAir: 0, friction: 0, inertia: Infinity });
    this.matter.body.setMass(this.body, cfg.mass);
    this.world.remove(this.body);
    this.mv = { x: 0, y: 0 }; // reused argument for Body.setVelocity
    this.pos = { x: 0, y: 0 };
    this.active = false;
    this.outfit = null;
    this.role = '';
    this.state = S.STAND;
    this.resume = S.STAND; // state to return to after REACT / FLEE
    this.vx = 0; this.vy = 0;
    this.fx = 1; this.fy = 0; // last walking direction (unit)
    this.face = 1;
    this.flip = false;
    this.frame = -1;
    this.phase = 0;
    this.t = 0; this.cool = 0; this.hop = 0; this.stuck = 0;
    this.speed = 0;
    this.node = -1; this.prev = -1;
    this.marker = -1;
    this.rx = 0; this.ry = 0; // step-aside / flee direction
    this.partner = null; this.dog = null; this.bench = null;
    this.sitting = false;
    this.visible = false;
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  activate(outfit, role, x, y, speed, face) {
    this.outfit = outfit;
    this.role = role;
    this.speed = speed;
    this.face = face;
    this.vx = this.vy = 0;
    this.fx = face; this.fy = 0;
    this.phase = 0;
    this.t = this.cool = this.hop = this.stuck = 0;
    this.node = this.prev = -1;
    this.marker = -1;
    this.partner = this.dog = this.bench = null;
    this.sitting = false;
    this.frame = -1;
    this.flip = face < 0;
    this.sprite.setTexture(outfit.keys[2]).setFlipX(this.flip).setRotation(0).setPosition(x, y).setDepth(y).setVisible(false);
    this.visible = false;
    this.matter.body.setPosition(this.body, { x, y });
    this.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    this.world.add(this.body);
    this.active = true;
  }

  deactivate() {
    this.active = false;
    this.sprite.setVisible(false);
    this.world.remove(this.body);
  }

  // Ease the velocity toward (dx, dy) * speed (unit direction) with rate `accel` per second.
  steer(dx, dy, speed, dt, accel) {
    const k = Math.min(1, accel * dt);
    this.vx += (dx * speed - this.vx) * k;
    this.vy += (dy * speed - this.vy) * k;
    this.mv.x = this.vx / 60;
    this.mv.y = this.vy / 60;
    this.matter.body.setVelocity(this.body, this.mv);
  }

  // Walk cycle, bob and sway; only called while on screen.
  draw(dt, stepRate) {
    const s = this.sprite;
    const v = Math.hypot(this.vx, this.vy);
    const moving = v > 3;
    if (moving) this.phase += dt * stepRate * (v / 24);
    const frame = moving ? (this.phase | 0) % 2 : 2;
    if (frame !== this.frame) { this.frame = frame; s.setTexture(this.outfit.keys[frame]); }
    if (Math.abs(this.vx) > 3) this.face = this.vx < 0 ? -1 : 1;
    const flip = this.face < 0;
    if (flip !== this.flip) { this.flip = flip; s.setFlipX(flip); }
    let lift = 0;
    if (this.hop > 0) { this.hop = Math.max(0, this.hop - dt / 0.35); lift = Math.sin((1 - this.hop) * PI) * this.cfg.react.hop; }
    const wave = moving ? Math.sin(this.phase * PI) : 0;
    s.setRotation(wave * 0.05);
    s.setPosition(this.x, this.y - lift - (moving ? Math.abs(wave) : 0) + (this.sitting ? -2 : 0)).setDepth(this.y);
  }
}

// The dog of a dog walker: an ANIMAL body that trots after its owner at the end of a leash.
export class Dog {
  constructor(scene, ctx, cfg) {
    this.matter = scene.matter;
    this.world = scene.matter.world;
    this.cfg = cfg.dog;
    this.sprite = scene.add.image(0, 0, 'npc-dog-2').setScale(ctx.res.inv).setOrigin(0.5, 0.8).setVisible(false);
    this.body = addCircle(scene, 0, 0, cfg.dog.radius, 'ANIMAL', { frictionAir: 0, friction: 0, inertia: Infinity });
    this.world.remove(this.body);
    this.mv = { x: 0, y: 0 };
    this.active = false;
    this.owner = null;
    this.vx = 0; this.vy = 0;
    this.phase = 0;
    this.frame = -1;
    this.flip = false;
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  activate(owner, x, y) {
    this.owner = owner;
    this.vx = this.vy = 0;
    this.phase = 0;
    this.frame = -1;
    this.matter.body.setPosition(this.body, { x, y });
    this.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    this.world.add(this.body);
    this.sprite.setPosition(x, y).setVisible(false);
    this.active = true;
  }

  deactivate() {
    this.active = false;
    this.owner = null;
    this.sprite.setVisible(false);
    this.world.remove(this.body);
  }

  // Trot to a spot `leash` behind the owner; faster the farther away it is.
  update(dt, visible) {
    const o = this.owner;
    const tx = o.x - o.fx * this.cfg.leash;
    const ty = o.y - o.fy * this.cfg.leash + 2;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const sp = d < 2 ? 0 : Math.min(this.cfg.maxSpeed, d * this.cfg.pull);
    const k = Math.min(1, 10 * dt);
    this.vx += ((d > 0 ? dx / d : 0) * sp - this.vx) * k;
    this.vy += ((d > 0 ? dy / d : 0) * sp - this.vy) * k;
    this.mv.x = this.vx / 60;
    this.mv.y = this.vy / 60;
    this.matter.body.setVelocity(this.body, this.mv);
    if (!visible) { this.sprite.setVisible(false); return; }
    const v = Math.hypot(this.vx, this.vy);
    if (v > 3) this.phase += dt * 3.2 * (v / 24);
    const frame = v > 3 ? (this.phase | 0) % 2 : 2;
    if (frame !== this.frame) { this.frame = frame; this.sprite.setTexture(DOG_KEYS[frame]); }
    const flip = Math.abs(this.vx) > 3 ? this.vx < 0 : this.flip;
    if (flip !== this.flip || !this.sprite.visible) { this.flip = flip; this.sprite.setFlipX(flip); }
    this.sprite.setPosition(this.x, this.y).setDepth(this.y).setVisible(true);
  }
}
