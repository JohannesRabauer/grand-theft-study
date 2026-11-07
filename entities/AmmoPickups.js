// Ammo pickups (pebble, chestnut, acorn) from map objects of type 'ammo'. Walking over one adds
// its amount to the slingshot magazine (capped); it reappears after `respawn` seconds. Sprites
// are made once. The player who walks over one fills their own magazine; emits `ammo:pickup` { player, kind, amount }.
export class AmmoPickups {
  constructor(scene, ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    const ts = ctx.map.tileSize;
    this.items = ctx.map.objects.filter(o => o.type === 'ammo').map(o => ({
      kind: o.kind,
      x: (o.x + 0.5) * ts,
      y: (o.y + 0.5) * ts,
      back: 0, // seconds until it is back, 0 = on the ground
      sprite: scene.add.image((o.x + 0.5) * ts, (o.y + 0.5) * ts, cfg.ammo[o.kind].texture).setScale(ctx.res.inv).setDepth((o.y + 0.5) * ts - 2)
    }));
    const self = this;
    ctx.pools.register('ammo', { live: () => self.items.filter(i => i.back === 0).length, cap: this.items.length });
  }

  update(dt) {
    const { players } = this.ctx;
    const r = this.cfg.pickup.radius;
    for (const it of this.items) {
      if (it.back > 0) {
        it.back -= dt;
        if (it.back <= 0) { it.back = 0; it.sprite.setVisible(true); }
        continue;
      }
      for (const player of players) {
        if (Math.hypot(player.x - it.x, player.y - it.y) > r) continue;
        const sling = player.toolbelt.tools.find(t => t.id === 'slingshot');
        if (!sling || sling.ammo >= sling.max) continue; // stays on the ground while the magazine is full
        const amount = this.cfg.ammo[it.kind].amount;
        sling.addAmmo(amount);
        it.back = this.cfg.pickup.respawn;
        it.sprite.setVisible(false);
        this.ctx.events.emit('ammo:pickup', { player: player.index, kind: it.kind, amount });
        break;
      }
    }
  }
}
