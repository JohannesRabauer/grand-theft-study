import { uiText } from '../../ui/uiKit.js';
import { darken, lighten } from '../../scenes/HiResArt.js';
import { MAX_BINS, binAt, layoutFor } from '../scienceCore.js';

const TUBE_COLORS = ['#4dabf7', '#ffa94d', '#69db7c', '#da77f2'];
const EDGE = 0xd9a521;
const hex = c => parseInt(c.slice(1), 16);
const TUBE = { w: 16, h: 38, top: 30 };

// The "Sortier-Labor" view in a player's area: the question, one item label at a time on a lab-table card and the category
// bins as test-tube racks whose liquid rises with every item put in. The player drops the card into a bin by dragging it,
// tapping a bin or (through the game) the cursor and number keys; the view only reports onBin(index) and onHint().
// Reveal paints each bin green or amber after the judging.
export class SortLab {
  constructor(scene, ctx, rect, { depth = 12 } = {}) {
    this.scene = scene;
    this.ctx = ctx;
    this.rect = rect;
    this.depth = depth;
    this.onBin = null;
    this.onHint = null;
    this.locked = true;
    this.count = 0;
    this.total = 1;
    this.levels = new Array(MAX_BINS).fill(0);
    this.focus = 0;
    this.home = { x: 0, y: 0 };
    this.binRects = [];
    this.objects = [];
    const own = o => { this.objects.push(o); return o; };
    const big = rect.w > 300;
    const font = { fontFamily: 'monospace', color: '#ffffff' };
    this.question = own(uiText(scene, rect.x + 6, rect.y + 4, '', { ...font, fontSize: big ? '12px' : '10px', wordWrap: { width: rect.w - 12 }, lineSpacing: 2 }).setDepth(depth));
    this.trays = Array.from({ length: MAX_BINS }, (_, i) => {
      const tray = own(scene.add.rectangle(0, 0, 10, 10, 0x1a2230, 0.92).setOrigin(0).setDepth(depth).setInteractive({ useHandCursor: true }));
      const label = own(uiText(scene, 0, 0, '', { ...font, fontSize: big ? '9px' : '8px', fontStyle: 'bold', align: 'center', wordWrap: { width: 50 } }).setOrigin(0.5, 0).setDepth(depth + 2));
      tray.on('pointerover', () => this.hover(i));
      tray.on('pointerdown', () => this.tap(i));
      return { tray, label };
    });
    this.tubes = own(scene.add.graphics().setDepth(depth + 1));
    this.card = own(scene.add.rectangle(0, 0, 100, 30, 0xf4efe0).setDepth(depth + 3).setStrokeStyle(2, 0x8b5a2b).setInteractive({ useHandCursor: true }));
    this.shine = own(scene.add.rectangle(0, 0, 100, 4, 0xffffff, 0.7).setDepth(depth + 4));
    this.word = own(uiText(scene, 0, 0, '', { fontFamily: 'monospace', fontSize: big ? '13px' : '11px', fontStyle: 'bold', color: '#2a2018' }).setOrigin(0.5).setDepth(depth + 4));
    this.ghost = own(scene.add.rectangle(0, 0, 40, 14, 0xf4efe0).setDepth(depth + 5).setStrokeStyle(1, 0x8b5a2b).setVisible(false));
    this.hintBtn = own(scene.add.circle(0, 0, 9, 0x28506f).setDepth(depth + 3).setStrokeStyle(1, 0x9fd0ff).setInteractive({ useHandCursor: true }));
    this.hintMark = own(uiText(scene, 0, 0, '?', { ...font, fontSize: '11px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(depth + 4));
    this.hintBtn.on('pointerdown', () => { if (!this.locked) this.onHint?.(); });
    scene.input.setDraggable(this.card);
    this.card.on('drag', (p, x, y) => { if (!this.locked) this.moveCard(x, y); });
    this.card.on('dragend', () => this.dropCard());
    this.hide();
  }

  // Shows a task: `set` from scienceCore.sortSet.
  show(set, question) {
    const { rect } = this;
    const layout = layoutFor(rect, 'sort', set.cats.length);
    this.count = set.cats.length;
    this.total = set.items.length;
    this.levels.fill(0);
    this.focus = 0;
    this.binRects = layout.bins;
    this.home.x = layout.card.x + layout.card.w / 2;
    this.home.y = layout.card.y + layout.card.h / 2;
    this.card.setSize(layout.card.w, layout.card.h);
    this.shine.setSize(layout.card.w - 4, 4);
    this.hintBtn.setPosition(rect.x + rect.w - 14, this.home.y);
    this.hintMark.setPosition(rect.x + rect.w - 14, this.home.y);
    this.trays.forEach(({ tray, label }, i) => {
      const r = layout.bins[i];
      const on = i < this.count;
      tray.setVisible(on);
      label.setVisible(on);
      if (!on) return;
      tray.setPosition(r.x, r.y).setSize(r.w, r.h);
      label.setPosition(r.x + r.w / 2, r.y + 4).setWordWrapWidth(r.w - 6);
    });
    this.retext(set, question);
    this.question.setVisible(true);
    this.tubes.setVisible(true);
    this.setHint(false);
    this.reveal(null);
    this.paint();
  }

  // Texts after a language switch (labels, question, the card).
  retext(set, question, item = this.shown) {
    this.question.setText(question);
    this.trays.forEach(({ label }, i) => { if (i < this.count) label.setText(set.cats[i].label); });
    if (item !== null && item !== undefined) this.word.setText(set.items[item].text).setScale(Math.min(1, (this.card.width - 10) / this.word.width));
  }

  // Puts the next item on the card (null = no item left).
  setCard(set, item) {
    this.shown = item;
    this.locked = item === null;
    this.card.setVisible(item !== null);
    this.shine.setVisible(item !== null);
    this.word.setVisible(item !== null);
    if (item === null) return;
    this.word.setText(set.items[item].text).setScale(Math.min(1, (this.card.width - 10) / this.word.width));
    this.moveCard(this.home.x, this.home.y);
    this.scene.tweens.killTweensOf(this.card);
    this.card.setScale(1.15);
    this.scene.tweens.add({ targets: this.card, scale: 1, duration: 160, ease: 'Back.easeOut' });
  }

  moveCard(x, y) {
    this.card.setPosition(x, y);
    this.shine.setPosition(x, y - this.card.height / 2 + 4);
    this.word.setPosition(x, y);
  }

  // A drag ended: into the bin under the card, else back home.
  dropCard() {
    if (this.locked) return;
    const b = binAt(this.binRects.slice(0, this.count), this.card.x, this.card.y);
    this.moveCard(this.home.x, this.home.y);
    if (b >= 0) this.onBin?.(b);
  }

  // The card sinks into bin b: the liquid rises, a small copy flies there.
  place(b) {
    this.levels[b]++;
    const r = this.binRects[b];
    const { ghost, scene } = this;
    scene.tweens.killTweensOf(ghost);
    ghost.setPosition(this.home.x, this.home.y).setScale(1).setAlpha(1).setVisible(true);
    scene.tweens.add({ targets: ghost, x: r.x + r.w / 2, y: r.y + TUBE.top, scale: 0.4, alpha: 0.2, duration: 180, onComplete: () => ghost.setVisible(false) });
    this.paint();
  }

  hover(i) {
    if (this.locked || i >= this.count) return;
    this.setFocus(i);
  }

  tap(i) {
    if (!this.locked && i < this.count) this.onBin?.(i);
  }

  setFocus(i) {
    this.focus = i;
    this.paint();
  }

  setHint(on) {
    this.hintBtn.setVisible(on);
    this.hintMark.setVisible(on);
  }

  // After the judging: bad[b] true = a wrong item went into bin b (amber), else green. null clears.
  reveal(bad) {
    this.bad = bad;
    this.paint();
  }

  paint() {
    const g = this.tubes.clear();
    this.trays.forEach(({ tray }, i) => {
      if (i >= this.count) return;
      const color = hex(TUBE_COLORS[i]);
      const stroke = this.bad ? (this.bad[i] ? 0xe0a82e : 0x51cf66) : !this.locked && this.focus === i ? EDGE : color;
      tray.setFillStyle(0x1a2230, 0.92).setStrokeStyle(this.bad || (!this.locked && this.focus === i) ? 3 : 2, stroke);
      const r = this.binRects[i];
      const cx = r.x + r.w / 2;
      const top = r.y + TUBE.top;
      const level = Math.min(1, this.levels[i] / this.total);
      g.fillStyle(0xdff6ff, 0.12).fillRect(cx - TUBE.w / 2, top, TUBE.w, TUBE.h - 2).fillCircle(cx, top + TUBE.h - 2, TUBE.w / 2);
      if (level > 0) {
        const lh = Math.max(4, (TUBE.h - 4) * level);
        g.fillStyle(color, 0.95).fillRect(cx - TUBE.w / 2 + 1, top + TUBE.h - 2 - lh, TUBE.w - 2, lh).fillCircle(cx, top + TUBE.h - 2, TUBE.w / 2 - 1);
        g.fillStyle(hex(lighten(TUBE_COLORS[i], 0.5)), 0.9).fillRect(cx - TUBE.w / 2 + 1, top + TUBE.h - 2 - lh, TUBE.w - 2, 2);
      }
      g.lineStyle(1.5, hex(darken('#dff6ff', 0.1)), 0.85).beginPath().moveTo(cx - TUBE.w / 2, top).lineTo(cx - TUBE.w / 2, top + TUBE.h - 2).arc(cx, top + TUBE.h - 2, TUBE.w / 2, Math.PI, 0, true).lineTo(cx + TUBE.w / 2, top).strokePath();
      g.fillStyle(0xdff6ff, 0.7).fillRect(cx - TUBE.w / 2 - 2, top - 2, TUBE.w + 4, 3);
    });
  }

  hide() {
    this.locked = true;
    this.shown = null;
    this.bad = null;
    for (const o of this.objects) o.setVisible(false);
    this.tubes.clear();
  }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
