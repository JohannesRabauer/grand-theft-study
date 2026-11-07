import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';

// Stamina bar, ground label and vehicle line, driven by player events (read-only).
export class StatusModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
    this.stamina = this.track(uiText(scene, 4, 14, ctx.t('hud.stamina'), style));
    this.bar = this.track(scene.add.graphics());
    this.label = this.track(uiText(scene, 4, 30, '', style));
    this.vehicle = this.track(uiText(scene, 4, 40, '', style));
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
    g.fillStyle(0x000000, 0.6).fillRect(46, 15, 42, 6);
    g.fillStyle(v > 0.25 ? 0x62d26f : 0xe0483c).fillRect(47, 16, Math.round(40 * v), 4);
  }

  showSurface(id) { this.label.setText(this.ctx.t('hud.surface', { name: this.ctx.t(`surface.${id}`) })); }

  showVehicle(id) { this.vehicle.setText(this.ctx.t('hud.vehicle', { name: this.ctx.t(`vehicle.${id}`) })); }

  retext() {
    this.stamina.setText(this.ctx.t('hud.stamina'));
    this.showSurface(this.player.surface);
    this.showVehicle(this.player.vehicle);
  }
}
