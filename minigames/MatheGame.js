import { Minigame } from './Minigame.js';
import { QuestionPanel } from './ui/QuestionPanel.js';
import { Keypad } from './ui/Keypad.js';
import { BlockField } from './ui/BlockField.js';
import { blockable, blockSet, comboSparkles, fallMsFor, makePlan, modeAt, sprintable, winnerOf } from './matheCore.js';
import { uiText } from '../ui/uiKit.js';

const CHALK = { frame: 0x2f5d46, frameAlpha: 0.97, edge: 0x8b5a2b };

// The Mathe minigame (story 4.2), one id with two modes picked per run by data/minigames.json options.mix:
//   sprint  "Kopfrechen-Sprint": learning-engine questions in a chalkboard QuestionPanel (answer buttons) or on the
//           numeric Keypad for typed items.
//   blocks  "Fallende Bloecke": the answer blocks fall in lanes, the player moves the catcher and takes the right one.
// Both ask ctx.learning.next('mathe') per player, feed every answer to the engine through record() and count the same
// way. A wrong answer or a landed block only shows the right answer, the explanation and a funny line, then the round
// goes on (no lives). Two players play side by side with their own streams; at the end the leader is cheered gently
// (cosmetic only, both get the full reward).
export class MatheGame extends Minigame {
  constructor() {
    super('mathe');
  }

  get opts() { return this.def.options; }

