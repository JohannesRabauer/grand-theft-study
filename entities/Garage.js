// The garage find (story 5.5, CAP-16): a `garage` map object (rect, `vehicle`, `hiddenFlag`) is a garage door at the player's
// home area. The first interact press next to it opens it (flag `hiddenFlag` in the saved state), unlocks the vehicle inside
// with `vehicles.unlock` reason 'garage' and celebrates with a toast and sparkles. Afterwards the door stays open. The
// home interior comes in epic 8; until then this is the exterior door. Emits `garage:found` { id, vehicle }.
const REACH = 12; // px around the rect from which the press counts

export class Garage {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.garages = [];
    this.loadMap();
    ctx.world.register(this);
  }

  loadMap() {
    const { ctx, scene } = this;
    const ts = ctx.map.tileSize;
    this.garages = ctx.map.objects.filter(o => o.type === 'garage').map(o => {
      const x0 = o.x * ts;
      const x1 = (o.x + o.w) * ts;
      const y1 = (o.y + o.h) * ts;
      const open = !!ctx.state.shared.flags[o.hiddenFlag];
      const sprite = scene.add.image((x0 + x1) / 2, y1, open ? 'garage-open' : 'garage-closed').setOrigin(0.5, 1).setScale(ctx.res.inv).setDepth(y1);
      return { o, x0: x0 - REACH, x1: x1 + REACH, y0: o.y * ts - REACH, y1: y1 + REACH, sprite };
    });
  }

  unloadMap() {
    for (const g of this.garages) g.sprite.destroy();
    this.garages = [];
  }

  update() {
    if (!this.garages.length) return;
    const { players, input } = this.ctx;
    for (const p of players) {
      if (p.pinned || p.vehicleSwapped || !input.intents[p.index].interact) continue;
      for (const g of this.garages) {
        if (p.x >= g.x0 && p.x < g.x1 && p.y >= g.y0 && p.y < g.y1) this.visit(g, p);
      }
    }
  }

  visit(g, player) {
    const { ctx } = this;
    const { o } = g;
    if (ctx.state.shared.flags[o.hiddenFlag]) { ctx.events.emit('ui:toast', { key: 'garage.empty' }); return; }
    ctx.state.dispatch('flags.set', { key: o.hiddenFlag });
    const fresh = ctx.ownership.unlock(o.vehicle, 'garage');
    g.sprite.setTexture('garage-open');
    ctx.particles.emit('spark', (g.x0 + g.x1) / 2, g.y1 - 12, { count: 3 });
    ctx.events.emit('ui:toast', { key: fresh ? 'garage.found' : 'garage.old', params: { name: ctx.t(`vehicle.${o.vehicle}`) } });
    ctx.events.emit('garage:found', { id: o.id, vehicle: o.vehicle, player: player.index });
  }
}
