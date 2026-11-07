import { HudModule } from './HudModule.js';

// HTML overlay: in portrait the 480x270 canvas is tiny, so the hint is drawn in page pixels.
export class RotateHintModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.el = document.createElement('div');
    this.el.id = 'rotate-hint';
    this.el.hidden = true;
    const icon = document.createElement('div');
    icon.className = 'rotate-icon';
    this.label = document.createElement('p');
    this.label.textContent = ctx.t('ui.rotate');
    this.el.append(icon, this.label);
    document.body.append(this.el);
  }

  update() {
    const blocked = this.ctx.input.blocked;
    if (this.el.hidden === blocked) this.el.hidden = !blocked;
  }

  retext() { this.label.textContent = this.ctx.t('ui.rotate'); }

  destroy() {
    this.el.remove();
    super.destroy();
  }
}
