import { TouchControls } from '../ui/touch.js';
import { ObjectiveArrow } from '../ui/ObjectiveArrow.js';
import { ButtonMenu } from '../ui/ButtonMenu.js';
import { settingsRows } from '../ui/settingsRows.js';
import { CaughtFrame } from '../ui/CaughtFrame.js';
import { uiText, setupUiCamera, bindRestartNote } from '../ui/uiKit.js';

// Overlay HUD, touch controls and rotate hint. Reads only; never mutates the world (AD-13).
export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create(data) {
    this.ctx = data.ctx;
    setupUiCamera(this, this.ctx.res);
    this.fps = uiText(this, 4, 2, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffff66' });
    this.nextFps = 0;
    this.lastFps = -1;
    this.makeStatus();
    this.makeAnger();
    this.makeMoney();
    this.makeTool();
    this.caughtFrame = new CaughtFrame(this, this.ctx);
    this.arrow = new ObjectiveArrow(this, this.ctx, this.scene.get('Game'));
    this.touch = new TouchControls(this, this.ctx, this.cache.json.get('input'));
    this.hint = this.makeRotateHint();
    this.makePause();
    bindRestartNote(this, this.ctx.events, this.ctx.t, this.ctx.res);
    if (window.SCHULWEG_DEBUG) this.windArrow = this.add.graphics();
    if (window.SCHULWEG_DEBUG) this.debug = uiText(this, 4, 62, '', { fontFamily: 'monospace', fontSize: '8px', color: '#9fe0ff' });
    this.nextDebug = 0;
    this.windKey = -1;
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
    this.lastFps = -1; // re-resolved on the next FPS tick
    this.windKey = -1; // and the wind label while aiming
    this.stamina.setText(ctx.t('hud.stamina'));
    this.angerLabel.setText(ctx.t('hud.anger'));
    this.spotted.setText(ctx.t('hud.spotted'));
    this.hidden.setText(ctx.t('hud.hidden'));
    this.showMoney();
    this.showTool();
    this.showSurface(ctx.player.surface);
    this.showVehicle(ctx.player.vehicle);
    this.arrow.retext();
    this.hintText.textContent = ctx.t('ui.rotate');
    this.pauseTitle.setText(ctx.t('pause.title'));
    this.showSlot();
    this.pauseMenu.refresh();
  }

  togglePause() {
    const on = !this.pauseMenu.active;
    if (on) this.showSlot();
    this.pauseUi.forEach(o => o.setVisible(on));
    this.pauseMenu.setActive(on);
    this.ctx.events.emit(on ? 'game:pause' : 'game:resume');
  }

  showSlot() {
    const slot = this.ctx.saves.activeSlot;
    this.pauseSlot.setText(slot ? this.ctx.t('pause.slot', { n: slot }) : '');
  }

  makePause() {
    const { ctx } = this;
    const { w: width, h: height } = this.ctx.res;
    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0).setDepth(20).setInteractive(); // swallows clicks
    this.pauseTitle = uiText(this, width / 2, 60, ctx.t('pause.title'), { fontFamily: 'monospace', fontSize: '20px', color: '#ffe14d', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(21);
    this.pauseSlot = uiText(this, width / 2, 80, '', { fontFamily: 'monospace', fontSize: '10px', color: '#cccccc' }).setOrigin(0.5).setDepth(21);
    const rows = [
      { items: [{ label: () => ctx.t('pause.resume'), on: () => this.togglePause() }] },
      ...settingsRows(ctx),
      { items: [{ label: () => ctx.t('pause.menu'), on: () => ctx.events.emit('game:quit') }] }
    ];
    this.pauseMenu = new ButtonMenu(this, ctx.t, rows, width / 2, 100, 28);
    this.pauseMenu.objects.forEach(o => o.setDepth(21));
    this.pauseUi = [dim, this.pauseTitle, this.pauseSlot];
    this.pauseUi.forEach(o => o.setVisible(false));
    this.pauseMenu.setActive(false);
  }

  // Stamina bar and ground label, driven by player events (read-only).
  makeStatus() {
    const { ctx } = this;
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
    this.stamina = uiText(this, 4, 14, ctx.t('hud.stamina'), style);
    this.bar = this.add.graphics();
    this.label = uiText(this, 4, 30, '', style);
    const onStamina = (v) => {
      const g = this.bar.clear();
      g.fillStyle(0x000000, 0.6).fillRect(46, 15, 42, 6);
      g.fillStyle(v > 0.25 ? 0x62d26f : 0xe0483c).fillRect(47, 16, Math.round(40 * v), 4);
    };
    this.vehicle = uiText(this, 4, 40, '', style);
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

  // Ärger meter (two bars, grey -> orange -> red) and a "spotted" flag, from chase events (read-only).
  makeAnger() {
    const { ctx } = this;
    const { w: width } = this.ctx.res;
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
    this.angerLabel = uiText(this, width - 4, 2, ctx.t('hud.anger'), style).setOrigin(1, 0);
    this.angerBars = this.add.graphics();
    this.spotted = uiText(this, width - 4, 22, ctx.t('hud.spotted'), { ...style, color: '#ff5a4d', stroke: '#000000', strokeThickness: 2 }).setOrigin(1, 0).setVisible(false);
    // hide indicator + cooldown bar (until the Ärger level drops), same spot as "spotted"
    this.hidden = uiText(this, width - 4, 22, ctx.t('hud.hidden'), { ...style, color: '#7dff8a', stroke: '#000000', strokeThickness: 2 }).setOrigin(1, 0).setVisible(false);
    this.hideBar = this.add.graphics();
    this.hideShown = false;
    this.hideFill = -1;
    const colors = [0xe8731c, 0xe0302a];
    const drawLevel = ({ level }) => {
      const g = this.angerBars.clear();
      for (let i = 0; i < 2; i++) {
        g.fillStyle(0x000000, 0.6).fillRect(width - 52 + i * 24, 12, 22, 7);
        g.fillStyle(i < level ? colors[Math.min(level, 2) - 1] : 0x444444).fillRect(width - 51 + i * 24, 13, 20, 5);
      }
    };
    const onSeen = (seen) => this.spotted.setVisible(seen);
    ctx.events.on('chase:level', drawLevel);
    ctx.events.on('chase:seen', onSeen);
    this.events.once('shutdown', () => {
      ctx.events.off('chase:level', drawLevel);
      ctx.events.off('chase:seen', onSeen);
    });
    drawLevel({ level: ctx.chase.level });
  }

  // "€ 5,00" in the HUD; changes come from `state:changed` (read-only).
  makeMoney() {
    const { ctx } = this;
    this.money = uiText(this, 4, 50, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffe14d' });
    this.showMoney = (e) => { if (!e || e.path === '' || e.path === 'shared.money') this.money.setText(ctx.t('hud.money', { v: this.formatMoney(ctx.state.shared.money) })); };
    ctx.events.on('state:changed', this.showMoney);
    this.events.once('shutdown', () => ctx.events.off('state:changed', this.showMoney));
    this.showMoney();
  }

  // Current tool and ammo (bottom centre); a wind arrow with strength appears above it while charging.
  makeTool() {
    const { ctx } = this;
    const { w: width, h: height } = this.ctx.res;
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 };
    this.tool = uiText(this, width / 2, height - 3, '', style).setOrigin(0.5, 1);
    this.windText = uiText(this, width / 2 + 14, height - 17, '', { ...style, color: '#9fe0ff' }).setOrigin(0, 1).setVisible(false);
    this.windGfx = this.add.graphics().setVisible(false);
    this.showTool = () => {
      const t = ctx.toolbelt.current;
      this.tool.setText(ctx.t('hud.tool', { name: ctx.t(`tool.${t.id}`), n: t.ammo, max: t.max }));
      this.tool.setColor(t.ammo === 0 ? '#ff8a7a' : '#ffffff');
    };
    ctx.events.on('tool:ammo', this.showTool);
    ctx.events.on('tool:changed', this.showTool);
    this.events.once('shutdown', () => {
      ctx.events.off('tool:ammo', this.showTool);
      ctx.events.off('tool:changed', this.showTool);
    });
    this.showTool();
  }

  drawToolWind() {
    const { ctx } = this;
    const aiming = ctx.toolbelt.current.charging;
    if (aiming !== this.windGfx.visible) {
      this.windGfx.setVisible(aiming);
      this.windText.setVisible(aiming);
      this.windKey = -1;
    }
    if (!aiming) return;
    const v = ctx.wind.vector;
    // the wind drifts slowly: redraw only when angle (about 3 deg steps) or strength (2 % steps) changed
    const key = Math.round(Math.atan2(v.y, v.x) * 20) * 1000 + Math.round(ctx.wind.strength * 50);
    if (key === this.windKey) return;
    this.windKey = key;
    const { w: width, h: height } = this.ctx.res;
    const cx = width / 2 - 14;
    const cy = height - 22;
    const a = Math.atan2(v.y, v.x);
    const len = 3 + ctx.wind.strength * 14;
    const ex = cx + Math.cos(a) * len;
    const ey = cy + Math.sin(a) * len;
    const g = this.windGfx.clear().lineStyle(2, 0x9fe0ff, 1);
    g.lineBetween(cx, cy, ex, ey);
    g.lineBetween(ex, ey, ex - Math.cos(a - 0.5) * 4, ey - Math.sin(a - 0.5) * 4);
    g.lineBetween(ex, ey, ex - Math.cos(a + 0.5) * 4, ey - Math.sin(a + 0.5) * 4);
    this.windText.setText(ctx.t('hud.wind', { n: Math.round(ctx.wind.strength * 50) * 2 }));
  }

  formatMoney(cents) {
    const s = (cents / 100).toFixed(2);
    return this.ctx.i18n.lang === 'de' ? s.replace('.', ',') : s;
  }

  // Hidden label, plus the cooldown bar while a chase is on (fills until the level drops to 0).
  drawHide() {
    const { chase } = this.ctx;
    const show = chase.hidden;
    if (show !== this.hideShown) {
      this.hideShown = show;
      this.hidden.setVisible(show);
      this.hideFill = -1; // force a redraw (or clear) below
      if (!show) this.hideBar.clear();
    }
    if (!show) return;
    // -2 = nothing drawn (level 0), otherwise the bar's pixel width; redrawn only when it changes
    const fill = chase.level === 0 ? -2 : Math.round(46 * chase.hideProgress);
    if (fill === this.hideFill) return;
    this.hideFill = fill;
    const g = this.hideBar.clear();
    if (fill < 0) return;
    const { w: width } = this.ctx.res;
    g.fillStyle(0x000000, 0.6).fillRect(width - 52, 33, 48, 6);
    g.fillStyle(0x7dff8a).fillRect(width - 51, 34, fill, 4);
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
    this.drawHide();
    this.drawToolWind();
    if (this.windArrow) this.drawWind();
    const blocked = this.ctx.input.blocked;
    if (this.hint.hidden === blocked) this.hint.hidden = !blocked;
    if (time < this.nextFps) return;
    this.nextFps = time + 250;
    const fps = Math.round(this.game.loop.actualFps);
    if (fps !== this.lastFps) {
      this.lastFps = fps;
      this.fps.setText(this.ctx.t('hud.fps', { n: fps }));
    }
    if (this.debug) this.showDebug();
  }

  // ?debug: active tier plus live/cap of every registered pool.
  showDebug() {
    const { quality, pools, wind, weather, chase } = this.ctx;
    const { res } = this.ctx;
    let s = `quality: ${quality.id}
render: ${res.renderW}x${res.renderH}  textures: x${res.scale}  zoom: ${this.scene.get('Game').cameras.main.zoom.toFixed(2)}
chase: level ${chase.level}  seen: ${chase.seen}
weather: ${weather.state}  wind: ${wind.vector.x.toFixed(2)}, ${wind.vector.y.toFixed(2)}`;
    if (this.ctx.crowd) s += `
${this.ctx.crowd.debugText()}`;
    for (const [name, p] of pools.byName) s += `
${name}: ${p.live()}/${p.cap}`;
    this.debug.setText(s);
  }

  // ?debug: small wind arrow (length = strength) in the lower-left corner.
  drawWind() {
    const v = this.ctx.wind.vector;
    const g = this.windArrow.clear().lineStyle(2, 0x9fe0ff, 1);
    const cx = 30;
    const cy = this.ctx.res.h - 30;
    const ex = cx + v.x * 24;
    const ey = cy + v.y * 24;
    g.strokeCircle(cx, cy, 2).lineBetween(cx, cy, ex, ey);
    const a = Math.atan2(v.y, v.x);
    g.lineBetween(ex, ey, ex - Math.cos(a - 0.5) * 5, ey - Math.sin(a - 0.5) * 5);
    g.lineBetween(ex, ey, ex - Math.cos(a + 0.5) * 5, ey - Math.sin(a + 0.5) * 5);
  }
}
