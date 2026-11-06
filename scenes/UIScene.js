import { TouchControls } from '../ui/touch.js';

// Overlay HUD, touch controls and rotate hint. Reads only; never mutates the world (AD-13).
export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create(data) {
    this.ctx = data.ctx;
    this.fps = this.add.text(4, 2, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffff66' });
    this.nextFps = 0;
    this.touch = new TouchControls(this, this.ctx, this.cache.json.get('input'));
    this.hint = this.makeRotateHint();
    this.events.once('shutdown', () => this.hint.remove());
  }

  // HTML overlay: in portrait the 480x270 canvas is tiny, so the hint is drawn in page pixels.
  makeRotateHint() {
    const el = document.createElement('div');
    el.id = 'rotate-hint';
    el.hidden = true;
    const icon = document.createElement('div');
    icon.className = 'rotate-icon';
    const text = document.createElement('p');
    text.textContent = this.ctx.t('ui.rotate');
    el.append(icon, text);
    document.body.append(el);
    return el;
  }

  update(time) {
    this.touch.update();
    const blocked = this.ctx.input.blocked;
    if (this.hint.hidden === blocked) this.hint.hidden = !blocked;
    if (time < this.nextFps) return;
    this.nextFps = time + 250;
    this.fps.setText(this.ctx.t('hud.fps', { n: Math.round(this.game.loop.actualFps) }));
  }
}
