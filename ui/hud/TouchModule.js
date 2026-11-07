import { HudModule } from './HudModule.js';
import { TouchControls } from '../touch.js';

// On-screen touch controls (ui/touch.js) as a HUD module.
export class TouchModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.touch = new TouchControls(scene, ctx, scene.cache.json.get('input'));
  }

  update() { this.touch.update(); }

  destroy() {
    this.touch.destroy();
    super.destroy();
  }
}
