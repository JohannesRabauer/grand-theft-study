// Co-op tether (AD-18), Phaser-free. Two players may not drift further apart than `maxDistance` (world px,
// measured in the view's box norm: the vertical distance counts times the view aspect, so the same limit fits
// a 16:9 screen in both directions). Beyond `soft` (fraction of the max) the player moving away is slowed
// smoothly down to `minLead` of its speed at the limit and the one moving towards the other gets up to
// `trailBonus` extra. A pinned player (caught frame, screen) never blocks the other: it keeps at least
// `frozenFloor` of its speed, and a gentle pull towards the pinned one grows past the limit.
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function boxDistance(dx, dy, aspect) {
  return Math.max(Math.abs(dx), Math.abs(dy) * aspect);
}

// 0 up to `soft`, 1 at the limit, smooth in between (no kink, so the slowdown does not jerk the player).
export function penalty(ratio, soft) {
  const t = clamp01((ratio - soft) / (1 - soft));
  return t * t * (3 - 2 * t);
}

export class Tether {
  constructor(cfg, aspect) {
    this.cfg = cfg;
    this.aspect = aspect;
    this.distance = 0;
    this.ratio = 0;
    this.speed = [1, 1]; // speed factor per player (1 = free)
    this.pullX = [0, 0]; // gentle pull towards the other player, px/s
    this.pullY = [0, 0];
  }

  // a, b: { x, y, pinned }; ma, mb: the players' move intents { x, y } (what they steer towards).
  update(dt, a, b, ma, mb) {
    this.distance = boxDistance(b.x - a.x, b.y - a.y, this.aspect);
    this.ratio = this.distance / this.cfg.maxDistance;
    this.side(0, dt, a, b, ma);
    this.side(1, dt, b, a, mb);
  }

  side(i, dt, self, other, move) {
    const { cfg, ratio } = this;
    const dx = other.x - self.x;
    const dy = other.y - self.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const mag = Math.hypot(move.x, move.y);
    // -1 away .. 1 towards the other, along the axis the box norm is measured on: the Euclidean direction would call
    // a move at right angles to it neutral although it still stretches the box distance (corners of the view).
    const alongX = Math.abs(dx) >= Math.abs(dy) * this.aspect;
    const toward = mag > 0.01 ? (alongX ? move.x * Math.sign(dx) : move.y * Math.sign(dy)) / mag : 0;
    let target = 1;
    if (!self.pinned) {
      const pen = penalty(ratio, cfg.soft);
      const floor = other.pinned ? cfg.frozenFloor : cfg.minLead;
      target = 1 - (1 - floor) * pen * clamp01(-toward) + (other.pinned ? 0 : cfg.trailBonus * pen * clamp01(toward));
    }
    this.speed[i] += (target - this.speed[i]) * (1 - Math.exp(-cfg.response * dt));
    const pull = self.pinned ? 0 : Math.min(cfg.pullMax, cfg.pullGain * Math.max(0, ratio - 1));
    this.pullX[i] = ux * pull;
    this.pullY[i] = uy * pull;
  }
}
