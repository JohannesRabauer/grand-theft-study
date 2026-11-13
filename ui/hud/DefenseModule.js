import { HudModule } from './HudModule.js';
import { uiLabel, uiIcon, drawBar, HudPlate } from '../uiKit.js';
import { sliceOf } from './layout.js';

const BAR_W = 40;
const LABEL_W = 22;

// The "Mut" (courage) bar of one kid (story 6.3, read-only): the pool that block, dodge and Kiai spend, with a thin strip under it that
// fills while the Kiai cools down and turns bright when the shout is ready. Reads the kid's defense slot (ctx.defense) once a frame and
// redraws only when a bar's pixel width or the ready state changes. Sits in the bottom corner on the kid's side (above the tool line).
export class DefenseModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const { right } = sliceOf(this.playerIndex ?? 0, this.players, ctx.res.w);
    const w = 3 + 9 + 3 + LABEL_W + BAR_W + 2 + 3;
    const x0 = right ? ctx.res.w - 2 - w : 2; // bottom corner of the kid's side, just above the tool line
    this.y = ctx.res.h - 32;
    this.barX = x0 + 3 + 9 + 3 + LABEL_W;
    this.plate = new HudPlate(scene);
    this.plate.fit(x0, this.y - 3, w, 18);
    this.track(this.plate.g);
    this.icon = this.track(uiIcon(scene, x0 + 3, this.y, 'shield'));
    this.label = this.track(uiLabel(scene, x0 + 15, this.y, ctx.t('hud.courage'), 'hud'));
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
    drawBar(this.scene, g, x, y, BAR_W + 2, 6, mut / BAR_W, mut / BAR_W > 0.25 ? 'orange' : 'red');
    drawBar(this.scene, g, x, y + 8, BAR_W + 2, 4, cool / BAR_W, ready ? 'gold' : 'grey');
  }

  retext() { this.label.setText(this.ctx.t('hud.courage')); }
}
