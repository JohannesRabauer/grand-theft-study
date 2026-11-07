import { uiText } from '../../ui/uiKit.js';
import { FallingBlocks, blockY, laneX, moveLane } from '../matheCore.js';

const LANE_COLORS = [0xff7a59, 0x4dabf7, 0x8ce99a, 0xffd43b];
const BOARD_H = 64;
const FLOOR_H = 36;
const BLOCK_H = 26;
const MARK = { good: 0x6fd08a, soft: 0xffb347 };
const CHALK = '#f5f5e8';

// One player's falling-block playfield in a bright classroom: a chalkboard with the equation on top, answer blocks
// falling in lanes towards the ground line and a catcher on the floor that the player moves with the cursor. The
// model (fall progress, catching) is FallingBlocks in matheCore.js; this class draws it and reports taps.
//   onResult(result)   a block was taken: { lane, ok }  (keys, number keys, tap)
// The minigame calls show(), update(dt) per frame (returns 'landed' when nothing was caught) and reveal().
export class BlockField {
  constructor(scene, ctx, rect, { depth = 14 } = {}) {
    this.scene = scene;
    this.ctx = ctx;
    this.rect = rect;
    this.depth = depth;
    this.fall = new FallingBlocks();
    this.onResult = null;
    this.q = null;
    this.view = null;
    this.set = null;
    this.meta = null;
    this.lane = 0;
    this.locked = true;
    this.hintsUsed = 0;
    this.fb = null;
    this.timeout = false;
    this.objects = [];
    const { x, y, w, h } = rect;
    this.groundY = y + h - FLOOR_H;
    this.playTop = y + BOARD_H + 14;
    this.blockW = 40;
    const own = o => { this.objects.push(o); return o; };
    const add = scene.add;
    own(add.rectangle(x, y, w, h, 0xf6efd9).setOrigin(0).setDepth(depth));
    own(add.rectangle(x, this.groundY - 6, w, 6, 0xe2d3a8).setOrigin(0).setDepth(depth));
    own(add.rectangle(x, this.groundY, w, FLOOR_H, 0xb98a58).setOrigin(0).setDepth(depth));
    for (let px = x + 24; px < x + w; px += 46) own(add.rectangle(px, this.groundY + 1, 1, FLOOR_H - 1, 0x9a6f43).setOrigin(0).setDepth(depth + 1));
    own(add.rectangle(x, this.groundY, w, 2, 0x5b3d22).setOrigin(0).setDepth(depth + 2));
    this.lanes = own(add.graphics().setDepth(depth + 1));
    // chalkboard with a wooden frame and a tray with chalk
    own(add.rectangle(x + 5, y + 5, w - 10, BOARD_H, 0x2f5d46).setOrigin(0).setDepth(depth + 1).setStrokeStyle(3, 0x8b5a2b));
    own(add.rectangle(x + 12, y + BOARD_H + 5, w - 24, 4, 0xc9a06a).setOrigin(0).setDepth(depth + 1));
    own(add.rectangle(x + 20, y + BOARD_H + 3, 10, 2, 0xffffff).setOrigin(0).setDepth(depth + 2));
    own(add.rectangle(x + 34, y + BOARD_H + 3, 7, 2, 0xffd0d8).setOrigin(0).setDepth(depth + 2));
    this.board = own(uiText(scene, x + 12, y + 9, '', {
      fontFamily: 'monospace', fontSize: '12px', color: CHALK, wordWrap: { width: w - 24 }, lineSpacing: 2, maxLines: 6
    }).setDepth(depth + 3));
    this.boardBig = w > 300 ? 13 : 11;
    // the tap zone over the play area: a tap takes the block of that lane
    this.zone = own(add.rectangle(x, this.playTop - 8, w, this.groundY - this.playTop + 8, 0xffffff, 0.001).setOrigin(0).setDepth(depth + 4).setInteractive({ useHandCursor: true }));
    this.zone.on('pointermove', (p, lx) => this.pointerLane(lx, false));
    this.zone.on('pointerdown', (p, lx) => this.pointerLane(lx, true));
    this.blocks = [];
    for (let i = 0; i < 4; i++) {
      const face = add.rectangle(0, 0, this.blockW, BLOCK_H, 0xffffff).setStrokeStyle(2, 0x1b1b2f);
      const shine = add.rectangle(0, -BLOCK_H / 2 + 4, this.blockW - 6, 3, 0xffffff, 0.55);
      const text = uiText(scene, 0, 1, '', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#1b1b2f' }).setOrigin(0.5);
      const box = own(add.container(0, 0, [face, shine, text]).setDepth(depth + 3));
      this.blocks.push({ box, face, text });
    }
    this.catcher = own(add.rectangle(0, this.groundY + 4, 40, 12, 0x3a4152).setOrigin(0.5, 0).setDepth(depth + 3).setStrokeStyle(2, 0xd9a521));
    this.hintBg = own(add.rectangle(x + 8, this.groundY + FLOOR_H - 16, w - 16, 13, 0x28506f).setOrigin(0).setDepth(depth + 3).setInteractive({ useHandCursor: true }));
    this.hintText = own(uiText(scene, x + w / 2, this.groundY + FLOOR_H - 9.5, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' }).setOrigin(0.5).setDepth(depth + 4));
    this.hintBg.on('pointerdown', () => this.useHint());
    this.hide();
  }

  get count() { return this.set?.texts.length ?? 0; }

  get hintsLeft() { return this.q ? Math.min(this.meta.hintsAllowed, this.view.hints.length) - this.hintsUsed : 0; }

  setVisible(on) {
    for (const o of this.objects) o.setVisible(on);
  }

  hide() {
    this.locked = true;
    this.q = null;
    this.fall.state = 'idle';
    this.setVisible(false);
  }

  // Shows the question on the board and lets the blocks of `set` (matheCore.blockSet) fall for fallMs.
  show(question, set, fallMs) {
    const { rect } = this;
    this.q = question;
    this.meta = question.meta;
    this.view = this.ctx.learning.localize(question);
    this.set = set;
    this.fb = null;
    this.timeout = false;
    this.hintsUsed = 0;
    this.locked = false;
    this.lane = Math.floor((this.count - 1) / 2);
    this.fall.start(fallMs, this.count, set.correct);
    this.setVisible(true);
    const laneW = rect.w / this.count;
    this.blockW = Math.min(44, laneW - 6);
    this.lanes.clear();
    for (let i = 0; i < this.count; i += 2) this.lanes.fillStyle(0xe9dcb6, 0.7).fillRect(rect.x + i * laneW, this.playTop - 8, laneW, this.groundY - this.playTop + 8);
    this.catcher.setSize(laneW - 10, 12);
    this.blocks.forEach((b, i) => {
      const on = i < this.count;
      b.box.setVisible(on).setAlpha(1);
      if (!on) return;
      b.face.setSize(this.blockW, BLOCK_H).setFillStyle(LANE_COLORS[i]).setStrokeStyle(2, 0x1b1b2f);
      b.text.setText(set.texts[i]);
      b.text.setFontSize(set.texts[i].length > 5 ? 9 : 12);
    });
    this.place();
    this.render();
  }

  place() {
    const { rect } = this;
    const y = blockY(this.fall.progress, this.playTop + BLOCK_H / 2, this.groundY - BLOCK_H / 2);
    for (let i = 0; i < this.count; i++) this.blocks[i].box.setPosition(laneX(rect.x, rect.w, i, this.count), y);
    this.catcher.setX(laneX(rect.x, rect.w, this.lane, this.count));
  }

  update(dt) {
    if (this.locked) return null;
    const ended = this.fall.tick(dt);
    this.place();
    return ended;
  }

  blockCenter(lane) {
    const b = this.blocks[lane].box;
    return { x: b.x, y: b.y };
  }

  pointerLane(localX, press) {
    if (this.locked) return;
    const lane = Math.min(this.count - 1, Math.max(0, Math.floor((localX / this.rect.w) * this.count)));
    this.lane = lane;
    this.catcher.setX(laneX(this.rect.x, this.rect.w, lane, this.count));
    if (press) this.grab(lane);
  }

  // Takes the block of `lane` if the round still runs; the minigame judges the result (onResult).
  grab(lane) {
    const result = this.fall.catchLane(lane);
    if (!result) return;
    this.locked = true;
    this.onResult?.(result);
  }

  useHint() {
    if (this.locked || this.hintsLeft <= 0) return;
    this.hintsUsed++;
    this.render();
  }

  // Cursor step from ChoiceCursor: dx moves the catcher, confirm takes the block above it, a number key takes that
  // lane at once, down asks for a hint.
  nav({ dx, dy, confirm, pick }) {
    if (this.locked) return;
    if (pick > 0) {
      if (pick <= this.count) { this.lane = pick - 1; this.grab(this.lane); }
      return;
    }
    if (dx) {
      this.lane = moveLane(this.lane, dx, this.count);
      this.catcher.setX(laneX(this.rect.x, this.rect.w, this.lane, this.count));
    }
    if (dy > 0) this.useHint();
    if (confirm) this.grab(this.lane);
  }

  // Marks the outcome: the right block turns green, a wrong pick amber, the others fade; the board shows the funny
  // reaction and, after a mistake, the right answer and the explanation. `timeout`: the blocks landed uncaught.
  reveal(result, fb, timeout = false) {
    this.locked = true;
    this.fb = fb;
    this.timeout = timeout;
    this.blocks.forEach((b, i) => {
      if (i >= this.count) return;
      const right = i === this.set.correct;
      const picked = result?.lane === i;
      b.box.setAlpha(right || picked ? 1 : 0.35);
      if (right) b.face.setFillStyle(MARK.good);
      else if (picked) b.face.setFillStyle(MARK.soft);
    });
    this.render();
  }

  render() {
    const { ctx, view, fb } = this;
    if (!this.q) return;
    let text = view.q;
    let size = this.boardBig;
    if (fb) {
      size = 8;
      text = `${this.timeout ? `${ctx.t('minigame.mathe.timeout')} ` : ''}${ctx.t(fb.reaction)}`;
      if (!fb.ok) text += `\n${ctx.t('minigame.correctWas', { answer: this.set.texts[this.set.correct] })}\n${view.explain}`;
    } else if (this.hintsUsed > 0) {
      size = this.boardBig - 2;
      text += `\n${ctx.t('minigame.hintLine', { hint: view.hints[this.hintsUsed - 1] })}`;
    }
    this.board.setText(text).setFontSize(size);
    const showHint = !fb && !this.locked && this.meta.hintsAllowed > 0 && view.hints.length > 0;
    this.hintBg.setVisible(showHint);
    this.hintText.setVisible(showHint);
    if (showHint) this.hintText.setText(ctx.t('minigame.mathe.blockHint', { n: this.hintsLeft }));
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
