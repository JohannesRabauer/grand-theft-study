import { HudModule } from './HudModule.js';
import { uiLabel, uiIcon, drawBar, HudPlate } from '../uiKit.js';
import { sliceOf } from './layout.js';

const BAR_W = 34;

// Level, XP bar and the grade average of one player on a plate (story 11.1, 16.14), read-only: redrawn only when that kid's xp, level or
// grades change. With two players this is player i's slice under their status (P1 left, P2 mirrored on the right).
export class ProgressModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const { right, dy } = sliceOf(this.playerIndex ?? 0, this.players, ctx.res.w);
    this.right = right;
    this.width = ctx.res.w;
    this.y0 = (this.players > 1 ? 42 : 59) + dy; // money sits under the status on one screen, in the middle on a shared one
    this.plate = new HudPlate(scene);
    this.track(this.plate.g);
    this.icon = this.track(uiIcon(scene, 0, 0, 'star'));
    this.level = this.track(uiLabel(scene, 0, 0, '', 'hud', 'ink', { color: 'blue' }));
    this.bar = this.track(scene.add.graphics());
    this.average = this.track(uiLabel(scene, 0, 0, '', 'hud', 'ink', { color: 'gold' }));
    const prefix = `players.${this.playerIndex ?? 0}.`;
    this.on('state:changed', e => { if (!e || e.path === '' || e.path.startsWith(prefix)) this.show(); });
    this.show();
  }

  show() {
    const { ctx } = this;
    const i = this.playerIndex ?? 0;
    const p = ctx.state.players[i];
    if (!p) return; // co-op is being switched off: the state already has one player less than this module
    const { xpPerLevel, maxLevel } = ctx.state.cfg;
    const inLevel = p.level >= maxLevel ? 1 : (p.xp % xpPerLevel) / xpPerLevel;
    this.level.setText(ctx.t('hud.level', { n: p.level }));
    const avg = ctx.grades?.average(i).overall;
    this.average.setText(ctx.t('hud.average', { v: avg === null || avg === undefined ? '-' : avg.toFixed(1).replace('.', ctx.i18n.lang === 'de' ? ',' : '.') }));
    const w = Math.ceil(Math.max(3 + 9 + 3 + this.level.width + 4 + BAR_W + 3, this.average.width + 6));
    const x0 = this.right ? this.width - 2 - w : 2;
    const y0 = this.y0;
    this.plate.fit(x0, y0, w, 26);
    this.icon.setPosition(x0 + 3, y0 + 3);
    this.level.setPosition(x0 + 15, y0 + 3);
    this.average.setPosition(x0 + 3, y0 + 14);
    drawBar(this.scene, this.bar.clear(), x0 + 15 + Math.ceil(this.level.width) + 4, y0 + 5, BAR_W, 6, inLevel, 'blue');
  }

  retext() { this.show(); }
}
