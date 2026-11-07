import { addCircle } from '../physics/bodies.js';
import { MovementController } from '../vehicles/MovementController.js';

// Player on foot. Movement comes from a profile in data/vehicles.json (AD-4).
// One of ctx.players (AD-18): `index` selects its intent (ctx.input.intents[index]), and it owns its movement,
// vehicle, stamina, hidden state and tool belt. Publishes `player:vehicle` { player, id } (profile id),
// `player:surface` { player, id } (surface id) and `player:stamina` { player, value } (0..1, whole-percent steps).
// Character fields (set by ctx.characters.apply): `character` (data entry or null), `perks`, `mods` (attribute-derived
// multipliers), `look` (texture keys per profile `lookSlot`), `bullyWeight`; `attrs` is the live attribute object from the state.
export class Player {
  constructor(scene, ctx, index, x, y, profiles, profileId) {
    this.ctx = ctx;
    this.matter = scene.matter;
    this.index = index;
    this.alive = true;
    this.pinned = false; // held by a caught frame or a screen: the co-op tether lets the other player go on
    this.toolbelt = null; // set by GameScene right after creation (the belt needs the player)
    this.profiles = profiles;
    const profile = profiles[profileId];
    this.vehicle = profileId;
    this.grabbing = false; // hanging on to a bus (entities/GrabTargets.js)
    this.stumbling = false; // the comic tumble after a failed grab
    this.vehicleSwapped = false; // set by setVehicle, cleared at the start of each frame: one mount or dismount per interact press
    this.character = null;
    this.perks = {};
    this.look = null;
    this.bullyWeight = 1;
    this.mods = { speed: 1, accel: 1, staminaSize: 1, staminaRegen: 1, spread: 1, assist: 1 };
    this.sprite = scene.add.image(x, y, profile.texture).setOrigin(0.5, 0.8).setScale(ctx.res.inv);
    this.body = addCircle(scene, x, y, profile.radius, 'PLAYER', { frictionAir: 0, friction: 0, inertia: Infinity });
    this.move = new MovementController(scene.matter, this.body, profileId, profile, ctx.surfaces);
    this.lastSurface = null;
    this.lastPct = -1;
    this.hid = false;
    this.leafIn = 0;
  }

  // A profile's texture, or this character's own look for it (profile `lookSlot`).
  textureFor(profile) {
    return (profile.lookSlot && this.look?.[profile.lookSlot]) || profile.texture;
  }

  // Re-reads the sprite texture after the character (look) changed.
  refreshLook() {
    this.sprite.setTexture(this.textureFor(this.profiles[this.vehicle]));
  }

  // Walking is always allowed, anything else must be owned (AD-23, vehicles/Ownership.js). A refused mount toasts and
  // uses up this frame's interact press (vehicleSwapped), so a nearer locked item does not pass it on to the next one.
  mayUse(id) {
    if (this.ctx.ownership.owns(id)) return true;
    this.vehicleSwapped = true;
    this.ctx.ownership.refuse(id);
    return false;
  }

  // Swap movement profile and look (data-driven: `texture`, `lookSlot`, `faceHeading`). Returns false when the vehicle is not owned.
  setVehicle(id) {
    if (!this.mayUse(id)) return false;
    const profile = this.profiles[id];
    this.vehicle = id;
    this.vehicleSwapped = true;
    this.move.boostMult = 1;
    this.move.setProfile(id, profile);
    this.sprite.setTexture(this.textureFor(profile)).setOrigin(0.5, profile.faceHeading ? 0.5 : 0.8);
    this.sprite.setFlipX(false).setRotation(0);
    this.ctx.events.emit('player:vehicle', { player: this.index, id });
    return true;
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

  // Held in place while pinned (a caught frame in a game where the other player goes on): no movement, no steering.
  hold() {
    this.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    this.move.speed = 0;
    this.move.vel.x = this.move.vel.y = 0;
  }

  // This player's karate defense slot (ctx.defense, defense/DefenseController.js).
  get defense() { return this.ctx.defense.forPlayer(this.index); }

  // This player's trick state and Style combo (ctx.tricks, vehicles/TrickSystem.js).
  get tricks() { return this.ctx.tricks.forPlayer(this.index); }

  get attrs() { return this.ctx.state.players[this.index]?.attributes ?? this.ctx.state.cfg.attributes; }

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

  // Riders face their heading; facing west they mirror instead of rotating past 90 degrees, so they never appear upside down.
  faceHeading() {
    const h = this.move.heading;
    const west = Math.cos(h) < 0;
    this.sprite.setFlipX(west).setRotation(west ? h + (h > 0 ? -Math.PI : Math.PI) : h);
  }

  update(dt) {
    const i = this.ctx.input.intents[this.index];
    const m = this.move;
    m.update(dt, i.move.x, i.move.y, i.sprint);
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setDepth(this.y);
    if (m.profile.faceHeading) this.faceHeading();
    else if (i.move.x) this.sprite.setFlipX(i.move.x < 0);

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
