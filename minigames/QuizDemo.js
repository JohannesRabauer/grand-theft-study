import { Minigame } from './Minigame.js';
import { QuestionPanel } from './ui/QuestionPanel.js';

// Debug demo and the template for the real minigames (stories 4.2+): every player answers a stream of learning-engine
// choice questions in an own QuestionPanel until the question limit (quiz-demo: 10) or the shared timer runs out.
// The pattern: fill the slots in buildGame, ask in onStart, advance in updateGame, report with record(), end with finish().
export class QuizDemo extends Minigame {
  constructor(id = 'quiz-demo') {
    super(id);
  }

  get limit() { return this.def.questionCount ?? Infinity; }

  buildGame(slots) {
    for (const slot of slots) {
      slot.panel = new QuestionPanel(this, this.ctx, slot.rect);
      slot.panel.onChoose = (index, hints) => this.answer(slot, index, hints);
      slot.q = null;
      slot.shownAt = 0;
      slot.wait = 0;
      slot.done = false;
    }
  }

  onStart() {
    for (const slot of this.slots) this.ask(slot);
  }

  updateGame(dt) {
    for (const slot of this.slots) {
      if (slot.wait > 0 && (slot.wait -= dt) <= 0) this.ask(slot);
    }
  }

  ask(slot) {
    if (slot.tally.total >= this.limit) {
      slot.done = true;
      if (this.slots.every(s => s.done)) this.finish(); else slot.panel.showMessage('minigame.waiting');
      return;
    }
    slot.q = this.nextQuestion(slot);
    slot.shownAt = this.clock.elapsedMs;
    slot.panel.show(slot.q);
  }

  // The demo panel only has answer buttons for choice items, so other types are skipped.
  nextQuestion(slot) {
    const topics = this.topic ? [this.topic] : this.def.topics;
    for (let tries = 0; tries < 50; tries++) {
      const q = this.ctx.learning.next(topics[(slot.tally.total + tries) % topics.length], { player: slot.index, context: this.context });
      if (q?.type === 'choice') return q;
    }
    throw new Error(`${this.id}: no choice question in ${topics}`);
  }

  answer(slot, index, hintsUsed) {
    const { ctx, cfg } = this;
    const ok = ctx.learning.isCorrect(slot.q, index);
    const feedback = this.record(slot, slot.q, ok, this.clock.elapsedMs - slot.shownAt, hintsUsed);
    slot.panel.feedback(feedback);
    slot.wait = ok ? cfg.feedbackCorrectMs : cfg.feedbackWrongMs;
    if (ok) this.pop.pop(slot.rect.x + slot.rect.w / 2, slot.panel.rowsTop - 6, '+1', { sparkle: 10 });
  }
}
