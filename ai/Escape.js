// Pure escape rules (no Phaser), owned by ChaseDirector. While the Ärger level is above 0:
//  - hiding: hidden, unseen and no bully within `stumbleRadius` for `hideSeconds` -> 'hidden'
//    (any sighting or a bully stumbling close resets the timer and the level stays);
//  - distance: unseen and farther than `farDistance` from every bully for `farSeconds` -> 'escaped'.
// `update` returns the reason once a timer completes, else null.
export class Escape {
  constructor(cfg) {
    this.cfg = cfg;
    this.hideT = 0;
    this.farT = 0;
  }

  get progress() { return Math.min(1, this.hideT / this.cfg.hideSeconds); }

  reset() { this.hideT = this.farT = 0; }

  // nearest: distance to the closest bully (Infinity when there is none)
  update(dt, active, hidden, seen, nearest) {
    if (!active) { this.reset(); return null; }
    const c = this.cfg;
    this.hideT = hidden && !seen && nearest > c.stumbleRadius ? this.hideT + dt : 0;
    this.farT = !seen && nearest > c.farDistance ? this.farT + dt : 0;
    if (this.hideT >= c.hideSeconds) return 'hidden';
    if (this.farT >= c.farSeconds) return 'escaped';
    return null;
  }
}
