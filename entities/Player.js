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
    this.sprite = scene.add.image(x, y, profile.texture).setOrigin(0.5, 0.8).setScale(ctx.res.inv);
    this.body = addCircle(scene, x, y, profile.radius, 'PLAYER', { frictionAir: 0, friction: 0, inertia: Infinity });
    this.move = new MovementController(scene.matter, this.body, profileId, profile, ctx.surfaces);
    this.lastSurface = null;
    this.lastPct = -1;
    this.hid = false;
    this.leafIn = 0;
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

  // Hidden in a hiding spot: translucent, greenish and the odd rustling leaf.
  updateHidden(dt) {
    const hid = this.ctx.chase.hidden;
    if (hid !== this.hid) {
      this.hid = hid;
      this.sprite.setAlpha(hid ? 0.5 : 1);
      if (hid) this.sprite.setTint(0x8fdc8f); else this.sprite.clearTint();
      this.leafIn = 0;
    }
    if (!hid || (this.leafIn -= dt) > 0) return;
    this.leafIn = this.ctx.chase.cfg.escape.leafInterval / this.ctx.quality.tier.particleMul;
    this.ctx.particles.emit('leaves', this.x, this.y - 4, { count: 1 });
  }

  update(dt) {
    const i = this.ctx.input.intent;
    const m = this.move;
    m.update(dt, i.move.x, i.move.y, i.sprint);
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setDepth(this.y);
    if (m.profile.faceHeading) {
      // facing west: mirror instead of rotating past 90 degrees, so the rider never appears upside down
      const h = m.heading;
      const west = Math.cos(h) < 0;
      this.sprite.setFlipX(west).setRotation(west ? h + (h > 0 ? -Math.PI : Math.PI) : h);
    } else if (i.move.x) this.sprite.setFlipX(i.move.x < 0);

    this.updateHidden(dt);
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
