import { uiText } from '../../ui/uiKit.js';

const ROWS = 4;
const COLORS = { frame: 0x1a1d26, row: 0x2b2f3a, focus: 0x3a4152, edge: 0xd9a521, good: 0x2f7f4f, soft: 0x8a5a1f, hint: 0x28506f };
const NOTE = { good: '#9be58f', soft: '#ffd27a', hint: '#9fd0ff' };

// Renders one learning item (ctx.learning.next) in a player's area: the question in the current language (bothLangs
// topics show German and English together), numbered answer buttons, a hint button and kind feedback. Answers come
// from the player's choice cursor (nav), the number keys or a tap or click; the panel only reports the chosen index
// through onChoose(index, hintsUsed). Only choice items have answer buttons here; typed, match and sort items get
// their own interaction in their minigames and use the panel for the question text and the feedback.
export class QuestionPanel {
  constructor(scene, ctx, rect, { depth = 10 } = {}) {
    this.ctx = ctx;
    this.rect = rect;
    this.onChoose = null;
    this.q = null;
    this.view = null;
    this.locked = true;
    this.focus = 0;
    this.chosen = -1;
    this.hintsUsed = 0;
    this.fb = null;
    this.message = null;
    this.marks = new Array(ROWS).fill(null);
    const big = rect.w > 300;
    const fs = big ? 12 : 10;
    const pad = 8;
    const rowH = big ? 24 : 22;
    const wrap = rect.w - pad * 2;
    const { x, y } = rect;
    this.rowsTop = y + 58;
    this.hintY = this.rowsTop + ROWS * (rowH + 3) + 4;
    this.noteY = this.hintY + 22;
    this.noteYFeedback = this.hintY;
    this.objects = [];
    const own = o => { this.objects.push(o); return o; };
    own(scene.add.rectangle(x, y, rect.w, rect.h, COLORS.frame, 0.92).setOrigin(0).setDepth(depth));
    const font = { fontFamily: 'monospace', color: '#ffffff' };
    this.question = own(uiText(scene, x + pad, y + 6, '', { ...font, fontSize: `${fs}px`, wordWrap: { width: wrap }, lineSpacing: 2 }).setDepth(depth + 1));
    this.rows = [];
    for (let i = 0; i < ROWS; i++) {
      const top = this.rowsTop + i * (rowH + 3);
      const bg = own(scene.add.rectangle(x + pad, top, wrap, rowH, COLORS.row).setOrigin(0).setDepth(depth + 1).setInteractive({ useHandCursor: true }));
      const text = own(uiText(scene, x + pad + 6, top + rowH / 2, '', { ...font, fontSize: `${fs - 1}px` }).setOrigin(0, 0.5).setDepth(depth + 2));
      bg.on('pointerover', () => this.hover(i));
      bg.on('pointerdown', () => this.tap(i));
      this.rows.push({ bg, text });
    }
    const hintBg = own(scene.add.rectangle(x + pad, this.hintY, wrap, 18, COLORS.hint).setOrigin(0).setDepth(depth + 1).setInteractive({ useHandCursor: true }));
    const hintText = own(uiText(scene, x + rect.w / 2, this.hintY + 9, '', { ...font, fontSize: `${fs - 2}px` }).setOrigin(0.5).setDepth(depth + 2));
    hintBg.on('pointerover', () => this.hover(ROWS));
    hintBg.on('pointerdown', () => this.tap(ROWS));
    this.hint = { bg: hintBg, text: hintText };
    this.note = own(uiText(scene, x + pad, this.noteY, '', { ...font, fontSize: `${fs - 2}px`, wordWrap: { width: wrap }, maxLines: 7 }).setDepth(depth + 2));
    this.hide();
  }

  get answerCount() { return this.q?.type === 'choice' ? this.view.answers.length : 0; }

  get hintsLeft() { return this.q ? Math.min(this.q.meta.hintsAllowed, this.view.hints.length) - this.hintsUsed : 0; }

  get hasHintButton() { return !!this.q && !this.locked && this.q.meta.hintsAllowed > 0 && this.view.hints.length > 0; }

  // Shows a learning item and unlocks the answer buttons.
  show(question) {
    this.q = question;
    this.view = this.ctx.learning.localize(question);
    this.message = null;
    this.fb = null;
    this.locked = false;
    this.hintsUsed = 0;
    this.focus = 0;
    this.chosen = -1;
    this.marks.fill(null);
    this.render();
  }

