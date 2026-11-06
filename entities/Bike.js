// Parked bikes from map objects (type "bike"), mounting with the interact intent, and the
// bike effects: skid marks, smoke puffs, bell. The ridden bike is the player's `bike`
// profile (see Player.setVehicle); this class only owns the parked entity and effects.
const DEG = Math.PI / 180;

// Fixed-size ring of sprites that fade (and optionally grow/rise) over their life. No allocation in update.
class FadePool {
  constructor(scene, key, n, depth) {
    this.n = n;
    this.next = 0;
    this.sprites = [];
    for (let i = 0; i < n; i++) this.sprites.push(scene.add.image(0, 0, key).setDepth(depth).setVisible(false));
    this.age = new Float32Array(n);
    this.life = new Float32Array(n); // 0 = free
    this.a0 = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.rise = new Float32Array(n);
  }

  spawn(x, y, rot, life, a0, s0, s1, rise) {
    const i = this.next;
    this.next = (i + 1) % this.n; // oldest entry is recycled when full
    this.age[i] = 0; this.life[i] = life; this.a0[i] = a0;
    this.s0[i] = s0; this.s1[i] = s1; this.rise[i] = rise;
    this.sprites[i].setPosition(x, y).setRotation(rot).setScale(s0).setAlpha(a0).setVisible(true);
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] === 0) continue;
      const t = (this.age[i] += dt) / this.life[i];
      const s = this.sprites[i];
      if (t >= 1) { s.setVisible(false); this.life[i] = 0; continue; }
      s.setAlpha(this.a0[i] * (1 - t)).setScale(this.s0[i] + (this.s1[i] - this.s0[i]) * t);
      if (this.rise[i]) s.y -= this.rise[i] * dt;
    }
  }
}

export class Bikes {
  constructor(scene, ctx) {
    this.ctx = ctx;
    this.fx = ctx.player.profiles.bike.fx;
    const ts = ctx.map.tileSize;
    this.parked = ctx.map.objects.filter(o => o.type === 'bike')
      .map(o => scene.add.image((o.x + 0.5) * ts, (o.y + 0.5) * ts, 'bike').setDepth((o.y + 0.5) * ts));
    this.mounted = null; // the sprite being ridden (hidden while mounted)
    this.skids = new FadePool(scene, 'skid', this.fx.skidCap, -0.5);
    this.puffs = new FadePool(scene, 'puff', this.fx.puffCap, 9000);
    this.rings = new FadePool(scene, 'ring', this.fx.bellCap, 9001);
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
        this.puffIn = 0.06;
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
