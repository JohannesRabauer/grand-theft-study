import { TouchControls } from '../ui/touch.js';
import { ObjectiveArrow } from '../ui/ObjectiveArrow.js';
import { ButtonMenu } from '../ui/ButtonMenu.js';
import { settingsRows } from '../ui/settingsRows.js';

// Overlay HUD, touch controls and rotate hint. Reads only; never mutates the world (AD-13).
export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create(data) {
    this.ctx = data.ctx;
    this.fps = this.add.text(4, 2, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffff66' });
    this.nextFps = 0;
    this.makeStatus();
    this.arrow = new ObjectiveArrow(this, this.ctx, this.scene.get('Game'));
    this.touch = new TouchControls(this, this.ctx, this.cache.json.get('input'));
    this.hint = this.makeRotateHint();
    this.makePause();
    if (window.SCHULWEG_DEBUG) this.windArrow = this.add.graphics();
    if (window.SCHULWEG_DEBUG) this.debug = this.add.text(4, 52, '', { fontFamily: 'monospace', fontSize: '8px', color: '#9fe0ff' });
    this.nextDebug = 0;
    const ev = this.ctx.events;
    // every visible text re-resolves when the language changes
    const onLang = () => this.retext();
    const onToggle = () => this.togglePause();
    ev.on('lang:changed', onLang);
    ev.on('ui:pause-toggle', onToggle);
    this.events.once('shutdown', () => {
      ev.off('lang:changed', onLang);
      ev.off('ui:pause-toggle', onToggle);
      this.hint.remove();
    });
  }

  retext() {
    const { ctx } = this;
    this.stamina.setText(ctx.t('hud.stamina'));
    this.showSurface(ctx.player.surface);
    this.showVehicle(ctx.player.vehicle);
    this.arrow.retext();
    this.hintText.textContent = ctx.t('ui.rotate');
    this.pauseTitle.setText(ctx.t('pause.title'));
    this.pauseMenu.refresh();
  }

  togglePause() {
    const on = !this.pauseMenu.active;
    this.pauseUi.forEach(o => o.setVisible(on));
    this.pauseMenu.setActive(on);
    this.ctx.events.emit(on ? 'game:pause' : 'game:resume');
  }

  makePause() {
    const { ctx } = this;
    const { width, height } = this.scale;
    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0).setDepth(20).setInteractive(); // swallows clicks
    this.pauseTitle = this.add.text(width / 2, 60, ctx.t('pause.title'), { fontFamily: 'monospace', fontSize: '20px', color: '#ffe14d', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(21);
    const rows = [
      { items: [{ label: () => ctx.t('pause.resume'), on: () => this.togglePause() }] },
      ...settingsRows(ctx),
      { items: [{ label: () => ctx.t('pause.menu'), on: () => ctx.events.emit('game:quit') }] }
    ];
    this.pauseMenu = new ButtonMenu(this, ctx.t, rows, width / 2, 100, 28);
    this.pauseMenu.objects.forEach(o => o.setDepth(21));
    this.pauseUi = [dim, this.pauseTitle];
    this.pauseUi.forEach(o => o.setVisible(false));
    this.pauseMenu.setActive(false);
  }

  // Stamina bar and ground label, driven by player events (read-only).
  makeStatus() {
    const { ctx } = this;
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
    this.stamina = this.add.text(4, 14, ctx.t('hud.stamina'), style);
    this.bar = this.add.graphics();
    this.label = this.add.text(4, 30, '', style);
    const onStamina = (v) => {
      const g = this.bar.clear();
      g.fillStyle(0x000000, 0.6).fillRect(46, 15, 42, 6);
      g.fillStyle(v > 0.25 ? 0x62d26f : 0xe0483c).fillRect(47, 16, Math.round(40 * v), 4);
    };
    this.vehicle = this.add.text(4, 40, '', style);
    this.showVehicle = (id) => this.vehicle.setText(ctx.t('hud.vehicle', { name: ctx.t(`vehicle.${id}`) }));
    this.showSurface = (id) => this.label.setText(ctx.t('hud.surface', { name: ctx.t(`surface.${id}`) }));
    const onVehicle = this.showVehicle;
    const onSurface = this.showSurface;
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
    this.hintText = document.createElement('p');
    this.hintText.textContent = this.ctx.t('ui.rotate');
    el.append(icon, this.hintText);
    document.body.append(el);
    return el;
  }

  update(time) {
    this.touch.update();
    this.arrow.update();
    if (this.windArrow) this.drawWind();
    const blocked = this.ctx.input.blocked;
    if (this.hint.hidden === blocked) this.hint.hidden = !blocked;
    if (time < this.nextFps) return;
    this.nextFps = time + 250;
    this.fps.setText(this.ctx.t('hud.fps', { n: Math.round(this.game.loop.actualFps) }));
    if (this.debug) this.showDebug();
  }

  // ?debug: active tier plus live/cap of every registered pool.
  showDebug() {
    const { quality, pools, wind, weather } = this.ctx;
    let s = `quality: ${quality.id}
weather: ${weather.state}  wind: ${wind.vector.x.toFixed(2)}, ${wind.vector.y.toFixed(2)}`;
    for (const [name, p] of pools.byName) s += `
${name}: ${p.live()}/${p.cap}`;
    this.debug.setText(s);
  }

  // ?debug: small wind arrow (length = strength) in the lower-left corner.
  drawWind() {
    const v = this.ctx.wind.vector;
    const g = this.windArrow.clear().lineStyle(2, 0x9fe0ff, 1);
    const cx = 30;
    const cy = this.scale.height - 30;
    const ex = cx + v.x * 24;
    const ey = cy + v.y * 24;
    g.strokeCircle(cx, cy, 2).lineBetween(cx, cy, ex, ey);
    const a = Math.atan2(v.y, v.x);
    g.lineBetween(ex, ey, ex - Math.cos(a - 0.5) * 5, ey - Math.sin(a - 0.5) * 5);
    g.lineBetween(ex, ey, ex - Math.cos(a + 0.5) * 5, ey - Math.sin(a + 0.5) * 5);
  }
}
