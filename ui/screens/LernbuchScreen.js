import { uiText } from '../uiKit.js';
import { bookOf, barColor } from '../../learning/lernbuch.js';

// The Lernbuch (story 10.5): for one kid a bar per subject with the real accuracy of everything they answered, a bronze / silver /
// gold medal when they earned one, and two small badges (a long streak of right answers, many questions learned for good).
// Q / E switch to the other kid in co-op, Esc closes. Read-only; every number comes from the saved learning stats.
const MEDAL = { bronze: 0xcd7f32, silver: 0xc4c9d4, gold: 0xffd84d };

export class LernbuchScreen {
  constructor(scene, ctx, stack, cfg, player = 0) {
    this.id = 'lernbuch';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.cfg = cfg;
    this.player = player;
    this.objects = [];
    this.marks = [];
  }

  create() {
    const { scene, ctx } = this;
    const { w, h } = ctx.res;
    const own = o => { this.objects.push(o); return o; };
    own(scene.add.rectangle(0, 0, w, h, 0x10131a, 0.95).setOrigin(0).setDepth(40).setInteractive());
    own(scene.add.rectangle(w / 2, h / 2, w - 24, h - 20, 0xf3ecd6).setStrokeStyle(2, 0x8a6a35).setDepth(40.5));
    const text = (x, y, size, color, wrap) => own(uiText(scene, x, y, '', { fontFamily: 'monospace', fontSize: `${size}px`, color, ...(wrap ? { wordWrap: { width: wrap } } : {}) }).setDepth(43));
    this.title = text(w / 2, 16, 15, '#5a3b16').setOrigin(0.5, 0);
    this.owner = text(w / 2, 34, 9, '#7a5b2a').setOrigin(0.5, 0);
    this.gfx = own(scene.add.graphics().setDepth(42));
    const topics = this.ctx.learning.topics();
    this.rows = topics.map((topic, i) => {
      const y = 58 + i * 30;
      return { topic, y, name: text(34, y + 2, 10, '#3a2a14'), pct: text(352, y + 2, 10, '#3a2a14').setOrigin(1, 0), info: text(34, y + 16, 7, '#6a5a3a') };
    });
    this.total = text(34, 58 + topics.length * 30 + 2, 9, '#5a3b16', 400);
    this.legend = text(34, 58 + topics.length * 30 + 16, 7, '#7a6a4a', 400);
    this.nav = text(w / 2, h - 26, 8, '#7a6a4a').setOrigin(0.5, 0);
    this.render();
  }

  who() { const p = this.ctx.players[this.player]; return p?.character?.name ?? this.ctx.t('menu.slot.player', { n: this.player + 1 }); }

  book() {
    const { ctx } = this;
    return bookOf(ctx.learning.topics(), t => ctx.learning.stats(this.player, t), t => ctx.learning.poolSize(t), this.cfg);
  }

  render() {
    const { ctx, gfx, cfg } = this;
    const book = this.book();
    gfx.clear();
    this.marks.forEach(m => m.destroy());
    this.marks = [];
    this.title.setText(ctx.t('lernbuch.title'));
    this.owner.setText(ctx.t('lernbuch.owner', { who: this.who() }));
    const pct = v => `${Math.round(v * 100)}%`;
    this.rows.forEach((row, i) => {
      const r = book.rows[i];
      this.name(row, r);
      const x = 150;
      gfx.fillStyle(0xd8cdb0).fillRect(x, row.y + 2, 170, 10);
      if (r.answered) gfx.fillStyle(parseInt(barColor(r.accuracy, cfg).slice(1), 16)).fillRect(x, row.y + 2, Math.max(2, Math.round(170 * r.accuracy)), 10);
      gfx.lineStyle(1, 0x8a6a35).strokeRect(x + 0.5, row.y + 2.5, 169, 9);
      row.pct.setText(r.answered ? pct(r.accuracy) : '-');
      row.info.setText(ctx.t('lernbuch.info', { n: r.answered, level: r.level.toFixed(1).replace('.', ctx.i18n.lang === 'de' ? ',' : '.'), learned: r.learned, pool: r.pool }));
      // the medal and the two badges
      const my = row.y + 7;
      if (r.medal) { gfx.fillStyle(MEDAL[r.medal]).fillCircle(380, my, 8); gfx.lineStyle(1, 0x5a3b16).strokeCircle(380, my, 8); this.mark(380, my, ctx.t(`lernbuch.medal.${r.medal}`).slice(0, 1)); }
      else { gfx.lineStyle(1, 0xb8aa86).strokeCircle(380, my, 8); }
      if (r.badges.streak) { gfx.fillStyle(0xe0605a).fillTriangle(404, my - 8, 396, my + 7, 412, my + 7); }
      else { gfx.lineStyle(1, 0xb8aa86).strokeTriangle(404, my - 8, 396, my + 7, 412, my + 7); }
      if (r.badges.learner) { gfx.fillStyle(0x4aa3df).fillRect(420, my - 6, 12, 13); gfx.fillStyle(0xffffff, 0.7).fillRect(423, my - 3, 6, 2); gfx.fillRect(423, my + 1, 6, 2); }
      else { gfx.lineStyle(1, 0xb8aa86).strokeRect(420.5, my - 5.5, 11, 12); }
    });
    this.total.setText(book.answered ? ctx.t('lernbuch.total', { n: book.answered, pct: pct(book.accuracy), medals: book.medals }) : ctx.t('lernbuch.empty'));
    this.legend.setText(ctx.t('lernbuch.legend', { streak: cfg.badges.streakMin, learned: cfg.badges.learnedMin }));
    this.nav.setText(ctx.t('lernbuch.nav'));
  }

  name(row, r) { row.name.setText(this.ctx.t(`grades.subject.${r.topic}`)); }

  mark(x, y, letter) {
    const t = uiText(this.scene, x, y, letter, { fontFamily: 'monospace', fontSize: '9px', color: '#3a2a14', fontStyle: 'bold' }).setOrigin(0.5).setDepth(44);
    this.marks.push(t);
  }

  retext() { this.render(); }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    if (this.ctx.players.length < 2) return;
    for (const p of this.ctx.players) {
      const i = this.ctx.input.intents[p.index];
      if (i.toolNext || i.toolPrev) {
        this.player = (this.player + (i.toolNext ? 1 : -1) + this.ctx.players.length) % this.ctx.players.length;
        this.render();
        return;
      }
    }
  }

  destroy() {
    this.marks.forEach(m => m.destroy());
    for (const o of this.objects) o.destroy();
  }
}
