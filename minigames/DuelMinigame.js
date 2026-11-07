import { Minigame } from './Minigame.js';
import { winnerOf } from './matheCore.js';
import { uiText } from '../ui/uiKit.js';

// Minigame base for the games that alternate two modes and cheer the leader of two players: after the timer the round
// does not end at once but shows a short, gentle "<name> is ahead" banner (cosmetic only, both players get the full
// reward). A subclass calls initCheer() in buildGame(), `if (this.cheering(dt)) return` first in updateGame(), and
// needs the i18n keys minigame.<id>.winner ({name}) and minigame.<id>.tie plus options.celebrateMs in its registry entry.
export class DuelMinigame extends Minigame {
  initCheer() {
    const { ctx } = this;
    this.over = false;
    this.celebrate = 0;
    this.bannerKey = null;
    this.banner = uiText(this, ctx.res.w / 2, ctx.res.h / 2, '', {
      fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#ffe14d', align: 'center', stroke: '#000000', strokeThickness: 4, wordWrap: { width: ctx.res.w - 40 }
    }).setOrigin(0.5).setDepth(61).setVisible(false);
  }

  retext() {
    super.retext();
    if (this.bannerKey) this.banner.setText(this.ctx.t(this.bannerKey.key, this.bannerKey.params));
  }

  // True while the cheer runs (or the round is over); ends the round when the cheer is done.
  cheering(dt) {
    if (!this.over) return false;
    if (this.celebrate > 0 && (this.celebrate -= dt) <= 0) super.finish();
    return true;
  }

  // Two players: a short cheer for the leader before the result screen. Quitting, leaving or one player ends at once.
  finish(opts = {}) {
    if (this.finished || (this.over && !opts.quit && !opts.silent)) return;
    this.over = true;
    if (opts.quit || opts.silent || this.slots.length < 2) { super.finish(opts); return; }
    const { ctx } = this;
    const winner = winnerOf(this.slots.map(s => s.tally));
    const nameOf = slot => ctx.players[slot.index].character?.name ?? ctx.t('menu.slot.player', { n: slot.index + 1 });
    this.bannerKey = winner < 0
      ? { key: `minigame.${this.id}.tie` }
      : { key: `minigame.${this.id}.winner`, params: { name: nameOf(this.slots[winner]) } };
    this.banner.setText(ctx.t(this.bannerKey.key, this.bannerKey.params)).setVisible(true);
    for (const [i, slot] of this.slots.entries()) {
      this.onCheer(slot);
      this.pop.pop(slot.rect.x + slot.rect.w / 2, slot.rect.y + slot.rect.h / 2 + 30, '*', { sparkle: i === winner ? 24 : 8 });
    }
    this.celebrate = this.def.options.celebrateMs;
  }

  // Hook: the round is over, stop this player's pending timers (e.g. the pause before the next question).
  onCheer() {}
}
