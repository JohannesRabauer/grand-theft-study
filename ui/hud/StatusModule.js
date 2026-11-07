import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';
import { sliceOf } from './layout.js';

// Stamina bar, ground label and vehicle line, driven by player events (read-only). With two players this is
// player i's slice: P1 at the left edge, P2 mirrored at the right, each with a coloured "P1" / "P2" tag.
export class StatusModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const width = ctx.res.w;
    const { right, x, dy } = sliceOf(this.playerIndex ?? 0, this.players, width);
    const o = right ? 1 : 0; // text origin x
    this.barX = right ? width - 88 : 46;
    this.barY = dy + 15;
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
    if (this.players > 1) {
      const color = scene.cache.json.get('camera').coop.ringColors[this.playerIndex];
      this.tag = this.track(uiText(scene, x, dy + 2, `P${this.playerIndex + 1}`, { ...style, color, stroke: '#000000', strokeThickness: 2 }).setOrigin(o, 0));
    }
    this.stamina = this.track(uiText(scene, x, dy + 14, ctx.t('hud.stamina'), style).setOrigin(o, 0));
    this.bar = this.track(scene.add.graphics());
    this.label = this.track(uiText(scene, x, dy + 30, '', style).setOrigin(o, 0));
    this.vehicle = this.track(uiText(scene, x, dy + 40, '', style).setOrigin(o, 0));
    this.on('player:stamina', (ev) => { if (this.mine(ev)) this.showStamina(ev.value); });
    this.on('player:surface', (ev) => { if (this.mine(ev)) this.showSurface(ev.id); });
    this.on('player:vehicle', (ev) => { if (this.mine(ev)) this.showVehicle(ev.id); });
    const p = this.player;
    this.showStamina(p.stamina);
    this.showSurface(p.surface);
    this.showVehicle(p.vehicle);
  }

  showStamina(v) {
    const g = this.bar.clear();
    const { barX: x, barY: y } = this;
    g.fillStyle(0x000000, 0.6).fillRect(x, y, 42, 6);
    g.fillStyle(v > 0.25 ? 0x62d26f : 0xe0483c).fillRect(x + 1, y + 1, Math.round(40 * v), 4);
  }

  showSurface(id) { this.label.setText(this.ctx.t('hud.surface', { name: this.ctx.t(`surface.${id}`) })); }

  showVehicle(id) { this.vehicle.setText(this.ctx.t('hud.vehicle', { name: this.ctx.t(`vehicle.${id}`) })); }

  retext() {
    this.stamina.setText(this.ctx.t('hud.stamina'));
    this.showSurface(this.player.surface);
    this.showVehicle(this.player.vehicle);
  }
}
