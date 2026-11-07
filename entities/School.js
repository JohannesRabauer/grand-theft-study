import { SchoolDay } from '../services/SchoolDay.js';
import { TimetableScreen } from '../ui/screens/TimetableScreen.js';

export class School {
  constructor(scene, ctx, cfg, minigames) {
    this.scene = scene;
    this.ctx = ctx;
    this.day = ctx.school = new SchoolDay(ctx, cfg, minigames);
    this.parts = [];
    this.labels = [];
    this.spot = null;
    this.loadMap();
    ctx.world.register(this);
    ctx.events.on('lang:changed', () => this.retext());
    ctx.events.on('world:enter', e => {
      if (e.map === cfg.map) ctx.events.emit('ui:toast', { key: 'school.hint' });
    });
    ctx.events.on('goal:reached', e => {
      if (e.id === 'school') ctx.events.emit('ui:toast', { key: 'school.entrance' });
    });
    scene.events.once('shutdown', () => { this.day.closed = true; });
  }

  label(x, y, key, size = 9) {
    const text = this.scene.add.text(x, y, this.ctx.t(key), {
      fontFamily: 'monospace', fontSize: `${size}px`, color: '#ffeec4',
      backgroundColor: '#244039', padding: { x: 3, y: 2 }, resolution: this.ctx.res.scale
    }).setOrigin(0.5).setDepth(8000);
    this.parts.push(text);
    this.labels.push({ text, key });
  }

  loadMap() {
    const { ctx } = this;
    const ts = ctx.map.tileSize;
    const door = ctx.map.objects.find(o => o.id === 'door-school');
    if (door) this.label((door.x + door.w / 2) * ts, (door.y - 1) * ts, 'school.entrance', 8);
    const spot = ctx.map.objects.find(o => o.type === 'school-spot');
    if (!spot) return;
    this.spot = { x: (spot.x + 0.5) * ts, y: (spot.y + 0.5) * ts };
    const gfx = this.scene.add.graphics().setDepth(-0.3);
    this.parts.push(gfx);
    gfx.fillStyle(0x234c3f).fillRect(11 * ts, ts, 10 * ts, ts);
    gfx.lineStyle(2, 0xc59a61).strokeRect(11 * ts, ts, 10 * ts, ts);
    for (const y of [6, 9]) for (const x of [5, 10, 20, 25]) {
      gfx.fillStyle(0xb5834e).fillRect(x * ts, y * ts, 2 * ts, ts);
      gfx.fillStyle(0x446c86).fillRect((x + 0.5) * ts, (y + 1) * ts, ts, ts / 2);
      gfx.fillStyle(0xf3e9c9).fillRect((x + 0.3) * ts, (y + 0.2) * ts, ts / 2, ts / 2);
    }
    gfx.fillStyle(0xd8ae64).fillCircle(this.spot.x, this.spot.y, 10);
    this.label(16 * ts, 3 * ts, 'school.classroom');
    this.label(16 * ts, 14 * ts, 'school.hint', 8);
  }

  retext() { for (const { text, key } of this.labels) text.setText(this.ctx.t(key)); }

  unloadMap() {
    for (const o of this.parts) o.destroy();
    this.parts.length = this.labels.length = 0;
    this.spot = null;
  }

  update() {
    const { ctx, spot } = this;
    if (!spot || ctx.screens?.top() || this.day.running || ctx.minigames.active) return;
    for (const p of ctx.players) {
      if (!p.pinned && ctx.input.intents[p.index].interact && Math.hypot(p.x - spot.x, p.y - spot.y) <= this.day.cfg.interactReach) {
        ctx.screens.push(new TimetableScreen(this.scene.scene.get('UI'), ctx, this.day));
        return;
      }
    }
  }
}
