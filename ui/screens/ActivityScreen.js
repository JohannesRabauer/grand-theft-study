import { uiText } from '../uiKit.js';
import { fits, questionsIn, stagesOf } from '../../services/activityLogic.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

// A question activity (story 9.2): the Pfand machine or the bakery counter. The kid who started it answers choice questions from the learning
// engine (every answer is recorded there), with friendly feedback after each one that waits for a fresh press, and at the end gets the
// pocket money and xp it earned. The bakery first asks whether to order in German or in English. Esc leaves without a reward for what is
// left. Arrows or 1-4 choose, jump / interact confirms, the pointer works too.
export class ActivityScreen {
  constructor(scene, ctx, stack, activities, id, player) {
    this.id = 'activity';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.activities = activities;
    this.activity = id;
    this.player = player;
    this.objects = [];
    this.cursor = new ChoiceCursor();
    this.phase = id === 'bakery' ? 'choose' : 'ask';
    this.variant = 'de';
    this.sel = 0;
    this.correct = 0;
    this.answered = 0;
    this.index = 0;
    this.result = null;
  }

  create() {
    const { scene, ctx } = this;
    const { w, h } = ctx.res;
    const own = o => { this.objects.push(o); return o; };
    own(scene.add.rectangle(0, 0, w, h, 0x10131a, 0.95).setOrigin(0).setDepth(40).setInteractive());
    own(scene.add.rectangle(w / 2, h / 2, w - 24, h - 20, 0x232a38).setStrokeStyle(2, 0xe2bb65).setDepth(40.5));
    const text = (x, y, size, color, wrap, align = 'center') => own(uiText(scene, x, y, '', { fontFamily: 'monospace', fontSize: `${size}px`, color, align, ...(wrap ? { wordWrap: { width: wrap } } : {}) }).setOrigin(0.5, 0).setDepth(43));
    this.title = text(w / 2, 18, 14, '#ffe14d');
    this.header = text(w / 2, 36, 9, '#9be58f');
    this.progress = text(w - 40, 20, 8, '#8fa6b2');
    this.body = text(w / 2, 62, 12, '#ffffff', w - 70);
    this.feedback = text(w / 2, 214, 9, '#ffe7ac', w - 70);
    this.nav = text(w / 2, h - 26, 8, '#8fa6b2');
    this.buttons = [0, 1, 2, 3].map(i => {
      const b = own(uiText(scene, w / 2, 112 + i * 24, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', backgroundColor: '#2b3446', padding: { x: 14, y: 4 }, align: 'center', wordWrap: { width: w - 110 } }).setOrigin(0.5, 0).setDepth(43).setInteractive({ useHandCursor: true }));
      b.on('pointerdown', () => { this.sel = i; this.confirm(); });
      return b;
    });
    if (this.phase === 'ask') this.begin('de');
    this.render();
  }

  begin(variant) {
    this.variant = variant;
    this.stages = stagesOf(this.activities.cfg, this.activity, variant);
    this.total = questionsIn(this.stages);
    this.index = 0;
    this.phase = 'ask';
    this.next();
  }

  stageAt(i) {
    let n = i;
    for (const s of this.stages) { if (n < s.n) return s; n -= s.n; }
    return this.stages.at(-1);
  }

  next() {
    const { ctx } = this;
    const stage = this.stageAt(this.index);
    this.q = ctx.learning.next(stage.topic, { player: this.player, context: this.activities.cfg.context, filter: fits(stage) });
    this.view = this.q ? ctx.learning.localize(this.q) : null;
    this.stage = stage;
    this.sel = 0;
    this.shownAt = this.scene.time.now;
    if (!this.q) this.finish(); // no question left to ask: the run ends with what was answered
  }

  render() {
    const { ctx } = this;
    const id = this.activity;
    this.title.setText(ctx.t(`activity.${id}.title`));
    this.nav.setText(ctx.t(this.phase === 'ask' ? 'activity.nav.ask' : 'activity.nav.next'));
    const hide = from => this.buttons.forEach((b, i) => { if (i >= from) b.setVisible(false); });
    if (this.phase === 'choose') {
      this.header.setText('');
      this.progress.setText('');
      this.body.setText(ctx.t('activity.bakery.intro'));
      this.feedback.setText(ctx.t('activity.bakery.bonus'));
      [ctx.t('activity.bakery.german'), ctx.t('activity.bakery.english')].forEach((t, i) => this.buttons[i].setVisible(true).setText(t));
      hide(2);
      this.colour(2);
      return;
    }
    if (this.phase === 'done') {
      const r = this.result;
      this.header.setText('');
      this.progress.setText('');
      this.body.setText(ctx.t('activity.done', { correct: this.correct, total: this.total }));
      this.feedback.setText(ctx.t('activity.reward', { money: ctx.t('hud.money', { v: (r.cents / 100).toFixed(2).replace('.', ctx.i18n.lang === 'de' ? ',' : '.') }), xp: r.xp }));
      hide(0);
      this.nav.setText(ctx.t('activity.nav.close'));
      return;
    }
    this.header.setText(ctx.t(`activity.stage.${this.stage.kind}`));
    this.progress.setText(ctx.t('activity.progress', { n: this.index + 1, total: this.total }));
    this.body.setText(this.view.q);
    const answers = this.view.answers;
    this.buttons.forEach((b, i) => { b.setVisible(i < answers.length); if (i < answers.length) b.setText(answers[i].text); });
    this.colour(answers.length);
    this.feedback.setText(this.phase === 'feedback' ? this.last.text : '');
  }

  colour(n) {
    this.buttons.forEach((b, i) => {
      if (i >= n) return;
      let bg = i === this.sel ? '#2f6f4f' : '#2b3446';
      if (this.phase === 'feedback') bg = this.view.answers[i].correct ? '#2f8f4f' : i === this.last.picked ? '#8f3f3f' : '#2b3446';
      b.setBackgroundColor(bg);
    });
  }

  answer(i) {
    const { ctx } = this;
    const ok = ctx.learning.isCorrect(this.q, i);
    ctx.learning.answer(this.q, ok, Math.round(this.scene.time.now - this.shownAt), { player: this.player });
    this.answered++;
    if (ok) this.correct++;
    this.last = { picked: i, ok, text: ok ? ctx.t('activity.right') : `${ctx.t('activity.wrong')}\n${this.view.explain ?? ''}` };
    this.phase = 'feedback';
    this.render();
  }

  finish() {
    this.result = this.activities.finish({ id: this.activity, variant: this.variant, player: this.player, correct: this.correct, total: Math.max(this.total, this.answered) });
    this.phase = 'done';
    this.render();
  }

  confirm() {
    if (this.phase === 'choose') { this.begin(this.sel === 1 ? 'en' : 'de'); this.render(); return; }
    if (this.phase === 'ask') { if (this.view && this.sel < this.view.answers.length) this.answer(this.sel); return; }
    if (this.phase === 'feedback') {
      this.index++;
      if (this.index >= this.total) this.finish(); else { this.phase = 'ask'; this.next(); if (this.phase === 'ask') this.render(); }
      return;
    }
    this.close();
  }

  retext() { if (this.phase !== 'choose' && this.phase !== 'done') this.view = this.ctx.learning.localize(this.q); this.render(); }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    const read = this.cursor.read(this.ctx.input.intents[this.player]);
    const n = this.phase === 'choose' ? 2 : this.view?.answers.length ?? 0;
    if (this.phase !== 'feedback' && this.phase !== 'done' && n) {
      if (read.dy || read.dx) { this.sel = Math.max(0, Math.min(n - 1, this.sel + read.dy + read.dx)); this.render(); return; }
      if (read.pick && this.phase === 'ask' && read.pick <= n) { this.sel = read.pick - 1; this.confirm(); return; }
    }
    if (read.confirm) this.confirm();
  }

  destroy() {
    for (const o of this.objects) o.destroy();
  }
}
