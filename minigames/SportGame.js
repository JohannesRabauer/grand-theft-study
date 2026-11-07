import { DuelMinigame } from './DuelMinigame.js';
import { SportTrack } from './ui/SportTrack.js';
import { makeSportArt } from './ui/sportArt.js';
import { Runner, bandOf, buildCourse, formatSec, parTimes, scoreRun, tallyUnits } from './sportCore.js';
import { uiText } from '../ui/uiKit.js';

const KNOCK_KEYS = { cone: 'minigame.sport.knock.cone', hurdle: 'minigame.sport.knock.hurdle', beam: 'minigame.sport.knock.beam' };
const STRIP = 0x12151c;

// The Sport minigame "Hindernislauf" (story 4.7): an obstacle course in the school gym, seen from above. Every player runs
// their own lane (two players side by side) with the real movement system: the MovementController with the foot profile, so
// the character's Tempo sets the speed and Ausdauer the sprint stamina (sprint with Shift, the bar runs dry). Sections:
// sprint lane, cone slalom (touch a cone and it falls over), hurdles (jump with the confirm key, Space), a balance beam
// (slip off and the mats slow you), a final sprint to the finish line. Knocking something never blocks: it costs a few
// seconds and a short stumble. Course, runner physics, scoring and the bot that sets the par time are sportCore.js; the
// scene runs on the frozen world and owns its runners (no Matter world). The result is the standard shape: the score is
// in points of 100 (time against par and slow reference, checkpoints, cleanliness, a finish bonus), the effort the share
// of the course covered. At the end the faster of two players is cheered gently (cosmetic, both get the full reward).
//
// Hooks for the audio epic (events only): sfx:play { name: 'sport.jump'|'sport.knock'|'sport.clear'|'sport.checkpoint'|
// 'sport.finish'|'sport.tired', player }.
export class SportGame extends DuelMinigame {
  constructor() {
    super('sport');
  }

  get opts() { return this.def.options; }

