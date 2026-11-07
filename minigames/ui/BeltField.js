import { uiText } from '../../ui/uiKit.js';
import { darken, lighten } from '../../scenes/HiResArt.js';
import { BINS, Belt, binOf, crateX, laneX, moveLane, nounOf } from '../deutschCore.js';

const BOARD_H = 50;
const CRATE_H = 24;
const BIN_H = 50;
const MARK = { good: 0x6fd08a, soft: 0xffb347 };
const CHALK = '#f5f5e8';
const SORT_MS = 260;
const hex = c => parseInt(c.slice(1), 16);

// One player's Artikel-Sortierer in a classroom: a chalkboard with the task on top, a conveyor belt carrying the noun in
// a wooden crate from left to right and three cute bins (der blue square, die red circle, das green triangle: colour,
// shape and word all mark a bin) below it. A selector arrow shows the chosen bin; confirming, a number key (1-3) or a tap
// sorts the noun into it. The model (belt progress, routing) is Belt in deutschCore.js; this class draws it.
//   onResult(result)   the noun was sorted: { lane (bin), ok }
// The minigame calls show(), update(dt) (returns 'missed' when the noun reached the belt's end) and reveal().
export class BeltField {
  constructor(scene, ctx, rect, { depth = 14 } = {}) {
    this.ctx = ctx;
    this.rect = rect;
    this.belt = new Belt();
    this.onResult = null;
    this.q = null;
    this.view = null;
    this.meta = null;
    this.noun = '';
    this.correct = 0;
    this.bin = 1;
    this.locked = true;
    this.hintsUsed = 0;
    this.fb = null;
    this.timeout = false;
    this.anim = null;
    this.objects = [];
    const { x, y, w, h } = rect;
    const own = o => { this.objects.push(o); return o; };
    const add = scene.add;
    this.beltY = y + BOARD_H + 34;
    this.binTop = y + h - BIN_H - 28;
    this.crateY = this.beltY - CRATE_H / 2 - 1;
    this.x0 = x + 34;
    this.x1 = x + w - 34;
    own(add.rectangle(x, y, w, h, 0xf3ead0).setOrigin(0).setDepth(depth));
    own(add.rectangle(x, y + h - 30, w, 30, 0xb98a58).setOrigin(0).setDepth(depth));
    own(add.rectangle(x, y + h - 30, w, 2, 0x5b3d22).setOrigin(0).setDepth(depth + 1));
    // chalkboard with a wooden frame and a tray
    own(add.rectangle(x + 5, y + 5, w - 10, BOARD_H, 0x2f5d46).setOrigin(0).setDepth(depth + 1).setStrokeStyle(3, 0x8b5a2b));
    own(add.rectangle(x + 12, y + BOARD_H + 5, w - 24, 4, 0xc9a06a).setOrigin(0).setDepth(depth + 1));
    own(add.rectangle(x + 20, y + BOARD_H + 3, 10, 2, 0xffffff).setOrigin(0).setDepth(depth + 2));
    own(add.rectangle(x + 34, y + BOARD_H + 3, 7, 2, 0xffd0d8).setOrigin(0).setDepth(depth + 2));
    this.board = own(uiText(scene, x + 12, y + 9, '', { fontFamily: 'monospace', fontSize: '10px', color: CHALK, wordWrap: { width: w - 24 }, lineSpacing: 2, maxLines: 6 }).setDepth(depth + 3));
    this.boardBig = w > 300 ? 11 : 10;
    // the belt: legs, steel body, end rollers and a pool of tread marks that slide with it
    for (const lx of [x + 18, x + w - 22]) own(add.rectangle(lx, this.beltY + 12, 5, 30, 0x555b69).setOrigin(0).setDepth(depth + 1));
    own(add.rectangle(x + 8, this.beltY, w - 16, 12, 0x3b3f4a).setOrigin(0).setDepth(depth + 2));
    own(add.rectangle(x + 8, this.beltY, w - 16, 2, 0x7d8494).setOrigin(0).setDepth(depth + 3));
    for (const rx of [x + 10, x + w - 10]) own(add.circle(rx, this.beltY + 6, 7, 0x2b2f3a).setDepth(depth + 3).setStrokeStyle(2, 0x9aa1b1));
    this.treads = [];
    this.treadGap = 14;
    for (let tx = x + 14; tx < x + w - 14; tx += this.treadGap) this.treads.push(own(add.rectangle(tx, this.beltY + 4, 3, 6, 0x5a6070).setOrigin(0.5, 0).setDepth(depth + 3)));
    this.treadSpan = this.treads.length * this.treadGap;
    // the crate with the noun
    this.crateFace = add.rectangle(0, 0, 60, CRATE_H, 0xd9a15a).setStrokeStyle(2, 0x6b4423);
    const slat = add.rectangle(0, -CRATE_H / 2 + 3, 54, 2, 0xf0c98a);
    this.crateText = uiText(scene, 0, 1, '', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#2a1a0a' }).setOrigin(0.5);
    this.crate = own(add.container(0, 0, [this.crateFace, slat, this.crateText]).setDepth(depth + 4));
    // the bins
    const laneW = w / BINS.length;
    this.binW = Math.min(76, laneW - 8);
    const art = own(add.graphics().setDepth(depth + 2));
    BINS.forEach((b, i) => this.drawBin(art, laneX(x, w, i, BINS.length), b));
    this.marks = BINS.map((b, i) => own(add.rectangle(laneX(x, w, i, BINS.length), this.binTop + BIN_H / 2 + 2, this.binW + 8, BIN_H + 10).setFillStyle(0xffffff, 0).setDepth(depth + 5).setVisible(false)));
    this.labels = BINS.map((b, i) => own(uiText(scene, laneX(x, w, i, BINS.length) + 8, this.binTop + 31, b.article, { fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#ffffff', stroke: '#1b1b2f', strokeThickness: 3 }).setOrigin(0.5).setDepth(depth + 4)));
    BINS.forEach((b, i) => own(uiText(scene, laneX(x, w, i, BINS.length), this.binTop + BIN_H + 3, String(i + 1), { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' }).setOrigin(0.5, 0).setDepth(depth + 4)));
    this.arrow = own(add.triangle(0, 0, 0, 0, 14, 0, 7, 9, 0xffd43b).setOrigin(0.5).setDepth(depth + 6).setStrokeStyle(1, 0x1b1b2f));
    BINS.forEach((b, i) => {
      const zone = own(add.rectangle(laneX(x, w, i, BINS.length), this.binTop + BIN_H / 2, laneW, BIN_H + 24, 0xffffff, 0.001).setDepth(depth + 6).setInteractive({ useHandCursor: true }));
      zone.on('pointerover', () => this.select(i));
      zone.on('pointerdown', () => { this.select(i); this.sort(i); });
    });
    this.hintBg = own(add.rectangle(x + 8, y + h - 16, w - 16, 13, 0x28506f).setOrigin(0).setDepth(depth + 3).setInteractive({ useHandCursor: true }));
    this.hintText = own(uiText(scene, x + w / 2, y + h - 9.5, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' }).setOrigin(0.5).setDepth(depth + 4));
    this.hintBg.on('pointerdown', () => this.useHint());
    this.hide();
  }

  // A bin: shadow, tapered body (side shade, rim, dark opening) and the shape badge. The article text is a Phaser text.
  drawBin(g, cx, bin) {
    const base = hex(bin.color);
    const top = this.binTop;
    const bw = this.binW;
    g.fillStyle(0x000000, 0.18).fillEllipse(cx, top + BIN_H + 1, bw + 6, 8);
    g.fillStyle(base).fillPoints([{ x: cx - bw / 2, y: top + 6 }, { x: cx + bw / 2, y: top + 6 }, { x: cx + bw / 2 - 5, y: top + BIN_H }, { x: cx - bw / 2 + 5, y: top + BIN_H }], true);
    g.fillStyle(hex(darken(bin.color, 0.3))).fillPoints([{ x: cx + bw / 2 - 12, y: top + 6 }, { x: cx + bw / 2, y: top + 6 }, { x: cx + bw / 2 - 5, y: top + BIN_H }, { x: cx + bw / 2 - 15, y: top + BIN_H }], true);
    g.fillStyle(hex(darken(bin.color, 0.55))).fillRect(cx - bw / 2 + 3, top + 6, bw - 6, 5);
    g.fillStyle(hex(lighten(bin.color, 0.35))).fillRoundedRect(cx - bw / 2 - 3, top, bw + 6, 7, 3);
    g.lineStyle(2, 0x1b1b2f).strokeRoundedRect(cx - bw / 2 - 3, top, bw + 6, 7, 3);
    const bx = cx - bw / 2 + 12;
    const by = top + 31;
    g.fillStyle(0xffffff).lineStyle(2, 0x1b1b2f);
    if (bin.shape === 'square') { g.fillRect(bx - 5, by - 5, 10, 10); g.strokeRect(bx - 5, by - 5, 10, 10); }
    else if (bin.shape === 'circle') { g.fillCircle(bx, by, 5.5); g.strokeCircle(bx, by, 5.5); }
    else { g.fillTriangle(bx, by - 6, bx - 6, by + 5, bx + 6, by + 5); g.strokeTriangle(bx, by - 6, bx - 6, by + 5, bx + 6, by + 5); }
  }

  get hintsLeft() { return this.q ? Math.min(this.meta.hintsAllowed, this.view.hints.length) - this.hintsUsed : 0; }

  setVisible(on) {
    for (const o of this.objects) o.setVisible(on);
  }

  hide() {
    this.locked = true;
    this.q = null;
    this.belt.state = 'idle';
    this.anim = null;
    this.setVisible(false);
  }

  // Shows the noun of an Artikel item (deutschCore.beltable) on the belt; it needs travelMs to reach the end.
  show(question, travelMs) {
    this.q = question;
    this.meta = question.meta;
    this.view = this.ctx.learning.localize(question);
    this.noun = nounOf(question);
    this.correct = binOf(question);
    this.fb = null;
    this.timeout = false;
    this.hintsUsed = 0;
    this.locked = false;
    this.anim = null;
    this.bin = 1;
    this.belt.start(travelMs, this.correct);
    this.setVisible(true);
    for (const m of this.marks) m.setVisible(false);
    for (const l of this.labels) l.setAlpha(1);
    this.crateText.setText(this.noun);
    const cw = Math.max(54, this.noun.length * 8 + 14);
    this.crateFace.setSize(cw, CRATE_H);
    this.crate.setScale(1).setAlpha(1);
    this.place();
    this.render();
  }

  place() {
    const { rect } = this;
    if (!this.anim) this.crate.setPosition(crateX(this.belt.progress, this.x0, this.x1), this.crateY);
    this.arrow.setPosition(laneX(rect.x, rect.w, this.bin, BINS.length), this.binTop - 9);
  }

  select(bin) {
    if (this.locked) return;
    this.bin = bin;
    this.place();
  }

  update(dt, time) {
    if (this.q) {
      const shift = (time * 0.02) % this.treadGap;
      for (let i = 0; i < this.treads.length; i++) this.treads[i].x = this.rect.x + 14 + ((i * this.treadGap + shift) % this.treadSpan);
    }
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / SORT_MS);
      const e = a.t * a.t;
      this.crate.setPosition(a.x + (a.tx - a.x) * a.t, a.y + (a.ty - a.y) * e).setScale(1 - 0.4 * a.t).setAlpha(a.fade ? 1 - a.t : 1 - Math.max(0, a.t - 0.6) * 2.5);
      if (a.t >= 1) this.anim = null;
    }
    if (this.locked) return null;
    const ended = this.belt.tick(dt);
    this.place();
    return ended;
  }

  // Sends the noun into `bin` if it is still on the belt; the minigame judges the result (onResult).
  sort(bin) {
    const result = this.belt.route(bin);
    if (!result) return;
    this.locked = true;
    this.startAnim(laneX(this.rect.x, this.rect.w, bin, BINS.length), this.binTop + 14, false);
    this.onResult?.(result);
  }

  startAnim(tx, ty, fade) {
    this.anim = { x: this.crate.x, y: this.crate.y, tx, ty, t: 0, fade };
  }

  useHint() {
    if (this.locked || this.hintsLeft <= 0) return;
    this.hintsUsed++;
    this.render();
  }

  // Cursor step from ChoiceCursor: dx moves the selector, confirm sorts into the selected bin, a number key (1-3) sorts at
  // once, down asks for a hint.
  nav({ dx, dy, confirm, pick }) {
    if (this.locked) return;
    if (pick > 0) {
      if (pick <= BINS.length) { this.select(pick - 1); this.sort(pick - 1); }
      return;
    }
    if (dx) this.select(moveLane(this.bin, dx, BINS.length));
    if (dy > 0) this.useHint();
    if (confirm) this.sort(this.bin);
  }

  // Marks the outcome: the right bin glows green, a wrong pick amber; the board shows the funny reaction and, after a
  // mistake, the right article with the noun and the explanation. `timeout`: the noun rode off the belt unsorted.
  reveal(result, fb, timeout = false) {
    this.locked = true;
    this.fb = fb;
    this.timeout = timeout;
    this.marks.forEach((m, i) => {
      const right = i === this.correct;
      const picked = result?.lane === i;
      m.setVisible(right || picked).setStrokeStyle(4, right ? MARK.good : MARK.soft);
    });
    if (timeout) this.startAnim(this.x1 + 20, this.beltY + 70, true);
    this.render();
  }

  render() {
    const { ctx, view, fb } = this;
    if (!this.q) return;
    let text = ctx.t('minigame.deutsch.beltPrompt');
    let size = this.boardBig;
    if (fb) {
      size = 8;
      text = `${this.timeout ? `${ctx.t('minigame.deutsch.timeout')} ` : ''}${ctx.t(fb.reaction)}`;
      if (!fb.ok) text += `\n${ctx.t('minigame.correctWas', { answer: `${BINS[this.correct].article} ${this.noun}` })}\n${view.explain}`;
    } else if (this.hintsUsed > 0) {
      size = 8;
      text += `\n${ctx.t('minigame.hintLine', { hint: view.hints[this.hintsUsed - 1] })}`;
    }
    this.board.setText(text).setFontSize(size);
    const showHint = !fb && !this.locked && this.meta.hintsAllowed > 0 && view.hints.length > 0;
    this.hintBg.setVisible(showHint);
    this.hintText.setVisible(showHint);
    if (showHint) this.hintText.setText(ctx.t('minigame.deutsch.beltHint', { n: this.hintsLeft }));
  }

  // Re-resolves the board text after a language switch.
  retext() {
    if (!this.q) return;
    this.view = this.ctx.learning.localize(this.q);
    this.render();
  }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
