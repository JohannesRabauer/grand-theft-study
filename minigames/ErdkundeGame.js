import { DuelMinigame } from './DuelMinigame.js';
import { QuestionPanel } from './ui/QuestionPanel.js';
import { GermanyMap } from './ui/GermanyMap.js';
import { resolveGeo, stepTarget, nearest } from './geoCore.js';
import { MODES, comboSparkles, inPool, layoutFor, makePlan, modeAt, plainable, resolveTargets } from './erdkundeCore.js';
import { uiText } from '../ui/uiKit.js';

const CHALK = { frame: 0x2f5d46, frameAlpha: 0.97 };
const BACK_EDGE = 0x8b5a2b;

// The Erdkunde minigame (story 4.4), one id with two modes picked per run by data/minigames.json options.mix. The map is
// the stylised Germany of ui/GermanyMap.js (data/maps-geo/germany.json); the Sachkunde items come from
// ctx.learning.next('sachkunde', { filter }) and are tied to the map by data/learning/grade3/geo-map.json.
//   wo       "Wo liegt ...?": the question is shown above a big map and the player taps the state (or river) it asks for;
//            with the cursor, arrows jump from state to state and confirm picks. Items whose right answer is the name of
//            the mapped target.
//   capital  "Hauptstadt-Match": the state is highlighted on the map and the capital is chosen in the chalkboard
//            QuestionPanel (answer buttons); the capital dot appears with its name afterwards. Items whose right answer is
//            the capital of the mapped state. Now and then (options.fallbackShare) an unmapped geo/karte choice item
//            appears here as plain choice buttons beside the neutral map.
// Every answer goes through record() into the engine. A wrong answer only shows the right one, the explanation and a funny
// line (no lives); two players play side by side with their own map, cursor and question stream.
export class ErdkundeGame extends DuelMinigame {
  constructor() {
    super('erdkunde');
  }

  get opts() { return this.def.options; }

