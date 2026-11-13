import { HudModule } from './HudModule.js';
import { uiLabel, drawBar, HudPlate } from '../uiKit.js';
import { sliceOf } from './layout.js';

const BAR_W = 60;
const NAMES_SHOWN = 3;
const POP_MS = 1700;
const RATTLE_MS = 900;

// The Style meter of one skater (CAP-13), read-only: the chain's points and multiplier, a timer bar (the window until it
// banks), the last tricks by their fun names and, when a chain banks, a rising "+€ ..." popup with a coin sparkle.
// Only visible while there is a chain. Driven by `style:changed`, `style:trick` and `style:banked`; the timer bar reads
// the player's combo (ctx.tricks) once a frame and redraws only when its width changes.
export class StyleModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const cfg = scene.cache.json.get('tricks');
    this.window = cfg.combo.window;
    this.fireMult = cfg.combo.fireMult;
    this.names = [];
    this.points = 0;
    this.mult = 1;
    this.barPx = -1;
    this.pop = null;
    const { right, x, dy } = sliceOf(this.playerIndex ?? 0, this.players, ctx.res.w);
    const o = right ? 1 : 0;
    this.x = x;
    this.y = dy + (this.players > 1 ? 72 : 90);
    this.right = right;
    this.width = ctx.res.w;
    this.barX = right ? x - BAR_W : x;
    this.plate = new HudPlate(scene).setVisible(false);
    this.track(this.plate.g);
    this.head = this.track(uiLabel(scene, x, this.y, '', 'body', 'ink', { color: 'gold' }).setOrigin(o, 0).setVisible(false));
    this.bar = this.track(scene.add.graphics().setVisible(false));
    this.list = this.track(uiLabel(scene, x, this.y + 20, '', 'hud').setOrigin(o, 0).setVisible(false));
    this.note = this.track(uiLabel(scene, x, this.y + 32, '', 'body', 'ink', { color: 'gold' }).setOrigin(o, 0).setAlpha(0));
    this.fx = ctx.particles.createFor(scene, 'spark', 0.15);
    this.sparkX = right ? x - 40 : x + 40;
    this.on('style:changed', e => { if (this.mine(e)) this.changed(e.points, e.multiplier); });
    this.on('style:trick', e => { if (this.mine(e)) this.trick(e); });
    this.on('style:banked', e => { if (this.mine(e)) this.banked(e); });
  }

  get combo() { return this.ctx.tricks.forPlayer(this.playerIndex ?? 0).combo; }

  get hot() { return this.mult >= this.fireMult; }

  changed(points, mult) {
    this.points = points;
    this.mult = mult;
    const on = points > 0;
    if (!on) this.names.length = 0;
    this.head.setVisible(on);
    this.plate.setVisible(on);
    this.bar.setVisible(on);
    this.list.setVisible(on);
    this.barPx = -1;
    this.retext();
  }

  trick(e) {
    if (e.points === 0) { this.flash(this.ctx.t(e.name)); return; }
    this.names.push(e.name);
    if (this.names.length > NAMES_SHOWN) this.names.shift();
    this.retext();
  }

  banked(e) {
    const { ctx } = this;
    const s = (e.cents / 100).toFixed(2);
    const v = ctx.i18n.lang === 'de' ? s.replace('.', ',') : s;
    this.flash(ctx.t(e.bailed ? 'style.saved' : e.reason === 'bank-spot' ? 'style.bankedSpot' : 'style.banked', { v, xp: e.xp, b: Math.round(e.bonus * 100) }), POP_MS);
    this.fx.burst(this.sparkX, this.y + 36, 6);
  }

  // A short message under the meter that rises and fades.
  flash(text, ms = RATTLE_MS) {
    const { scene, note } = this;
    this.pop?.stop();
    note.setText(text).setAlpha(1).setY(this.y + 32);
    this.pop = scene.tweens.add({ targets: note, y: this.y + 24, alpha: 0, duration: ms, delay: ms * 0.4, ease: 'Quad.easeIn' });
  }

  update() {
    if (!this.head.visible) return;
    const px = Math.max(0, Math.round(BAR_W * Math.min(1, this.combo.timer / this.window)));
    if (px === this.barPx) return;
    this.barPx = px;
    drawBar(this.scene, this.bar.clear(), this.barX, this.y + 12, BAR_W, 6, Math.max(0, px - 2) / (BAR_W - 2), this.hot ? 'orange' : 'gold');
  }

  retext() {
    const { ctx } = this;
    const ink = this.scene.cache.json.get('ui').text.ink;
    this.head.setText(ctx.t('hud.style', { p: this.points, m: this.mult.toFixed(1) })).setColor(this.hot ? '#ffb24a' : ink.gold);
    this.list.setText(this.names.map(n => ctx.t(n)).join(' · '));
    const w = Math.ceil(Math.max(this.head.width, this.list.width, BAR_W) + 8);
    this.plate.fit(this.right ? this.width - 2 - w : 2, this.y - 3, w, 36);
  }

  destroy() {
    this.pop?.stop();
    super.destroy();
  }
}
