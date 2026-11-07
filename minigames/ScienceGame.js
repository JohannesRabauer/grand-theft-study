import { DuelMinigame } from './DuelMinigame.js';
import { QuestionPanel } from './ui/QuestionPanel.js';
import { SortLab } from './ui/SortLab.js';
import { CircuitBoard } from './ui/CircuitBoard.js';
import { pickCell, solved } from './circuitCore.js';
import { MODES, binOf, circuitable, comboSparkles, kindFor, layoutFor, makePlan, misplaced, modeAt, puzzleFix, quizzable, shuffle, sortSet, sortable, stepBin } from './scienceCore.js';
import { uiText } from '../ui/uiKit.js';

const WALL = 0x2c4f55;
const TILE_LINE = 0x3d6a70;
const TABLE = 0x3b2a1e;
const TABLE_EDGE = 0x8b5a2b;
const WALL_H = 30;
const MAX_WRONG_LINES = 3;

// The Science minigame (story 4.5), one id with two modes picked per run by data/minigames.json options.mix, plus short
// Quick-Quiz questions between the puzzles so the whole topic is covered. Items come from ctx.learning.next('science', { filter }).
//   sort     "Sortier-Labor": the items of a sort task (or the left sides of a match task, bins = the right sides) arrive
//            one by one as lab cards; the player drags a card into a test-tube bin, taps a bin, or uses the cursor (left/right
//            + confirm) or the number keys. After the last item the engine's isCorrect judges the whole set at once.
//   circuit  "Stromkreis-Tüftler": a drawn loop with a dark bulb (circuitCore.js solves it); the player picks the part that
//            stops the current (cursor, number keys or tap). A needed repair is applied; with the last one the bulb lights
//            up. A part that works already ends the puzzle: a gentle line says why the current still cannot flow and the
//            solution lights the bulb.
//   quiz     Quick-Quiz: any other choice item in the answer panel.
// Every task goes through record() into the engine. A wrong answer only shows the right one, the explanation, the item's
// fun fact and a funny line (no lives); two players play side by side with their own lab and question stream.
export class ScienceGame extends DuelMinigame {
  constructor() {
    super('science');
  }

  get opts() { return this.def.options; }

