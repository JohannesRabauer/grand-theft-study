import { HudModule } from './HudModule.js';
import { ObjectiveArrow } from '../ObjectiveArrow.js';

// The GTA-style goal arrow (ui/ObjectiveArrow.js) as a HUD module, one per player.
export class ObjectiveModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.arrow = new ObjectiveArrow(scene, ctx, scene.scene.get('Game'), opts?.playerIndex ?? 0);
  }

  update() { this.arrow.update(); }

  retext() { this.arrow.retext(); }

  destroy() {
    this.arrow.destroy();
    super.destroy();
  }
}
