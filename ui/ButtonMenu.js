// Rows of text buttons that work with mouse, touch and keyboard (arrows move the focus, Enter or
// Space activates). Used by the main menu and the pause overlay. Menu navigation is the one place
// outside ui/input.js that listens to keys: it only drives menu focus, never gameplay intents.
//
// rows: [{ caption?: key, items: [{ label: () => string, on: () => void, selected?: () => boolean }] }]
import { uiText } from './uiKit.js';

const STYLE = { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', padding: { x: 5, y: 3 } };
const COLORS = { idle: '#2b2f3a', selected: '#2f6f4f', focus: '#d9a521' };

export class ButtonMenu {
  constructor(scene, t, rows, cx, top, step) {
    this.scene = scene;
    this.t = t;
    this.rows = rows;
    this.cx = cx;
    this.row = 0;
    this.col = 0;
    this.active = true;
    rows.forEach((r, ri) => {
      r.y = top + ri * step;
      if (r.caption) r.cap = uiText(scene, 0, r.y, '', { ...STYLE, padding: { x: 0, y: 3 }, color: '#bbbbbb' }).setOrigin(0, 0.5);
      r.items.forEach((it, ci) => {
        it.text = uiText(scene, 0, r.y, '', STYLE).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        it.text.on('pointerdown', () => { this.focus(ri, ci); this.activate(); });
        it.text.on('pointerover', () => this.focus(ri, ci));
      });
    });
    this.onKey = e => this.key(e.code);
    scene.input.keyboard.on('keydown', this.onKey);
    scene.events.once('shutdown', () => scene.input.keyboard.off('keydown', this.onKey));
    this.refresh();
  }

  get objects() {
    return this.rows.flatMap(r => [r.cap, ...r.items.map(i => i.text)]).filter(Boolean);
  }

  destroy() {
    this.active = false;
    this.scene.input.keyboard.off('keydown', this.onKey);
    for (const o of this.objects) o.destroy();
  }

  setActive(on) {
    this.active = on;
    for (const o of this.objects) o.setVisible(on);
    if (on) { this.row = 0; this.col = 0; this.refresh(); }
  }

  focus(r, c) {
    this.row = r;
    this.col = c;
    this.paint();
  }

  key(code) {
    if (!this.active) return;
    const rows = this.rows;
    if (code === 'ArrowDown') this.focus((this.row + 1) % rows.length, Math.min(this.col, rows[(this.row + 1) % rows.length].items.length - 1));
    else if (code === 'ArrowUp') { const r = (this.row + rows.length - 1) % rows.length; this.focus(r, Math.min(this.col, rows[r].items.length - 1)); }
    else if (code === 'ArrowRight') this.focus(this.row, Math.min(this.col + 1, rows[this.row].items.length - 1));
    else if (code === 'ArrowLeft') this.focus(this.row, Math.max(this.col - 1, 0));
    else if (code === 'Enter' || code === 'Space') this.activate();
  }

  activate() {
    if (!this.active) return;
    this.rows[this.row].items[this.col].on();
    if (this.active) this.refresh();
  }

  // Re-resolves every label (language switch) and lays the items out left to right.
  refresh() {
    const left = this.cx - 110;
    for (const r of this.rows) {
      let x = r.caption ? this.cx - 20 : 0;
      if (r.cap) r.cap.setText(this.t(r.caption)).setX(left);
      for (const it of r.items) it.text.setText(it.label());
      if (!r.caption) {
        const w = r.items.reduce((a, it) => a + it.text.width, 0) + (r.items.length - 1) * 4;
        x = this.cx - w / 2;
      }
      for (const it of r.items) { it.text.setX(x); x += it.text.width + 4; }
    }
    this.paint();
  }

  paint() {
    this.rows.forEach((r, ri) => r.items.forEach((it, ci) => {
      const focused = ri === this.row && ci === this.col;
      it.text.setBackgroundColor(focused ? COLORS.focus : it.selected?.() ? COLORS.selected : COLORS.idle);
      it.text.setColor(focused ? '#000000' : '#ffffff');
    }));
  }
}
