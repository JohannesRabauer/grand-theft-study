import { Minigame } from './Minigame.js';
import { QuestionPanel } from './ui/QuestionPanel.js';
import { Keypad } from './ui/Keypad.js';
import { BeltField } from './ui/BeltField.js';
import { BINS, LETTER, LetterPadModel, MODES, beltMsFor, beltable, comboSparkles, laneX, makePlan, matchTyped, modeAt, spellable, winnerOf } from './deutschCore.js';
import { uiText } from '../ui/uiKit.js';

const CHALK = { frame: 0x2f5d46, frameAlpha: 0.97, edge: 0x8b5a2b };
const TYPE_GUARD_MS = 160; // cursor steps right after a physical key press are the letter itself (WASD, F, Enter)

// The Deutsch minigame (story 4.3), one id with two modes picked per run by data/minigames.json options.mix:
//   belt   "Artikel-Sortierer": a noun rides a conveyor belt, the player sorts it into the der, die or das bin
//          (ui/BeltField.js; the belt time comes from the engine's difficulty and timeFactor).
//   spell  "Rechtschreib-Detektiv": spelling items in a chalkboard QuestionPanel (answer buttons) or, for typed items, on
//          the letter pad (ui/Keypad.js with the LetterPadModel: arrows + confirm, tap, and the physical keyboard when one
//          player plays; ä ö ü ß and Shift are on the pad).
// Both ask ctx.learning.next('deutsch', { filter }) per player (belt: the 'artikel' sub-tag, spell: the spelling
// sub-tags), feed every answer to the engine through record() and count the same way. A wrong answer or a noun that rode
// off the belt only shows the right answer, the explanation and a funny line, then the round goes on (no lives). Two
// players play side by side with their own streams; at the end the leader is cheered gently (cosmetic only, both get the
// full reward).
export class DeutschGame extends Minigame {
  constructor() {
    super('deutsch');
  }

  get opts() { return this.def.options; }

