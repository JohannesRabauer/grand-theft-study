import { addSensor } from '../physics/bodies.js';

// Map trigger zones in tile coordinates: hiding spots, bully turf and the school goal.
// Hiding and turf zones get SENSOR bodies (read later by bullies and the chase director);
// each player's overlap is a cheap per-frame point-in-rect test that emits
// `hide:enter|leave` and `turf:enter|leave` ({ id, kind, player }) and, once per player, `goal:reached` ({ id, player }).
const COLORS = { hiding: 0x4cd964, turf: 0xff4d4d, goal: 0xffe14d };

export class Zones {
  constructor(scene, ctx) {
    this.ctx = ctx;
    const ts = ctx.map.tileSize;
    this.zones = ctx.map.objects
      .filter(o => o.type === 'hiding' || o.type === 'turf' || o.type === 'goal')
      .map(o => {
        const z = { o, x0: o.x * ts, y0: o.y * ts, x1: (o.x + o.w) * ts, y1: (o.y + o.h) * ts, inside: new Uint8Array(ctx.maxPlayers) };
        if (o.type !== 'goal') z.body = addSensor(scene, (z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, z.x1 - z.x0, z.y1 - z.y0);
        return z;
      });
    this.reached = new Uint8Array(ctx.maxPlayers); // per player: has reached the goal
    this.hiding = new Uint8Array(ctx.maxPlayers); // per player: number of hiding-spot zones inside (read by bully perception)
    if (window.SCHULWEG_DEBUG) this.drawDebug(scene);
  }

  update() {
    const { players, events } = this.ctx;
    for (let i = 0; i < players.length; i++) {
      const px = players[i].x;
      const py = players[i].y;
      for (const z of this.zones) {
        const now = px >= z.x0 && px < z.x1 && py >= z.y0 && py < z.y1;
        if (now === !!z.inside[i]) continue;
        z.inside[i] = now ? 1 : 0;
        const { type, id, kind } = z.o;
        if (type === 'goal') {
          if (now && !this.reached[i]) {
            this.reached[i] = 1;
            events.emit('goal:reached', { id, player: i });
          }
          continue;
        }
        if (type === 'hiding') this.hiding[i] += now ? 1 : -1;
        const ev = type === 'hiding' ? 'hide' : 'turf';
        events.emit(`${ev}:${now ? 'enter' : 'leave'}`, { id, kind: kind ?? id, player: i });
      }
    }
  }

  drawDebug(scene) {
    const g = scene.add.graphics().setDepth(9500);
    for (const z of this.zones) {
      const color = COLORS[z.o.type];
      g.lineStyle(1, color, 1).strokeRect(z.x0 + 0.5, z.y0 + 0.5, z.x1 - z.x0 - 1, z.y1 - z.y0 - 1);
      scene.add.text(z.x0 + 2, z.y0 + 1, z.o.kind ?? z.o.id, { fontFamily: 'monospace', fontSize: '6px', color: '#' + color.toString(16).padStart(6, '0'), resolution: this.ctx.res.scale })
        .setDepth(9500);
    }
  }
}
