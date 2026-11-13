import { HudModule } from './HudModule.js';
import { uiLabel, uiCfg, paintRects, animOff } from '../uiKit.js';
import { faceTone, panelRects } from '../uiTheme.js';

const SHOW_MS = 3000;

// A small message at the top centre for a few seconds ("Controller disconnected"). Anything can ask for one with
// the `ui:toast` event { key, params?, style? }; a newer toast replaces the one showing. Style 'phone' is the blue text-message look.
// The toast is a bevelled panel that eases in from above (not under reducedMotion).
export class ToastModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.until = 0;
    this.req = null;
    this.panel = this.track(scene.add.graphics().setDepth(89).setVisible(false));
    this.text = this.track(uiLabel(scene, ctx.res.w / 2, 38, '', 'body', 'ink', { padding: { x: 8, y: 4 } }).setOrigin(0.5).setDepth(90).setVisible(false));
    this.on('ui:toast', req => {
      this.req = req;
      this.until = this.scene.time.now + SHOW_MS;
      this.retext();
      this.text.setVisible(true);
      this.panel.setVisible(true);
      if (!animOff(scene, ctx)) {
        this.text.setAlpha(0).y = 34;
        scene.tweens.add({ targets: this.text, alpha: 1, y: 38, duration: uiCfg(scene).anim.open, ease: 'Cubic.easeOut', onUpdate: () => this.place() });
      } else this.place();
    });
  }

  get updatesWhileDucked() { return true; }

  retext() {
    if (!this.req) return;
    this.text.setText(this.ctx.t(this.req.key, this.req.params));
    this.place();
  }

  // The panel follows the text (tone by style) so an easing text drags its frame along.
  place() {
    const cfg = uiCfg(this.scene);
    const w = Math.round(this.text.width);
    const h = Math.round(this.text.height);
    const phone = this.req?.style === 'phone';
    const tone = phone ? faceTone('#1f4e8c', cfg.edge, cfg.tones.ink.accent) : cfg.tones.ink;
    this.panel.clear().setAlpha(this.text.alpha);
    paintRects(this.panel, panelRects(w, h, tone, cfg.edge, { shadow: true }), Math.round(this.text.x - w / 2), Math.round(this.text.y - h / 2));
  }

  update() {
    if (this.text.visible && this.scene.time.now > this.until) { this.text.setVisible(false); this.panel.setVisible(false); }
  }
}
