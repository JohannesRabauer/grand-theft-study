import { setupUiCamera, uiText } from '../ui/uiKit.js';
import { ChoiceCursor, RoundClock, Tally, layoutRects } from './minigameCore.js';
import { Timer } from './ui/Timer.js';
import { ScorePop } from './ui/ScorePop.js';

const LAYOUT = { top: 26, margin: 6, gap: 8 };
const DEPTH = { backdrop: 0, hud: 20, overlay: 60 };

// Base of every minigame (AD-20): a Phaser scene with the key MG_<id>, launched by ctx.minigames.start() on top of the
// frozen world. It owns what all minigames share: the 480x270 layout space and camera, the opaque backdrop, the visible
// 3-2-1 countdown, the shared round timer, the pause button, one playing area per player side by side, one answer
// cursor per player and the tallies. A minigame only fills its areas and reacts:
//
//   buildGame(slots)       create the per-player content; slot = { index, i, rect, tally, cursor, panel? }
//   onStart()              the countdown ended, the timer runs
//   navigate(slot, nav)    this player's discrete input (dx, dy, confirm, pick); default: slot.panel.nav(nav)
//   updateGame(dtMs)       per frame while the timer runs and the game is not paused
//
// and reports through record() (feeds the learning engine and the tally) and finish(). Input is read only from
// ctx.input.intents[player]. Time stands still while a pause screen is open, so pausing never costs anyone time.
export class Minigame extends Phaser.Scene {
  constructor(id) {
    super(`MG_${id}`);
    this.id = id;
  }

  init(data) {
    this.ctx = data.ctx;
    this.def = data.def;
    this.cfg = data.cfg;
    this.session = data.session;
    this.session.scene = this;
    this.playerIndexes = data.players;
    this.difficulty = data.difficulty;
    this.context = data.context;
    this.topic = data.topic ?? null;
    this.finished = false;
    this.started = false;
    this.live = false;
  }

