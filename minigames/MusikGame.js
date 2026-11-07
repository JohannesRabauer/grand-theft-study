import { DuelMinigame } from './DuelMinigame.js';
import { RhythmStage } from './ui/RhythmStage.js';
import { NoteTrack, Scorer, beatPhase, buildSchedule, lanesFromNav, songFor, tierFor, windowsFor } from './rhythmCore.js';
import { comboSparkles } from './matheCore.js';
import { uiText } from '../ui/uiKit.js';

// The Musik minigame (story 4.6): a four-lane rhythm game on a small concert stage. One chiptune song per run
// (data/songs.json, chosen at random); every player gets the chart tier that fits difficulty + level, so a duo can play
// different charts of the same song side by side. Notes fall to the hit line and the player taps the lane in time:
// arrows / WASD / keys 1-4 (P2: arrows / numpad 1-4), the pad buttons or a tap on the lane. Hit windows are gentle
// (perfect / good, a miss only breaks the combo), the beat is the round clock, so pausing stops the song and the game is
// fully playable without sound: a metronome ring pulses on every beat. The rhythm logic is rhythmCore.js.
//
// Hooks for the audio epic (events only, nothing is played here):
//   music:note  { player, lane, grade: 'perfect'|'good'|'miss', pitch (MIDI), song, tier, combo }  every judged note
//   music:beat  { beat, bpm, song }                                                                   every beat
//   sfx:play    { name: 'musik.perfect'|'musik.good'|'musik.miss'|'musik.combo', player, lane, pitch }
// The musicArtBonus perk (Jonas) widens the hit windows and multiplies the points; the graded score is the share of
// notes hit (tally), so the wider windows are what lifts his grade.
export class MusikGame extends DuelMinigame {
  constructor() {
    super('musik');
  }

  get opts() { return this.def.options; }

  buildGame(slots) {
    const { ctx } = this;
    const songs = this.cache.json.get('songs');
    this.songs = songs;
    this.song = songFor(songs.songs);
    this.beat = -1;
    this.laneBuf = [];
    this.initCheer();
    this.help = uiText(this, ctx.res.w / 2, ctx.res.h / 2 + 30, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 3, wordWrap: { width: ctx.res.w - 60 }
    }).setOrigin(0.5, 0).setDepth(60);
    for (const slot of slots) {
      const state = ctx.state.players[slot.index];
      slot.bonus = ctx.players[slot.index].perks?.musicArtBonus ?? 0;
      slot.tier = tierFor(this.difficulty, state?.level ?? 1, songs.tierRule);
      const win = windowsFor(songs, slot.tier, slot.bonus);
      const schedule = buildSchedule(this.song, slot.tier, { ...songs.play, durationMs: this.def.durationSeconds * 1000, lanes: songs.lanes, stepsPerBar: songs.stepsPerBar });
      slot.track = new NoteTrack(schedule, songs.lanes, win);
      slot.scorer = new Scorer(songs.scoring, slot.bonus);
      slot.stage = new RhythmStage(this, ctx, slot.rect, { lanes: songs.lanes, fallMs: songs.tiers[slot.tier].fallMs, lingerMs: win.linger });
      slot.stage.onTap = lane => this.press(slot, lane);
    }
  }

  retext() {
    super.retext();
    const { ctx } = this;
    this.help.setText(ctx.t('minigame.musik.help'));
    for (const slot of this.slots) {
      slot.stage.retext(ctx.t(`minigame.musik.song.${this.song.id}`), slot.bonus > 0 ? ctx.t('minigame.musicart.bonus', { n: Math.round(slot.bonus * 100) }) : '');
      this.showCombo(slot);
    }
  }

  showScore(slot) {
    if (slot.scorer) slot.score.setText(this.ctx.t('minigame.musik.points', { n: slot.scorer.points }));
  }

  showCombo(slot) {
    const { combo } = slot.scorer;
    slot.stage.setCombo(combo >= this.opts.combo.from ? this.ctx.t('minigame.musik.combo', { n: combo }) : '');
  }

  onStart() {
    this.help.setVisible(false);
  }

  navigate(slot, nav) {
    if (this.over) return;
    const n = lanesFromNav(nav, this.songs.lanes, this.laneBuf);
    for (let i = 0; i < n; i++) this.press(slot, this.laneBuf[i]);
  }

  // A lane was played. Presses outside a hittable note (too early, nothing there, between rounds) are ignored.
  press(slot, lane) {
    if (!this.started || this.over || this.finished || !this.live || this.clock.phase !== 'play') return;
    const now = this.clock.elapsedMs;
    this.judgeMisses(slot, now);
    slot.stage.flash(lane, now);
    const r = slot.track.press(lane, now);
    if (!r.grade) return;
    slot.scorer.hit(r.grade);
    this.countResult(slot, true, Math.abs(r.dt), 'musik');
    this.showCombo(slot);
    const x = slot.stage.cx(lane);
    const streak = slot.scorer.combo;
    this.pop.pop(x, slot.stage.lineY - 6, '', { color: '#ffe14d', sparkle: r.grade === 'perfect' ? comboSparkles(streak, this.opts.combo) : 4 });
    slot.stage.showJudge(r.grade, this.ctx.t(`minigame.musik.${r.grade}`));
    this.announce(slot, lane, r.grade, streak);
    if (streak % this.songs.scoring.comboStep === 0) this.ctx.events.emit('sfx:play', { name: 'musik.combo', player: slot.index, lane, pitch: this.pitch(lane) });
  }

  judgeMisses(slot, now) {
    const { track } = slot;
    if (!track.sweep(now)) return;
    for (const i of track.missed) {
      slot.scorer.miss();
      this.countResult(slot, false, track.win.good, 'musik');
      slot.stage.showJudge('miss', this.ctx.t('minigame.musik.miss'));
      this.announce(slot, track.lane[i], 'miss', 0);
    }
    this.showCombo(slot);
  }

  pitch(lane) { return this.song.root + this.song.scale[lane]; }

  announce(slot, lane, grade, combo) {
    const { events } = this.ctx;
    const pitch = this.pitch(lane);
    events.emit('music:note', { player: slot.index, lane, grade, pitch, song: this.song.id, tier: slot.tier, combo });
    events.emit('sfx:play', { name: `musik.${grade}`, player: slot.index, lane, pitch });
  }

  updateGame(dt) {
    if (this.cheering(dt)) return;
    const now = this.clock.elapsedMs;
    const beat = Math.floor(now * this.song.bpm / 60000);
    if (beat !== this.beat) {
      this.beat = beat;
      this.ctx.events.emit('music:beat', { beat, bpm: this.song.bpm, song: this.song.id });
    }
    const phase = beatPhase(now, this.song.bpm);
    for (const slot of this.slots) {
      this.judgeMisses(slot, now);
      slot.stage.render(now, slot.track, phase);
    }
  }
}
