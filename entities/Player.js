import { addCircle } from '../physics/bodies.js';
import { MovementController } from '../vehicles/MovementController.js';

// Player on foot. Movement comes from a profile in data/vehicles.json (AD-4).
// One of ctx.players (AD-18): `index` selects its intent (ctx.input.intents[index]), and it owns its movement,
// vehicle, stamina, hidden state and tool belt. Publishes `player:vehicle` { player, id } (profile id),
// `player:surface` { player, id } (surface id) and `player:stamina` { player, value } (0..1, whole-percent steps).
export class Player {
  constructor(scene, ctx, index, x, y, profiles, profileId) {
    this.ctx = ctx;
    this.matter = scene.matter;
    this.index = index;
    this.alive = true;
    this.toolbelt = null; // set by GameScene right after creation (the belt needs the player)
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
    this.ctx.events.emit('player:vehicle', { player: this.index, id });
  }

  // Puts the player at (x, y) standing still, optionally facing `heading` (radians).
  teleport(x, y, heading) {
    this.matter.body.setPosition(this.body, { x, y });
    this.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    this.move.speed = 0;
    this.move.vel.x = this.move.vel.y = 0;
    if (heading !== undefined) this.move.heading = heading;
    this.sprite.setPosition(x, y);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get stamina() { return this.move.stamina; }
  get surface() { return this.move.surface; }

  // Hidden in a hiding spot: translucent, greenish and the odd rustling leaf.
  updateHidden(dt) {
    const hid = this.ctx.chase.hiddenFor(this);
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
    const i = this.ctx.input.intents[this.index];
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
      this.ctx.events.emit('player:surface', { player: this.index, id: m.surface });
    }
    const pct = Math.round(m.stamina * 100);
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      this.ctx.events.emit('player:stamina', { player: this.index, value: m.stamina });
    }
  }
}
