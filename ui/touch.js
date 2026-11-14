import { createTouchState } from './inputBindings.js';

// On-screen touch controls, drawn procedurally inside UIScene (AD-13). They only fill the
// state object that Input merges into the intent snapshot (AD-10): a floating joystick in the
// left half (it follows the thumb when dragged past its edge and has a small dead zone; a faint ring shows where it rests) and
// round buttons on the right, including map and phone. Hold-and-drag on the tool button aims.
export class TouchControls {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.input = ctx.input;
    this.ctx = ctx;
    this.cfg = cfg;
    this.state = createTouchState();
    ctx.events.emit('input:touch-bind', this.state);

    scene.input.addPointer(3); // mouse + 4 touches
    this.joy = { pointer: null, ox: 0, oy: 0 };
    this.joyBase = scene.add.graphics().setVisible(false);
    this.joyBase.lineStyle(2, 0xffffff, 0.5).strokeCircle(0, 0, cfg.joystick.radius);
    this.joyKnob = scene.add.graphics().setVisible(false);
    this.joyKnob.fillStyle(0xffffff, 0.6).fillCircle(0, 0, cfg.joystick.knob);
    // a faint ring where the stick rests, so it is clear where to put the thumb
    this.joyHint = scene.add.graphics({ x: cfg.joystick.restX, y: cfg.joystick.restY }).setAlpha(0.28).setVisible(false);
    this.joyHint.lineStyle(2, 0xffffff, 1).strokeCircle(0, 0, cfg.joystick.radius).fillStyle(0xffffff, 0.5).fillCircle(0, 0, cfg.joystick.knob * 0.7);

    this.k = 1 / ctx.res.scale; // pointers are in canvas pixels, the layout in 480x270 UI units
    this.uiW = ctx.res.w;
    this.buttons = cfg.buttons.map(b => ({ ...b, pointer: null, gfx: drawButton(scene, b) }));
    this.group = [this.joyBase, this.joyKnob, this.joyHint, ...this.buttons.map(b => b.gfx)];
    this.shown = true;
    this.suspended = false;
    this.onPointerDown = p => this.onDown(p);
    scene.input.on('pointerdown', this.onPointerDown);
  }

  destroy() {
    this.scene.input.off('pointerdown', this.onPointerDown);
    for (const g of this.group) g.destroy();
  }

  onDown(p) {
    if (!p.wasTouch || this.input.blocked || this.suspended) return;
    const pad = this.cfg.hitPad;
    const px = p.x * this.k;
    const py = p.y * this.k;
    for (const b of this.buttons) {
      if (!b.pointer && b.gfx.visible && Math.hypot(px - b.x, py - b.y) <= b.r + pad) {
        b.pointer = p;
        return;
      }
    }
    const j = this.cfg.joystick;
    if (!this.joy.pointer && px < this.uiW * j.zone) {
      this.joy.pointer = p;
      this.joy.ox = px;
      this.joy.oy = py;
    }
  }

  // Hides and releases everything until resumed (a minigame covers the controls).
  setSuspended(on) {
    this.suspended = on;
    if (on) {
      this.releaseAll();
      for (const g of this.group) g.setVisible(false);
    }
    this.shown = on ? false : null; // the next update() decides again
  }

  update() {
    if (this.suspended) return;
    const visible = this.input.type === 'touch' && !this.input.blocked;
    if (visible !== this.shown) {
      this.shown = visible;
      for (const g of this.group) g.setVisible(visible && g !== this.joyBase && g !== this.joyKnob);
      if (!visible) this.releaseAll();
    }
    if (!visible) return;

    const s = this.state;
    const j = this.joy;
    const r = this.cfg.joystick.radius;
    if (j.pointer && !j.pointer.isDown) j.pointer = null;
    if (j.pointer) {
      let dx = j.pointer.x * this.k - j.ox;
      let dy = j.pointer.y * this.k - j.oy;
      const dist = Math.hypot(dx, dy);
      if (dist > r) { // dragged past the edge: the stick follows the thumb, so it never runs out of travel
        j.ox += (dx / dist) * (dist - r);
        j.oy += (dy / dist) * (dist - r);
        dx = j.pointer.x * this.k - j.ox;
        dy = j.pointer.y * this.k - j.oy;
      }
      const m = Math.min(Math.hypot(dx, dy), r);
      const a = Math.atan2(dy, dx);
      const dead = this.cfg.joystick.deadzone ?? 0;
      const f = m / r < dead ? 0 : (m / r - dead) / (1 - dead); // dead zone, then the full range
      s.move.x = Math.cos(a) * f;
      s.move.y = Math.sin(a) * f;
      this.joyBase.setPosition(j.ox, j.oy).setVisible(true);
      this.joyKnob.setPosition(j.ox + Math.cos(a) * m, j.oy + Math.sin(a) * m).setVisible(true);
      this.joyHint.setVisible(false);
    } else {
      s.move.x = s.move.y = 0;
      this.joyBase.setVisible(false);
      this.joyKnob.setVisible(false);
      this.joyHint.setVisible(true);
    }

    s.aiming = false;
    const rider = this.ctx.players[0]?.move.profile;
    for (const b of this.buttons) {
      if (b.when) b.gfx.setVisible(!!rider?.[b.when]); // e.g. the manual button only while the vehicle has tricks
      if (b.pointer && !b.pointer.isDown) b.pointer = null;
      const held = b.pointer !== null;
      s.btn[b.id] = held;
      b.gfx.setAlpha(held ? 0.95 : 0.55);
      if (held && b.id === 'toolUse') this.dragAim(b);
    }
  }

  // Drag away from the tool button to aim in that direction.
  dragAim(b) {
    const dx = b.pointer.x * this.k - b.x;
    const dy = b.pointer.y * this.k - b.y;
    const m = Math.hypot(dx, dy);
    if (m < this.cfg.aimDragMin) return;
    this.state.aiming = true;
    this.state.aimDir.x = dx / m;
    this.state.aimDir.y = dy / m;
  }

  releaseAll() {
    const s = this.state;
    this.joy.pointer = null;
    s.move.x = s.move.y = 0;
    s.aiming = false;
    for (const b of this.buttons) {
      b.pointer = null;
      s.btn[b.id] = false;
    }
    this.joyBase.setVisible(false);
    this.joyKnob.setVisible(false);
  }
}

