import { uiText } from '../../ui/uiKit.js';
import { analyze, CELL_HALF, loopPath, placeCells, pointAt, stretch } from '../circuitCore.js';
import { layoutFor } from '../scienceCore.js';

const MAX_CELLS = 6;
const DOTS = 8;
const EDGE = 0xd9a521;
const COPPER = 0xc27c3a;
const COPPER_DARK = 0x6d3f17;
const CURRENT = 0xffe066;
const MARK = { good: 0x51cf66, soft: 0xe0a82e };
const INSET = { x: 24, y: 20 };
const FLOW_SPEED = 0.05; // px per ms

// The "Stromkreis-Tüftler" view: a lab breadboard with one drawn series loop (circuitCore cells in list order: battery,
// bulb, switch, wires, gaps, bridged gaps). Symbols are drawn procedurally for the loop's two orientations; the bulb glows
// with spark particles and the current flows as moving dots once the loop is closed. The cursor is a focus frame on a cell
// (nav through the game), a tap on a cell reports onPick(index). Marks put a green or amber ring on a cell.
export class CircuitBoard {
  constructor(scene, ctx, rect, { depth = 12 } = {}) {
    this.scene = scene;
    this.ctx = ctx;
    this.rect = rect;
    this.onPick = null;
    this.cells = [];
    this.slots = [];
    this.lit = false;
    this.focus = 0;
    this.locked = true;
    this.marks = new Map();
    this.path = null;
    this.phase = 0;
    this.acc = 0;
    this.spot = { x: 0, y: 0 };
    this.tmp = { x: 0, y: 0, edge: 0 };
    this.objects = [];
    const own = o => { this.objects.push(o); return o; };
    const font = { fontFamily: 'monospace', color: '#e8fff0' };
    this.question = own(uiText(scene, rect.x + 6, rect.y + 4, '', { ...font, color: '#ffffff', fontSize: rect.w > 300 ? '12px' : '10px', wordWrap: { width: rect.w - 12 }, lineSpacing: 2 }).setDepth(depth));
    this.gfx = own(scene.add.graphics().setDepth(depth));
    this.labels = Array.from({ length: MAX_CELLS }, () => own(uiText(scene, 0, 0, '', { ...font, fontSize: '8px', stroke: '#10281c', strokeThickness: 2 }).setDepth(depth + 2)));
    this.zones = Array.from({ length: MAX_CELLS }, (_, i) => {
      const zone = own(scene.add.rectangle(0, 0, 36, 36, 0xffffff, 0.001).setDepth(depth + 3).setInteractive({ useHandCursor: true }));
      zone.on('pointerover', () => this.hover(i));
      zone.on('pointerdown', () => this.tap(i));
      return zone;
    });
    this.frame = own(scene.add.rectangle(0, 0, 40, 32).setStrokeStyle(2, EDGE).setDepth(depth + 2));
    this.glow = [own(scene.add.circle(0, 0, 30, 0xffe066, 0.22)), own(scene.add.circle(0, 0, 18, 0xfff6c2, 0.4))];
    for (const g of this.glow) g.setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 1);
    scene.tweens.add({ targets: this.glow, scale: { from: 0.85, to: 1.2 }, duration: 480, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.dots = Array.from({ length: DOTS }, () => own(scene.add.circle(0, 0, 1.8, 0xfff6c2).setDepth(depth + 1)));
    this.fx = ctx.particles.createFor(scene, 'spark', 0.2);
    this.fx.emitter.setDepth(depth + 2);
    this.hide();
  }

  // Shows a circuit (the cells of a Science item) under `question`.
  show(cells, question) {
    const { board } = layoutFor(this.rect, 'circuit');
    this.path = loopPath(board.x + INSET.x, board.y + INSET.y, board.w - 2 * INSET.x, board.h - 2 * INSET.y);
    this.slots = placeCells(this.path, cells.length);
    this.slots.forEach((slot, i) => {
      pointAt(this.path, slot.s, this.tmp);
      slot.x = this.tmp.x;
      slot.y = this.tmp.y;
      const zone = this.zones[i];
      zone.setPosition(slot.x, slot.y).setSize(slot.dir === 'h' ? 38 : 30, slot.dir === 'h' ? 30 : 38);
    });
    this.zones.forEach((z, i) => z.setVisible(i < cells.length));
    this.cells = cells;
    this.marks.clear();
    this.focus = 0;
    this.locked = false;
    this.lit = false;
    this.question.setText(question).setVisible(true);
    this.gfx.setVisible(true);
    this.refresh();
  }

  // The cells changed (a repair): redraw; lights the bulb when the loop is closed now.
  setCells(cells) {
    const wasLit = this.lit;
    this.cells = cells;
    this.refresh();
    if (this.lit && !wasLit) this.fx.burst(this.spot.x, this.spot.y, 24);
  }

  mark(id, kind) {
    if (kind) this.marks.set(id, kind); else this.marks.delete(id);
    this.refresh();
  }

  setFocus(i) {
    this.focus = i;
    this.refresh();
  }

  setQuestion(text) { this.question.setText(text); }

  // Repaints from the cells: wires, symbols, labels, focus, glow.
  refresh() {
    const { cells, slots, gfx } = this;
    this.lit = analyze(cells).lit;
    gfx.clear();
    this.drawBoard();
    const wire = this.lit ? CURRENT : COPPER;
    for (let i = 0; i < cells.length; i++) {
      const pts = stretch(this.path, slots[i].s + CELL_HALF, slots[(i + 1) % cells.length].s - CELL_HALF);
      gfx.lineStyle(5, this.lit ? 0x9a7a10 : COPPER_DARK).beginPath().moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) gfx.lineTo(pts[k].x, pts[k].y);
      gfx.strokePath();
      gfx.lineStyle(2.5, wire).beginPath().moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) gfx.lineTo(pts[k].x, pts[k].y);
      gfx.strokePath();
    }
    cells.forEach((cell, i) => {
      this.drawCell(cell, slots[i]);
      this.placeLabel(i, cell, slots[i]);
      const mark = this.marks.get(cell.id);
      if (mark) gfx.lineStyle(2.5, MARK[mark]).strokeCircle(slots[i].x, slots[i].y, 17);
    });
    this.labels.forEach((l, i) => l.setVisible(i < cells.length));
    const slot = slots[this.focus];
    this.frame.setVisible(!this.locked && !!slot);
    if (slot) this.frame.setPosition(slot.x, slot.y).setSize(slot.dir === 'h' ? 42 : 34, slot.dir === 'h' ? 34 : 42);
    const bulb = cells.findIndex(c => c.kind === 'bulb');
    if (bulb >= 0) { this.spot.x = slots[bulb].x; this.spot.y = slots[bulb].y; }
    for (const g of this.glow) g.setPosition(this.spot.x, this.spot.y).setVisible(this.lit && bulb >= 0);
    for (const d of this.dots) d.setVisible(this.lit);
    if (!this.lit) this.acc = 0;
  }

  drawBoard() {
    const { board } = layoutFor(this.rect, 'circuit');
    const g = this.gfx;
    g.fillStyle(0x1e3b2d, 1).fillRoundedRect(board.x, board.y, board.w, board.h, 6);
    g.lineStyle(2, 0x0f2118).strokeRoundedRect(board.x, board.y, board.w, board.h, 6);
    g.fillStyle(0x2b5a42, 0.55);
    for (let x = board.x + 8; x < board.x + board.w - 4; x += 12) for (let y = board.y + 8; y < board.y + board.h - 4; y += 12) g.fillRect(x, y, 1.5, 1.5);
    for (const [sx, sy] of [[6, 6], [board.w - 6, 6], [6, board.h - 6], [board.w - 6, board.h - 6]]) g.fillStyle(0x9aa7a0).fillCircle(board.x + sx, board.y + sy, 2.2);
  }

  // One symbol at its slot, drawn in the loop's local frame (u along the wire, v across it).
  drawCell(cell, slot) {
    const g = this.gfx;
    const h = slot.dir === 'h';
    const px = (u, v) => (h ? slot.x + u : slot.x + v);
    const py = (u, v) => (h ? slot.y + v : slot.y + u);
    const box = (u, v, w, hh, color, alpha = 1) => {
      g.fillStyle(color, alpha);
      if (h) g.fillRect(slot.x + u, slot.y + v, w, hh); else g.fillRect(slot.x + v, slot.y + u, hh, w);
    };
    const dot = (u, v, r, color) => g.fillStyle(color).fillCircle(px(u, v), py(u, v), r);
    const line = (u0, v0, u1, v1, width, color) => g.lineStyle(width, color).lineBetween(px(u0, v0), py(u0, v0), px(u1, v1), py(u1, v1));
    const half = CELL_HALF;
    const lead = (from, to) => { line(-half, 0, from, 0, 2.5, this.lit ? CURRENT : COPPER); line(to, 0, half, 0, 2.5, this.lit ? CURRENT : COPPER); };
    switch (cell.kind) {
      case 'battery':
        lead(-12, 14);
        box(-12, -8, 24, 16, 0x1f5f3b);
        box(-12, -8, 24, 3, 0x2f7f4f);
        box(-4, -8, 5, 16, 0xffa94d);
        box(12, -3.5, 3, 7, 0xd9d9d9);
        box(5, -1, 6, 2, 0xffffff);
        box(7, -3, 2, 6, 0xffffff);
        box(-10, -1, 4, 2, 0xffffff);
        break;
      case 'bulb': {
        lead(-6, 6);
        box(-5, 6, 10, 5, 0x9a9a9a);
        box(-5, 8, 10, 1, 0x6e6e6e);
        dot(0, -3, 10, this.lit ? 0xfff3a3 : 0xdff6ff);
        g.lineStyle(1.5, this.lit ? 0xffb300 : 0x8a97a3).strokeCircle(px(0, -3), py(0, -3), 10);
        line(-3, 5, -3, -1, 1.5, this.lit ? 0xff8a00 : 0x7a7a7a);
        line(-3, -1, 0, -5, 1.5, this.lit ? 0xff8a00 : 0x7a7a7a);
        line(0, -5, 3, -1, 1.5, this.lit ? 0xff8a00 : 0x7a7a7a);
        line(3, -1, 3, 5, 1.5, this.lit ? 0xff8a00 : 0x7a7a7a);
        if (!this.lit) dot(-4, -7, 2, 0xffffff);
        break;
      }
      case 'switch':
        lead(-12, 12);
        box(-16, 4, 32, 4, 0x555b66);
        dot(-12, 0, 3, 0xd9d9d9);
        dot(12, 0, 3, 0xd9d9d9);
        if (cell.state === 'closed') line(-12, 0, 12, 0, 3.5, 0xf2f2f2); else line(-12, 0, 8, -12, 3.5, 0xf2f2f2);
        dot(-12, 0, 1.5, 0x555b66);
        break;
      case 'gap':
        lead(-5, 5);
        dot(-5, 0, 2.5, 0xd9d9d9);
        dot(5, 0, 2.5, 0xd9d9d9);
        for (const v of [-6, -2, 2, 6]) box(-0.5, v - 0.5, 1, 1.5, 0xff6b6b, 0.8);
        break;
      case 'bridge': {
        lead(-8, 8);
        const metal = !!cell.conducts;
        box(-9, -5, 18, 10, metal ? 0xb8c4d0 : 0xd98f8f);
        box(-9, -5, 18, 3, metal ? 0xe8eef4 : 0xefb4b4);
        dot(-8, 0, 2, 0xd9d9d9);
        dot(8, 0, 2, 0xd9d9d9);
        break;
      }
      default: // wire
        lead(-8, 8);
        box(-8, -3, 16, 6, this.lit ? 0xf0b429 : 0xe8a33d);
        box(-8, -3, 16, 1.5, 0xffd27a);
    }
  }

  placeLabel(i, cell, slot) {
    const { ctx } = this;
    const name = cell.kind === 'bridge' ? cell.item?.[ctx.i18n.lang] ?? cell.item?.de ?? ctx.t('minigame.science.cell.bridge') : ctx.t(`minigame.science.cell.${cell.kind}`);
    const label = this.labels[i].setText(`${i + 1} ${name}`);
    const pad = 15;
    const at = [[slot.x, slot.y + pad, 0.5, 0], [slot.x - pad, slot.y, 1, 0.5], [slot.x, slot.y - pad, 0.5, 1], [slot.x + pad, slot.y, 0, 0.5]][slot.edge];
    label.setPosition(at[0], at[1]).setOrigin(at[2], at[3]);
  }

  hover(i) {
    if (this.locked || i >= this.cells.length || this.focus === i) return;
    this.setFocus(i);
  }

  tap(i) {
    if (!this.locked && i < this.cells.length) this.onPick?.(i);
  }

  // Current dots along the loop and a trickle of sparks at the lit bulb.
  tick(dt) {
    if (!this.lit) return;
    const { path, tmp } = this;
    this.phase = (this.phase + dt * FLOW_SPEED) % path.total;
    for (let k = 0; k < DOTS; k++) {
      pointAt(path, this.phase + (k * path.total) / DOTS, tmp);
      this.dots[k].setPosition(tmp.x, tmp.y);
    }
    this.acc += dt;
    if (this.acc > 260) { this.acc = 0; this.fx.burst(this.spot.x, this.spot.y, 2); }
  }

  lock() { this.locked = true; this.frame.setVisible(false); }

  hide() {
    this.locked = true;
    this.lit = false;
    this.cells = [];
    for (const o of this.objects) o.setVisible(false);
    this.gfx.clear();
  }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
