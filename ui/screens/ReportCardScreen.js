import { uiText } from '../uiKit.js';
import { controlParams } from '../controlLabels.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

// The Zeugnis (story 8.6): one page per kid with the grades of the school year that just ended, the conduct (Kopfnoten), the
// funny teacher comment, the parents' reaction and the promotion result; confetti falls when a kid is promoted. A repeated year
// is always put as a bonus lap with the comeback bonus, never as a failure. Read-only: the consequence was settled when the
// screen opened (Grades.settleYear), so closing it early loses nothing. A fresh press of jump or interact turns the page.
const CATS = ['verhalten', 'mitarbeit', 'ordnung', 'hilfsbereitschaft'];
const COLORS = [0xffe14d, 0xff6f91, 0x4dd2ff, 0x9be58f, 0xb983ff, 0xffffff];

export class ReportCardScreen {
  // opts: { cards: [{ player, ...Grades.yearCard, applied }], day, inputCfg, onDone }
  constructor(scene, ctx, stack, opts) {
    this.id = 'reportCard';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.opts = opts;
    this.page = 0;
    this.objects = [];
    this.confetti = [];
    this.cursors = ctx.players.map(() => new ChoiceCursor());
  }

  get cards() { return this.opts.cards; }

  create() {
    const { scene, ctx } = this;
    const { w, h } = ctx.res;
    const own = o => { this.objects.push(o); return o; };
    own(scene.add.rectangle(0, 0, w, h, 0x12151c, 0.95).setOrigin(0).setDepth(40).setInteractive());
    own(scene.add.rectangle(w / 2, h / 2, w - 24, h - 20, 0xf4ecd2).setStrokeStyle(2, 0xb08a4a).setDepth(40.5));
    const text = (x, y, size, color, wrap, bold) => own(uiText(scene, x, y, '', {
      fontFamily: 'monospace', fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal',
      ...(wrap ? { wordWrap: { width: wrap } } : {})
    }).setDepth(41));
    this.title = text(w / 2, 20, 15, '#5a3b16', 0, true).setOrigin(0.5, 0);
    this.owner = text(w / 2, 38, 10, '#7a5b2a').setOrigin(0.5, 0);
    this.rows = Array.from({ length: 8 }, (_, i) => ({ name: text(34, 58 + i * 14, 10, '#3a2a14'), grade: text(196, 58 + i * 14, 10, '#8a2a1a', 0, true).setOrigin(1, 0) }));
    this.average = text(34, 174, 10, '#3a2a14', 0, true);
    this.conduct = text(34, 190, 8, '#5a4a30', 190);
    this.teacher = text(246, 56, 9, '#3a2a14', 196);
    this.parents = text(246, 110, 9, '#3a5a2a', 196);
    this.result = text(246, 160, 11, '#1a6a2a', 196, true);
    this.reason = text(246, 176, 8, '#5a4a30', 196);
    this.bonus = text(246, 214, 8, '#8a5a1a', 196);
    this.footer = text(w / 2, h - 26, 9, '#5a3b16').setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
    this.footer.on('pointerdown', () => this.next());
    this.render();
    if (this.cards.some(c => c.promotion.promoted)) this.rain();
  }

  // A little confetti: falls once, wobbling, and is gone after a few seconds.
  rain() {
    const { scene, ctx } = this;
    for (let i = 0; i < 40; i++) {
      const piece = scene.add.rectangle(Math.random() * ctx.res.w, -10 - Math.random() * 60, 4, 6, COLORS[i % COLORS.length]).setDepth(42).setRotation(Math.random() * 3);
      this.confetti.push(piece);
      scene.tweens.add({ targets: piece, y: ctx.res.h + 20, x: piece.x + (Math.random() - 0.5) * 60, rotation: piece.rotation + 6, duration: 2400 + Math.random() * 1600, ease: 'Sine.easeIn', onComplete: () => piece.destroy() });
    }
  }

  render() {
    const { ctx } = this;
    const card = this.cards[this.page];
    const who = ctx.players[card.player].character?.name ?? ctx.t('menu.slot.player', { n: card.player + 1 });
    this.title.setText(ctx.t('zeugnis.title'));
    this.owner.setText(`${ctx.t('zeugnis.owner', { who })}${this.cards.length > 1 ? `   (${ctx.t('zeugnis.page', { n: this.page + 1, total: this.cards.length })})` : ''}`);
    const subjects = Object.entries(card.zeugnis);
    this.rows.forEach((row, i) => {
      const entry = subjects[i];
      row.name.setVisible(!!entry).setText(entry ? ctx.t(`grades.subject.${entry[0]}`) : '');
      row.grade.setVisible(!!entry).setText(entry ? String(entry[1]) : '');
    });
    this.average.setText(card.promotion.average === null ? ctx.t('zeugnis.noGrades') : ctx.t('zeugnis.average', { v: card.promotion.average.toFixed(1).replace('.', ctx.i18n.lang === 'de' ? ',' : '.') }));
    this.conduct.setText(`${ctx.t('zeugnis.conduct')}: ${CATS.map(c => `${ctx.t(`kopfnoten.${c}`)} ${card.kopfnoten.values[c]}`).join(', ')}`);
    this.teacher.setText(`${ctx.t('zeugnis.teacher')}\n${card.teacherComment}`);
    this.parents.setText(`${ctx.t('zeugnis.parents')}\n${card.parentLine}`);
    const promoted = card.promotion.promoted;
    this.result.setText(ctx.t(promoted ? 'zeugnis.promoted' : 'zeugnis.repeat')).setColor(promoted ? '#1a6a2a' : '#9a5a14');
    this.reason.setText(ctx.t(card.promotion.reasons[0]));
    const b = card.promotion.comebackBonus;
    this.bonus.setText(b ? ctx.t('zeugnis.bonus', { xp: b.xp, money: ctx.t('hud.money', { v: (b.moneyCents / 100).toFixed(2).replace('.', ctx.i18n.lang === 'de' ? ',' : '.') }) }) : '');
    const keys = controlParams(this.opts.inputCfg, ctx.players.map(p => p.index), ctx.input.type, ctx.t);
    const confirm = [keys.jump, keys.interact].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / ');
    this.footer.setText(`${confirm}: ${ctx.t(this.page + 1 < this.cards.length ? 'zeugnis.next' : 'zeugnis.continue')}`);
  }

  // The language changed: the comment lines are re-read in the new language (the consequence stays as it was).
  retext() {
    this.opts.cards.forEach((c, i) => { this.opts.cards[i] = { ...this.ctx.grades.yearCard(c.player, this.opts.day, this.ctx.i18n.lang), applied: c.applied }; this.opts.cards[i].player = c.player; });
    this.render();
  }

  next() {
    if (this.page + 1 < this.cards.length) { this.page++; this.render(); return; }
    this.close();
  }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    for (const p of this.ctx.players) if (this.cursors[p.index].read(this.ctx.input.intents[p.index]).confirm) { this.next(); return; }
  }

  destroy() {
    for (const c of this.confetti) c.destroy();
    for (const o of this.objects) o.destroy();
    this.opts.onDone?.();
  }
}
