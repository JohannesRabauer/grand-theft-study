// Pure Ärger-level rules (no Phaser): thresholds from data/chase.json `level`. Owned by
// ChaseDirector, which is the only caller that writes it (AD-12). `onChange(level, reason)` fires
// on every change.
export class ChaseLevel {
  constructor(cfg, enabled, onChange) {
    this.cfg = cfg;
    this.max = cfg.spawnByLevel.length - 1;
    this.enabled = enabled;
    this.onChange = onChange;
    this.level = 0;
    this.inTurf = false;
    this.turfTime = 0;
    this.bumpCool = 0;
    this.coolIn = 0; // seconds until a scheduled cool-down to level 0 (0 = none)
    this.lockout = 0; // after the level fell to 0, turf cannot raise it again for a while
  }

  set(level, reason) {
    if (!this.enabled || level === this.level) return;
    if (level > this.level) this.coolIn = 0; // new trouble cancels a pending cool-down
    this.level = level;
    this.onChange(level, reason);
  }

  // Entering turf starts at level 1; staying raises one level per `turfSecondsPerLevel`.
  turf(inside) {
    this.inTurf = inside;
    this.turfTime = 0;
    if (inside && this.lockout <= 0) this.set(Math.max(1, this.level), 'turf');
  }

  bump() {
    if (this.bumpCool > 0) return;
    this.bumpCool = this.cfg.bumpCooldown;
    this.set(Math.min(this.max, this.level + 1), 'bump');
  }

  // A Kiai (story 6.3) takes `amount` levels off, but only while the level is 1..maxLevel (data level.defendMaxLevel; epic 7 may raise it).
  // Reaching 0 ends the chase like any clear. The turf timer is pulled back so the same turf does not lift the level again at once.
  // Returns whether the level changed.
  defend(amount, maxLevel) {
    if (!this.enabled || this.level < 1 || this.level > maxLevel || amount < 1) return false;
    const to = Math.max(0, this.level - Math.floor(amount));
    if (to === 0) this.clear('defend');
    else {
      this.turfTime = Math.min(this.turfTime, (to - 1) * this.cfg.turfSecondsPerLevel);
      this.set(to, 'defend');
    }
    return true;
  }

  cool(seconds) {
    this.coolIn = Math.max(0, seconds);
    if (!this.coolIn) this.clear('cooled');
  }

  clear(reason) {
    this.coolIn = 0;
    this.turfTime = 0;
    if (this.level > 0) this.lockout = this.cfg.lockoutAfterClear;
    this.set(0, reason);
  }

  update(dt) {
    if (!this.enabled) return;
    this.bumpCool -= dt;
    if (this.coolIn > 0 && (this.coolIn -= dt) <= 0) this.clear('cooled');
    if (this.lockout > 0 && (this.lockout -= dt) > 0) return;
    if (!this.inTurf) return;
    this.turfTime += dt;
    const want = Math.min(this.max, 1 + Math.floor(this.turfTime / this.cfg.turfSecondsPerLevel));
    if (want > this.level) this.set(want, 'turf');
  }
}
