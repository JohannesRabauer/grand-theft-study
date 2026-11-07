// Traffic hits (story 5.6, AD-23, CAP-31): road vehicles that are in motion hit players, comically and never harmfully.
// `sources` are services with a `pool` of vehicles ({ id, kind, active, x, y, heading, vx, vy, speed, kcfg: { length, width, zone } };
// now GrabTargets' buses, later cars and the tram). Each frame every player who is not tumbling, invulnerable, pinned or
// hanging on to a bus is tested against the vehicles with vehicles/trafficLogic.js `classifyHit`: a front or side contact at a
// relative speed of at least `minSpeed` hits; the grab zone behind the rear never does. This is a geometric query, not
// physics: no Matter force touches anybody (AD-3), and pedestrians, animals, bullies and chasers are not even looked at.
//
// A hit (`traffic:hit` { player, vehicleId, kind, speed, direction (the vehicle's heading, rad), lost (cents), x, y }, the hook
// the Verhalten conduct score may use later; `sfx:play` 'traffic-hit' and 'bus-horn' are the audio hooks) throws the player on a
// short arc with a spin (fake height + shadow), where it lies sprawled with stars over its head, gets up and goes on slowly
// for a while, then is safe from the next hit for a moment. The ridden bike, board or skates are flung off and slide to a
// stop, lying there to be mounted again; up to 50 cents drop out of the pocket as coins (wallet.spend + LootDrops coins that
// stay 20 s); the stamina tank loses a share. The bus honks (bubble) and drives on. All numbers are data/traffic.json.
// Per player and independent (co-op). `threat(x, y)` tells the pedestrian director a vehicle is coming (they step aside early).
import { CAT, MASK } from '../physics/categories.js';
import { SpeechBubbles } from './SpeechBubbles.js';
import {
  DONE, FLY, GETUP, IDLE, LANDED, LIE, UP, canBeHit, classifyHit, createHit, flightAt, inPath, planLaunch, relativeSpeed, slideFraction,
  spillCoins, startHit, stepHit, clearFraction
} from '../vehicles/trafficLogic.js';

const TURN = 2 * Math.PI;
const FLY_MASK = MASK.PLAYER & ~CAT.PROP & ~CAT.NPC; // the launch passes over props and pedestrians (nobody is shoved)

