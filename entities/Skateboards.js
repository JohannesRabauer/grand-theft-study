// Skateboards from map objects (type "skateboard"), mounting with the interact intent, and the trick effects on
// top of the pure logic in vehicles/skateLogic.js. The ridden board is the player's `skateboard` profile (see
// Player.setVehicle, MovementController); this class owns the lying boards, each rider's trick state and what a
// trick looks like: a lifted sprite over a ground shadow, crouch / manual poses, landing dust, clack and rattle.
// A board that is let go of stays on the ground and can be picked up again, like a bike.
//
// Ollie (jump intent): while airborne the player's body ignores PROP bodies (cones, cans, crates, balls, bins);
// walls still stop it. Manual (manual intent, hold to balance, see skateLogic). Emits `trick:ollie` and `trick:manual`
// as { player, phase: 'start' | 'end', x, y, ... } (ollie end = landing with `airtime`; manual end carries `time`,
// `sweet` seconds in the balance window and a `reason`) for vehicles/TrickSystem.js, which also asks this class to
// launch the rider off a ramp or put it on a rail (launch, beginGrind, finishGrind). Rattle: surfaces with `rattle` in data/surfaces.json shake the rider sprite.
import { CAT, MASK } from '../physics/categories.js';
import { LAND, MANUAL, MANUAL_END, OLLIE, createSkate, endGrind, resetSkate, startAir, startGrind, stepSkate } from '../vehicles/skateLogic.js';

const ID = 'skateboard';
const PROP_FREE = MASK.PLAYER & ~CAT.PROP;

export class Skateboards {
  // `bikes`: a bike standing closer than a board wins the interact press, so a board lying next to a bike never blocks it.
  constructor(scene, ctx, bikes) {
    this.scene = scene;
    this.ctx = ctx;
    this.bikes = bikes;
    this.profile = ctx.players[0].profiles[ID];
    this.fx = this.profile.fx;
    this.parked = []; // boards lying around, plus those being ridden (hidden)
    this.riders = Array.from({ length: ctx.maxPlayers }, () => ({ mounted: null, skate: createSkate(), shadow: null, pose: '', clackIn: 0 }));
    this.time = 0;
    this.loadMap();
    ctx.world.register(this);
  }

  loadMap() {
    const { ctx } = this;
    const ts = ctx.map.tileSize;
    for (const o of ctx.map.objects) {
      if (o.type === 'skateboard') this.parked.push(this.scene.add.image((o.x + 0.5) * ts, (o.y + 0.5) * ts, 'skateboard').setScale(ctx.res.inv).setDepth((o.y + 0.5) * ts));
    }
  }

  // A board being ridden travels with its rider; the lying ones stay behind.
  unloadMap() {
    const ridden = this.riders.map(r => r.mounted).filter(Boolean);
    for (const b of this.parked) if (!ridden.includes(b)) b.destroy();
    this.parked = ridden;
  }

  isMounted(index) { return this.riders[index].mounted !== null; }

  update(dt) {
    const { players, input } = this.ctx;
    this.time += dt;
    for (const player of players) {
      if (player.pinned) continue; // a caught player's presses belong to the caught frame
      const r = this.riders[player.index];
      const i = input.intents[player.index];
      if (r.mounted && player.vehicle !== ID) this.dismount(player); // switched away by something else
      if (i.interact && !player.vehicleSwapped) {
        if (r.mounted) this.dismount(player); else if (player.vehicle === 'foot') this.tryMount(player);
      }
      if (r.mounted) this.ride(dt, player, r, i);
    }
  }

  tryMount(player) {
    let best = null;
    let bestD = this.fx.mountRange;
    for (const b of this.parked) {
      const d = Math.hypot(b.x - player.x, b.y - player.y);
      if (b.visible && d <= bestD) { best = b; bestD = d; }
    }
    if (!best || this.bikes.nearest(player).dist < bestD) return;
    best.setVisible(false);
    this.riders[player.index].mounted = best;
    player.setVehicle(ID);
  }

  // The player starts the game already on a board of their own (a character's start vehicle).
  giveBoard(player) {
    const board = this.scene.add.image(player.x, player.y, 'skateboard').setScale(this.ctx.res.inv).setVisible(false);
    this.parked.push(board);
    this.riders[player.index].mounted = board;
    player.setVehicle(ID);
  }

