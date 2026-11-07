// Bike racks and parking (story 5.5, CAP-16). A bike a player lets go of (`bike:dropped`) within `rackRadius` of a `bike-rack`
// map object is chained there: parkState 'locked', a closed lock and a chain on it, safe from borrowing; anywhere else it is
// 'unlocked' and shows an open lock as the hint that it can be borrowed (entities/BikeTheft.js). Mounting it again
// (`bike:mounted`) takes the lock off. A bike the player has not dropped (the ones from the map) is not tracked. Also draws the
// red padlock over every lying vehicle that is not owned yet (display pieces; Player.mayUse refuses them). Emits
// `bike:parked` { bike, player, locked, rack }. `dropped` is the list of tracked bike images (read by BikeTheft).
import { rackNear } from '../vehicles/theftLogic.js';

const ICON_DEPTH = 7000;

export class Parking {
  constructor(scene, ctx, cfg, services) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.services = services; // the systems with lying items: bikes, skateboards, skates (each has `id` and `parked`)
    this.dropped = [];
    this.racks = [];
    this.padlocks = [];
    const { events } = ctx;
    events.on('bike:dropped', ev => this.park(ev.bike, ev.player));
    events.on('bike:mounted', ev => this.release(ev.bike));
    events.on('state:changed', ev => { if (ev.path === 'shared.ownedVehicles' || ev.path === '') this.refreshPadlocks(); });
    this.loadMap();
    ctx.world.register(this);
  }

  loadMap() {
    const { ctx } = this;
    const ts = ctx.map.tileSize;
    this.racks = ctx.map.objects.filter(o => o.type === 'bike-rack').map(o => ({ id: o.id, x: (o.x + 0.5) * ts, y: (o.y + 0.5) * ts }));
    this.refreshPadlocks();
  }

  // The bikes standing here are destroyed by Bikes; their lock images go with them.
  unloadMap() {
    for (const b of this.dropped) {
      b.icon?.destroy();
      b.chain?.destroy();
      b.icon = b.chain = null;
      b.parkState = undefined;
    }
    this.dropped.length = 0;
    this.racks = [];
    for (const p of this.padlocks) p.setVisible(false);
  }

  park(bike, player) {
    const rack = rackNear(this.racks, bike.x, bike.y, this.cfg.rackRadius);
    bike.parkState = rack ? 'locked' : 'unlocked';
    bike.awayT = 0;
    bike.owner = player;
    if (!this.dropped.includes(bike)) this.dropped.push(bike);
    this.mark(bike);
    if (rack) this.ctx.events.emit('ui:toast', { key: 'bike.locked' });
    this.ctx.events.emit('bike:parked', { bike, player, locked: !!rack, rack: rack?.id ?? null });
  }

  // The lock images of a tracked bike: closed lock + chain when locked, open lock when not.
  mark(bike) {
    const { scene, cfg } = this;
    const inv = this.ctx.res.inv;
    const locked = bike.parkState === 'locked';
    bike.icon ??= scene.add.image(0, 0, 'lock-open').setScale(inv).setDepth(ICON_DEPTH);
    bike.icon.setTexture(locked ? 'lock-closed' : 'lock-open').setPosition(bike.x, bike.y + cfg.iconOffsetY).setVisible(true);
    if (locked) {
      bike.chain ??= scene.add.image(0, 0, 'bike-chain').setScale(inv);
      bike.chain.setPosition(bike.x, bike.y).setRotation(bike.rotation).setDepth(bike.depth + 0.1).setVisible(true);
    } else bike.chain?.setVisible(false);
  }

  // The bike is on its way again (mounted) or was taken (borrowed): no lock, no longer tracked.
  release(bike) {
    bike.parkState = undefined;
    bike.icon?.setVisible(false);
    bike.chain?.setVisible(false);
    const i = this.dropped.indexOf(bike);
    if (i >= 0) this.dropped.splice(i, 1);
  }

  // A padlock over each visible lying vehicle that is not owned (the pool grows to the number of such items, once).
  refreshPadlocks() {
    const { ctx, scene } = this;
    let n = 0;
    for (const svc of this.services) {
      if (ctx.ownership.owns(svc.id)) continue;
      for (const item of svc.parked) {
        if (!item.visible) continue;
        const pad = this.padlocks[n++] ??= scene.add.image(0, 0, 'lock-padlock').setScale(ctx.res.inv).setDepth(ICON_DEPTH);
        pad.setPosition(item.x, item.y + this.cfg.iconOffsetY).setVisible(true);
      }
    }
    for (let i = n; i < this.padlocks.length; i++) this.padlocks[i].setVisible(false);
  }
}
