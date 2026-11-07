import { HudModule } from './HudModule.js';
import { CaughtFrame } from '../CaughtFrame.js';

// The comic caught frame (ui/CaughtFrame.js) as a HUD module; it listens to player:caught / player:respawn itself.
export class CaughtModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.frame = new CaughtFrame(scene, ctx);
  }

  destroy() {
    this.frame.destroy();
    super.destroy();
  }
}
