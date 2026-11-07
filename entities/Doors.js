// Door objects (AD-28): a rectangle in tile coordinates that leads to another map. A player walking in
// and pressing interact (or just touching it when the door has `auto: true`) makes the door emit
// `world:enter-request` { map, entry, door, player }; ctx.world performs the switch. A player who
// arrives standing inside a door does not trigger it until they have left it. Doors marked `debug`
// exist only in debug sessions (ctx.world.debugContent).
const MAT = 0x4a3524;
const MAT_EDGE = 0x8a6a45;

export class Doors {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.list = [];
    this.gfx = null;
    this.debugText = [];
    this.loadMap();
    ctx.world.register(this);
  }

  loadMap() {
    const { ctx, scene } = this;
    const ts = ctx.map.tileSize;
    this.list = ctx.map.objects
      .filter(o => o.type === 'door' && (!o.debug || ctx.world.debugContent))
      .map(o => ({ o, x0: o.x * ts, y0: o.y * ts, x1: (o.x + o.w) * ts, y1: (o.y + o.h) * ts, inside: new Uint8Array(ctx.maxPlayers) }));
    if (!this.list.length) return;
    this.gfx = scene.add.graphics().setDepth(-0.5); // a doormat on the ground
    ctx.players.forEach((p, i) => { for (const d of this.list) d.inside[i] = this.contains(d, p) ? 1 : 0; });
    for (const d of this.list) {
      this.gfx.fillStyle(MAT, 1).fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
      this.gfx.lineStyle(1, MAT_EDGE, 1).strokeRect(d.x0 + 0.5, d.y0 + 0.5, d.x1 - d.x0 - 1, d.y1 - d.y0 - 1);
      if (window.SCHULWEG_DEBUG) {
        this.debugText.push(scene.add.text(d.x0 + 2, d.y0 + 1, `${d.o.id} > ${d.o.to}`, { fontFamily: 'monospace', fontSize: '6px', color: '#ffb84d', resolution: ctx.res.scale }).setDepth(9500));
      }
    }
  }

  unloadMap() {
    this.gfx?.destroy();
    this.gfx = null;
    for (const t of this.debugText) t.destroy();
    this.debugText.length = 0;
    this.list = [];
  }

  contains(d, p) {
    return p.x >= d.x0 && p.x < d.x1 && p.y >= d.y0 && p.y < d.y1;
  }

  update() {
    const { players, input, events } = this.ctx;
    for (const d of this.list) {
      for (let i = 0; i < players.length; i++) {
        const now = this.contains(d, players[i]);
        const entered = now && !d.inside[i];
        d.inside[i] = now ? 1 : 0;
        if (now && !players[i].pinned && ((entered && d.o.auto) || input.intents[i].interact)) {
          events.emit('world:enter-request', { map: d.o.to, entry: d.o.entry, door: d.o.id, player: i });
          return;
        }
      }
    }
  }
}
