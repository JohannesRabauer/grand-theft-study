import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';

// FPS counter top left, refreshed four times a second and only when the rounded value changes.
export class FpsModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.text = this.track(uiText(scene, 4, 2, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffff66' }));
    this.next = 0;
    this.last = -1;
  }

  update(time) {
    if (time < this.next) return;
    this.next = time + 250;
    const fps = Math.round(this.scene.game.loop.actualFps);
    if (fps === this.last) return;
    this.last = fps;
    this.text.setText(this.ctx.t('hud.fps', { n: fps }));
  }

  retext() { this.last = -1; }
}
