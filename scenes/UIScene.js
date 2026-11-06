import { TouchControls } from '../ui/touch.js';

// Overlay HUD, touch controls and rotate hint. Reads only; never mutates the world (AD-13).
export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create(data) {
    this.ctx = data.ctx;
    this.fps = this.add.text(4, 2, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffff66' });
    this.nextFps = 0;
    this.makeStatus();
    this.touch = new TouchControls(this, this.ctx, this.cache.json.get('input'));
    this.hint = this.makeRotateHint();
    this.events.once('shutdown', () => this.hint.remove());
  }

  // Stamina bar and ground label, driven by player events (read-only).
  makeStatus() {
    const { ctx } = this;
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
    this.add.text(4, 14, ctx.t('hud.stamina'), style);
    this.bar = this.add.graphics();
    this.label = this.add.text(4, 30, '', style);
    const onStamina = (v) => {
      const g = this.bar.clear();
      g.fillStyle(0x000000, 0.6).fillRect(46, 15, 42, 6);
      g.fillStyle(v > 0.25 ? 0x62d26f : 0xe0483c).fillRect(47, 16, Math.round(40 * v), 4);
    };
    this.vehicle = this.add.text(4, 40, '', style);
    const onVehicle = (id) => this.vehicle.setText(ctx.t('hud.vehicle', { name: ctx.t(`vehicle.${id}`) }));
    const onSurface = (id) => this.label.setText(ctx.t('hud.surface', { name: ctx.t(`surface.${id}`) }));
    ctx.events.on('player:stamina', onStamina);
    ctx.events.on('player:surface', onSurface);
    ctx.events.on('player:vehicle', onVehicle);
    this.events.once('shutdown', () => {
      ctx.events.off('player:stamina', onStamina);
      ctx.events.off('player:surface', onSurface);
      ctx.events.off('player:vehicle', onVehicle);
    });
    onStamina(ctx.player.stamina);
    onSurface(ctx.player.surface);
    onVehicle(ctx.player.vehicle);
  }

  // HTML overlay: in portrait the 480x270 canvas is tiny, so the hint is drawn in page pixels.
  makeRotateHint() {
    const el = document.createElement('div');
    el.id = 'rotate-hint';
    el.hidden = true;
    const icon = document.createElement('div');
    icon.className = 'rotate-icon';
    const text = document.createElement('p');
    text.textContent = this.ctx.t('ui.rotate');
    el.append(icon, text);
    document.body.append(el);
    return el;
  }

  update(time) {
    this.touch.update();
    const blocked = this.ctx.input.blocked;
    if (this.hint.hidden === blocked) this.hint.hidden = !blocked;
    if (time < this.nextFps) return;
    this.nextFps = time + 250;
    this.fps.setText(this.ctx.t('hud.fps', { n: Math.round(this.game.loop.actualFps) }));
  }
}
