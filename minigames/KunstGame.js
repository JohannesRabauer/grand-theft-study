import { DuelMinigame } from './DuelMinigame.js';
import { PixelEasel } from './ui/PixelEasel.js';
import { PaintModel, adaptLevel, bandOf, generatePattern, memorizeMs, mulberry32, paletteFor, profileFor, scoreGrid } from './kunstCore.js';
import { uiText } from '../ui/uiKit.js';

const MIN_SKIP_MS = 500;

// The Kunst minigame "Pixel-Muster merken" (story 4.6): a pixel pattern (4x4 up to 7x7, 2-5 colours by level) is shown on
// an easel for a few seconds, then it disappears and the player paints it again on an empty canvas with a colour
// palette. Each pattern goes through three phases per player (own timeline, two players play side by side):
//   show    the pattern and a shrinking bar; confirm skips ahead. The time comes from the level (shorter at higher levels,
//           longer for struggling kids) and is extended by the musicArtBonus perk (Jonas).
//   paint   cursor + palette: arrows move, confirm paints (hold it and move to draw a stroke), keys 1-4 pick a colour, arrow
//           down from the last row enters the palette (colours and the Fertig button), or paint with the mouse / a finger.
//   result  pattern and copy side by side; wrong cells get a dot and a friendly line. A perfect copy celebrates.
// Every cell counts as one answer in the tally (right cells = correct), so a half-right copy earns half. The level adapts:
// a perfect copy makes the next pattern harder, a poor one easier. When the shared timer ends in the paint phase the copy is
// judged as it is. Patterns are seeded (kunstCore.js), no learning-engine questions.
export class KunstGame extends DuelMinigame {
  constructor() {
    super('kunst');
  }

  get opts() { return this.def.options; }