  buildGame(slots) {
    const { ctx, opts } = this;
    this.plan = makePlan(opts.mix, Math.random, this.def.durationSeconds * 1000);
    this.over = false;
    this.celebrate = 0;
    this.help = uiText(this, ctx.res.w / 2, ctx.res.h / 2 + 30, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 3, wordWrap: { width: ctx.res.w - 60 }
    }).setOrigin(0.5, 0).setDepth(60);
    this.banner = uiText(this, ctx.res.w / 2, ctx.res.h / 2, '', {
      fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#ffe14d', align: 'center', stroke: '#000000', strokeThickness: 4, wordWrap: { width: ctx.res.w - 40 }
    }).setOrigin(0.5).setDepth(61).setVisible(false);
    this.bannerKey = null;
    for (const slot of slots) {
      const panel = slot.panel = new QuestionPanel(this, ctx, slot.rect, CHALK);
      panel.onChoose = (index, hints) => this.answerChoice(slot, index, hints);
      slot.keypad = new Keypad(this, ctx, slot.rect, panel.rowsTop, { maxDigits: opts.keypadMaxDigits });
      slot.keypad.hintsLeft = () => panel.hintsLeft;
      slot.keypad.onSubmit = text => this.answerTyped(slot, text);
      slot.keypad.onHint = () => panel.useHint();
      slot.field = new BlockField(this, ctx, slot.rect);
      slot.field.onResult = result => this.answerBlock(slot, result);
      slot.tag = uiText(this, slot.rect.x + slot.rect.w / 2, 20, '', { fontFamily: 'monospace', fontSize: '8px', color: '#9fd0ff' }).setOrigin(0.5).setDepth(20);
      slot.mode = null;
      slot.q = null;
      slot.shownAt = 0;
      slot.wait = 0;
    }
  }

  onStart() {
    this.help.setVisible(false);
    for (const slot of this.slots) this.ask(slot);
  }

  retext() {
    super.retext();
    const { ctx } = this;
    this.help.setText(ctx.t(`minigame.mathe.help.${this.plan.first}`));
    for (const slot of this.slots) {
      slot.tag.setText(slot.mode ? ctx.t(`minigame.mathe.mode.${slot.mode}`) : '');
      slot.keypad.retext();
      slot.field.retext();
    }
    if (this.bannerKey) this.banner.setText(ctx.t(this.bannerKey.key, this.bannerKey.params));
  }

  // The panel hint button of typed questions is replaced by the keypad's own hint key.
  navigate(slot, nav) {
    if (!slot.q) return;
    if (slot.mode === 'blocks') slot.field.nav(nav);
    else if (slot.q.type === 'typed') slot.keypad.nav(nav);
    else slot.panel.nav(nav);
  }

  updateGame(dt) {
    if (this.over) {
      if (this.celebrate > 0 && (this.celebrate -= dt) <= 0) super.finish();
      return;
    }
    for (const slot of this.slots) {
      if (slot.wait > 0 && (slot.wait -= dt) <= 0) this.ask(slot);
      if (slot.mode === 'blocks' && slot.field.update(dt) === 'landed') this.landed(slot);
    }
  }

  ask(slot) {
    if (this.over) return;
    const mode = modeAt(this.plan, this.clock.elapsedMs);
    if (mode !== slot.mode) this.switchMode(slot, mode);
    slot.q = this.nextQuestion(slot, mode);
    slot.shownAt = this.clock.elapsedMs;
    if (mode === 'blocks') {
      const view = this.ctx.learning.localize(slot.q);
      const set = blockSet(slot.q, view.answers.map(a => a.text));
      slot.field.show(slot.q, set, fallMsFor(this.opts.fall, slot.q.meta));
      return;
    }
    slot.panel.externalHints = slot.q.type === 'typed';
    slot.panel.show(slot.q);
    if (slot.q.type === 'typed') slot.keypad.show();
  }

  switchMode(slot, mode) {
    const first = slot.mode === null;
    slot.mode = mode;
    slot.panel.hide();
    slot.keypad.hide();
    slot.field.hide();
    slot.tag.setText(this.ctx.t(`minigame.mathe.mode.${mode}`));
    if (!first) this.pop.pop(slot.rect.x + slot.rect.w / 2, slot.rect.y + 40, this.ctx.t(`minigame.mathe.mode.${mode}`), { color: '#9fd0ff' });
  }

  nextQuestion(slot, mode) {
    const { opts } = this;
    const fits = mode === 'blocks'
      ? q => blockable(q, { maxChars: opts.blockMaxChars, maxDigits: opts.keypadMaxDigits })
      : q => sprintable(q, opts.keypadMaxDigits);
    // The fit is part of the engine filter: a due (repetition) item that does not fit this mode must not be returned again and again.
    const q = this.ctx.learning.next('mathe', { player: slot.index, context: this.context, filter: fits });
    if (!q) throw new Error(`mathe: no ${mode} question found`);
    return q;
  }

  answerChoice(slot, index, hints) {
    const ok = this.ctx.learning.isCorrect(slot.q, index);
    this.settle(slot, ok, hints, fb => slot.panel.feedback(fb), this.sprintPopAt(slot));
  }

  answerTyped(slot, text) {
    const ok = this.ctx.learning.isCorrect(slot.q, text);
    slot.keypad.lock();
    this.settle(slot, ok, slot.panel.hintsUsed, fb => slot.panel.feedback(fb), this.sprintPopAt(slot));
  }

  answerBlock(slot, { lane, ok }) {
    this.settle(slot, ok, slot.field.hintsUsed, fb => slot.field.reveal({ lane, ok }, fb), slot.field.blockCenter(lane));
  }

  landed(slot) {
    this.settle(slot, false, slot.field.hintsUsed, fb => slot.field.reveal(null, fb, true), null);
  }

  sprintPopAt(slot) {
    return { x: slot.rect.x + slot.rect.w / 2, y: slot.panel.rowsTop - 6 };
  }

  // One answer: engine + tally, the view's friendly feedback, the pause before the next question and the sparkles.
  settle(slot, ok, hints, show, at) {
    if (this.over) return;
    const { cfg, opts } = this;
    const feedback = this.record(slot, slot.q, ok, this.clock.elapsedMs - slot.shownAt, hints);
    show(feedback);
    slot.wait = ok ? cfg.feedbackCorrectMs : cfg.feedbackWrongMs;
    if (!ok || !at) return;
    const streak = slot.tally.streak;
    const label = streak >= opts.combo.from ? this.ctx.t('minigame.mathe.combo', { n: streak }) : '+1';
    this.pop.pop(at.x, at.y, label, { sparkle: comboSparkles(streak, opts.combo) });
  }

  // Two players: a short gentle cheer for the leader before the result screen. Quitting or leaving ends at once.
  finish(opts = {}) {
    if (this.finished || (this.over && !opts.quit && !opts.silent)) return;
    this.over = true;
    if (opts.quit || opts.silent || this.slots.length < 2) { super.finish(opts); return; }
    const winner = winnerOf(this.slots.map(s => s.tally));
    const { ctx } = this;
    for (const slot of this.slots) slot.wait = 0;
    this.bannerKey = winner < 0
      ? { key: 'minigame.mathe.tie' }
      : { key: 'minigame.mathe.winner', params: { name: ctx.players[this.slots[winner].index].character?.name ?? ctx.t('menu.slot.player', { n: this.slots[winner].index + 1 }) } };
    this.banner.setText(ctx.t(this.bannerKey.key, this.bannerKey.params)).setVisible(true);
    for (const [i, slot] of this.slots.entries()) {
      const star = i === winner ? 24 : 8;
      this.pop.pop(slot.rect.x + slot.rect.w / 2, slot.rect.y + slot.rect.h / 2 + 30, '*', { sparkle: star });
    }
    this.celebrate = this.opts.celebrateMs;
  }
}