export class Traffic {
  // `rides`: Bikes, Skateboards and Skates (they know the vehicle a player sits on); `parking` re-tracks a flung bike.
  constructor(scene, ctx, cfg, sources, rides, parking) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.sources = sources;
    this.rides = rides;
    this.parking = parking;
    this.random = Math.random; // swappable for seeded runs
    this.enabled = !window.SCHULWEG_GAME?.trafficOff; // test hook: the scripted smoke runs ride the main road blind and switch traffic off
    this.bubbles = new SpeechBubbles(scene, ctx, ctx.maxPlayers * 2, 'trafficBubbles');
    this.slots = Array.from({ length: ctx.maxPlayers }, () => ({
      hit: createHit(),
      plan: { dx: 0, dy: 0, side: 1 },
      pose: { x: 0, y: 0, lift: 0, spin: 0 },
      fromX: 0, fromY: 0, lieRot: 0, starsIn: 0,
      anchor: { x: 0, y: 0, active: true }, // what the line bubble follows
      shadow: null,
      slide: { item: null, x0: 0, y0: 0, dx: 0, dy: 0, t: 0, rot: 0, spin: 0, dustIn: 0 }
    }));
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.solid = (x, y) => ctx.surfaces.solid(ctx.surfaces.at(x, y));
    const { events } = ctx;
    events.on('player:caught', e => this.cancel(ctx.players[e.player]));
    events.on('world:leave', () => { for (const p of ctx.players) this.cancel(p); });
    ctx.traffic = this;
    ctx.pools.register('traffic-slides', { live: () => this.slots.filter(s => s.slide.item).length, cap: ctx.maxPlayers });
    ctx.world.register(this);
  }

  loadMap() {}

  unloadMap() {
    this.bubbles.clear();
  }

  // Is player `index` in the middle of a tumble (flying, lying or getting up)?
  tumbling(index) {
    return this.slots[index].hit.phase !== IDLE;
  }

  // The first vehicle that is about to drive over the point (x, y), or null. Pedestrians use it to step aside early.
  threat(x, y) {
    if (!this.enabled) return null;
    const react = this.cfg.npcReact;
    for (const src of this.sources) {
      for (const t of src.pool) {
        if (t.active && t.speed >= this.cfg.minSpeed && inPath(t.x, t.y, t.heading, t.kcfg.length, t.kcfg.width, react, x, y)) return t;
      }
    }
    return null;
  }

  update(dt) {
    const { players } = this.ctx;
    for (const player of players) {
      const slot = this.slots[player.index];
      const flags = stepHit(slot.hit, this.cfg, dt);
      if (slot.hit.phase !== IDLE || flags) this.tumble(dt, player, slot, flags);
      if (slot.hit.stun > 0) this.slow(player);
      if (this.enabled && !player.pinned && !player.grabbing && canBeHit(slot.hit)) this.detect(player, slot);
      if (slot.slide.item) this.slide(dt, player, slot);
    }
    this.bubbles.update(dt);
  }

  slow(player) {
    const m = player.move;
    m.speed = Math.min(m.speed, m.profile.maxSpeed * this.cfg.stun.speedMult);
  }

  airborne(player) {
    for (const ride of this.rides) {
      const s = ride.riders[player.index].skate;
      if (s && (s.air > 0 || s.grind)) return true;
    }
    return false;
  }

  detect(player, slot) {
    const m = player.move;
    const radius = player.body.circleRadius;
    const { minSpeed, kinds } = this.cfg;
    for (const src of this.sources) {
      for (const t of src.pool) {
        if (!t.active || t.speed < minSpeed) continue;
        const reach = t.kcfg.length / 2 + radius + 12;
        if (Math.abs(player.x - t.x) > reach || Math.abs(player.y - t.y) > reach) continue;
        const speed = relativeSpeed(t.vx, t.vy, m.vel.x, m.vel.y);
        if (speed < minSpeed) continue;
        const kind = classifyHit(t.x, t.y, t.heading, t.kcfg.length, t.kcfg.width, t.kcfg.zone, kinds[t.kind], player.x, player.y, radius);
        if ((kind === 'front' || kind === 'side') && !this.airborne(player)) {
          this.hitBy(player, slot, t, kind, speed);
          return;
        }
      }
    }
  }

  hitBy(player, slot, t, kind, speed) {
    const { ctx, cfg } = this;
    const { events, particles } = ctx;
    const m = player.move;
    const lat = -(player.x - t.x) * Math.sin(t.heading) + (player.y - t.y) * Math.cos(t.heading);
    startHit(slot.hit);
    slot.fromX = player.x;
    slot.fromY = player.y;
    planLaunch(cfg, t.heading, lat, player.x, player.y, this.solid, slot.plan);
    slot.lieRot = slot.plan.side * Math.PI / 2;
    slot.starsIn = 0;
    player.body.collisionFilter.mask = FLY_MASK;
    this.fling(player, slot, t.heading);
    m.stamina = Math.max(0, m.stamina - cfg.stun.stamina);
    const lost = this.spill(player);
    particles.emit('stars', player.x, player.y - 6, { count: cfg.fx.hitStars });
    particles.emit('dust', player.x, player.y, { count: cfg.fx.hitDust });
    this.bubbles.say(t, ctx.t('traffic.honk'), cfg.horn.bubbleSeconds);
    this.bubbles.say(slot.anchor, ctx.t(`traffic.hit.${1 + Math.floor(this.random() * cfg.lines)}`), cfg.bubbleSeconds);
    slot.anchor.x = player.x;
    slot.anchor.y = player.y;
    if (lost > 0) events.emit('ui:toast', { key: 'traffic.spill' });
    events.emit('sfx:play', { name: cfg.horn.sfx, x: t.x, y: t.y });
    events.emit('sfx:play', { name: cfg.horn.hitSfx, x: player.x, y: player.y });
    events.emit('traffic:hit', { player: player.index, vehicleId: t.id, kind, speed, direction: t.heading, lost, x: player.x, y: player.y });
  }

  // The pocket's loss as coins on the ground (a wallet.spend and as many cents of loot); returns the cents lost.
  spill(player) {
    const { ctx, cfg } = this;
    const { total, parts } = spillCoins(cfg, ctx.state.shared.money, this.random);
    if (total === 0) return 0;
    ctx.state.dispatch('wallet.spend', { cents: total, reason: 'traffic' });
    for (const cents of parts) ctx.loot.drop('coin', player.x, player.y, { cents }).life = cfg.coins.life;
    return total;
  }

  // The ridden vehicle (if any) is let go of and thrown off to slide away; it stays a lying item that can be mounted again.
  fling(player, slot, heading) {
    const ride = this.rides.find(r => r.isMounted(player.index));
    if (!ride) return;
    const f = this.cfg.fling;
    const item = ride.riders[player.index].mounted;
    ride.dismount(player);
    this.parking?.release(item); // a flung bike is not locked where it was dropped: it is tracked again when it has stopped
    const dist = f.distance[0] + this.random() * (f.distance[1] - f.distance[0]);
    const a = heading + slot.plan.side * f.angle * (0.4 + 0.6 * this.random());
    const dx = Math.cos(a) * dist;
    const dy = Math.sin(a) * dist;
    const k = clearFraction(item.x, item.y, dx, dy, this.cfg.launch.probe, 4, this.solid);
    const s = slot.slide;
    s.item = item;
    s.x0 = item.x;
    s.y0 = item.y;
    s.dx = dx * k;
    s.dy = dy * k;
    s.t = 0;
    s.dustIn = 0;
    s.rot = item.rotation;
    s.spin = (this.random() < 0.5 ? -1 : 1) * f.spins * TURN;
  }

  slide(dt, player, slot) {
    const { cfg } = this;
    const s = slot.slide;
    const item = s.item;
    if (!item.scene || !item.visible) { s.item = null; return; } // gone with the map, or mounted by somebody else
    s.t += dt;
    const u = Math.min(1, s.t / cfg.fling.seconds);
    const e = slideFraction(u);
    item.setPosition(s.x0 + s.dx * e, s.y0 + s.dy * e).setRotation(s.rot + s.spin * e).setDepth(item.y);
    if ((s.dustIn -= dt) <= 0 && u < 1) {
      s.dustIn = cfg.fx.slideDust / this.ctx.quality.tier.particleMul;
      this.ctx.particles.emit('dust', item.x, item.y, { count: 1 });
    }
    if (u < 1) return;
    s.item = null;
    if (item.parkState !== undefined || item.bikeId !== undefined) this.parking?.park(item, player.index);
  }

  // One frame of the tumble: the launch arc with the shadow, the sprawl with stars, the get-up.
  tumble(dt, player, slot, flags) {
    const { cfg } = this;
    const h = slot.hit;
    const sprite = player.sprite;
    const m = player.move;
    let lift = 0;
    if (h.phase === FLY) {
      const pose = flightAt(h.t / cfg.launch.seconds, slot.fromX, slot.fromY, slot.plan, cfg.launch, slot.pose);
      this.place(player, pose);
      lift = pose.lift;
      sprite.setRotation(pose.spin);
    } else if (h.phase === LIE) {
      this.place(player, slot.pose); // where it landed
      if ((slot.starsIn -= dt) <= 0) {
        slot.starsIn = cfg.fx.starsEvery / this.ctx.quality.tier.particleMul;
        this.ctx.particles.emit('stars', player.x, player.y - 8, { count: 1 });
      }
      sprite.setRotation(slot.lieRot + Math.sin(h.t * 14) * 0.08);
    } else if (h.phase === GETUP) {
      const u = h.t / cfg.getUp;
      lift = Math.sin(u * Math.PI) * 3;
      sprite.setRotation(slot.lieRot * (1 - u * u));
    }
    if (flags & LANDED) {
      this.ctx.particles.emit('dust', player.x, player.y, { count: cfg.fx.hitDust });
      this.ctx.particles.emit('stars', player.x, player.y - 6, { count: 2 });
    }
    if (flags & UP) player.body.collisionFilter.mask = MASK.PLAYER;
    if (flags & DONE) sprite.setRotation(0);
    if (h.phase === FLY || h.phase === LIE) {
      player.vehicleSwapped = true; // no mounting while on the ground
      m.speed = 0;
    }
    sprite.y = player.y - lift;
    sprite.setDepth(player.y);
    slot.anchor.x = player.x;
    slot.anchor.y = player.y - lift;
    this.drawShadow(player, slot, h.phase === FLY ? lift / cfg.launch.peak : h.phase === IDLE ? -1 : 0);
  }

  // Puts the player's body at pose (x, y), standing still.
  place(player, pose) {
    const { matter } = player;
    this.pos.x = pose.x;
    this.pos.y = pose.y;
    matter.body.setPosition(player.body, this.pos);
    matter.body.setVelocity(player.body, this.vel);
    player.move.vel.x = player.move.vel.y = player.move.velSpeed = 0;
  }

  // The ground shadow under the flying player: `up` 0..1 is the height share, below 0 hides it.
  drawShadow(player, slot, up) {
    if (up < 0) {
      slot.shadow?.setVisible(false);
      return;
    }
    const shadow = slot.shadow ?? (slot.shadow = this.scene.add.image(0, 0, 'skate-shadow'));
    shadow.setVisible(true).setPosition(player.x, player.y + 1).setScale(this.ctx.res.inv * (1 - 0.35 * up)).setAlpha(1 - 0.5 * up).setDepth(player.y - 1);
  }

  // The tumble ends without a landing (caught, map change): back to normal at once.
  cancel(player) {
    const slot = this.slots[player.index];
    if (slot.hit.phase !== IDLE) {
      slot.hit.phase = IDLE;
      slot.hit.t = 0;
      player.body.collisionFilter.mask = MASK.PLAYER;
      player.sprite.setRotation(0);
      slot.shadow?.setVisible(false);
    }
    slot.hit.stun = slot.hit.safe = 0;
    slot.slide.item = null;
    this.bubbles.release(slot.anchor);
  }
}
