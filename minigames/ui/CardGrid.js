import { uiText } from '../../ui/uiKit.js';
import { darken, lighten } from '../../scenes/HiResArt.js';
import { gridFor, stepCard } from '../englischCore.js';

const MAX_CARDS = 8;
const GAP = 5;
const hex = c => parseInt(c.slice(1), 16);
// English cards are blue, German cards amber (plus the tiny EN / DE tag, so colour is never the only hint).
const SIDE = { en: { fill: '#2f6fb8', ink: '#ffffff', tag: 'EN' }, de: { fill: '#e0a82e', ink: '#1b1b2f', tag: 'DE' } };
const BACK = '#3d4f86';
const EDGE = 0xd9a521;

// The face-down / face-up cards of a MemoryBoard (englischCore.js) in a rectangle: a grid of two rows, 3 or 4 columns. A
// card shows its word and a tag for its language; matched cards get a green edge and stay up. The cursor is the focused
// card (nav: arrows move over the cards still in play, confirm turns the card); a tap turns a card, too. The grid only
// reports onFlip(index); the game flips the board and calls refresh().
export class CardGrid {
  constructor(scene, ctx, rect, { depth = 11 } = {}) {
    this.ctx = ctx;
    this.rect = rect;
    this.board = null;
    this.focus = 0;
    this.locked = true;
    this.onFlip = null;
    this.cols = 4;
    this.rows = 2;
    this.cw = 0;
    this.ch = 0;
    this.objects = [];
    const own = o => { this.objects.push(o); return o; };
    this.cards = Array.from({ length: MAX_CARDS }, (_, i) => {
      const bg = own(scene.add.rectangle(0, 0, 10, 10, 0).setOrigin(0).setDepth(depth).setInteractive({ useHandCursor: true }));
      const shine = own(scene.add.rectangle(0, 0, 10, 3, 0xffffff, 0.22).setOrigin(0).setDepth(depth + 1));
      const mark = own(uiText(scene, 0, 0, '?', { fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold', color: lighten(BACK, 0.45) }).setOrigin(0.5).setDepth(depth + 1));
      const word = own(uiText(scene, 0, 0, '', { fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(depth + 2));
      const tag = own(uiText(scene, 0, 0, '', { fontFamily: 'monospace', fontSize: '6px', color: '#ffffff' }).setOrigin(0, 0).setDepth(depth + 2));
      bg.on('pointerover', () => this.hover(i));
      bg.on('pointerdown', () => this.tap(i));
      return { bg, shine, mark, word, tag };
    });
    this.hide();
  }

  // Bottom edge of the cards (the game puts its note below).
  get bottom() { return this.rect.y + this.rows * this.ch + (this.rows - 1) * GAP; }

  show(board) {
    this.board = board;
    const n = board.cards.length;
    const { cols, rows } = gridFor(n / 2);
    this.cols = cols;
    this.rows = rows;
    const { rect } = this;
    const big = rect.w > 300;
    this.cw = Math.floor((rect.w - GAP * (cols - 1)) / cols);
    this.ch = Math.min(big ? 78 : 62, Math.floor((rect.h - GAP * (rows - 1)) / rows));
    this.cards.forEach((c, i) => {
      const x = rect.x + (i % cols) * (this.cw + GAP);
      const y = rect.y + Math.floor(i / cols) * (this.ch + GAP);
      c.bg.setPosition(x, y).setSize(this.cw, this.ch);
      c.shine.setPosition(x, y).setSize(this.cw, 3);
      c.mark.setPosition(x + this.cw / 2, y + this.ch / 2).setFontSize(big ? 26 : 20);
      c.word.setPosition(x + this.cw / 2, y + this.ch / 2 + 2).setFontSize(big ? 13 : 10);
      c.tag.setPosition(x + 3, y + 3);
      if (i < n) c.word.setText(board.cards[i].text).setScale(Math.min(1, (this.cw - 8) / c.word.width));
      c.tag.setText(i < n ? SIDE[board.cards[i].side].tag : '');
    });
    this.locked = false;
    this.focus = 0;
    this.refresh();
  }

  hide() {
    this.locked = true;
    this.board = null;
    for (const o of this.objects) o.setVisible(false);
  }

  // Repaints every card from the board state.
  refresh() {
    const { board } = this;
    if (!board) return;
    this.cards.forEach((c, i) => {
      const on = i < board.cards.length;
      for (const o of [c.bg, c.shine, c.mark, c.word, c.tag]) o.setVisible(on);
      if (!on) return;
      const faceUp = board.up[i] || board.done[i];
      const side = SIDE[board.cards[i].side];
      c.bg.setFillStyle(hex(faceUp ? (board.done[i] ? darken(side.fill, 0.28) : side.fill) : BACK));
      if (board.done[i]) c.bg.setStrokeStyle(2, 0x51cf66);
      else if (!this.locked && this.focus === i) c.bg.setStrokeStyle(2, EDGE);
      else c.bg.setStrokeStyle(1, hex(darken(faceUp ? side.fill : BACK, 0.4)));
      c.mark.setVisible(!faceUp);
      c.word.setVisible(faceUp).setColor(side.ink);
      c.tag.setVisible(faceUp).setColor(side.ink);
    });
  }

  // Cursor step from ChoiceCursor.
  nav({ dx, dy, confirm }) {
    if (this.locked || !this.board) return;
    if (dx || dy) {
      this.focus = stepCard(this.focus, dx, dy, this.cols, this.rows, this.board.done);
      this.refresh();
    }
    if (confirm) this.tap(this.focus);
  }

  hover(i) {
    if (this.locked || !this.board || i >= this.board.cards.length || this.board.done[i]) return;
    this.focus = i;
    this.refresh();
  }

  tap(i) {
    if (this.locked || !this.board || i >= this.board.cards.length) return;
    this.onFlip?.(i);
  }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