// Each button is one Graphics object drawn once around its own origin.
function drawButton(scene, b) {
  const g = scene.add.graphics({ x: b.x, y: b.y });
  g.fillStyle(0x000000, 0.35).fillCircle(0, 0, b.r);
  g.lineStyle(2, 0xffffff, 1).strokeCircle(0, 0, b.r);
  g.lineStyle(2, 0xffffff, 1).fillStyle(0xffffff, 1);
  const k = b.r * 0.45;
  switch (b.icon) {
    case 'jump': // up arrow
      g.fillTriangle(0, -k, -k, 0, k, 0).fillRect(-k / 3, 0, (2 * k) / 3, k);
      break;
    case 'sprint': // double chevron
      g.beginPath().moveTo(-k, -k).lineTo(0, 0).lineTo(-k, k).strokePath();
      g.beginPath().moveTo(0, -k).lineTo(k, 0).lineTo(0, k).strokePath();
      break;
    case 'tool': // slingshot fork
      g.beginPath().moveTo(0, k).lineTo(0, 0).lineTo(-k, -k).moveTo(0, 0).lineTo(k, -k).strokePath();
      break;
    case 'interact': // hand-like circle with dot
      g.strokeCircle(0, 0, k).fillCircle(0, 0, k / 3);
      break;
    case 'next': // right triangle
      g.fillTriangle(-k / 2, -k, -k / 2, k, k, 0);
      break;
    case 'manual': // board with its nose up
      g.lineStyle(3, 0xffffff, 1).beginPath().moveTo(-k, k * 0.5).lineTo(k * 0.2, k * 0.5).lineTo(k, -k * 0.7).strokePath();
      break;
    case 'shield': // kite shield
      g.fillTriangle(-k, -k * 0.7, k, -k * 0.7, 0, k * 1.1).fillRect(-k, -k, 2 * k, k * 0.5);
      break;
    case 'kiai': // shout burst: three rays
      g.beginPath().moveTo(-k, -k).lineTo(-k * 0.2, -k * 0.2).moveTo(k, -k).lineTo(k * 0.2, -k * 0.2).moveTo(0, -k * 1.2).lineTo(0, -k * 0.3).strokePath();
      g.fillCircle(0, k * 0.5, k * 0.45);
      break;
    case 'map': // folded map
      g.lineStyle(2, 0xffffff, 1).strokeRect(-k, -k * 0.8, 2 * k, k * 1.6);
      g.beginPath().moveTo(-k / 3, -k * 0.8).lineTo(-k / 3, k * 0.8).moveTo(k / 3, -k * 0.8).lineTo(k / 3, k * 0.8).strokePath();
      break;
    case 'phone': // handset
      g.lineStyle(2, 0xffffff, 1).strokeRect(-k * 0.6, -k, k * 1.2, k * 2);
      g.fillRect(-k * 0.3, k * 0.5, k * 0.6, k * 0.25);
      break;
    case 'pause':
      g.fillRect(-k * 0.8, -k, k * 0.6, k * 2).fillRect(k * 0.2, -k, k * 0.6, k * 2);
      break;
  }
  return g.setAlpha(0.55);
}