  buildGame(slots) {
    const { ctx, opts } = this;
    const { w, h } = ctx.res;
    const profile = this.cache.json.get('vehicles').foot;
    const charCfg = this.cache.json.get('characters');
    this.course = buildCourse(opts, this.difficulty);
    this.par = parTimes(this.course, { opts, profile, charCfg });
    makeSportArt(this, ctx.res.scale, { laneW: opts.laneW, beamWidth: opts.layout.beamWidth });
    this.initCheer();
    this.doneAt = 0;
    this.help = uiText(this, w / 2, h / 2 + 30, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 3, wordWrap: { width: w - 60 }
    }).setOrigin(0.5, 0).setDepth(60);
    for (const slot of slots) {
      const player = ctx.players[slot.index];
      slot.runner = new Runner(this.course, { opts, profile, attrs: player.attrs, charCfg });
      slot.track = new SportTrack(this, ctx, slot.rect, { course: this.course, player, profile, jumpHeight: opts.jump.height });
      slot.jump = false;
      slot.msg = null;
      slot.msgUntil = 0;
      slot.result = null;
    }
    // opaque strips around the lanes clip the scrolling course
    const first = slots[0].rect;
    const last = slots.at(-1).rect;
    const strip = (x, y, sw, sh) => this.add.rectangle(x, y, sw, sh, STRIP).setOrigin(0).setDepth(18);
    strip(0, 0, w, first.y);
    strip(0, first.y + first.h, w, h - first.y - first.h);
    strip(0, first.y, first.x, first.h);
    strip(last.x + last.w, first.y, w - last.x - last.w, first.h);
    for (let i = 1; i < slots.length; i++) strip(slots[i - 1].rect.x + slots[i - 1].rect.w, first.y, slots[i].rect.x - slots[i - 1].rect.x - slots[i - 1].rect.w, first.h);
  }

  retext() {
    super.retext();
    const { ctx } = this;
    this.help.setText(ctx.t('minigame.sport.help'));
    for (const slot of this.slots) {
      slot.track.retext(key => ctx.t(key));
      this.showMessage(slot);
    }
  }

  showScore(slot) {
    if (!slot.runner) return;
    const { runner } = slot;
    slot.score.setText(runner.finished
      ? this.ctx.t('minigame.sport.finishTime', { t: formatSec(runner.effectiveSec) })
      : this.ctx.t('minigame.sport.station', { n: runner.checkpoint, total: this.course.checkpoints.length }));
  }

  // The line in the lane: i18n entries (key + params) joined by line breaks, shown for ms (or until the round ends).
  say(slot, entries, ms) {
    slot.msg = entries;
    slot.msgUntil = ms === Infinity ? Infinity : this.clock.elapsedMs + ms;
    this.showMessage(slot);
  }

  showMessage(slot) {
    slot.track.setMessage(slot.msg ? slot.msg.map(e => this.ctx.t(e.key, e.params)).join('\n') : '');
  }

  onStart() {
    this.help.setVisible(false);
    for (const slot of this.slots) this.say(slot, [{ key: 'minigame.sport.section.sprint' }], this.opts.messageMs);
  }

  navigate(slot, nav) {
    if (nav.confirm) slot.jump = true;
  }

  updateGame(dt) {
    if (this.cheering(dt)) return;
    const { ctx } = this;
    const now = this.clock.elapsedMs;
    let running = 0;
    for (const slot of this.slots) {
      const { runner } = slot;
      const intent = ctx.input.intents[slot.index];
      const events = runner.step(dt / 1000, intent.move.x, intent.move.y, intent.sprint, slot.jump);
      slot.jump = false;
      for (const [type, i] of events) this.onEvent(slot, type, i);
      if (slot.msg && now > slot.msgUntil) { slot.msg = null; this.showMessage(slot); }
      slot.track.render(runner, dt, now);
      if (!runner.finished) running++;
    }
    if (running === 0) {
      this.doneAt += dt;
      if (this.doneAt >= this.opts.finishLingerMs) this.finish();
    }
  }

  onEvent(slot, type, i) {
    const { ctx, opts, course } = this;
    const { runner, track } = slot;
    const sfx = name => ctx.events.emit('sfx:play', { name: `sport.${name}`, player: slot.index });
    const at = { x: track.sprite.x, y: track.sprite.y - 14 };
    if (type === 'jump') sfx('jump');
    else if (type === 'cone' || type === 'hurdle' || type === 'beam') {
      if (type === 'cone') track.knockCone(i);
      if (type === 'hurdle') track.knockHurdle(i);
      const sec = formatSec(opts.knock[type].sec);
      this.say(slot, [{ key: KNOCK_KEYS[type], params: { t: sec } }], opts.messageMs);
      this.pop.pop(at.x, at.y, `+${sec}`, { color: '#ffb347' });
      sfx('knock');
    } else if (type === 'clear') {
      this.pop.pop(at.x, at.y, ctx.t('minigame.sport.clear'), { sparkle: 6 });
      sfx('clear');
    } else if (type === 'tired') {
      if (!slot.msg) this.say(slot, [{ key: 'minigame.sport.tired' }], opts.messageMs);
      sfx('tired');
    } else if (type === 'section') {
      const { type: kind } = course.sections[i];
      const key = kind === 'sprint' ? (i === 0 ? 'sprint' : i === course.sections.length - 1 ? 'final' : null) : kind;
      if (key && i > 0) this.say(slot, [{ key: `minigame.sport.section.${key}` }], opts.messageMs);
    } else if (type === 'checkpoint') {
      track.reachCheckpoint(i);
      this.showScore(slot);
      sfx('checkpoint');
    } else if (type === 'finish') {
      this.finalize(slot);
      track.pips.forEach((_, n) => track.reachCheckpoint(n));
      const band = bandOf(slot.result.score, opts.bands);
      this.say(slot, [
        { key: runner.faults === 0 ? 'minigame.sport.finishClean' : 'minigame.sport.finish', params: { t: formatSec(runner.effectiveSec) } },
        { key: `minigame.sport.result.${band.key}` }
      ], Infinity);
      this.pop.pop(at.x, at.y - 10, '*', { sparkle: opts.bands.indexOf(band) === 0 ? 30 : 14 });
      this.showScore(slot);
      sfx('finish');
    }
  }

  // Counts the run in the tally once: `correct` points of 100 for the score, `total` for the course covered.
  finalize(slot) {
    if (slot.result) return;
    const { course, opts } = this;
    const { runner } = slot;
    slot.result = scoreRun(runner, course, this.par, opts.scoring);
    const { correct, total } = tallyUnits(slot.result.score, slot.result.progress, this.def.expectedQuestions);
    const ms = runner.effectiveSec * 1000 / Math.max(1, total);
    for (let n = 0; n < total; n++) slot.tally.record(n < correct, ms, 0, 'sport');
  }

  // Time up: runs that did not reach the finish still count what they covered. Quitting counts nothing extra.
  finish(opts = {}) {
    if (!this.finished && !this.over && !opts.quit && !opts.silent) {
      for (const slot of this.slots) {
        if (slot.result) continue;
        this.finalize(slot);
        this.say(slot, [{ key: 'minigame.sport.timeout', params: { n: slot.runner.checkpoint, total: this.course.checkpoints.length } }], Infinity);
        this.showScore(slot);
      }
    }
    super.finish(opts);
  }
}
