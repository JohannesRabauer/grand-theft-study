import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';
import { sliceOf } from './layout.js';

const BAR_W = 40;
const LABEL_W = 34;

// The "Mut" (courage) bar of one kid (story 6.3, read-only): the pool that block, dodge and Kiai spend, with a thin strip under it that
// fills while the Kiai cools down and turns bright when the shout is ready. Reads the kid's defense slot (ctx.defense) once a frame and
// redraws only when a bar's pixel width or the ready state changes. Sits in the bottom corner on the kid's side (above the tool line).
export class DefenseModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const { right, x } = sliceOf(this.playerIndex ?? 0, this.players, ctx.res.w);
    this.barX = right ? x - LABEL_W - BAR_W - 2 : x + LABEL_W; // bottom corner of the kid's side, just above the tool line
    this.y = ctx.res.h - 25;
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' };
    this.label = this.track(uiText(scene, x, this.y, ctx.t('hud.courage'), style).setOrigin(right ? 1 : 0, 0));
    this.bar = this.track(scene.add.graphics());
    this.key = -1;
  }

  update() {
    const { ctx } = this;
    const i = this.playerIndex ?? 0;
    const slot = ctx.defense.forPlayer(i);
    const stats = ctx.defense.stats(i);
    const mut = Math.round(slot.mut * BAR_W);
    const cool = Math.round((1 - slot.kiaiCd / stats.kiaiCooldown) * BAR_W);
    const ready = slot.kiaiCd <= 0 && slot.mut >= ctx.defense.cfg.mut.kiaiCost;
    const key = (mut * 64 + cool) * 2 + (ready ? 1 : 0);
    if (key === this.key) return;
    this.key = key;
    const { barX: x, y } = this;
    const g = this.bar.clear();
    g.fillStyle(0x000000, 0.6).fillRect(x, y, BAR_W + 2, 6);
    g.fillStyle(mut / BAR_W > 0.25 ? 0xf0a030 : 0xe0483c).fillRect(x + 1, y + 1, mut, 4);
    g.fillStyle(0x000000, 0.6).fillRect(x, y + 7, BAR_W + 2, 4);
    g.fillStyle(ready ? 0xffe14d : 0x8a8a96).fillRect(x + 1, y + 8, cool, 2);
  }

  retext() { this.label.setText(this.ctx.t('hud.courage')); }
}
