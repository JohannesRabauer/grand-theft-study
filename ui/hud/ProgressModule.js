import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';
import { sliceOf } from './layout.js';

// Level and XP bar and the grade average of one player (story 11.1), read-only: redrawn only when that kid's xp, level or grades change.
// With two players this is player i's slice under their status (P1 left, P2 mirrored on the right).
export class ProgressModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const { right, x, dy } = sliceOf(this.playerIndex ?? 0, this.players, ctx.res.w);
    const o = right ? 1 : 0;
    const y = (this.players > 1 ? 50 : 60) + dy; // money sits under the status on one screen, in the middle on a shared one
    this.barX = right ? ctx.res.w - 4 - 42 : x;
    this.barY = y + 10;
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#bfe8ff' };
    this.level = this.track(uiText(scene, x, y, '', style).setOrigin(o, 0));
    this.bar = this.track(scene.add.graphics());
    this.average = this.track(uiText(scene, x, y + 19, '', { ...style, color: '#ffe7ac' }).setOrigin(o, 0));
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
    const g = this.bar.clear();
    g.fillStyle(0x000000, 0.6).fillRect(this.barX, this.barY, 42, 5);
    g.fillStyle(0x4dd2ff).fillRect(this.barX + 1, this.barY + 1, Math.round(40 * inLevel), 3);
    this.level.setText(ctx.t('hud.level', { n: p.level }));
    const avg = ctx.grades?.average(i).overall;
    this.average.setText(ctx.t('hud.average', { v: avg === null || avg === undefined ? '-' : avg.toFixed(1).replace('.', ctx.i18n.lang === 'de' ? ',' : '.') }));
  }

  retext() { this.show(); }
}
