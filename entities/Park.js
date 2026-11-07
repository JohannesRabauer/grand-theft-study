import { drawPark, release } from '../scenes/ParkArt.js';

// The skatepark of a map (story 5.4, AD-28): its procedural art (scenes/ParkArt.js, layout in data/park.json) and the
// hint signs: a `sign` object shows its text as a HUD toast (`ui:toast`) when a player rolls close to it. Maps without an
// entry in data/park.json get nothing. The trick objects (rails, ramps, bank spots) belong to vehicles/TrickSystem.js.
export class Park {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.art = null;
    this.signs = [];
    this.loadMap();
    ctx.world.register(this);
  }

  loadMap() {
    const { ctx, cfg } = this;
    const mapCfg = cfg.maps[ctx.world.id];
    if (!mapCfg) return;
    const ts = ctx.map.tileSize;
    this.art = drawPark(this.scene, ctx, mapCfg);
    this.signs = ctx.map.objects.filter(o => o.type === 'sign').map(o => ({ key: o.text, x: (o.x + 0.5) * ts, y: (o.y + 0.5) * ts, near: new Uint8Array(ctx.maxPlayers) }));
  }

  unloadMap() {
    if (this.art) release(this.scene, this.art);
    this.art = null;
    this.signs = [];
  }

  update() {
    if (!this.signs.length) return;
    const { players, events } = this.ctx;
    const { signRadius, signLeave } = this.cfg;
    for (let i = 0; i < players.length; i++) {
      for (const s of this.signs) {
        const d = Math.hypot(players[i].x - s.x, players[i].y - s.y);
        if (d <= signRadius && !s.near[i]) {
          s.near[i] = 1;
          events.emit('ui:toast', { key: s.key });
        } else if (d > signLeave) s.near[i] = 0;
      }
    }
  }
}
