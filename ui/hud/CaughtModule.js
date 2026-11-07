import { HudModule } from './HudModule.js';
import { CaughtFrame } from '../CaughtFrame.js';

// The comic caught frames (ui/CaughtFrame.js) as a HUD module: one per player, shown on that player's `player:caught` and
// hidden on its `player:respawn`. `frame` is player 1's.
export class CaughtModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    // Baking the comic canvas on first contact stalls the enlarged world's update.
    this.frames = ctx.players.map((_, index) => {
      const frame = new CaughtFrame(scene, ctx, index);
      frame.show({ player: index, lost: ctx.chase.cfg.caught.lossCents });
      frame.hide();
      return frame;
    });
    this.frame = this.frames[0];
    this.on('player:caught', (ev) => {
      this.frames[ev.player] ??= new CaughtFrame(scene, ctx, ev.player);
      this.frames[ev.player].show(ev);
    });
    this.on('player:respawn', (ev) => this.frames[ev.player]?.hide());
  }

  destroy() {
    for (const f of this.frames) f?.destroy();
    super.destroy();
  }
}
