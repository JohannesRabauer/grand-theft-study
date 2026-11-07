// Bully eyes: view distance, field of view (wider while already chasing) and a grid raycast
// against solid tiles (cheaper than a Matter query). A player who stands (almost) still inside a
// hiding-spot zone is invisible; hiding and line of sight are evaluated per player. `senseRadius` is the "notice someone right beside you" range.
export class Perception {
  constructor(ctx, cfg, nav) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.nav = nav;
    this.halfFov = (cfg.fovDeg * Math.PI) / 360;
    this.halfChaseFov = (cfg.chaseFovDeg * Math.PI) / 360;
  }

  // Is this player hidden right now (in a hiding spot and nearly still)?
  hiddenFor(p) {
    return this.ctx.zones.hiding[p.index] > 0 && p.move.velSpeed < this.cfg.hideSpeed;
  }

  // Everyone in play is hidden (the chase has nobody to see).
  get hidden() {
    const players = this.ctx.alivePlayers();
    for (let i = 0; i < players.length; i++) if (!this.hiddenFor(players[i])) return false;
    return players.length > 0;
  }

  // Does bully b see player p?
  sees(b, p, chasing) {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d2 = dx * dx + dy * dy;
    const c = this.cfg;
    if (d2 > c.viewDistance * c.viewDistance || this.hiddenFor(p)) return false;
    if (d2 > c.senseRadius * c.senseRadius) {
      let diff = Math.atan2(dy, dx) - b.move.heading;
      diff -= Math.round(diff / (2 * Math.PI)) * 2 * Math.PI;
      if (Math.abs(diff) > (chasing ? this.halfChaseFov : this.halfFov)) return false;
    }
    return this.nav.lineClear(b.x, b.y, p.x, p.y);
  }
}