  buildGame(slots) {
    const { ctx } = this;
    this.plan = makePlan(this.opts.mix, Math.random, this.def.durationSeconds * 1000, MODES);
    this.initCheer();
    this.help = uiText(this, ctx.res.w / 2, ctx.res.h / 2 + 30, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 3, wordWrap: { width: ctx.res.w - 60 }
    }).setOrigin(0.5, 0).setDepth(60);
    for (const slot of slots) {
      const { rect } = slot;
      this.drawLab(rect);
      slot.lab = new SortLab(this, ctx, rect);
      slot.lab.onBin = b => this.dropBin(slot, b);
      slot.lab.onHint = () => this.useHint(slot);
      slot.board = new CircuitBoard(this, ctx, rect);
      slot.board.onPick = i => this.pickPart(slot, i);
      slot.panel = new QuestionPanel(this, ctx, layoutFor(rect, 'quiz').panel, { frame: 0x1d3b44, frameAlpha: 0.97, edge: 0x4dabf7 });
      slot.panel.showFact = true;
      slot.panel.note.setMaxLines(9);
      slot.panel.onChoose = (index, hints) => this.answerQuiz(slot, index, hints);
      slot.note = uiText(this, rect.x + 6, rect.y, '', { fontFamily: 'monospace', fontSize: rect.w > 300 ? '9px' : '8px', color: '#9be58f', wordWrap: { width: rect.w - 12 }, maxLines: 9 }).setDepth(16);
      slot.tag = uiText(this, rect.x + rect.w / 2, 20, '', { fontFamily: 'monospace', fontSize: '8px', color: '#9fd0ff' }).setOrigin(0.5).setDepth(20);
      slot.kind = null;
      slot.since = 0; // puzzles since the last Quick-Quiz
      slot.q = null;
      slot.view = null;
      slot.locked = true;
      slot.shownAt = 0;
      slot.wait = 0;
      slot.fb = null;
      slot.set = null; // sort: bins and items
      slot.order = [];
      slot.pos = 0;
      slot.resp = [];
      slot.bad = [];
      slot.hints = 0;
      slot.cells = []; // circuit: the cells now
      slot.fix = [];
      slot.fixed = [];
      slot.why = null;
    }
  }

  // The lab: tiled wall strip on top, dark wooden table below.
  drawLab(rect) {
    const g = this.add.graphics().setDepth(9);
    g.fillStyle(WALL).fillRect(rect.x, rect.y, rect.w, WALL_H);
    g.lineStyle(1, TILE_LINE, 0.8);
    for (let x = rect.x + 20; x < rect.x + rect.w; x += 20) g.lineBetween(x, rect.y, x, rect.y + WALL_H);
    g.lineBetween(rect.x, rect.y + WALL_H / 2, rect.x + rect.w, rect.y + WALL_H / 2);
    g.fillStyle(TABLE).fillRect(rect.x, rect.y + WALL_H, rect.w, rect.h - WALL_H);
    g.fillStyle(TABLE_EDGE).fillRect(rect.x, rect.y + WALL_H, rect.w, 3);
    g.lineStyle(1, 0x4b3828, 0.9);
    for (let y = rect.y + WALL_H + 22; y < rect.y + rect.h; y += 22) g.lineBetween(rect.x, y, rect.x + rect.w, y);
    g.lineStyle(3, TABLE_EDGE).strokeRect(rect.x, rect.y, rect.w, rect.h);
  }

  onStart() {
    this.help.setVisible(false);
    for (const slot of this.slots) this.ask(slot);
  }

  retext() {
    super.retext();
    const { ctx } = this;
    this.help.setText(ctx.t(`minigame.science.help.${this.plan.first}`));
    for (const slot of this.slots) {
      if (!slot.kind) continue;
      slot.tag.setText(ctx.t(`minigame.science.mode.${slot.kind}`));
      slot.view = ctx.learning.localize(slot.q);
      if (slot.kind === 'sort') {
        slot.set = sortSet(slot.q, slot.view);
        slot.lab.retext(slot.set, slot.view.q);
      } else if (slot.kind === 'circuit') {
        slot.board.setQuestion(ctx.t('minigame.science.circuit.ask'));
        slot.board.refresh();
      }
      this.showNote(slot);
    }
  }

  navigate(slot, nav) {
    if (!slot.q) return;
    if (slot.kind === 'quiz') { slot.panel.nav(nav); return; }
    if (slot.locked) return;
    if (slot.kind === 'sort') {
      const n = slot.set.cats.length;
      if (nav.dx) slot.lab.setFocus(stepBin(slot.lab.focus, nav.dx, n));
      if (nav.dy) this.useHint(slot);
      if (nav.pick > 0 && nav.pick <= n) this.dropBin(slot, nav.pick - 1);
      else if (nav.confirm) this.dropBin(slot, slot.lab.focus);
      return;
    }
    const n = slot.cells.length;
    const step = nav.dx || nav.dy;
    if (step) slot.board.setFocus(stepBin(slot.board.focus, step, n));
    if (nav.pick > 0 && nav.pick <= n) this.pickPart(slot, nav.pick - 1);
    else if (nav.confirm) this.pickPart(slot, slot.board.focus);
  }

  updateGame(dt) {
    if (this.cheering(dt)) return;
    for (const slot of this.slots) {
      if (slot.wait > 0 && (slot.wait -= dt) <= 0) this.ask(slot);
      if (slot.kind === 'circuit') slot.board.tick(dt);
    }
  }

  onCheer(slot) { slot.wait = 0; }

  // ---- the next task ----

  ask(slot) {
    if (this.over) return;
    const kind = kindFor(modeAt(this.plan, this.clock.elapsedMs), slot.since, this.opts.quizEvery);
    slot.q = this.nextQuestion(slot, kind);
    slot.since = kind === 'quiz' ? 0 : slot.since + 1;
    slot.shownAt = this.clock.elapsedMs;
    slot.fb = null;
    slot.why = null;
    slot.bad = [];
    slot.hints = 0;
    slot.view = this.ctx.learning.localize(slot.q);
    this.showKind(slot, kind);
    if (kind === 'sort') this.startSort(slot);
    else if (kind === 'circuit') this.startCircuit(slot);
    else slot.panel.show(slot.q);
  }

  nextQuestion(slot, kind) {
    const filter = kind === 'sort' ? sortable : kind === 'circuit' ? circuitable : quizzable;
    const q = this.ctx.learning.next('science', { player: slot.index, context: this.context, filter });
    if (!q) throw new Error(`science: no ${kind} question found`);
    return q;
  }

  // Shows the views of one kind and hides the others.
  showKind(slot, kind) {
    const { ctx } = this;
    const previous = slot.kind;
    slot.kind = kind;
    slot.lab.hide();
    slot.board.hide();
    slot.panel.hide();
    slot.panel.back.setVisible(kind === 'quiz');
    const { note } = layoutFor(slot.rect, kind === 'quiz' ? 'sort' : kind);
    slot.note.setPosition(note.x, note.y).setText('').setVisible(kind !== 'quiz');
    slot.tag.setText(ctx.t(`minigame.science.mode.${kind}`));
    if (previous !== null && previous !== kind) this.pop.pop(slot.rect.x + slot.rect.w / 2, slot.rect.y + 40, ctx.t(`minigame.science.mode.${kind}`), { color: '#9fd0ff' });
  }

  // ---- Sortier-Labor ----

  startSort(slot) {
    slot.set = sortSet(slot.q, slot.view);
    const n = slot.set.items.length;
    slot.order = shuffle([...Array(n).keys()]);
    slot.pos = 0;
    slot.resp = new Array(n);
    slot.lab.show(slot.set, slot.view.q);
    slot.lab.setCard(slot.set, slot.order[0]);
    slot.lab.setHint(this.hintsLeft(slot) > 0);
    slot.locked = false;
  }

  hintsLeft(slot) {
    return Math.min(slot.q.meta.hintsAllowed, slot.view.hints.length) - slot.hints;
  }

  useHint(slot) {
    if (slot.locked || slot.kind !== 'sort' || this.hintsLeft(slot) <= 0) return;
    slot.hints++;
    slot.lab.setHint(this.hintsLeft(slot) > 0);
    this.showNote(slot);
  }

  dropBin(slot, b) {
    if (slot.locked || slot.kind !== 'sort' || this.over || !this.live) return;
    const item = slot.order[slot.pos];
    slot.resp[item] = slot.set.cats[b].id;
    slot.lab.place(b);
    slot.pos++;
    if (slot.pos < slot.order.length) { slot.lab.setCard(slot.set, slot.order[slot.pos]); return; }
    slot.lab.setCard(slot.set, null);
    this.finishSort(slot);
  }

  finishSort(slot) {
    const { ctx } = this;
    const { rect } = slot;
    slot.locked = true;
    const ok = ctx.learning.isCorrect(slot.q, slot.resp);
    slot.bad = misplaced(slot.set, slot.resp);
    slot.fb = this.record(slot, slot.q, ok, this.clock.elapsedMs - slot.shownAt, slot.hints);
    const flags = slot.set.cats.map(() => false);
    for (const i of slot.bad) flags[slot.set.cats.findIndex(c => c.id === slot.resp[i])] = true;
    slot.lab.setHint(false);
    slot.lab.reveal(flags);
    this.showNote(slot);
    this.settle(slot, ok, { x: rect.x + rect.w / 2, y: slot.lab.home.y });
  }

  // ---- Stromkreis-Tüftler ----

  startCircuit(slot) {
    slot.fix = puzzleFix(slot.q);
    slot.cells = slot.q.circuit.cells;
    slot.fixed = [];
    slot.board.show(slot.cells, this.ctx.t('minigame.science.circuit.ask'));
    slot.locked = false;
  }

  pickPart(slot, i) {
    const cell = slot.cells[i];
    if (slot.locked || slot.kind !== 'circuit' || this.over || !this.live || !cell || slot.fixed.includes(cell.id)) return;
    const r = pickCell(slot.cells, slot.fix, cell.id);
    if (r.kind === 'wrong') {
      slot.why = { reason: r.why, id: cell.id };
      slot.board.mark(cell.id, 'soft');
      this.finishCircuit(slot, false);
      return;
    }
    slot.cells = r.cells;
    slot.fixed.push(cell.id);
    slot.board.mark(cell.id, 'good');
    slot.board.setCells(r.cells);
    if (r.done) this.finishCircuit(slot, true); else this.showNote(slot);
  }

  finishCircuit(slot, ok) {
    slot.locked = true;
    slot.board.lock();
    if (!ok) slot.board.setCells(solved(slot.cells, slot.fix)); // the solution lights the bulb
    slot.fb = this.record(slot, slot.q, ok, this.clock.elapsedMs - slot.shownAt, 0);
    this.showNote(slot);
    this.settle(slot, ok, slot.board.spot);
  }

  // ---- Quick-Quiz ----

  answerQuiz(slot, index, hints) {
    const ok = this.ctx.learning.isCorrect(slot.q, index);
    const fb = this.record(slot, slot.q, ok, this.clock.elapsedMs - slot.shownAt, hints);
    slot.panel.feedback(fb);
    this.settle(slot, ok, { x: slot.rect.x + slot.rect.w / 2, y: slot.panel.hintY + 4 });
  }

  // ---- feedback ----

  // The note under a sort or circuit task from the slot's state (rebuilt after a language switch).
  showNote(slot) {
    const { ctx } = this;
    const { fb, view } = slot;
    if (slot.kind === 'quiz') return;
    const lines = [];
    if (slot.kind === 'sort' && !fb) {
      if (slot.hints > 0) lines.push(ctx.t('minigame.hintLine', { hint: view.hints[slot.hints - 1] }));
    } else if (slot.kind === 'circuit' && !fb) {
      if (slot.fixed.length) lines.push(ctx.t('minigame.science.circuit.partial'));
    } else if (fb) {
      lines.push(ctx.t(fb.reaction));
      if (fb.ok) {
        if (slot.kind === 'circuit') lines.push(ctx.t('minigame.science.circuit.lit'));
      } else {
        if (slot.kind === 'sort') {
          for (const i of slot.bad.slice(0, MAX_WRONG_LINES)) lines.push(ctx.t('minigame.science.belongs', { item: slot.set.items[i].text, bin: slot.set.cats[binOf(slot.set, i)].label }));
        } else if (slot.why) lines.push(ctx.t(`minigame.science.why.${slot.why.reason}`, { item: this.partName(slot) }));
        lines.push(view.explain);
        if (view.fact) lines.push(ctx.t('minigame.fact', { fact: view.fact }));
      }
    }
    slot.note.setColor(fb && !fb.ok ? '#ffd27a' : fb ? '#9be58f' : '#9fd0ff').setText(lines.join('\n'));
  }

  // The shown name of the part that was picked.
  partName(slot) {
    const { ctx } = this;
    const cell = slot.q.circuit.cells.find(c => c.id === slot.why.id);
    return cell.kind === 'bridge' ? cell.item?.[ctx.i18n.lang] ?? cell.item?.de : ctx.t(`minigame.science.cell.${cell.kind}`);
  }

  // The pause before the next task and the sparkles of a right answer.
  settle(slot, ok, at) {
    const { cfg, opts } = this;
    const fact = slot.q.fact ? opts.factExtraMs : 0;
    slot.wait = ok ? (slot.kind === 'circuit' ? opts.litMs : cfg.feedbackCorrectMs) : cfg.feedbackWrongMs + fact;
    if (!ok) return;
    const streak = slot.tally.streak;
    const label = streak >= opts.combo.from ? this.ctx.t('minigame.science.combo', { n: streak }) : '+1';
    this.pop.pop(at.x, at.y, label, { sparkle: comboSparkles(streak, opts.combo) });
  }
}
