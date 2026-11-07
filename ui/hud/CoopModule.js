import { HudModule } from './HudModule.js';
import { edgeSpot } from './layout.js';

// Co-op only: a small chevron at the view edge, in the player's ring colour, for a player who is far off-centre.
// Reads the game camera; nothing is drawn or kept while one player is in the game.
export class CoopModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.cam = scene.scene.get('Game').cameras.main;
    const cfg = scene.cache.json.get('camera').coop;
    this.threshold = cfg.edgeIndicator;
    this.colors = cfg.ringColors.map(c => parseInt(c.slice(1), 16));
    this.chevrons = [];
    this.spot = { x: 0, y: 0, angle: 0 };
  }

  update() {
    const { ctx, cam, spot } = this;
    if (ctx.players.length < 2) return;
    const { w, h } = ctx.res;
    const k = 1 / ctx.res.scale;
    for (const p of ctx.players) {
      let c = this.chevrons[p.index];
      if (!c) {
        const color = this.colors[p.index % this.colors.length];
        c = this.chevrons[p.index] = this.track(this.scene.add.graphics().fillStyle(color, 0.75).fillTriangle(5, 0, -4, -5, -4, 5).setDepth(9));
      }
      // player on screen in UI units, from the live scroll (worldView is only refreshed at render time)
      const sx = ((p.x - cam.scrollX - cam.width / 2) * cam.zoom + cam.width / 2) * k;
      const sy = ((p.y - cam.scrollY - cam.height / 2) * cam.zoom + cam.height / 2) * k;
      const s = edgeSpot((sx - w / 2) / (w / 2), (sy - h / 2) / (h / 2), this.threshold, w, h, 8, spot);
      c.setVisible(!!s);
      if (s) c.setPosition(s.x, s.y).setRotation(s.angle);
    }
  }
}
