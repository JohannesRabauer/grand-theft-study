// Drives any actor from a movement profile (AD-4). Behaviour comes only from profile
// numbers and surface data; there is no branching on the profile id.
//
// Model: the actor has a heading that turns at `turnRate` and a speed that approaches
// the target at `accel`. Real velocity chases heading * speed at a rate of
// grip * surfaceGrip * (1 - drift) per second, which is what makes stops and turns slide.
// A profile with a `stamina` block can sprint until it runs dry and then gets slower.
const DEG = Math.PI / 180;

export class MovementController {
  constructor(matter, body, profileId, profile, surfaces) {
    this.matter = matter;
    this.body = body;
    this.profileId = profileId; // only used as the key into data/surfaces.json speed tables
    this.profile = profile;
    this.surfaces = surfaces;
    this.heading = 0;
    this.speed = 0;
    this.surface = surfaces.at(body.position.x, body.position.y);
    this.stamina = 1; // 0..1
    this.sprinting = false;
    this.exhausted = false;
    this.regenIn = 0;
    this.vel = { x: 0, y: 0 };
    this.matterVel = { x: 0, y: 0 }; // reused argument for Body.setVelocity (no per-frame object)
    this.slip = 0; // angle (rad) between real velocity and heading
    this.velSpeed = 0;
  }

  // Switch profile (mount/dismount) keeping heading, speed and velocity so the change is seamless.
  setProfile(profileId, profile) {
    this.profileId = profileId;
    this.profile = profile;
  }

  update(dt, moveX, moveY, sprintWanted) {
    const p = this.profile;
    const body = this.body;
    this.surface = this.surfaces.at(body.position.x, body.position.y);
    const surf = this.surfaces.props(this.surface);

    const mag = Math.min(1, Math.hypot(moveX, moveY));
    const moving = mag > 0.01;
    const speedMult = this.updateStamina(dt, moving && sprintWanted);

    const target = moving ? mag * p.maxSpeed * (surf.speed[this.profileId] ?? 1) * speedMult : 0;
    const step = p.accel * surf.grip * dt;
    this.speed = this.speed < target ? Math.min(this.speed + step, target) : Math.max(this.speed - step, target);

    if (moving) {
      const want = Math.atan2(moveY, moveX);
      if (this.speed < 1) this.heading = want;
      else {
        let diff = want - this.heading;
        diff -= Math.round(diff / (2 * Math.PI)) * 2 * Math.PI;
        const max = p.turnRate * DEG * dt;
        this.heading += Math.max(-max, Math.min(max, diff));
      }
    }

    // Start from the real velocity so walls and collisions are felt (Matter step is fixed 60 Hz).
    const vx = body.velocity.x * 60;
    const vy = body.velocity.y * 60;
    const k = 1 - Math.exp(-p.grip * surf.grip * (1 - p.drift) * dt);
    this.vel.x = vx + (Math.cos(this.heading) * this.speed - vx) * k;
    this.vel.y = vy + (Math.sin(this.heading) * this.speed - vy) * k;
    this.velSpeed = Math.hypot(this.vel.x, this.vel.y);
    let slip = Math.atan2(this.vel.y, this.vel.x) - this.heading;
    slip -= Math.round(slip / (2 * Math.PI)) * 2 * Math.PI;
    this.slip = this.velSpeed > 1 ? Math.abs(slip) : 0;
    const mv = this.matterVel;
    mv.x = this.vel.x / 60;
    mv.y = this.vel.y / 60;
    this.matter.body.setVelocity(body, mv);
  }

  // Returns the speed multiplier for this frame.
  updateStamina(dt, wantsSprint) {
    const s = this.profile.stamina;
    if (!s) return 1;
    this.sprinting = wantsSprint && !this.exhausted;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - (s.drain / s.max) * dt);
      this.regenIn = s.regenDelay;
      if (this.stamina === 0) { this.exhausted = true; this.sprinting = false; }
    } else {
      this.regenIn -= dt;
      if (this.regenIn <= 0) this.stamina = Math.min(1, this.stamina + (s.regen / s.max) * dt);
      if (this.exhausted && this.stamina >= s.recoverAt) this.exhausted = false;
    }
    return this.sprinting ? s.sprintMult : this.exhausted ? s.tiredMult : 1;
  }
}