  buildGame(slots) {
    const { ctx, opts } = this;
    this.plan = makePlan(opts.mix, Math.random, this.def.durationSeconds * 1000, MODES);
    this.over = false;
    this.celebrate = 0;
    this.typedAt = -1e9;
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
      slot.pad = new Keypad(this, ctx, slot.rect, panel.rowsTop, { model: new LetterPadModel(opts.padMaxChars), keyH: 15, displayH: 18, pickKeys: false });
      slot.pad.hintsLeft = () => panel.hintsLeft;
      slot.pad.onSubmit = text => this.answerTyped(slot, text);
      slot.pad.onHint = () => panel.useHint();
      slot.belt = new BeltField(this, ctx, slot.rect);
      slot.belt.onResult = result => this.answerBin(slot, result);
      slot.tag = uiText(this, slot.rect.x + slot.rect.w / 2, 20, '', { fontFamily: 'monospace', fontSize: '8px', color: '#9fd0ff' }).setOrigin(0.5).setDepth(20);
      slot.icons = { belt: this.makeBeltIcon(), spell: this.makeLensIcon() };
      slot.mode = null;
      slot.q = null;
      slot.shownAt = 0;
      slot.wait = 0;
    }
    if (slots.length === 1 && this.input.keyboard) {
      this.input.keyboard.on('keydown', this.onKey, this);
      this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this.onKey, this));
    }
  }

  // Header icons beside the mode name: a crate on a belt and the detective's magnifying glass.
  makeBeltIcon() {
    const g = this.add.graphics().setDepth(20).setVisible(false);
    g.fillStyle(0x3b3f4a).fillRect(-6, 2, 12, 3).fillStyle(0xd9a15a).fillRect(-3, -4, 6, 6).lineStyle(1, 0x6b4423).strokeRect(-3, -4, 6, 6);
    return g;
  }

  makeLensIcon() {
    const g = this.add.graphics().setDepth(20).setVisible(false);
    g.lineStyle(2, 0xffe14d).strokeCircle(-1, -1, 4).lineStyle(3, 0x8b5a2b).lineBetween(2, 2, 6, 6);
    g.fillStyle(0xffffff, 0.8).fillRect(-3, -3, 2, 1);
    return g;
  }

  placeIcon(slot) {
    for (const [mode, icon] of Object.entries(slot.icons)) {
      icon.setVisible(slot.mode === mode).setScale(1.4).setPosition(slot.tag.x - slot.tag.width / 2 - 11, 20);
    }
  }

  onStart() {
    this.help.setVisible(false);
    for (const slot of this.slots) this.ask(slot);
  }

  retext() {
    super.retext();
    const { ctx } = this;
    this.help.setText(ctx.t(`minigame.deutsch.help.${this.plan.first}`));
    for (const slot of this.slots) {
      slot.tag.setText(slot.mode ? ctx.t(`minigame.deutsch.mode.${slot.mode}`) : '');
      slot.pad.retext();
      slot.belt.retext();
      this.placeIcon(slot);
    }
    if (this.bannerKey) this.banner.setText(ctx.t(this.bannerKey.key, this.bannerKey.params));
  }

  // The panel hint button of typed questions is replaced by the pad's own hint key.
  navigate(slot, nav) {
    if (!slot.q) return;
    if (slot.mode === 'belt') slot.belt.nav(nav);
    else if (slot.q.type === 'typed') { if (this.time.now - this.typedAt > TYPE_GUARD_MS) slot.pad.nav(nav); }
    else slot.panel.nav(nav);
  }

  // Physical keyboard typing for a single player's typed item: letters (incl. ä ö ü ß), Backspace and Enter.
  onKey(event) {
    const slot = this.slots[0];
    if (!this.live || this.over || slot.mode !== 'spell' || slot.q?.type !== 'typed' || slot.pad.locked || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Backspace') slot.pad.press('back');
    else if (event.key === 'Enter') slot.pad.press('ok');
    else if (LETTER.test(event.key)) slot.pad.typeChar(event.key);
    else return;
    this.typedAt = this.time.now;
  }

  updateGame(dt) {
    if (this.over) {
      if (this.celebrate > 0 && (this.celebrate -= dt) <= 0) super.finish();
      return;
    }
    for (const slot of this.slots) {
      if (slot.wait > 0 && (slot.wait -= dt) <= 0) this.ask(slot);
      if (slot.mode === 'belt' && slot.belt.update(dt, this.time.now) === 'missed') this.missed(slot);
    }
  }

  ask(slot) {
    if (this.over) return;
    const mode = modeAt(this.plan, this.clock.elapsedMs);
    if (mode !== slot.mode) this.switchMode(slot, mode);
    slot.q = this.nextQuestion(slot, mode);
    slot.shownAt = this.clock.elapsedMs;
    if (mode === 'belt') {
      slot.belt.show(slot.q, beltMsFor(this.opts.belt, slot.q.meta));
      return;
    }
    slot.panel.externalHints = slot.q.type === 'typed';
    slot.panel.show(slot.q);
    if (slot.q.type === 'typed') slot.pad.show();
  }

  switchMode(slot, mode) {
    const first = slot.mode === null;
    slot.mode = mode;
    slot.panel.hide();
    slot.pad.hide();
    slot.belt.hide();
    slot.tag.setText(this.ctx.t(`minigame.deutsch.mode.${mode}`));
    this.placeIcon(slot);
    if (!first) this.pop.pop(slot.rect.x + slot.rect.w / 2, slot.rect.y + 40, this.ctx.t(`minigame.deutsch.mode.${mode}`), { color: '#9fd0ff' });
  }

  nextQuestion(slot, mode) {
    const { opts } = this;
    const filter = mode === 'belt' ? opts.beltTags : opts.spellTags;
    const fits = mode === 'belt' ? beltable : q => spellable(q, { maxChars: opts.padMaxChars, maxAnswers: 4 });
    for (let tries = 0; tries < 60; tries++) {
      const q = this.ctx.learning.next('deutsch', { player: slot.index, context: this.context, filter });
      if (q && fits(q)) return q;
    }
    throw new Error(`deutsch: no ${mode} question found`);
  }

  answerChoice(slot, index, hints) {
    const ok = this.ctx.learning.isCorrect(slot.q, index);
    this.settle(slot, ok, hints, fb => slot.panel.feedback(fb), this.panelPopAt(slot));
  }

  // Letter case and umlaut spelling are item rules (matchTyped); the engine confirms the matched accepted answer.
  answerTyped(slot, text) {
    const matched = matchTyped(slot.q, text);
    const ok = matched !== null && this.ctx.learning.isCorrect(slot.q, matched);
    slot.pad.lock();
    this.settle(slot, ok, slot.panel.hintsUsed, fb => slot.panel.feedback(fb), this.panelPopAt(slot));
  }

  answerBin(slot, { lane, ok }) {
    this.settle(slot, ok, slot.belt.hintsUsed, fb => slot.belt.reveal({ lane, ok }, fb), { x: laneX(slot.rect.x, slot.rect.w, lane, BINS.length), y: slot.belt.binTop });
  }

  missed(slot) {
    this.settle(slot, false, slot.belt.hintsUsed, fb => slot.belt.reveal(null, fb, true), null);
  }

  panelPopAt(slot) {
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
    const label = streak >= opts.combo.from ? this.ctx.t('minigame.deutsch.combo', { n: streak }) : '+1';
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
      ? { key: 'minigame.deutsch.tie' }
      : { key: 'minigame.deutsch.winner', params: { name: ctx.players[this.slots[winner].index].character?.name ?? ctx.t('menu.slot.player', { n: this.slots[winner].index + 1 }) } };
    this.banner.setText(ctx.t(this.bannerKey.key, this.bannerKey.params)).setVisible(true);
    for (const [i, slot] of this.slots.entries()) {
      const star = i === winner ? 24 : 8;
      this.pop.pop(slot.rect.x + slot.rect.w / 2, slot.rect.y + slot.rect.h / 2 + 30, '*', { sparkle: star });
    }
    this.celebrate = this.opts.celebrateMs;
  }
}