  buildGame(slots) {
    const { ctx, opts } = this;
    this.plan = makePlan(opts.mix, Math.random, this.def.durationSeconds * 1000, MODES);
    this.initCheer();
    this.geo = resolveGeo(this.cache.json.get('geo-germany'));
    this.info = resolveTargets(this.geo, this.cache.json.get('geo-map').targets, this.cache.json.get('learning-grade3-sachkunde').items).byItem;
    this.help = uiText(this, ctx.res.w / 2, ctx.res.h / 2 + 30, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 3, wordWrap: { width: ctx.res.w - 60 }
    }).setOrigin(0.5, 0).setDepth(60);
    for (const slot of slots) {
      const { rect } = slot;
      this.add.rectangle(rect.x, rect.y, rect.w, rect.h, CHALK.frame, CHALK.frameAlpha).setOrigin(0).setDepth(9);
      this.add.rectangle(rect.x, rect.y, rect.w, rect.h).setOrigin(0).setStrokeStyle(3, BACK_EDGE).setDepth(30);
      slot.panel = new QuestionPanel(this, ctx, layoutFor(rect, 'capital').panel, CHALK);
      slot.panel.onChoose = (index, hints) => this.answerChoice(slot, index, hints);
      slot.map = new GermanyMap(this, this.geo, { depth: 14 });
      slot.map.onTap = id => this.tapMap(slot, id);
      slot.question = uiText(this, rect.x + 6, rect.y + 4, '', { fontFamily: 'monospace', fontSize: rect.w > 300 ? '12px' : '10px', color: '#ffffff', wordWrap: { width: rect.w - 12 }, lineSpacing: 2 }).setDepth(16);
      slot.note = uiText(this, rect.x, rect.y, '', { fontFamily: 'monospace', fontSize: rect.w > 300 ? '10px' : '8px', color: '#9be58f' }).setDepth(16);
      slot.tag = uiText(this, rect.x + rect.w / 2, 20, '', { fontFamily: 'monospace', fontSize: '8px', color: '#9fd0ff' }).setOrigin(0.5).setDepth(20);
      slot.mode = null;
      slot.q = null;
      slot.target = null; // the mapped item's { mode, target, what }, null for a plain item
      slot.sel = null; // the cursor's target id in 'wo' mode
      slot.locked = true;
      slot.picked = null;
      slot.shownAt = 0;
      slot.wait = 0;
      slot.fb = null;
    }
  }

  onStart() {
    this.help.setVisible(false);
    for (const slot of this.slots) this.ask(slot);
  }

  retext() {
    super.retext();
    const { ctx } = this;
    this.help.setText(ctx.t(`minigame.erdkunde.help.${this.plan.first}`));
    for (const slot of this.slots) {
      slot.tag.setText(slot.mode ? ctx.t(`minigame.erdkunde.mode.${slot.mode}`) : '');
      if (slot.mode === 'wo' && slot.q) { slot.question.setText(ctx.learning.localize(slot.q).q); this.showNote(slot); }
    }
  }

  navigate(slot, nav) {
    if (!slot.q) return;
    if (slot.mode === 'capital') { slot.panel.nav(nav); return; }
    if (slot.locked) return;
    if (nav.dx || nav.dy) {
      slot.sel = stepTarget(slot.map.anchors(), slot.sel, nav.dx, nav.dy);
      slot.map.setHover(slot.sel);
    }
    if (nav.confirm) this.answerMap(slot, slot.sel);
  }

  updateGame(dt) {
    if (this.cheering(dt)) return;
    for (const slot of this.slots) if (slot.wait > 0 && (slot.wait -= dt) <= 0) this.ask(slot);
  }

  onCheer(slot) { slot.wait = 0; }

  ask(slot) {
    if (this.over) return;
    const mode = modeAt(this.plan, this.clock.elapsedMs);
    if (mode !== slot.mode) this.switchMode(slot, mode);
    slot.q = this.nextQuestion(slot, mode);
    slot.target = this.info.get(slot.q.id) ?? null;
    slot.shownAt = this.clock.elapsedMs;
    slot.fb = null;
    slot.picked = null;
    slot.map.clear();
    if (mode === 'capital') {
      if (slot.target) slot.map.setHighlight(slot.target.target, 'focus');
      slot.panel.externalHints = false;
      slot.panel.show(slot.q);
      return;
    }
    const { map } = slot;
    map.setTargets(slot.target.what);
    const rect = layoutFor(slot.rect, 'wo').map;
    const centre = nearest(rect.x + rect.w / 2, rect.y + rect.h / 2, map.anchors());
    slot.sel = centre.id;
    map.setHover(slot.sel);
    slot.question.setText(this.ctx.learning.localize(slot.q).q);
    slot.note.setText('');
    slot.locked = false;
  }

  switchMode(slot, mode) {
    const first = slot.mode === null;
    slot.mode = mode;
    const parts = layoutFor(slot.rect, mode);
    const wo = mode === 'wo';
    slot.panel.hide();
    slot.question.setVisible(wo);
    slot.note.setVisible(wo);
    slot.map.layout(parts.map);
    slot.map.onTap = wo ? id => this.tapMap(slot, id) : null;
    slot.map.setVisible(true);
    if (wo) {
      slot.question.setPosition(parts.question.x, parts.question.y).setWordWrapWidth(parts.question.w);
      slot.note.setPosition(parts.note.x, parts.note.y).setWordWrapWidth(parts.note.w);
    }
    slot.map.setTargets('states');
    slot.tag.setText(this.ctx.t(`minigame.erdkunde.mode.${mode}`));
    if (!first) this.pop.pop(slot.rect.x + slot.rect.w / 2, slot.rect.y + 40, this.ctx.t(`minigame.erdkunde.mode.${mode}`), { color: '#9fd0ff' });
  }

  // The next item for this mode: 'wo' = mapped tap items, 'capital' = mapped capital items, now and then an unmapped
  // plain choice item (the fallback rendering).
  nextQuestion(slot, mode) {
    const { opts, info } = this;
    const pool = q => inPool(q, opts.tags);
    let filter;
    if (mode === 'wo') filter = q => info.get(q.id)?.mode === 'wo';
    else if (Math.random() < opts.fallbackShare) filter = q => pool(q) && !info.has(q.id) && plainable(q);
    else filter = q => info.get(q.id)?.mode === 'capital';
    const q = this.ctx.learning.next('sachkunde', { player: slot.index, context: this.context, filter });
    if (!q) throw new Error(`erdkunde: no ${mode} question found`);
    return q;
  }

  // ---- 'wo': taps and the cursor ----

  tapMap(slot, id) {
    if (id && slot.mode === 'wo' && !slot.locked && !this.over && this.live) this.answerMap(slot, id);
  }

  answerMap(slot, id) {
    if (slot.locked || !id) return;
    slot.locked = true;
    slot.picked = id;
    const ok = this.ctx.learning.isCorrect(slot.q, this.geo.byId[id].name);
    const fb = this.record(slot, slot.q, ok, this.clock.elapsedMs - slot.shownAt, 0);
    const { map, target } = slot;
    map.setHover(null);
    if (!ok) map.setHighlight(id, 'soft');
    map.setHighlight(target.target, 'good');
    if (target.what === 'rivers') map.drawRiver(target.target);
    slot.fb = fb;
    this.showNote(slot);
    this.settle(slot, ok, { x: slot.map.anchorOf(target.target).ax, y: slot.map.anchorOf(target.target).ay });
  }

  showNote(slot) {
    const { fb, q } = slot;
    if (slot.mode !== 'wo' || !fb) return;
    const { ctx } = this;
    const view = ctx.learning.localize(q);
    const right = view.answers.find(a => a.correct)?.text ?? '';
    slot.note.setColor(fb.ok ? '#9be58f' : '#ffd27a').setText(fb.ok ? ctx.t(fb.reaction) : `${ctx.t(fb.reaction)}\n${ctx.t('minigame.correctWas', { answer: right })}\n${view.explain}`);
  }

  // ---- 'capital': answer buttons ----

  answerChoice(slot, index, hints) {
    const ok = this.ctx.learning.isCorrect(slot.q, index);
    const fb = this.record(slot, slot.q, ok, this.clock.elapsedMs - slot.shownAt, hints);
    slot.panel.feedback(fb);
    if (slot.target) slot.map.drawCapital(slot.target.target);
    const { rect } = slot;
    this.settle(slot, ok, { x: rect.x + slot.panel.rect.w / 2, y: slot.panel.hintY + 4 });
  }

  // The pause before the next question and the sparkles of a right answer.
  settle(slot, ok, at) {
    const { cfg, opts } = this;
    slot.wait = ok ? cfg.feedbackCorrectMs : cfg.feedbackWrongMs;
    if (!ok) return;
    const streak = slot.tally.streak;
    const label = streak >= opts.combo.from ? this.ctx.t('minigame.erdkunde.combo', { n: streak }) : '+1';
    this.pop.pop(at.x, at.y, label, { sparkle: comboSparkles(streak, opts.combo) });
  }
}
