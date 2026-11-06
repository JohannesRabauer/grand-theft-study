// Bully eyes: view distance, field of view (wider while already chasing) and a grid raycast
// against solid tiles (cheaper than a Matter query). A player who stands (almost) still inside a
// hiding-spot zone is invisible. `senseRadius` is the "notice someone right beside you" range.
export class Perception {
  constructor(ctx, cfg, nav) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.nav = nav;
    this.halfFov = (cfg.fovDeg * Math.PI) / 360;
    this.halfChaseFov = (cfg.chaseFovDeg * Math.PI) / 360;
  }

  // Is the player hidden right now (in a hiding spot and nearly still)?
  get hidden() {
    const { player, zones } = this.ctx;
    return zones.hiding > 0 && player.move.velSpeed < this.cfg.hideSpeed;
  }

  sees(b, chasing) {
    const { player } = this.ctx;
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const d2 = dx * dx + dy * dy;
    const c = this.cfg;
    if (d2 > c.viewDistance * c.viewDistance || this.hidden) return false;
    if (d2 > c.senseRadius * c.senseRadius) {
      let diff = Math.atan2(dy, dx) - b.move.heading;
      diff -= Math.round(diff / (2 * Math.PI)) * 2 * Math.PI;
      if (Math.abs(diff) > (chasing ? this.halfChaseFov : this.halfFov)) return false;
    }
    return this.nav.lineClear(b.x, b.y, player.x, player.y);
  }
}
