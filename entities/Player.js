import { addCircle } from '../physics/bodies.js';
import { MovementController } from '../vehicles/MovementController.js';

// Player on foot. Movement comes from a profile in data/vehicles.json (AD-4).
// Publishes `player:vehicle` (profile id), `player:surface` (surface id) and `player:stamina` (0..1, whole-percent steps).
export class Player {
  constructor(scene, ctx, x, y, profiles, profileId) {
    this.ctx = ctx;
    this.profiles = profiles;
    const profile = profiles[profileId];
    this.vehicle = profileId;
    this.sprite = scene.add.image(x, y, profile.texture).setOrigin(0.5, 0.8);
    this.body = addCircle(scene, x, y, profile.radius, 'PLAYER', { frictionAir: 0, friction: 0, inertia: Infinity });
    this.move = new MovementController(scene.matter, this.body, profileId, profile, ctx.surfaces);
    this.lastSurface = null;
    this.lastPct = -1;
  }

  // Swap movement profile and look (data-driven: `texture`, `faceHeading`).
  setVehicle(id) {
    const profile = this.profiles[id];
    this.vehicle = id;
    this.move.setProfile(id, profile);
    this.sprite.setTexture(profile.texture).setOrigin(0.5, profile.faceHeading ? 0.5 : 0.8);
    this.sprite.setFlipX(false).setRotation(0);
    this.ctx.events.emit('player:vehicle', id);
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
    if (m.profile.faceHeading) this.sprite.setRotation(m.heading);
    else if (i.move.x) this.sprite.setFlipX(i.move.x < 0);

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