  // The board stays where the rider let go of it.
  dismount(player) {
    const r = this.riders[player.index];
    const b = r.mounted;
    b.setPosition(player.x, player.y).setRotation(player.move.heading).setDepth(player.y).setVisible(true);
    r.mounted = null;
    this.endAir(player);
    resetSkate(r.skate);
    r.shadow?.setVisible(false);
    r.pose = '';
    player.setVehicle('foot');
  }

  endAir(player) { player.body.collisionFilter.mask = MASK.PLAYER; }

  // A ramp throws the rider up for `airtime` s, `peak` px high; like an ollie, props are skipped meanwhile.
  launch(player, airtime, peak) {
    startAir(this.riders[player.index].skate, airtime, peak);
    player.body.collisionFilter.mask = PROP_FREE;
  }

  // From the air onto a rail: the rider is held there until finishGrind or a jump (which is the ollie of stepSkate).
  beginGrind(player) {
    startGrind(this.riders[player.index].skate);
    player.body.collisionFilter.mask = PROP_FREE;
  }

  finishGrind(player) {
    endGrind(this.riders[player.index].skate, this.profile.trick);
    this.endAir(player);
  }

  ride(dt, player, r, i) {
    const { events, surfaces, particles, quality } = this.ctx;
    const m = player.move;
    const s = r.skate;
    const cfg = this.profile.trick;
    const flags = stepSkate(s, cfg, dt, { jump: i.jump, manual: i.manual, speed: m.velSpeed });
    m.boostMult = s.boost;
    const info = { player: player.index, phase: 'start', x: player.x, y: player.y, speed: m.velSpeed };

    if (flags & OLLIE) {
      player.body.collisionFilter.mask = PROP_FREE;
      info.airtime = s.airTime;
      events.emit('trick:ollie', info);
    }
    if (flags & LAND) {
      this.endAir(player);
      particles.surfaceBurst(m.surface, player.x, player.y, this.fx.landDust);
      info.phase = 'end';
      info.airtime = s.airTime;
      events.emit('trick:ollie', info);
    }
    if (flags & MANUAL) events.emit('trick:manual', info);
    if (flags & MANUAL_END) {
      info.phase = 'end';
      info.time = s.manualTime;
      info.sweet = s.sweet;
      info.reason = s.endReason;
      events.emit('trick:manual', info);
    }

    // pose, lift and ground shadow
    const poses = this.profile.poses;
    const pose = s.air > 0 || s.grind || (i.jump && !s.manual) ? poses.crouch : s.manual ? poses.manual : '';
    if (pose !== r.pose) {
      r.pose = pose;
      player.sprite.setTexture(player.textureFor(this.profile) + pose);
    }
    const surf = surfaces.props(m.surface);
    let lift = s.height + (s.manual ? cfg.manual.lift : 0);
    const rattle = s.air === 0 && surf.rattle > 0 && m.velSpeed >= this.fx.rattleMinSpeed;
    if (rattle) lift += Math.sin(this.time * 90) * surf.rattle * this.fx.rattleJitter;
    const sprite = player.sprite;
    sprite.y = player.y - lift;
    const shadow = r.shadow ?? (r.shadow = this.scene.add.image(0, 0, 'skate-shadow'));
    const up = Math.min(1, s.height / cfg.ollie.height);
    shadow.setVisible(true).setPosition(player.x, player.y + 1).setRotation(sprite.rotation).setFlipX(sprite.flipX)
      .setScale(this.ctx.res.inv * (1 - 0.3 * up)).setAlpha(1 - 0.4 * up).setDepth(player.y - 1);

    // skate clack: small puffs at the rear wheels, more often (and bouncier) on rough ground
    r.clackIn -= dt;
    if (s.air === 0 && m.velSpeed >= this.fx.clackSpeed && r.clackIn <= 0 && surf.particle !== 'splash') {
      r.clackIn = this.fx.clackInterval / (1 + surf.rattle * 3) / quality.tier.particleMul;
      particles.surfaceBurst(m.surface, player.x - Math.cos(m.heading) * 8, player.y - Math.sin(m.heading) * 8, 1);
    }
  }
}
