// Phone lookouts (story 7.2, ctx.lookouts): bullies with a phone who stand at the map objects `lookout` and watch (data/chase.json `lookout`).
// A player inside the radius who is not hidden is spotted: `lookout:spotted` { id, player, level } is emitted, the gang is called (the
// Aerger level rises) and the kids are exposed for a few seconds - hiding spots do not work meanwhile (ctx.chase.exposed). Each lookout rests
// for its cooldown after spotting. The art is a small figure with a lit phone and a faint ring showing the spotted radius.
export class Lookouts {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.spots = [];
    this.gfx = null;
    ctx.lookouts = this;
    ctx.world.register(this);
    this.loadMap();
  }

  get cfg() { return this.ctx.chase.cfg.lookout; }

  loadMap() {
    const { ctx, scene } = this;
    const ts = ctx.map.tileSize;
    this.spots = ctx.map.indoor ? [] : ctx.map.objects.filter(o => o.type === 'lookout').map(o => ({ id: o.id, x: (o.x + 0.5) * ts, y: (o.y + 0.5) * ts, rest: 0 }));
    if (!this.spots.length) return;
    const g = (this.gfx = scene.add.graphics().setDepth(2));
    for (const s of this.spots) {
      g.lineStyle(1, 0xff9a3a, 0.22).strokeCircle(s.x, s.y, this.cfg.radius);
      g.fillStyle(0x000000, 0.25).fillEllipse(s.x, s.y + 7, 10, 4);
      g.fillStyle(0x5a2a7a).fillRect(s.x - 3, s.y - 3, 6, 9); // hoodie
      g.fillStyle(0xf2c9a0).fillCircle(s.x, s.y - 6, 3); // head
      g.fillStyle(0x1a1a1a).fillRect(s.x - 3, s.y - 9, 6, 2); // cap
      g.fillStyle(0xffe14d).fillRect(s.x + 3, s.y - 3, 2, 3); // the phone
    }
  }

  unloadMap() {
    this.gfx?.destroy();
    this.gfx = null;
    this.spots = [];
  }

  update(dt) {
    const { ctx } = this;
    const chase = ctx.chase;
    if (chase.exposed > 0) chase.exposed = Math.max(0, chase.exposed - dt);
    if (!this.spots.length || !chase.lvl.enabled || window.SCHULWEG_GAME?.lookoutsOff) return; // lookoutsOff: test hook, the scripted chase runs have no lookouts
    const c = this.cfg;
    for (const s of this.spots) {
      if (s.rest > 0) { s.rest -= dt; continue; }
      for (const p of ctx.players) {
        if (!p.alive || p.pinned || Math.hypot(p.x - s.x, p.y - s.y) > c.radius || chase.perception.hiddenFor(p)) continue;
        this.spot(s, p);
        break;
      }
    }
  }

  spot(s, p) {
    const { ctx } = this;
    const chase = ctx.chase;
    const c = this.cfg;
    s.rest = c.cooldown;
    chase.exposed = c.exposeSeconds;
    chase.lvl.set(Math.min(chase.lvl.max, Math.max(1, chase.lvl.level + c.raise)), 'lookout');
    ctx.events.emit('lookout:spotted', { id: s.id, player: p.index, level: chase.lvl.level });
    ctx.events.emit('ui:toast', { key: 'lookout.spotted' });
  }
}
