import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';

const SHOW_MS = 3000;

// A small message at the top centre for a few seconds ("Controller disconnected"). Anything can ask for one with
// the `ui:toast` event { key, params? }; a newer toast replaces the one showing.
export class ToastModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.until = 0;
    this.req = null;
    this.text = this.track(uiText(scene, ctx.res.w / 2, 26, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', backgroundColor: '#2b2f3a', padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setDepth(90).setVisible(false));
    this.on('ui:toast', req => {
      this.req = req;
      this.until = this.scene.time.now + SHOW_MS;
      this.retext();
      this.text.setVisible(true);
    });
  }

  get updatesWhileDucked() { return true; }

  retext() {
    if (this.req) this.text.setText(this.ctx.t(this.req.key, this.req.params));
  }

  update() {
    if (this.text.visible && this.scene.time.now > this.until) this.text.setVisible(false);
  }
}
