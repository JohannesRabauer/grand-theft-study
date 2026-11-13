import { HudModule } from './HudModule.js';
import { uiLabel, uiIcon, drawBar, HudPlate } from '../uiKit.js';
import { sliceOf } from './layout.js';

const BAR_W = 36;

// Stamina bar, ground label and vehicle line on one HUD plate (story 16.14), driven by player events (read-only). With two players this is
// player i's slice: P1 at the left edge, P2 mirrored at the right, each with a coloured "P1" / "P2" tag. The plate is as wide as its widest
// line and anchored at its edge of the screen.
export class StatusModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const width = ctx.res.w;
    const { right, dy } = sliceOf(this.playerIndex ?? 0, this.players, width);
    this.right = right;
    this.width = width;
    this.y0 = dy + 2;
    this.plate = new HudPlate(scene);
    this.track(this.plate.g);
    this.icon = this.track(uiIcon(scene, 0, 0, 'bolt'));
    if (this.players > 1) {
      const color = scene.cache.json.get('camera').coop.ringColors[this.playerIndex];
      this.tag = this.track(uiLabel(scene, 0, 0, `P${this.playerIndex + 1}`, 'hud', 'ink', { color }));
    }
    this.stamina = this.track(uiLabel(scene, 0, 0, ctx.t('hud.stamina'), 'hud', 'ink', { color: 'muted' }));
    this.bar = this.track(scene.add.graphics());
    this.label = this.track(uiLabel(scene, 0, 0, '', 'hud'));
    this.vehicle = this.track(uiLabel(scene, 0, 0, '', 'hud'));
    this.value = -1;
    this.stam = this.player.stamina;
    this.barX = 0;
    this.barY = 0;
    this.on('player:stamina', (ev) => { if (this.mine(ev)) this.showStamina(ev.value); });
    this.on('player:surface', (ev) => { if (this.mine(ev)) this.showSurface(ev.id); });
    this.on('player:vehicle', (ev) => { if (this.mine(ev)) this.showVehicle(ev.id); });
    const p = this.player;
    this.showSurface(p.surface);
    this.showVehicle(p.vehicle);
  }

  // Places the plate and everything on it from the current text widths.
  layout() {
    const tagW = this.tag ? this.tag.width + 3 : 0;
    const row1 = 3 + tagW + 9 + 3 + this.stamina.width + 4 + BAR_W + 3;
    const w = Math.ceil(Math.max(row1, this.label.width + 6, this.vehicle.width + 6));
    const x0 = this.right ? this.width - 2 - w : 2;
    const y0 = this.y0;
    this.plate.fit(x0, y0, w, 37);
    let x = x0 + 3;
    if (this.tag) { this.tag.setPosition(x, y0 + 3); x += tagW; }
    this.icon.setPosition(x, y0 + 3);
    this.stamina.setPosition(x + 12, y0 + 3);
    this.barX = x + 12 + this.stamina.width + 4;
    this.barY = y0 + 4;
    this.label.setPosition(x0 + 3, y0 + 14);
    this.vehicle.setPosition(x0 + 3, y0 + 24);
    this.value = -1;
    this.drawStamina();
  }

  showStamina(v) {
    this.stam = v;
    this.drawStamina();
  }

  drawStamina() {
    const key = Math.round(this.stam * 34) * 2 + (this.stam > 0.25 ? 1 : 0) + this.barX * 1000;
    if (key === this.value) return;
    this.value = key;
    drawBar(this.scene, this.bar.clear(), this.barX, this.barY, BAR_W, 7, this.stam, this.stam > 0.25 ? 'green' : 'red');
  }

  showSurface(id) { this.label.setText(this.ctx.t('hud.surface', { name: this.ctx.t(`surface.${id}`) })); this.layout(); }

  showVehicle(id) { this.vehicle.setText(this.ctx.t('hud.vehicle', { name: this.ctx.t(`vehicle.${id}`) })); this.layout(); }

  retext() {
    this.stamina.setText(this.ctx.t('hud.stamina'));
    this.showSurface(this.player.surface);
    this.showVehicle(this.player.vehicle);
  }
}
