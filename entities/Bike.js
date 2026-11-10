// Parked bikes from map objects (type "bike"), mounting with the interact intent, and the
// bike effects: skid marks, smoke puffs, bell. Each bike image has a `bikeId` (its map object id, or `own-<player>` for a
// character's own). Mounting needs ownership (Player.mayUse) and emits `bike:mounted` { bike, player }; letting go emits
// `bike:dropped` { bike, player } (entities/Parking.js decides locked or not). Mounting is per player (a `rider` record each; one bike is
// ridden by one player at a time). The ridden bike is the player's `bike` profile (see Player.setVehicle);
// this class only owns the parked entities and effects. `bike:bell` carries { x, y, player }.
import { FadePool } from './pools.js';

const DEG = Math.PI / 180;

export class Bikes {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.id = 'bike';
    this.fx = ctx.players[0].profiles.bike.fx;
    this.parked = []; // sprites of bikes standing around, plus those being ridden (hidden)
    // per player: the sprite being ridden (hidden while mounted) and the effect timers
    this.riders = Array.from({ length: ctx.maxPlayers }, () => ({ mounted: null, lastX: 0, lastY: 0, puffIn: 0, bellIn: 0, jumpPrev: false, skidding: false }));
    this.skids = new FadePool(scene, ctx, 'skid', -0.5, 'skidPool');
    this.puffs = new FadePool(scene, ctx, 'puff', 9000, 'smokePool');
    this.rings = new FadePool(scene, ctx, 'ring', 9001, 'bellPool');
    ctx.pools.register('skids', this.skids);
    ctx.pools.register('smoke', this.puffs);
    ctx.pools.register('bell', this.rings);
    this.loadMap();
    ctx.world.register(this);
  }

  loadMap() {
    const { ctx } = this;
    const ts = ctx.map.tileSize;
    const stolen = ctx.state.shared.flags.stolenBike?.bikeId; // a bike that is at a hideout is not at home too
    for (const o of ctx.map.objects) {
      if (o.type !== 'bike' || o.id === stolen || o.street) continue;
      const bike = this.scene.add.image((o.x + 0.5) * ts, (o.y + 0.5) * ts, 'bike').setScale(ctx.res.inv).setDepth((o.y + 0.5) * ts);
      bike.bikeId = o.id;
      this.parked.push(bike);
    }
    for (const r of ctx.street.locations(this.id)) {
      const b = this.place(r.x, r.y, r.id);
      b.streetId = r.id;
      b.setTint(0xf4c85c);
    }
  }

  // A bike standing at (x, y) that is not a map object (one fetched back from a hideout or restored from a save).
  place(x, y, bikeId) {
    const bike = this.scene.add.image(x, y, 'bike').setScale(this.ctx.res.inv).setDepth(y);
    bike.bikeId = bikeId;
    this.parked.push(bike);
    return bike;
  }

  // A bike being ridden travels with its rider; the parked ones stay behind.
  unloadMap() {
    const ridden = this.riders.map(r => r.mounted).filter(Boolean);
    for (const b of this.parked) if (!ridden.includes(b)) b.destroy();
    this.parked = ridden;
  }

  isMounted(index) { return this.riders[index].mounted !== null; }

  update(dt) {
    const { players, input } = this.ctx;
    for (const player of players) {
      if (player.pinned) continue; // a caught player's presses belong to the caught frame
      const r = this.riders[player.index];
      const i = input.intents[player.index];
      if (i.interact && !player.vehicleSwapped) r.mounted ? this.dismount(player, true) : this.tryMount(player);
      if (r.mounted) this.rideEffects(dt, player, r, i);
      r.jumpPrev = i.jump;
    }
    this.skids.update(dt);
    this.puffs.update(dt);
    this.rings.update(dt);
  }

  // The standing bike closest to `player` within mount range (null when none) and its distance.
  nearest(player) {
    let best = null;
    let bestD = this.fx.mountRange;
    for (const b of this.parked) {
      const d = Math.hypot(b.x - player.x, b.y - player.y);
      if (b.visible && d <= bestD) { best = b; bestD = d; }
    }
    return { bike: best, dist: bestD };
  }

  tryMount(player) {
    const best = this.nearest(player).bike;
    if (!best || player.vehicle !== 'foot' || best.busy || !this.ctx.street.claim(best, player)) return;
    best.setVisible(false);
    this.riders[player.index].mounted = best;
    player.setVehicle('bike');
    this.ctx.events.emit('bike:mounted', { bike: best, player: player.index });
  }

  // The player starts the game already on a bike of their own (a character's start vehicle).
  giveBike(player) {
    const bike = this.scene.add.image(player.x, player.y, 'bike').setScale(this.ctx.res.inv).setVisible(false);
    bike.bikeId = `own-${player.index}`;
    this.parked.push(bike);
    this.riders[player.index].mounted = bike;
    player.setVehicle('bike');
  }

  // The bike stays where the rider let go of it.
  dismount(player, returnRequested = false) {
    const r = this.riders[player.index];
    const b = r.mounted;
    b.setPosition(player.x, player.y).setRotation(player.move.heading).setDepth(player.y).setVisible(true);
    this.ctx.street.drop(b, player, returnRequested);
    r.mounted = null;
    r.skidding = false;
    player.setVehicle('foot');
    this.ctx.events.emit('bike:dropped', { bike: b, player: player.index });
  }

  rideEffects(dt, player, r, i) {
    const m = player.move;
    const fx = this.fx;
    const moving = Math.hypot(i.move.x, i.move.y) > 0.2;
    const drifting = m.slip > fx.skidAngle * DEG && m.velSpeed > fx.skidMinSpeed;
    const braking = !moving && m.velSpeed > fx.brakeSpeed;
    r.skidding = drifting || braking;

    // rear wheel sits behind the player along the heading
    const rx = player.x - Math.cos(m.heading) * 7;
    const ry = player.y - Math.sin(m.heading) * 7;
    r.puffIn -= dt;
    if (r.skidding) {
      if (Math.hypot(rx - r.lastX, ry - r.lastY) >= 2) {
        this.skids.spawn(rx, ry, m.heading, fx.skidLife, 0.6, 1, 1, 0);
        r.lastX = rx; r.lastY = ry;
      }
      if (r.puffIn <= 0) {
        this.puffs.spawn(rx, ry, 0, 0.6, 0.5, 0.5, 1.6, 14);
        this.ctx.particles.puffAt(player, rx, ry, 1);
        r.puffIn = 0.06 / this.ctx.quality.tier.particleMul;
      }
    } else {
      r.lastX = rx; r.lastY = ry;
    }

    r.bellIn -= dt;
    if (i.jump && !r.jumpPrev && r.bellIn <= 0) {
      r.bellIn = fx.bellCooldown;
      this.rings.spawn(player.x, player.y, 0, 0.5, 0.9, 0.3, 2.5, 0);
      this.ctx.events.emit('bike:bell', { x: player.x, y: player.y, player: player.index });
    }
  }
}
