import { addCircle } from '../physics/bodies.js';

// Player on foot. Movement comes from a profile in data/vehicles.json (AD-4).
export class Player {
  constructor(scene, ctx, x, y, profile) {
    this.scene = scene;
    this.ctx = ctx;
    this.profile = profile;
    this.sprite = scene.add.image(x, y, 'player').setOrigin(0.5, 0.8);
    this.body = addCircle(scene, x, y, profile.radius, 'PLAYER', { frictionAir: 0, friction: 0, inertia: Infinity });
    this.vx = 0;
    this.vy = 0;
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  update(dt) {
    const p = this.profile;
    const move = this.ctx.input.intent.move;
    const surf = this.ctx.surfaces.props(this.ctx.surfaces.at(this.x, this.y));
    const maxSpeed = p.maxSpeed * (surf.speed.foot ?? 1);
    const step = p.accel * surf.grip * p.grip * dt;
    this.vx = approach(this.vx, move.x * maxSpeed, step);
    this.vy = approach(this.vy, move.y * maxSpeed, step);
    // Fixed 60 Hz Matter step: velocity is px per step.
    this.scene.matter.body.setVelocity(this.body, { x: this.vx / 60, y: this.vy / 60 });
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setDepth(this.y);
    if (move.x) this.sprite.setFlipX(move.x < 0);
  }
}

function approach(v, target, step) {
  if (v < target) return Math.min(v + step, target);
  return Math.max(v - step, target);
}
