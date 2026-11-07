import { uiText } from '../../ui/uiKit.js';
import { KeypadModel } from '../matheCore.js';

const COLORS = { paper: 0xf4ead2, key: 0x2b2f3a, focus: 0x3a4152, edge: 0xd9a521, ok: 0x2f7f4f, hint: 0x28506f, back: 0x7a3b3b };
const GAP = 3;

// The keypad for typed answers: a paper strip with what was typed so far and the rows of keys of its model (by default
// the digits, then back / hint / ok). Keys come from the player's choice cursor (arrows move, confirm presses), the
// number keys 1-4 (digits; pickKeys false for a letter pad) or a tap. It reports through onSubmit(text) and onHint(); the
// minigame judges the answer. `model` swaps the key set (the Deutsch letter pad: smaller keys via keyH / displayH, and
// typeChar() takes a letter from a physical keyboard).
export class Keypad {
  constructor(scene, ctx, rect, top, { maxDigits = 5, depth = 11, model = null, keyH = 22, displayH = 20, pickKeys = true } = {}) {
    this.ctx = ctx;
    this.model = model ?? new KeypadModel(maxDigits);
    this.pickKeys = pickKeys;
    this.locked = true;
    this.hintsLeft = () => 0;
    this.onSubmit = null;
    this.onHint = null;
    this.objects = [];
    const pad = 8;
    const wrap = rect.w - pad * 2;
    const own = o => { this.objects.push(o); return o; };
    const font = { fontFamily: 'monospace', color: '#ffffff', fontSize: '10px' };
    own(scene.add.rectangle(rect.x + pad, top, wrap, displayH, COLORS.paper).setOrigin(0).setDepth(depth + 1).setStrokeStyle(2, 0x8b5a2b));
    this.display = own(uiText(scene, rect.x + rect.w / 2, top + displayH / 2, '', { ...font, fontSize: '14px', fontStyle: 'bold', color: '#1b1b2f' }).setOrigin(0.5).setDepth(depth + 2));
    this.keys = [];
    this.model.layout.forEach((row, r) => {
      const kw = (wrap - GAP * (row.length - 1)) / row.length;
      row.forEach((key, c) => {
        const ky = top + displayH + 4 + r * (keyH + GAP);
        const bg = own(scene.add.rectangle(rect.x + pad + c * (kw + GAP), ky, kw, keyH, COLORS.key).setOrigin(0).setDepth(depth + 1).setInteractive({ useHandCursor: true }));
        const text = own(uiText(scene, bg.x + kw / 2, ky + keyH / 2, '', font).setOrigin(0.5).setDepth(depth + 2));
        bg.on('pointerover', () => { if (!this.locked) { this.model.focusKey(r, c); this.paint(); } });
        bg.on('pointerdown', () => this.press(key));
        this.keys.push({ key, bg, text, r, c });
      });
    });
    this.hide();
  }

  show() {
    this.model.reset();
    this.locked = false;
    this.setVisible(true);
    this.paint();
  }

  hide() {
    this.locked = true;
    this.setVisible(false);
  }

  setVisible(on) {
    for (const o of this.objects) o.setVisible(on);
  }

  // Keeps the typed digits visible while the answer is judged, but accepts no more keys.
  lock() {
    this.locked = true;
    this.paint();
  }

  label(key) {
    const { ctx } = this;
    if (key === 'back') return '<';
    if (key === 'ok') return ctx.t('minigame.mathe.ok');
    if (key === 'hint') return `?${this.hintsLeft()}`;
    if (key === 'shift') return 'Aa';
    return this.model.shift ? key.toUpperCase() : key;
  }

  paint() {
    const m = this.model;
    this.display.setText(m.text || '_');
    for (const k of this.keys) {
      const focused = !this.locked && m.row === k.r && m.col === k.c;
      const fill = k.key === 'shift' && m.shift ? COLORS.edge : k.key === 'ok' ? COLORS.ok : k.key === 'hint' ? COLORS.hint : k.key === 'back' ? COLORS.back : focused ? COLORS.focus : COLORS.key;
      k.bg.setFillStyle(fill);
      if (focused) k.bg.setStrokeStyle(2, COLORS.edge); else k.bg.setStrokeStyle();
      k.bg.setAlpha(k.key === 'hint' && this.hintsLeft() <= 0 ? 0.4 : 1);
      k.text.setText(this.label(k.key));
    }
  }

  press(key) {
    if (this.locked) return;
    const res = this.model.press(key);
    if (res === 'hint' && this.hintsLeft() <= 0) return;
    if (res === 'submit') this.onSubmit?.(this.model.text);
    else if (res === 'hint') this.onHint?.();
    this.paint();
  }

  // Cursor step from ChoiceCursor: arrows move the focus, confirm presses the focused key, number keys 1-4 type that digit.
  nav({ dx, dy, confirm, pick }) {
    if (this.locked) return;
    if (pick > 0) { if (this.pickKeys) this.press(String(pick)); return; }
    if (dx || dy) { this.model.move(dx, dy); this.paint(); }
    if (confirm) this.press();
  }

  // A letter from a physical keyboard (letter models only).
  typeChar(char) {
    if (this.locked) return;
    this.model.type(char);
    this.paint();
  }

  retext() { this.paint(); }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