  buildGame(slots) {
    const { ctx } = this;
    const data = this.cache.json.get('pixel-patterns');
    this.icons = data.icons;
    this.paletteIds = data.palette.map(c => c.id);
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.initCheer();
    this.help = uiText(this, ctx.res.w / 2, ctx.res.h / 2 + 30, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 3, wordWrap: { width: ctx.res.w - 60 }
    }).setOrigin(0.5, 0).setDepth(60);
    const colors = data.palette.map(c => parseInt(c.hex.slice(1), 16));
    for (const slot of slots) {
      slot.bonus = ctx.players[slot.index].perks?.musicArtBonus ?? 0;
      slot.level = this.difficulty;
      slot.n = 0;
      slot.phase = 'wait';
      slot.t = 0;
      slot.msg = null;
      slot.sub = null;
      slot.easel = new PixelEasel(this, ctx, slot.rect, { colors });
      slot.easel.onCell = (x, y, drag) => this.paintAt(slot, x, y, drag);
      slot.easel.onSwatch = i => this.select(slot, i);
      slot.easel.onDone = () => this.submit(slot);
      slot.bonusText = slot.bonus > 0
        ? uiText(this, slot.rect.x + 4, slot.rect.y + 2, '', { fontFamily: 'monospace', fontSize: '7px', color: '#b8741a' }).setDepth(30)
        : null;
    }
  }

  retext() {
    super.retext();
    const { ctx } = this;
    this.help.setText(ctx.t('minigame.kunst.help'));
    for (const slot of this.slots) {
      slot.easel.retext();
      slot.bonusText?.setText(ctx.t('minigame.musicart.bonus', { n: Math.round(slot.bonus * 100) }));
      this.showMessage(slot);
    }
  }

  showScore(slot) {
    slot.score.setText(this.ctx.t('minigame.kunst.score', { n: slot.tally.correct }));
  }

  // The line above the easel (key + params) and the hint line below it, kept so a language switch can redo them.
  say(slot, key, params, sub = null) {
    slot.msg = { key, params };
    slot.sub = sub;
    this.showMessage(slot);
  }

  showMessage(slot) {
    const { ctx } = this;
    slot.easel.setMessage(slot.msg ? ctx.t(slot.msg.key, slot.msg.params) : '');
    slot.easel.setSub(slot.sub ? ctx.t(slot.sub) : '');
  }

  onStart() {
    this.help.setVisible(false);
    for (const slot of this.slots) this.startPattern(slot);
  }

  startPattern(slot) {
    const { opts } = this;
    const level = Math.min(slot.level, opts.levels.length);
    const profile = profileFor(opts.levels, level);
    const rng = mulberry32(this.seed + slot.n * 7919 + level * 131);
    slot.pattern = generatePattern({ rng, profile, kinds: opts.kinds, icons: this.icons, paletteIds: this.paletteIds, recolor: opts.recolor });
    slot.palette = paletteFor(slot.pattern, profile.decoys, this.paletteIds.length, rng);
    slot.model = null;
    slot.showMs = memorizeMs(profile, slot.bonus);
    slot.phase = 'show';
    slot.t = 0;
    slot.n++;
    slot.easel.showPattern(slot.pattern);
    this.say(slot, 'minigame.kunst.memorize', undefined, 'minigame.kunst.skip');
  }

  startPaint(slot) {
    slot.phase = 'paint';
    slot.t = 0;
    slot.model = new PaintModel(slot.pattern.size, slot.palette);
    slot.easel.showPaint(slot.pattern.size, slot.palette);
    slot.easel.refresh(slot.model);
    this.say(slot, 'minigame.kunst.paint', undefined, 'minigame.kunst.paintHint');
    this.ctx.events.emit('sfx:play', { name: 'kunst.reveal', player: slot.index });
  }

  updateGame(dt) {
    if (this.cheering(dt)) return;
    for (const slot of this.slots) {
      slot.t += dt;
      if (slot.phase === 'show') {
        slot.easel.setBar(1 - slot.t / slot.showMs);
        if (slot.t >= slot.showMs) this.startPaint(slot);
      } else if (slot.phase === 'result' && slot.t >= this.opts.resultMs) this.startPattern(slot);
    }
  }

  navigate(slot, nav) {
    if (this.over) return;
    if (slot.phase === 'show') {
      if (nav.confirm && slot.t > MIN_SKIP_MS) this.startPaint(slot);
    } else if (slot.phase === 'paint') {
      const intent = this.ctx.input.intents[slot.index];
      const result = slot.model.nav(nav, intent.jump || intent.interact);
      if (result === 'submit') this.submit(slot);
      else if (result) this.painted(slot, result);
    } else if (slot.phase === 'result' && nav.confirm && slot.t > MIN_SKIP_MS) this.startPattern(slot);
  }

  painted(slot, result) {
    slot.easel.refresh(slot.model);
    if (result === 'paint') this.ctx.events.emit('sfx:play', { name: 'kunst.paint', player: slot.index, color: slot.model.color });
  }

  paintAt(slot, x, y, drag) {
    if (slot.phase !== 'paint' || !this.live || this.over) return;
    const { model } = slot;
    model.focus = 'grid';
    model.cx = x;
    model.cy = y;
    if (model.paintAt(x, y) || !drag) this.painted(slot, 'paint');
  }

  select(slot, i) {
    if (slot.phase !== 'paint' || !slot.model.selectColor(i)) return;
    slot.model.focus = 'grid';
    this.painted(slot, 'select');
  }

  // The copy is judged: one tally entry per cell, the friendly line, and a celebration for a perfect copy. `quiet`: the
  // round ended while painting, no result view.
  submit(slot, quiet = false) {
    if (slot.phase !== 'paint') return;
    const { opts } = this;
    const { cells } = slot.model;
    const score = scoreGrid(slot.pattern.cells, cells);
    const ms = slot.t;
    for (let i = 0; i < score.total; i++) this.countResult(slot, !score.wrong.includes(i), ms / score.total, 'kunst');
    slot.level = adaptLevel(slot.level, score.accuracy, opts.adapt, opts.levels.length);
    slot.phase = 'result';
    slot.t = 0;
    if (quiet) return;
    const band = bandOf(score.accuracy, opts.bands);
    slot.easel.showResult(slot.pattern, cells, score.wrong);
    this.say(slot, `minigame.kunst.result.${band.key}`, { n: score.right, total: score.total });
    const { rect } = slot;
    this.pop.pop(rect.x + rect.w / 2, rect.y + 60, score.perfect ? this.ctx.t('minigame.kunst.perfect') : `${score.right}/${score.total}`, { sparkle: score.perfect ? opts.perfectSparkles : 0 });
    this.ctx.events.emit('sfx:play', { name: score.perfect ? 'kunst.perfect' : 'kunst.done', player: slot.index });
  }

  // The timer ran out: a copy in progress still counts. A pattern that is only being shown is not counted at all.
  finish(opts = {}) {
    if (!this.finished && !this.over && !opts.quit && !opts.silent) for (const slot of this.slots) this.submit(slot, true);
    super.finish(opts);
  }
}