  create() {
    const { ctx, cfg, def } = this;
    const { w, h } = ctx.res;
    setupUiCamera(this, ctx.res);
    this.add.rectangle(0, 0, w, h, 0x12151c).setOrigin(0).setDepth(DEPTH.backdrop);
    this.clock = new RoundClock(def.durationSeconds * 1000, cfg.countdownSeconds * 1000);
    this.timer = new Timer(this, { x: 30, y: 9, w: w - 60, h: 9, depth: DEPTH.hud, warnSeconds: cfg.warnSeconds });
    this.timer.set(this.clock.remainingMs, this.clock.durationMs);
    this.makePauseButton(w - 14, 9);
    this.pop = new ScorePop(this, ctx);
    const rects = layoutRects(this.playerIndexes.length, w, h, LAYOUT);
    const names = this.playerIndexes.length > 1;
    this.slots = this.playerIndexes.map((index, i) => ({
      index,
      i,
      rect: rects[i],
      tally: new Tally(),
      cursor: new ChoiceCursor(),
      panel: null,
      name: names ? uiText(this, rects[i].x + 2, 20, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffe14d' }).setOrigin(0, 0.5).setDepth(DEPTH.hud) : null,
      score: uiText(this, rects[i].x + rects[i].w - 2, 20, '', { fontFamily: 'monospace', fontSize: '8px', color: '#9be58f' }).setOrigin(1, 0.5).setDepth(DEPTH.hud)
    }));
    this.title = uiText(this, w / 2, h / 2 - 34, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(DEPTH.overlay);
    this.count = uiText(this, w / 2, h / 2, '', { fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold', color: '#ffe14d', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5).setDepth(DEPTH.overlay);
    this.countShown = null;
    this.goUntil = 0;
    this.buildGame(this.slots);
    this.retext();
    const onLang = () => this.retext();
    ctx.events.on('lang:changed', onLang);
    this.events.once('shutdown', () => ctx.events.off('lang:changed', onLang));
  }

  makePauseButton(x, y) {
    const button = this.add.circle(x, y, 9, 0x2b2f3a).setDepth(DEPTH.hud).setStrokeStyle(1, 0xffffff).setInteractive({ useHandCursor: true });
    this.add.rectangle(x - 2.5, y, 2.5, 8, 0xffffff).setDepth(DEPTH.hud + 1);
    this.add.rectangle(x + 2.5, y, 2.5, 8, 0xffffff).setDepth(DEPTH.hud + 1);
    button.on('pointerdown', () => { if (this.live) this.ctx.events.emit('ui:pause-toggle'); });
  }

  buildGame() {}

  onStart() {}

  navigate(slot, nav) { slot.panel?.nav(nav); }

  updateGame() {}

  // Texts that depend on the language and on the tallies.
  retext() {
    const { ctx } = this;
    this.title.setText(ctx.t(`minigame.${this.id}.title`));
    this.countShown = null;
    for (const slot of this.slots) {
      slot.name?.setText(ctx.players[slot.index].character?.name ?? ctx.t('menu.slot.player', { n: slot.index + 1 }));
      this.showScore(slot);
      slot.panel?.retext();
    }
  }

  showScore(slot) {
    slot.score.setText(this.ctx.t('minigame.score', { n: slot.tally.correct }));
  }

  // Reports one answer: feeds the learning engine (AD-19) and the player's tally. `ms` is the answer time. Returns the
  // engine's feedback data for the QuestionPanel.
  record(slot, question, ok, ms, hintsUsed) {
    const feedback = this.ctx.learning.answer(question, ok, ms, { player: slot.index, hintsUsed });
    this.countResult(slot, ok, ms, question.meta?.topic ?? question.topic, hintsUsed);
    return feedback;
  }

  // Counts one result without a learning-engine question (the Musik and Kunst minigames have none): a hit note, a right cell.
  countResult(slot, ok, ms, topic, hints = 0) {
    slot.tally.record(ok, ms, hints, topic);
    this.showScore(slot);
  }

  update(time, delta) {
    if (this.finished) return;
    const top = this.ctx.screens?.top();
    const live = top?.id === 'minigame';
    if (live !== this.live) {
      this.live = live;
      if (live) for (const slot of this.slots) slot.cursor.read(this.ctx.input.intents[slot.index]); // keys held through a pause do not count
    }
    if (!live) return;
    const dt = Math.min(delta, 50);
    const playing = this.clock.phase === 'play';
    for (const slot of this.slots) {
      const nav = slot.cursor.read(this.ctx.input.intents[slot.index]);
      if (playing) this.navigate(slot, nav);
    }
    this.clock.tick(dt);
    if (this.clock.phase === 'countdown') {
      this.showCountdown();
    } else if (!this.started) {
      this.started = true;
      this.goUntil = time + 600;
      this.showCountdown();
      this.onStart();
    }
    if (this.started) {
      if (time > this.goUntil) this.count.setVisible(false);
      this.updateGame(dt);
      this.timer.set(this.clock.remainingMs, this.clock.durationMs);
    }
    if (this.clock.phase === 'done') this.finish();
  }

  showCountdown() {
    const label = this.clock.phase === 'countdown' ? String(Math.ceil(this.clock.countdownLeft / 1000)) : this.ctx.t('minigame.go');
    if (label === this.countShown) return;
    this.countShown = label;
    this.count.setText(label).setVisible(true);
    this.tweens.killTweensOf(this.count);
    this.count.setScale(1.5);
    this.tweens.add({ targets: this.count, scale: 1, duration: 250, ease: 'Back.easeOut' });
    if (this.clock.phase !== 'countdown') this.title.setVisible(false);
  }

  // Ends the round (time up, everyone done, or quit) and hands the tallies to ctx.minigames, which builds the graded
  // result, applies the rewards and shows the result screen.
  finish({ quit = false, silent = false } = {}) {
    if (this.finished) return;
    this.finished = true;
    this.clock.finish();
    this.session.complete({ tallies: this.slots.map(s => s.tally), ms: this.clock.elapsedMs, quit, silent });
  }
}
