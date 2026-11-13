import { uiLabel, uiLeave, uiScreenFrame, uiIcon, paintRects, uiCfg } from '../uiKit.js';
import { barRects, over } from '../uiTheme.js';
import { bookOf, barColor } from '../../learning/lernbuch.js';

// The Lernbuch (story 10.5): for one kid a bar per subject with the real accuracy of everything they answered, a bronze / silver /
// gold medal when they earned one, and two small badges (a long streak of right answers, many questions learned for good).
// Q / E switch to the other kid in co-op, Esc closes. Read-only; every number comes from the saved learning stats.
// The page is paper (story 16.14): the paper tone of the UI kit, the icons of the kit for the medal and the badges.
const MEDAL = { bronze: 0xcd7f32, silver: 0xc4c9d4, gold: 0xffffff };
const BAR = { x: 150, w: 170, h: 10 };

export class LernbuchScreen {
  constructor(scene, ctx, stack, cfg, player = 0) {
    this.id = 'lernbuch';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.cfg = cfg;
    this.player = player;
    this.objects = [];
  }

  create() {
    const { scene, ctx } = this;
    const { w, h } = ctx.res;
    const own = o => { this.objects.push(o); return o; };
    const frame = uiScreenFrame(scene, ctx, { tone: 'paper', dimAlpha: 0.95 });
    own(frame.dim);
    own(frame.panel);
    const text = (x, y, size, color, wrap) => own(uiLabel(scene, x, y, '', 'body', 'paper', { size, color, ...(wrap ? { wordWrap: { width: wrap } } : {}) }).setDepth(43));
    this.title = text(w / 2, 16, 15, 'gold').setOrigin(0.5, 0);
    this.owner = text(w / 2, 34, 9, 'muted').setOrigin(0.5, 0);
    this.gfx = own(scene.add.graphics().setDepth(42));
    const topics = this.ctx.learning.topics();
    this.rows = topics.map((topic, i) => {
      const y = 58 + i * 30;
      const icon = (x, name) => own(uiIcon(scene, x, y + 3, name).setDepth(43));
      return {
        topic, y, name: text(34, y + 2, 10, 'text'), pct: text(352, y + 2, 10, 'text').setOrigin(1, 0), info: text(34, y + 16, 7, 'muted'),
        medal: icon(376, 'medal'), letter: text(389, y + 4, 8, 'text'), streak: icon(408, 'flame'), learner: icon(424, 'book')
      };
    });
    this.total = text(34, 58 + topics.length * 30 + 2, 9, 'gold', 400);
    this.legend = text(34, 58 + topics.length * 30 + 16, 7, 'muted', 400);
    this.nav = text(w / 2, h - 28, 8, 'muted').setOrigin(0.5, 0);
    this.render();
  }

  who() { const p = this.ctx.players[this.player]; return p?.character?.name ?? this.ctx.t('menu.slot.player', { n: this.player + 1 }); }

  book() {
    const { ctx } = this;
    return bookOf(ctx.learning.topics(), t => ctx.learning.stats(this.player, t), t => ctx.learning.poolSize(t), this.cfg);
  }

  render() {
    const { ctx, gfx, cfg } = this;
    const ui = uiCfg(this.scene);
    const book = this.book();
    gfx.clear();
    this.title.setText(ctx.t('lernbuch.title'));
    this.owner.setText(ctx.t('lernbuch.owner', { who: this.who() }));
    const pct = v => `${Math.round(v * 100)}%`;
    this.rows.forEach((row, i) => {
      const r = book.rows[i];
      this.name(row, r);
      const base = barColor(r.accuracy, cfg);
      const color = { base, light: over('#fff1c4', base, 0.4), dark: over(ui.edge, base, 0.3) };
      paintRects(gfx, barRects(BAR.w, BAR.h, r.answered ? Math.max(2 / (BAR.w - 2), r.accuracy) : 0, color, ui.tones.paper.dark, ui.edge), BAR.x, row.y + 2);
      row.pct.setText(r.answered ? pct(r.accuracy) : '-');
      row.info.setText(ctx.t('lernbuch.info', { n: r.answered, level: r.level.toFixed(1).replace('.', ctx.i18n.lang === 'de' ? ',' : '.'), learned: r.learned, pool: r.pool }));
      // the medal and the two badges: earned ones in colour, the others as a faint slot
      if (r.medal) row.medal.setAlpha(1).setTint(MEDAL[r.medal]); else row.medal.setAlpha(0.22).clearTint();
      row.letter.setText(r.medal ? ctx.t(`lernbuch.medal.${r.medal}`).slice(0, 1) : '');
      row.streak.setAlpha(r.badges.streak ? 1 : 0.22);
      row.learner.setAlpha(r.badges.learner ? 1 : 0.22);
    });
    this.total.setText(book.answered ? ctx.t('lernbuch.total', { n: book.answered, pct: pct(book.accuracy), medals: book.medals }) : ctx.t('lernbuch.empty'));
    this.legend.setText(ctx.t('lernbuch.legend', { streak: cfg.badges.streakMin, learned: cfg.badges.learnedMin }));
    this.nav.setText(ctx.t('lernbuch.nav'));
  }

  name(row, r) { row.name.setText(this.ctx.t(`grades.subject.${r.topic}`)); }

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
    uiLeave(this.scene, this.ctx, this.objects);
  }
}
