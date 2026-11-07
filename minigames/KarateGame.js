import { Minigame } from './Minigame.js';
import { KarateStage } from './ui/KarateStage.js';
import { KarateSession, defendLane, laneOf, lanesFromNav, nextCall } from './karateCore.js';
import { comboSparkles } from './matheCore.js';
import { uiText } from '../ui/uiKit.js';

// The karate training minigame (story 6.4, AD-20): the sensei calls the moves of a kata and the kid plays them in time on a
// five-lane dojo track: dodge left / right (left / right), block high / low (up / down or the defend key on whichever block is
// next), Kiai (the Kiai key or confirm), or tap the lanes. A session is the three kata of the kid's belt (data/kata.json), the
// last one is the belt exam; two kids train side by side on their own belt. Hit windows are gentle (a miss only breaks the combo,
// nothing is ever punished) and a steady rhythm fills the calm Fokus meter, which widens them. The kata logic is karateCore.js.
//
// At the end every kid's summary goes to ctx.karate.submit() (defense/Karate.js), which stores the points and may promote the
// belt; a banner tells the kid how the exam went before the result screen. Quitting submits nothing.
//
// Hooks for the audio epic (events only, nothing is played here):
//   karate:move  { player, lane, move, grade: 'perfect'|'good'|'miss', combo }   every judged note
//   sfx:play     { name: 'karate.perfect'|'karate.good'|'karate.miss'|'karate.combo', player, lane }
export class KarateGame extends Minigame {
  constructor() {
    super('karate');
  }

  get opts() { return this.def.options; }

