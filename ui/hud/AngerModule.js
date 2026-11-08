import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';

const COLORS = [0xe8731c, 0xe8731c, 0xe0302a, 0xe0302a, 0xa0102a]; // one per level; the top levels get darker

// Ärger meter (two bars, grey -> orange -> red), the "spotted" flag and the hide indicator with its
// cooldown bar (fills until the level drops), all from chase state (read-only).
export class AngerModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const width = ctx.res.w;
    this.width = width;
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
    this.label = this.track(uiText(scene, width - 4, 2, ctx.t('hud.anger'), style).setOrigin(1, 0));
    this.bars = this.track(scene.add.graphics());
    this.spotted = this.track(uiText(scene, width - 4, 22, ctx.t('hud.spotted'), { ...style, color: '#ff5a4d', stroke: '#000000', strokeThickness: 2 }).setOrigin(1, 0).setVisible(false));
    this.hidden = this.track(uiText(scene, width - 4, 22, ctx.t('hud.hidden'), { ...style, color: '#7dff8a', stroke: '#000000', strokeThickness: 2 }).setOrigin(1, 0).setVisible(false));
    this.hideBar = this.track(scene.add.graphics());
    this.hideShown = false;
    this.hideFill = -1;
    this.on('chase:level', (e) => this.drawLevel(e.level));
    this.on('chase:seen', (seen) => this.spotted.setVisible(seen));
    this.drawLevel(ctx.chase.level);
  }

  drawLevel(level) {
    const g = this.bars.clear();
    const { width } = this;
    const max = this.ctx.chase.lvl.max;
    const step = Math.floor(48 / max); // the bars share the same 48 px however many levels there are
    for (let i = 0; i < max; i++) {
      g.fillStyle(0x000000, 0.6).fillRect(width - 52 + i * step, 12, step - 2, 7);
      g.fillStyle(i < level ? COLORS[Math.min(level, COLORS.length) - 1] : 0x444444).fillRect(width - 51 + i * step, 13, step - 4, 5);
    }
  }

  update() {
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
    g.fillStyle(0x000000, 0.6).fillRect(this.width - 52, 33, 48, 6);
    g.fillStyle(0x7dff8a).fillRect(this.width - 51, 34, fill, 4);
  }

  retext() {
    this.label.setText(this.ctx.t('hud.anger'));
    this.spotted.setText(this.ctx.t('hud.spotted'));
    this.hidden.setText(this.ctx.t('hud.hidden'));
  }
}
