// Parked bikes from map objects (type "bike"), mounting with the interact intent, and the
// bike effects: skid marks, smoke puffs, bell. The ridden bike is the player's `bike`
// profile (see Player.setVehicle); this class only owns the parked entity and effects.
import { FadePool } from './pools.js';

const DEG = Math.PI / 180;

export class Bikes {
  constructor(scene, ctx) {
    this.ctx = ctx;
    this.fx = ctx.player.profiles.bike.fx;
    const ts = ctx.map.tileSize;
    this.parked = ctx.map.objects.filter(o => o.type === 'bike')
      .map(o => scene.add.image((o.x + 0.5) * ts, (o.y + 0.5) * ts, 'bike').setScale(ctx.res.inv).setDepth((o.y + 0.5) * ts));
    this.mounted = null; // the sprite being ridden (hidden while mounted)
    this.skids = new FadePool(scene, ctx, 'skid', -0.5, 'skidPool');
    this.puffs = new FadePool(scene, ctx, 'puff', 9000, 'smokePool');
    this.rings = new FadePool(scene, ctx, 'ring', 9001, 'bellPool');
    ctx.pools.register('skids', this.skids);
    ctx.pools.register('smoke', this.puffs);
    ctx.pools.register('bell', this.rings);
    this.lastX = 0;
    this.lastY = 0;
    this.puffIn = 0;
    this.bellIn = 0;
    this.jumpPrev = false;
    this.skidding = false;
  }

  update(dt) {
    const { player, input, events } = this.ctx;
    const i = input.intent;
    if (i.interact) this.mounted ? this.dismount() : this.tryMount();
    if (this.mounted) this.rideEffects(dt, player, i, events);
    this.jumpPrev = i.jump;
    this.skids.update(dt);
    this.puffs.update(dt);
    this.rings.update(dt);
  }

  tryMount() {
    const { player } = this.ctx;
    let best = null;
    let bestD = this.fx.mountRange;
    for (const b of this.parked) {
      const d = Math.hypot(b.x - player.x, b.y - player.y);
      if (b.visible && d <= bestD) { best = b; bestD = d; }
    }
    if (!best) return;
    best.setVisible(false);
    this.mounted = best;
    player.setVehicle('bike');
  }

  // The bike stays where the rider let go of it.
  dismount() {
    const { player } = this.ctx;
    const b = this.mounted;
    b.setPosition(player.x, player.y).setRotation(player.move.heading).setDepth(player.y).setVisible(true);
    this.mounted = null;
    this.skidding = false;
    player.setVehicle('foot');
  }

  rideEffects(dt, player, i, events) {
    const m = player.move;
    const fx = this.fx;
    const moving = Math.hypot(i.move.x, i.move.y) > 0.2;
    const drifting = m.slip > fx.skidAngle * DEG && m.velSpeed > fx.skidMinSpeed;
    const braking = !moving && m.velSpeed > fx.brakeSpeed;
    this.skidding = drifting || braking;

    // rear wheel sits behind the player along the heading
    const rx = player.x - Math.cos(m.heading) * 7;
    const ry = player.y - Math.sin(m.heading) * 7;
    this.puffIn -= dt;
    if (this.skidding) {
      if (Math.hypot(rx - this.lastX, ry - this.lastY) >= 2) {
        this.skids.spawn(rx, ry, m.heading, fx.skidLife, 0.6, 1, 1, 0);
        this.lastX = rx; this.lastY = ry;
      }
      if (this.puffIn <= 0) {
        this.puffs.spawn(rx, ry, 0, 0.6, 0.5, 0.5, 1.6, 14);
        this.puffIn = 0.06 / this.ctx.quality.tier.particleMul;
      }
    } else {
      this.lastX = rx; this.lastY = ry;
    }

    this.bellIn -= dt;
    if (i.jump && !this.jumpPrev && this.bellIn <= 0) {
      this.bellIn = fx.bellCooldown;
      this.rings.spawn(player.x, player.y, 0, 0.5, 0.9, 0.3, 2.5, 0);
      events.emit('bike:bell', { x: player.x, y: player.y });
    }
  }
}
