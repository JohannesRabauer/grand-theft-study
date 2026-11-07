import { DuelMinigame } from './DuelMinigame.js';
import { QuestionPanel } from './ui/QuestionPanel.js';
import { Keypad } from './ui/Keypad.js';
import { CardGrid } from './ui/CardGrid.js';
import { SignPlate } from './ui/SignPlate.js';
import { LETTER, LetterPadModel, MODES, MemoryBoard, comboSparkles, dealBoard, makePlan, matchTyped, modeAt, spellable } from './englischCore.js';
import { uiText } from '../ui/uiKit.js';

const CHALK = { frame: 0x2f5d46, frameAlpha: 0.97, edge: 0x8b5a2b };
const TYPE_GUARD_MS = 160; // cursor steps right after a physical key press are the letter itself (WASD, F, Enter)
const PLATE_H = 54; // the sign plate covers the question area of the panel (rows start at 58)

// The Englisch minigame (story 4.4), one id with two modes picked per run by data/minigames.json options.mix; every text
// is shown in both languages (the topic is bothLangs):
//   memory  "Vokabel-Memory": a board of face-down cards, English words and their German meanings (and sign words), flip two
//           to match a pair (ui/CardGrid.js, MemoryBoard in englischCore.js). A board is dealt from engine items: one
//           `match` item (its 3-4 pairs, one answer when the board is done) or four vocabulary / sign `choice` items (each
//           pair is its own answer when matched). A pair counts as right unless the player flipped two already-seen cards
//           that did not belong together too often (`memory.maxFaults`); first-time flips are never mistakes.
//   signs   "Schilder-Check": a shop-sign plate (ui/SignPlate.js) with a word like OPEN, PUSH or BAKERY, pick its meaning
//           in the chalkboard QuestionPanel; typed sign items use the letter pad (ui/Keypad.js, as in Deutsch).
// Both ask ctx.learning.next('englisch', { filter }) per player and feed every answer to the engine through record(). A
// wrong answer only shows the right one, the explanation and a funny line (no lives). Two players play side by side.
export class EnglischGame extends DuelMinigame {
  constructor() {
    super('englisch');
  }

  get opts() { return this.def.options; }

