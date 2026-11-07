import { Morning } from '../services/Morning.js';
import { PackingScreen } from '../ui/screens/PackingScreen.js';

export class Home {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.morning = new Morning(ctx, cfg);
    this.parts = [];
    this.labels = [];
    this.spots = [];
    this.loadMap();
    ctx.world.register(this);
    ctx.events.on('world:enter', e => {
      if (e.map === cfg.map) {
        if (this.morning.available) this.morning.begin();
        ctx.events.emit('ui:toast', { key: 'home.hint' });
      }
    });
    ctx.events.on('world:leave', e => { if (e.map === cfg.map) this.morning.leave(); });
    ctx.events.on('lang:changed', () => { for (const { label, key } of this.labels) label.setText(ctx.t(key)); });
  }

  label(x, y, key, size = 8) {
    const label = this.scene.add.text(x, y, this.ctx.t(key), {
      fontFamily: 'monospace', fontSize: `${size}px`, color: '#ffeec4',
      backgroundColor: '#40372b', padding: { x: 3, y: 2 }, resolution: this.ctx.res.scale
    }).setOrigin(0.5).setDepth(8000);
    this.parts.push(label);
    this.labels.push({ label, key });
  }

  loadMap() {
    const { ctx, scene } = this;
    const ts = ctx.map.tileSize;
    const door = ctx.map.objects.find(o => o.id === 'door-home');
    if (door) this.label((door.x + door.w / 2) * ts, (door.y - 1) * ts, 'home.entrance');
    this.spots = ctx.map.objects.filter(o => o.type === 'home').map(o => ({ ...o, px: (o.x + o.w / 2) * ts, py: (o.y + o.h / 2) * ts }));
    if (!this.spots.length) return;
    const gfx = scene.add.graphics().setDepth(-0.3);
    this.parts.push(gfx);
    for (const spot of this.spots) {
      const { px, py, role } = spot;
      if (role === 'breakfast') {
        gfx.fillStyle(0xa5794f).fillRect(spot.x * ts, spot.y * ts, spot.w * ts, spot.h * ts);
        gfx.fillStyle(0xf3e2bd).fillCircle(px, py, 9);
        gfx.fillStyle(0xe9a645).fillCircle(px, py, 5);
        gfx.fillStyle(0xd3eff7).fillRect(px + 14, py - 8, 7, 10);
      } else {
        gfx.fillStyle(0x3d749d).fillRoundedRect(px - 9, py - 10, 18, 21, 4);
        gfx.lineStyle(2, 0xeab665).strokeRoundedRect(px - 6, py - 15, 12, 8, 3);
        gfx.fillStyle(0xa2c3d7).fillRect(px - 6, py + 2, 12, 6);
      }
      this.label(px, py - 28, role === 'breakfast' ? 'home.breakfast' : 'home.bag');
    }
    gfx.fillStyle(0x5c739b).fillRect(2 * ts, ts, 3 * ts, 2 * ts);
    gfx.fillStyle(0xf1e7d2).fillRect(2 * ts, ts, ts, ts);
    this.label(12 * ts, 12 * ts, 'home.hint', 7);
  }

  unloadMap() {
    for (const p of this.parts) p.destroy();
    this.parts.length = this.labels.length = this.spots.length = 0;
  }

  update() {
    const { ctx, morning } = this;
    if (ctx.screens?.top()) return;
    for (const spot of this.spots) for (const p of ctx.players) {
      if (p.pinned || !ctx.input.intents[p.index].interact || Math.hypot(p.x - spot.px, p.y - spot.py) > morning.cfg.interactReach) continue;
      if (!morning.available) { ctx.events.emit('ui:toast', { key: 'home.tomorrow' }); return; }
      if (spot.role === 'breakfast') morning.breakfast(p.index);
      else ctx.screens.push(new PackingScreen(this.scene.scene.get('UI'), ctx, morning, p.index));
      return;
    }
  }
}