  buildGame(slots) {
    const { ctx } = this;
    this.kata = this.cache.json.get('kata');
    this.laneBuf = [];
    this.over = false;
    this.endLeft = 0;
    this.kiaiLane = laneOf(this.kata, 'kiai');
    for (const slot of slots) {
      slot.belt = ctx.karate.beltOf(slot.index);
      slot.session = new KarateSession(this.kata, slot.belt);
      slot.prevDefend = true; // keys held from the countdown do not play a move
      slot.prevKiai = true;
      slot.stageShown = -1;
      slot.outcome = null;
      slot.stage = new KarateStage(this, ctx, slot.rect, { lanes: this.kata.lanes.length, fallMs: this.kata.play.fallMs });
      slot.stage.onTap = lane => this.press(slot, lane);
    }
    this.help = uiText(this, ctx.res.w / 2, ctx.res.h / 2 + 30, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 3, wordWrap: { width: ctx.res.w - 60 }
    }).setOrigin(0.5, 0).setDepth(60);
  }

  retext() {
    super.retext();
    const { ctx } = this;
    this.help.setText(ctx.t('minigame.karate.help'));
    for (const slot of this.slots) {
      slot.stageShown = -1;
      slot.stage.retext(ctx.t(`karate.kata.${slot.belt}`));
      slot.stage.setFokus(ctx.t('minigame.karate.fokus'));
      this.showCombo(slot);
      if (slot.outcome) slot.stage.showBanner(this.bannerText(slot));
    }
  }

  showScore(slot) {
    if (slot.session) slot.score.setText(this.ctx.t('minigame.karate.points', { n: slot.session.scorer.points }));
  }

  showCombo(slot) {
    const { combo } = slot.session.scorer;
    slot.stage.setCombo(combo >= this.opts.combo.from ? this.ctx.t('minigame.karate.combo', { n: combo }) : '');
  }

  onStart() {
    this.help.setVisible(false);
  }

  navigate(slot, nav) {
    if (this.over) return;
    const n = lanesFromNav(nav, this.kata, this.laneBuf);
    for (let i = 0; i < n; i++) this.press(slot, this.laneBuf[i]);
    const intent = this.ctx.input.intents[slot.index];
    if (intent.defend && !slot.prevDefend) this.press(slot, defendLane(slot.session, this.kata));
    if (intent.kiai && !slot.prevKiai) this.press(slot, this.kiaiLane);
    slot.prevDefend = intent.defend;
    slot.prevKiai = intent.kiai;
  }

  // A move was played. Presses that find no note in reach (too early, nothing called) are ignored, never punished.
  press(slot, lane) {
    if (!this.started || this.over || this.finished || !this.live || this.clock.phase !== 'play') return;
    const now = this.clock.elapsedMs;
    this.judgeMisses(slot, now);
    slot.stage.flash(lane, now);
    const r = slot.session.press(lane, now);
    if (!r.grade) return;
    this.countResult(slot, true, Math.abs(r.dt), 'karate');
    this.showCombo(slot);
    const streak = slot.session.scorer.combo;
    const { stage } = slot;
    this.pop.pop(stage.cx(lane), stage.lineY - 6, '', { color: '#ffe14d', sparkle: r.grade === 'perfect' ? comboSparkles(streak, this.opts.combo) : 4 });
    stage.showJudge(r.grade, this.ctx.t(`minigame.karate.${r.grade}`));
    this.announce(slot, lane, r.grade, streak);
    if (streak % this.kata.scoring.comboStep === 0) this.ctx.events.emit('sfx:play', { name: 'karate.combo', player: slot.index, lane });
  }

  judgeMisses(slot, now) {
    const { session } = slot;
    if (!session.sweep(now)) return;
    for (const i of session.track.missed) {
      this.countResult(slot, false, session.win.good, 'karate');
      slot.stage.showJudge('miss', this.ctx.t('minigame.karate.miss'));
      this.announce(slot, session.track.lane[i], 'miss', 0);
    }
    this.showCombo(slot);
  }

  announce(slot, lane, grade, combo) {
    const { events } = this.ctx;
    events.emit('karate:move', { player: slot.index, lane, move: this.kata.lanes[lane], grade, combo });
    events.emit('sfx:play', { name: `karate.${grade}`, player: slot.index, lane });
  }

  updateGame(dt) {
    if (this.over) {
      if ((this.endLeft -= dt) <= 0) super.finish();
      return;
    }
    const now = this.clock.elapsedMs;
    for (const slot of this.slots) {
      this.judgeMisses(slot, now);
      this.showCall(slot, now);
      slot.stage.render(now, slot.session, this.phaseAt(slot, now));
    }
    if (this.slots.every(s => s.session.done)) this.endRound();
  }

  // 0..1 within the current step of the kata being played (the breathing / metronome ring).
  phaseAt(slot, now) {
    const { stages } = slot.session.schedule;
    const st = stages.find(s => now < s.endMs) ?? stages[stages.length - 1];
    return Math.max(0, ((now - st.startMs) / st.stepMs) % 1);
  }

  // The sensei's call: the kata and what is coming next ("Block hoch!").
  showCall(slot, now) {
    const { ctx } = this;
    const { session, stage } = slot;
    const i = nextCall(session);
    const s = i < 0 ? session.schedule.stages.length - 1 : session.schedule.stage[i];
    if (s !== slot.stageShown) {
      slot.stageShown = s;
      stage.retext(`${ctx.t(`karate.kata.${slot.belt}`)} · ${ctx.t(`karate.stage.${s + 1}`)}`);
    }
    const lead = this.kata.play.fallMs;
    stage.setCall(i >= 0 && session.track.t[i] - now < lead ? ctx.t(`karate.move.${this.kata.lanes[session.track.lane[i]]}`) : '');
  }

  // Every note is judged: the summaries go to the belt logic, then the exam banner shows for a moment.
  endRound() {
    if (this.over) return;
    this.over = true;
    const { ctx } = this;
    for (const slot of this.slots) {
      slot.outcome = ctx.karate.submit(slot.index, slot.session.summary());
      slot.stage.setCall('');
      slot.stage.showBanner(this.bannerText(slot));
      const promoted = !!slot.outcome.promote;
      this.pop.pop(slot.rect.x + slot.rect.w / 2, slot.rect.y + slot.rect.h / 2 + 30, '*', { sparkle: promoted ? 36 : 10 });
    }
    this.endLeft = this.kata.play.resultMs;
  }

  bannerText(slot) {
    const { ctx } = this;
    const o = slot.outcome;
    const head = ctx.t(`karate.exam.${o.reason}`, { belt: ctx.t(`karate.belt.${o.promote ?? slot.belt}`) });
    return `${head}\n${ctx.t('karate.exam.points', { n: o.points })}`;
  }

  // Quitting counts as no training: nothing is submitted, the framework handles the rest.
  finish(opts = {}) {
    if (this.finished) return;
    if (opts.quit || opts.silent) { super.finish(opts); return; }
    if (this.over) return;
    this.endRound();
  }
}