  buildGame(slots) {
    const { ctx, opts } = this;
    this.plan = makePlan(opts.mix, Math.random, this.def.durationSeconds * 1000, MODES);
    this.initCheer();
    this.typedAt = -1e9;
    this.help = uiText(this, ctx.res.w / 2, ctx.res.h / 2 + 30, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 3, wordWrap: { width: ctx.res.w - 60 }
    }).setOrigin(0.5, 0).setDepth(60);
    for (const slot of slots) {
      const { rect } = slot;
      const panel = slot.panel = new QuestionPanel(this, ctx, rect, CHALK);
      panel.onChoose = (index, hints) => this.answerChoice(slot, index, hints);
      slot.pad = new Keypad(this, ctx, rect, panel.rowsTop, { model: new LetterPadModel(opts.padMaxChars), keyH: 15, displayH: 18, pickKeys: false });
      slot.pad.hintsLeft = () => panel.hintsLeft;
      slot.pad.onSubmit = text => this.answerTyped(slot, text);
      slot.pad.onHint = () => panel.useHint();
      slot.plate = new SignPlate(this, { x: rect.x + 4, y: rect.y + 4, w: rect.w - 8, h: PLATE_H - 4 }, { frame: CHALK.frame });
      slot.grid = new CardGrid(this, ctx, { x: rect.x + 8, y: rect.y + 10, w: rect.w - 16, h: rect.h - 80 });
      slot.grid.onFlip = i => this.flip(slot, i);
      slot.note = uiText(this, rect.x + 8, rect.y + rect.h - 62, '', { fontFamily: 'monospace', fontSize: rect.w > 300 ? '10px' : '8px', color: '#9be58f', wordWrap: { width: rect.w - 16 } }).setDepth(12);
      slot.tag = uiText(this, rect.x + rect.w / 2, 20, '', { fontFamily: 'monospace', fontSize: '8px', color: '#9fd0ff' }).setOrigin(0.5).setDepth(20);
      slot.mode = null;
      slot.q = null;
      slot.deal = null;
      slot.board = null;
      slot.shownAt = 0;
      slot.wait = 0;
      slot.peek = 0;
      slot.fb = null;
    }
    if (slots.length === 1 && this.input.keyboard) {
      this.input.keyboard.on('keydown', this.onKey, this);
      this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this.onKey, this));
    }
  }

  onStart() {
    this.help.setVisible(false);
    for (const slot of this.slots) this.ask(slot);
  }

  retext() {
    super.retext();
    const { ctx } = this;
    this.help.setText(ctx.t(`minigame.englisch.help.${this.plan.first}`));
    for (const slot of this.slots) {
      slot.tag.setText(slot.mode ? ctx.t(`minigame.englisch.mode.${slot.mode}`) : '');
      slot.pad.retext();
      if (slot.plate.visible) slot.plate.retext(ctx.t('minigame.englisch.signAsk'));
      this.showNote(slot);
    }
  }

  navigate(slot, nav) {
    if (!slot.q) return;
    if (slot.mode === 'memory') slot.grid.nav(nav);
    else if (slot.q.type === 'typed') { if (this.time.now - this.typedAt > TYPE_GUARD_MS) slot.pad.nav(nav); }
    else slot.panel.nav(nav);
  }

  // Physical keyboard typing for a single player's typed sign item: letters, Backspace and Enter.
  onKey(event) {
    const slot = this.slots[0];
    if (!this.live || this.over || slot.mode !== 'signs' || slot.q?.type !== 'typed' || slot.pad.locked || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Backspace') slot.pad.press('back');
    else if (event.key === 'Enter') slot.pad.press('ok');
    else if (LETTER.test(event.key)) slot.pad.typeChar(event.key);
    else return;
    this.typedAt = this.time.now;
  }

  updateGame(dt) {
    if (this.cheering(dt)) return;
    for (const slot of this.slots) {
      if (slot.peek > 0 && (slot.peek -= dt) <= 0) {
        slot.board.settle();
        slot.grid.refresh();
      }
      if (slot.wait > 0 && (slot.wait -= dt) <= 0) this.ask(slot);
    }
  }

  onCheer(slot) { slot.wait = 0; }

  ask(slot) {
    if (this.over) return;
    const mode = modeAt(this.plan, this.clock.elapsedMs);
    if (mode !== slot.mode) this.switchMode(slot, mode);
    slot.shownAt = this.clock.elapsedMs;
    slot.note.setText('');
    slot.fb = null;
    if (mode === 'memory') {
      this.deal(slot);
      return;
    }
    slot.q = this.nextSign(slot);
    const { q } = slot;
    slot.panel.externalHints = q.type === 'typed';
    slot.panel.show(q);
    if (q.type === 'typed') slot.pad.show();
    else if (q.sign) slot.plate.show(q.sign, this.ctx.t('minigame.englisch.signAsk'));
  }

  switchMode(slot, mode) {
    const first = slot.mode === null;
    slot.mode = mode;
    slot.panel.hide();
    slot.pad.hide();
    slot.plate.hide();
    slot.grid.hide();
    slot.board = null;
    slot.tag.setText(this.ctx.t(`minigame.englisch.mode.${mode}`));
    if (!first) this.pop.pop(slot.rect.x + slot.rect.w / 2, slot.rect.y + 40, this.ctx.t(`minigame.englisch.mode.${mode}`), { color: '#9fd0ff' });
  }

  // ---- Vokabel-Memory ----

  draw(slot, filter) {
    return this.ctx.learning.next('englisch', { player: slot.index, context: this.context, filter });
  }

  // Deals the next board from engine items (englischCore.dealBoard).
  deal(slot) {
    const { opts } = this;
    slot.deal = dealBoard(filter => this.draw(slot, filter), { tags: opts.memoryTags, maxChars: opts.cardMaxChars, pairs: opts.memory.pairs });
    slot.q = slot.deal.qs[0];
    slot.board = new MemoryBoard(slot.deal.entries);
    slot.peek = 0;
    slot.grid.show(slot.board);
    slot.note.setY(slot.grid.bottom + 8);
  }

  flip(slot, i) {
    const { board } = slot;
    if (!board || this.over || !this.live) return;
    const r = board.flip(i);
    if (r.kind === 'ignored') return;
    slot.grid.refresh();
    if (r.kind === 'miss') {
      slot.peek = this.opts.memory.peekMs;
    } else if (r.kind === 'match') {
      const { deal } = slot;
      if (!deal.whole) this.settlePair(slot, r.entry);
      else if (r.complete) this.settlePair(slot, 0);
      if (r.complete) slot.wait = this.cfg.feedbackCorrectMs;
    }
  }

  // One answer of a board: a single-pair item when its pair is matched, a match item when the board is done.
  settlePair(slot, entry) {
    const { board, deal } = slot;
    const { memory } = this.opts;
    const q = deal.qs[entry];
    const ok = deal.whole ? board.totalFaults() <= memory.matchFaults : board.faults[entry] <= memory.maxFaults;
    const ms = this.clock.elapsedMs - slot.shownAt;
    slot.shownAt = this.clock.elapsedMs;
    slot.q = q;
    this.finishAnswer(slot, ok, 0, ms, null, () => {});
  }

  // ---- Schilder-Check ----

  nextSign(slot) {
    const { opts } = this;
    const q = this.draw(slot, c => c.tags.some(t => opts.signTags.includes(t)) && spellable(c, { maxChars: opts.padMaxChars, maxAnswers: 4 }));
    if (!q) throw new Error('englisch: no sign question found');
    return q;
  }

  answerChoice(slot, index, hints) {
    const ok = this.ctx.learning.isCorrect(slot.q, index);
    this.finishAnswer(slot, ok, hints, this.clock.elapsedMs - slot.shownAt, this.panelPopAt(slot), fb => slot.panel.feedback(fb), true);
  }

  answerTyped(slot, text) {
    const matched = matchTyped(slot.q, text);
    const ok = matched !== null && this.ctx.learning.isCorrect(slot.q, matched);
    slot.pad.lock();
    this.finishAnswer(slot, ok, slot.panel.hintsUsed, this.clock.elapsedMs - slot.shownAt, this.panelPopAt(slot), fb => slot.panel.feedback(fb), true);
  }

  panelPopAt(slot) {
    return { x: slot.rect.x + slot.rect.w / 2, y: slot.panel.rowsTop - 6 };
  }

  // One answer: engine + tally, the view's friendly feedback, the pause before the next question and the sparkles. The
  // memory board shows its feedback line under the cards, the sign panel its own note and, for the wrong, the next
  // sign comes after a longer look at the answer. `at` null: pop over the cards.
  finishAnswer(slot, ok, hints, ms, at, show, paused = false) {
    if (this.over) return;
    const { cfg, opts } = this;
    const feedback = this.record(slot, slot.q, ok, ms, hints);
    show(feedback);
    if (slot.mode === 'memory') {
      slot.fb = feedback;
      this.showNote(slot);
    }
    if (paused) slot.wait = ok ? cfg.feedbackCorrectMs : cfg.feedbackWrongMs;
    const streak = slot.tally.streak;
    if (!ok) return;
    const label = streak >= opts.combo.from ? this.ctx.t('minigame.englisch.combo', { n: streak }) : '+1';
    const where = at ?? { x: slot.rect.x + slot.rect.w / 2, y: slot.grid.bottom };
    this.pop.pop(where.x, where.y, label, { sparkle: comboSparkles(streak, opts.combo) });
  }

  // The memory feedback line: the engine's reaction and, after a forgotten pair, the explanation.
  showNote(slot) {
    if (slot.mode !== 'memory') return;
    const { fb } = slot;
    if (!fb) { slot.note.setText(''); return; }
    const { ctx } = this;
    const view = ctx.learning.localize(slot.q);
    slot.note.setColor(fb.ok ? '#9be58f' : '#ffd27a').setText(fb.ok ? ctx.t(fb.reaction) : `${ctx.t(fb.reaction)}
${view.explain}`);
  }
}