  // Replaces the question by a plain message (a finished player waiting for the other).
  showMessage(key, params) {
    this.q = null;
    this.message = { key, params };
    this.locked = true;
    this.render();
  }

  render() {
    const { ctx, view } = this;
    this.question.setText(this.message ? ctx.t(this.message.key, this.message.params) : view.q);
    const n = this.answerCount;
    this.rows.forEach((r, i) => {
      r.bg.setVisible(i < n);
      r.text.setVisible(i < n);
      if (i < n) r.text.setText(`${i + 1}  ${view.answers[i].text}`);
    });
    const hint = this.hasHintButton;
    this.hint.bg.setVisible(hint);
    this.hint.text.setVisible(hint);
    if (hint) this.hint.text.setText(ctx.t('minigame.hint', { n: this.hintsLeft }));
    this.renderNote();
    this.paint();
  }

  renderNote() {
    const { ctx, view, fb } = this;
    let text = '';
    let color = NOTE.hint;
    let y = this.noteY;
    if (fb) {
      const correct = view.answers.find(a => a.correct);
      color = fb.ok ? NOTE.good : NOTE.soft;
      y = this.noteYFeedback;
      text = ctx.t(fb.reaction);
      if (!fb.ok) text += `\n${correct ? `${ctx.t('minigame.correctWas', { answer: correct.text })}\n` : ''}${view.explain}`;
    } else if (this.hintsUsed > 0) {
      text = ctx.t('minigame.hintLine', { hint: view.hints[this.hintsUsed - 1] });
    }
    this.note.setText(text).setColor(color).setY(y);
  }

  paint() {
    const n = this.answerCount;
    this.rows.forEach((r, i) => {
      const focused = !this.locked && this.focus === i && i < n;
      r.bg.setFillStyle(this.marks[i] === 'good' ? COLORS.good : this.marks[i] === 'soft' ? COLORS.soft : focused ? COLORS.focus : COLORS.row);
      if (focused) r.bg.setStrokeStyle(2, COLORS.edge); else r.bg.setStrokeStyle();
    });
    if (!this.locked && this.focus === n && this.hasHintButton) this.hint.bg.setStrokeStyle(2, COLORS.edge); else this.hint.bg.setStrokeStyle();
  }

  // Cursor step from ChoiceCursor: dy moves the focus (answers, then the hint button), confirm activates it, pick = number key.
  nav({ dy, confirm, pick }) {
    if (this.locked || !this.q) return;
    const n = this.answerCount;
    if (pick > 0) {
      if (pick <= n) this.choose(pick - 1);
      return;
    }
    const slots = n + (this.hasHintButton ? 1 : 0);
    if (dy && slots > 0) {
      this.focus = (this.focus + dy + slots) % slots;
      this.paint();
    }
    if (confirm && slots > 0) this.tap(this.focus >= n ? ROWS : this.focus);
  }

  hover(i) {
    if (this.locked || !this.q) return;
    const n = this.answerCount;
    if (i === ROWS ? !this.hasHintButton : i >= n) return;
    this.focus = i === ROWS ? n : i;
    this.paint();
  }

  tap(i) {
    if (this.locked || !this.q) return;
    if (i === ROWS) this.useHint(); else if (i < this.answerCount) this.choose(i);
  }

  useHint() {
    if (this.hintsLeft <= 0) return;
    this.hintsUsed++;
    this.render();
  }

  choose(i) {
    this.locked = true;
    this.chosen = i;
    this.render();
    this.onChoose?.(i, this.hintsUsed);
  }

  // Kind feedback after the answer (fb from ctx.learning.answer): the right answer lights up green, a wrong choice only
  // turns amber, the funny reaction comes first and after a mistake the correct answer and the explanation.
  feedback(fb) {
    this.fb = fb;
    this.marks.fill(null);
    const right = this.view.answers.findIndex(a => a.correct);
    if (right >= 0) this.marks[right] = 'good';
    if (!fb.ok && this.chosen !== right && this.chosen >= 0) this.marks[this.chosen] = 'soft';
    this.render();
  }

  // Re-resolves every text after a language switch.
  retext() {
    if (!this.q && !this.message) return;
    if (this.q) this.view = this.ctx.learning.localize(this.q);
    this.render();
  }

  hide() {
    this.q = null;
    this.message = null;
    this.locked = true;
    this.question.setText('');
    for (const r of this.rows) { r.bg.setVisible(false); r.text.setVisible(false); }
    this.hint.bg.setVisible(false);
    this.hint.text.setVisible(false);
    this.note.setText('');
  }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
