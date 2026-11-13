import { HudModule } from './HudModule.js';
import { uiLabel, uiIcon, drawBar, HudPlate } from '../uiKit.js';

const BAR_COLORS = ['orange', 'orange', 'red', 'red', 'red']; // one per level; the top levels read as danger
const PLATE_W = 66;
const HIDE_W = 34;

// Ärger meter on a plate in the top right corner (a flame and one segment per level, grey -> orange -> red), the "spotted" and "hidden"
// chips under it and the hide cooldown bar, all from chase state (read-only).
export class AngerModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const width = ctx.res.w;
    this.width = width;
    this.x0 = width - 2 - PLATE_W;
    this.plate = new HudPlate(scene);
    this.plate.fit(this.x0, 2, PLATE_W, 25);
    this.track(this.plate.g);
    this.icon = this.track(uiIcon(scene, this.x0 + 3, 5, 'flame'));
    this.label = this.track(uiLabel(scene, this.x0 + 15, 5, ctx.t('hud.anger'), 'hud'));
    this.bars = this.track(scene.add.graphics());
    this.chip = new HudPlate(scene);
    this.track(this.chip.g);
    this.hideX = 0;
    this.spotted = this.track(uiLabel(scene, this.x0 + 3, 31, ctx.t('hud.spotted'), 'hud', 'ink', { color: 'red' }).setVisible(false));
    this.hidden = this.track(uiLabel(scene, this.x0 + 3, 31, ctx.t('hud.hidden'), 'hud', 'ink', { color: 'green' }).setVisible(false));
    this.hideBar = this.track(scene.add.graphics());
    this.hideShown = false;
    this.hideFill = -1;
    this.on('chase:level', (e) => this.drawLevel(e.level));
    this.on('chase:seen', (seen) => { this.spotted.setVisible(seen); this.fitChip(); });
    this.drawLevel(ctx.chase.level);
    this.fitChip();
  }

  drawLevel(level) {
    const g = this.bars.clear();
    const max = this.ctx.chase.lvl.max;
    const step = Math.floor(56 / max); // the segments share the same width however many levels there are
    for (let i = 0; i < max; i++) {
      const on = i < level;
      drawBar(this.scene, g, this.x0 + 5 + i * step, 16, step - 1, 7, on ? 1 : 0, on ? BAR_COLORS[Math.min(level, BAR_COLORS.length) - 1] : 'grey');
    }
  }

  // The chip under the meter holds whichever message shows (spotted wins); the hidden one also has room for the cooldown bar.
  fitChip() {
    const text = this.spotted.visible ? this.spotted : this.hideShown ? this.hidden : null;
    this.chip.setVisible(!!text);
    if (!text) return;
    const w = Math.ceil(text.width) + 8 + (text === this.hidden ? HIDE_W + 4 : 0);
    const x = this.width - 2 - w;
    this.chip.fit(x, 28, w, 12);
    text.setPosition(x + 3, 31);
    if (text === this.hidden) this.hideX = x + 3 + Math.ceil(this.hidden.width) + 4;
    else this.hideBar.clear(); // the spotted chip has no room for the cooldown bar
    this.hidden.setVisible(text === this.hidden);
    this.hideFill = -1;
  }

  update() {
    const { chase } = this.ctx;
    const show = chase.hidden;
    if (show !== this.hideShown) {
      this.hideShown = show;
      this.hidden.setVisible(show);
      if (!show) this.hideBar.clear();
      this.fitChip();
    }
    if (!show) return;
    // -2 = nothing drawn (level 0), otherwise the bar's pixel width; redrawn only when it changes
    const fill = chase.level === 0 ? -2 : Math.round((HIDE_W - 2) * chase.hideProgress);
    if (fill === this.hideFill) return;
    this.hideFill = fill;
    const g = this.hideBar.clear();
    if (fill < 0) return;
    drawBar(this.scene, g, this.hideX, 31, HIDE_W, 6, fill / (HIDE_W - 2), 'green');
  }

  retext() {
    this.label.setText(this.ctx.t('hud.anger'));
    this.spotted.setText(this.ctx.t('hud.spotted'));
    this.hidden.setText(this.ctx.t('hud.hidden'));
    this.fitChip();
  }
}
