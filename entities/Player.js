import { addCircle } from '../physics/bodies.js';
import { MovementController } from '../vehicles/MovementController.js';

// Player on foot. Movement comes from a profile in data/vehicles.json (AD-4).
// Publishes `player:surface` (surface id) and `player:stamina` (0..1, whole-percent steps).
export class Player {
  constructor(scene, ctx, x, y, profileId, profile) {
    this.ctx = ctx;
    this.sprite = scene.add.image(x, y, 'player').setOrigin(0.5, 0.8);
    this.body = addCircle(scene, x, y, profile.radius, 'PLAYER', { frictionAir: 0, friction: 0, inertia: Infinity });
    this.move = new MovementController(scene.matter, this.body, profileId, profile, ctx.surfaces);
    this.lastSurface = null;
    this.lastPct = -1;
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get stamina() { return this.move.stamina; }
  get surface() { return this.move.surface; }

  update(dt) {
    const i = this.ctx.input.intent;
    const m = this.move;
    m.update(dt, i.move.x, i.move.y, i.sprint);
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setDepth(this.y);
    if (i.move.x) this.sprite.setFlipX(i.move.x < 0);

    if (m.surface !== this.lastSurface) {
      this.lastSurface = m.surface;
      this.ctx.events.emit('player:surface', m.surface);
    }
    const pct = Math.round(m.stamina * 100);
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      this.ctx.events.emit('player:stamina', m.stamina);
    }
  }
}
