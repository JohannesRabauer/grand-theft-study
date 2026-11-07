import { HudModule } from './HudModule.js';
import { ObjectiveArrow } from '../ObjectiveArrow.js';

// The GTA-style goal arrow (ui/ObjectiveArrow.js) as a HUD module. One player: the arrow orbits that player;
// two players: one shared arrow orbits the camera centre (the rig's focus) and points from there at the goal.
export class ObjectiveModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.arrow = new ObjectiveArrow(scene, ctx, scene.scene.get('Game'), this.players > 1 ? null : 0);
  }

  update() { this.arrow.update(); }

  retext() { this.arrow.retext(); }

  destroy() {
    this.arrow.destroy();
    super.destroy();
  }
}
