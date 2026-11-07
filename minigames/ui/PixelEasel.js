import { uiText } from '../../ui/uiKit.js';
import { canvasLayout, cellAt, paletteLayout, UNPAINTED } from '../kunstCore.js';

const WALL = 0xf3e7cf;
const FLOOR = 0xc79a62;
const WOOD = 0x8b5a2b;
const PAPER = 0xfffdf5;
const GRID_LINE = 0xd8d2c0;
const INK = '#4a3320';
const SWATCH = 20;
const MAX_SWATCHES = 6;
const DONE_W = 36;
const SPLATTERS = [[0.12, 0.2, 0xff8fc7], [0.86, 0.3, 0x9ad8ff], [0.9, 0.62, 0xffd43b], [0.08, 0.7, 0x4cc26b]];

// One player's art room: a bright wall with a painter's easel, the paper canvas for the pixel pattern and a wooden
// palette tray with paint swatches (the colours, then a "Fertig" button). The view only draws what the game hands it
// and reports taps; the model is PaintModel (kunstCore.js).
//   showPattern(pattern)           the pattern on the canvas (memorize phase, bar = time left)
//   showPaint(size, palette)       an empty canvas and the swatch row; refresh(model) after every change
//   showResult(pattern, cells, wrong)   pattern and copy side by side, wrong cells get a dot
//   onCell(x, y, drag) / onSwatch(i) / onDone()   mouse and touch: paint, choose a colour, finish
export class PixelEasel {
  constructor(scene, ctx, rect, { colors, depth = 14 }) {
    this.scene = scene;
    this.ctx = ctx;
    this.rect = rect;
    this.colors = colors;
    this.depth = depth;
    this.mode = 'idle';
    this.size = 4;
    this.palette = [];
    this.onCell = null;
    this.onSwatch = null;
    this.onDone = null;
    const { x, y, w, h } = rect;
    const add = scene.add;
    add.rectangle(x, y, w, h, WALL).setOrigin(0).setDepth(depth);
    add.rectangle(x, y + h - 26, w, 26, FLOOR).setOrigin(0).setDepth(depth + 1);
    add.rectangle(x, y + h - 28, w, 3, 0xa87b45).setOrigin(0).setDepth(depth + 1);
    for (const [fx, fy, col] of SPLATTERS) {
      add.circle(x + fx * w, y + fy * h, 4, col, 0.55).setDepth(depth + 1);
      add.circle(x + fx * w + 5, y + fy * h + 3, 2, col, 0.55).setDepth(depth + 1);
    }
    this.art = add.graphics().setDepth(depth + 2);
    this.msg = uiText(scene, x + w / 2, y + 11, '', { fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold', color: INK, align: 'center', wordWrap: { width: w - 16 } }).setOrigin(0.5, 0).setDepth(depth + 6);
    this.sub = uiText(scene, x + w / 2, y + h - 14, '', { fontFamily: 'monospace', fontSize: '8px', color: INK, align: 'center', wordWrap: { width: w - 12 } }).setOrigin(0.5, 0.5).setDepth(depth + 6);
    this.labels = [0, 1].map(() => uiText(scene, 0, 0, '', { fontFamily: 'monospace', fontSize: '7px', color: INK }).setOrigin(0.5, 1).setDepth(depth + 6).setVisible(false));
    this.barBack = add.rectangle(x + w / 2, y + 25, 120, 4, 0xc9b99a).setDepth(depth + 3).setVisible(false);
    this.barFill = add.rectangle(x + w / 2 - 60, y + 25, 120, 4, 0xe5484d).setOrigin(0, 0.5).setDepth(depth + 4).setVisible(false);
    this.canvasZone = add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0).setDepth(depth + 8).setInteractive({ useHandCursor: true }).setVisible(false);
    this.canvasZone.on('pointerdown', (p, lx, ly) => this.tapCell(lx + x, ly + y, false));
    this.canvasZone.on('pointermove', (p, lx, ly) => { if (p.isDown) this.tapCell(lx + x, ly + y, true); });
    this.zones = [];
    this.numbers = [];
    for (let i = 0; i < MAX_SWATCHES; i++) {
      const zone = add.rectangle(0, 0, SWATCH, SWATCH, 0xffffff, 0.001).setDepth(depth + 8).setInteractive({ useHandCursor: true }).setVisible(false);
      zone.on('pointerdown', () => { if (this.mode === 'paint') this.onSwatch?.(i); });
      this.zones.push(zone);
      this.numbers.push(uiText(scene, 0, 0, i < 4 ? String(i + 1) : '', { fontFamily: 'monospace', fontSize: '7px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 }).setOrigin(0.5).setDepth(depth + 7).setVisible(false));
    }
    this.doneZone = add.rectangle(0, 0, DONE_W, SWATCH, 0xffffff, 0.001).setDepth(depth + 8).setInteractive({ useHandCursor: true }).setVisible(false);
    this.doneZone.on('pointerdown', () => { if (this.mode === 'paint') this.onDone?.(); });
    this.done = uiText(scene, 0, 0, '', { fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold', color: '#ffffff', stroke: '#2f6b3a', strokeThickness: 2 }).setOrigin(0.5).setDepth(depth + 7).setVisible(false);
    this.layout = canvasLayout(rect, this.size);
    this.drawRoom();
  }

  retext() {
    const t = this.ctx.t;
    this.done.setText(t('minigame.kunst.done'));
    this.labels[0].setText(t('minigame.kunst.target'));
    this.labels[1].setText(t('minigame.kunst.yours'));
  }

  setMessage(text) { this.msg.setText(text); }

  setSub(text) { this.sub.setText(text); }

  setBar(frac) {
    this.barFill.setScale(Math.max(0, Math.min(1, frac)), 1);
  }

  // x, y in layout space
  tapCell(x, y, drag) {
    if (this.mode !== 'paint') return;
    const cell = cellAt(this.layout, this.size, x, y);
    if (cell) this.onCell?.(cell.x, cell.y, drag);
  }

  setMode(mode, size) {
    this.mode = mode;
    this.size = size;
    this.layout = canvasLayout(this.rect, size, { split: mode === 'result' });
    const { cell, ox, oy } = this.layout;
    this.barBack.setVisible(mode === 'show');
    this.barFill.setVisible(mode === 'show');
    this.canvasZone.setVisible(mode === 'paint');
    this.labels.forEach((l, i) => l.setVisible(mode === 'result').setPosition(ox[i] + (cell * size) / 2, oy + cell * size + 14));
  }

  showPattern(pattern) {
    this.setMode('show', pattern.size);
    this.palette = [];
    this.pattern = pattern;
    this.setBar(1);
    this.hideSwatches();
    this.drawRoom();
    this.drawGrid(0, pattern.cells);
  }

  showPaint(size, palette) {
    this.setMode('paint', size);
    this.palette = palette;
    this.pattern = null;
    this.placeSwatches();
  }

  showResult(pattern, cells, wrong) {
    this.setMode('result', pattern.size);
    this.palette = [];
    this.hideSwatches();
    this.drawRoom();
    this.drawGrid(0, pattern.cells);
    this.drawGrid(1, cells);
    const { cell, ox, oy } = this.layout;
    this.art.fillStyle(0x2b2d42, 0.85);
    for (const i of wrong) this.art.fillCircle(ox[1] + (i % pattern.size) * cell + cell / 2, oy + Math.floor(i / pattern.size) * cell + cell / 2, Math.max(1.5, cell / 8));
  }

  hideSwatches() {
    for (const z of this.zones) z.setVisible(false);
    for (const n of this.numbers) n.setVisible(false);
    this.doneZone.setVisible(false);
    this.done.setVisible(false);
  }

  placeSwatches() {
    const items = paletteLayout(this.rect, this.palette.length, { item: SWATCH, wide: DONE_W });
    const sy = this.layout.oy + this.layout.cell * this.size + 20;
    this.swatchY = sy;
    this.items = items;
    this.zones.forEach((z, i) => {
      const it = items[i];
      z.setVisible(i < this.palette.length);
      if (it) z.setPosition(it.cx, sy);
    });
    this.numbers.forEach((n, i) => n.setVisible(i < this.palette.length && i < 4).setPosition(items[i]?.cx ?? 0, sy));
    const wide = items[this.palette.length];
    this.doneZone.setVisible(true).setPosition(wide.cx, sy);
    this.done.setVisible(true).setPosition(wide.cx, sy);
  }

  drawRoom() {
    const { rect, layout, size, art, mode } = this;
    const { cell, ox, oy } = layout;
    art.clear();
    const span = cell * size;
    if (mode === 'show' || mode === 'paint') {
      // easel: two legs behind a wooden board, clips on top
      const mid = ox[0] + span / 2;
      const floorY = rect.y + rect.h - 26;
      art.lineStyle(4, 0x5b3d22, 1).lineBetween(mid - span / 2 + 6, oy + span, mid - span / 2 - 6, floorY).lineBetween(mid + span / 2 - 6, oy + span, mid + span / 2 + 6, floorY);
      art.fillStyle(WOOD, 1).fillRect(ox[0] - 7, oy - 7, span + 14, span + 14);
      art.fillStyle(0xb0b0b8, 1).fillRect(mid - 14, oy - 10, 6, 5).fillRect(mid + 8, oy - 10, 6, 5);
    }
    for (let i = 0; i < (mode === 'result' ? 2 : 1); i++) {
      art.fillStyle(WOOD, 1).fillRect(ox[i] - 4, oy - 4, span + 8, span + 8);
      art.fillStyle(PAPER, 1).fillRect(ox[i], oy, span, span);
    }
  }

  drawGrid(index, cells) {
    const { cell, ox, oy } = this.layout;
    const { art, size } = this;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === UNPAINTED) continue;
      art.fillStyle(this.colors[cells[i]], 1).fillRect(ox[index] + (i % size) * cell, oy + Math.floor(i / size) * cell, cell, cell);
    }
    art.fillStyle(GRID_LINE, 1);
    for (let k = 1; k < size; k++) {
      art.fillRect(ox[index] + k * cell, oy, 1, cell * size);
      art.fillRect(ox[index], oy + k * cell, cell * size, 1);
    }
  }

  // Paint phase: canvas with the painted cells, the cursor and the swatch row.
  refresh(model) {
    this.drawRoom();
    const { cell, ox, oy } = this.layout;
    const { art } = this;
    this.drawGrid(0, model.cells);
    if (model.focus === 'grid') {
      art.lineStyle(3, 0xffffff, 1).strokeRect(ox[0] + model.cx * cell, oy + model.cy * cell, cell, cell);
      art.lineStyle(1, 0x2b2d42, 1).strokeRect(ox[0] + model.cx * cell, oy + model.cy * cell, cell, cell);
    }
    // wooden tray under the canvas with paint swatches
    const first = this.items[0];
    const last = this.items[this.items.length - 1];
    const sy = this.swatchY;
    art.fillStyle(0xb98a58, 1).fillRoundedRect(first.cx - first.w / 2 - 6, sy - SWATCH / 2 - 4, last.cx + last.w / 2 - first.cx + first.w / 2 + 12, SWATCH + 8, 4);
    this.palette.forEach((idx, i) => {
      const it = this.items[i];
      art.fillStyle(this.colors[idx], 1).fillCircle(it.cx, sy, SWATCH / 2 - 1);
      if (i === model.color) art.lineStyle(2, 0xffffff, 1).strokeCircle(it.cx, sy, SWATCH / 2 + 1);
    });
    const wide = this.items[this.palette.length];
    art.fillStyle(0x3f9b52, 1).fillRoundedRect(wide.cx - wide.w / 2, sy - SWATCH / 2 + 1, wide.w, SWATCH - 2, 4);
    if (model.focus === 'palette') {
      const it = this.items[model.item];
      art.lineStyle(2, 0xffe14d, 1);
      if (model.item < this.palette.length) art.strokeCircle(it.cx, sy, SWATCH / 2 + 3);
      else art.strokeRoundedRect(it.cx - it.w / 2 - 2, sy - SWATCH / 2 - 1, it.w + 4, SWATCH + 2, 5);
    }
  }
}
