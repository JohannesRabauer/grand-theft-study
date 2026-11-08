// The town's small animals (story 12.5), Phaser-free. See data/critters.json. A Critter is a little state machine without any body: pigeons peck
// until someone comes close and then fly off and come back later, cats sit on fences and leap away when someone comes near, ducks swim about
// and gather when they are fed. Nothing here can be hit by a tool or a vehicle: there is no collision body at all.
export const C = { IDLE: 'IDLE', FLEE: 'FLEE', AWAY: 'AWAY', BACK: 'BACK', FEED: 'FEED' };

export class Critter {
  constructor(kind, cfg, x, y, id) {
    this.kind = kind;
    this.cfg = cfg;
    this.id = id;
    this.homeX = x;
    this.homeY = y;
    this.x = x;
    this.y = y;
    this.lift = 0; // height above the ground while flying (px)
    this.state = C.IDLE;
    this.t = 0;
    this.dx = 0;
    this.dy = 0;
    this.phase = (id * 1.7) % 6.28;
  }

  get visible() { return this.state !== C.AWAY; }

  // One step. `near`: distance to the closest kid or vehicle that scares it (Infinity for none), away: unit vector from the threat.
  // Returns 'scatter' when it just took off, 'back' when it is home again, 'fed' when the feeding ended, else null.
  update(dt, near, awayX, awayY) {
    const c = this.cfg;
    this.t += dt;
    this.phase += dt * c.bobSpeed;
    if (this.state === C.IDLE) {
      if (this.kind === 'duck') {
        this.x = this.homeX + Math.cos(this.phase * 0.6) * c.swim;
        this.y = this.homeY + Math.sin(this.phase * 0.45) * c.swim * 0.5;
      }
      if (this.kind !== 'duck' && near < c.scatterRadius) { this.take(awayX, awayY); return 'scatter'; }
    } else if (this.state === C.FLEE) {
      this.x += this.dx * c.fleeSpeed * dt;
      this.y += this.dy * c.fleeSpeed * dt;
      this.lift = Math.min(c.maxLift, this.lift + c.liftSpeed * dt);
      if (this.t >= c.fleeSeconds) { this.state = C.AWAY; this.t = 0; }
    } else if (this.state === C.AWAY) {
      if (this.t >= c.returnSeconds && near > c.scatterRadius * 1.5) { this.state = C.BACK; this.t = 0; this.x = this.homeX; this.y = this.homeY; this.lift = c.maxLift; }
    } else if (this.state === C.BACK) {
      this.lift = Math.max(0, this.lift - c.liftSpeed * dt);
      if (this.lift <= 0) { this.state = C.IDLE; this.t = 0; return 'back'; }
    } else if (this.state === C.FEED) {
      if (this.t >= c.feedSeconds) { this.state = C.IDLE; this.t = 0; return 'fed'; }
    }
    return null;
  }

  take(ux, uy) {
    this.state = C.FLEE;
    this.t = 0;
    const n = Math.hypot(ux, uy) || 1;
    this.dx = ux / n;
    this.dy = uy / n;
    if (this.kind === 'cat') this.dy = Math.abs(this.dy) * 0.4; // a cat runs along the ground, away from the threat
  }

  // Feeding (ducks only): they swim over to `x, y` for a few seconds.
  feed(x, y) {
    if (this.kind !== 'duck' || this.state !== C.IDLE) return false;
    this.state = C.FEED;
    this.t = 0;
    this.x = this.homeX + (x - this.homeX) * 0.5;
    this.y = this.homeY + (y - this.homeY) * 0.5;
    return true;
  }
}

export function validateCritters(cfg) {
  const problems = [];
  for (const k of ['pigeon', 'cat', 'duck']) {
    const c = cfg[k];
    if (!c) { problems.push(`missing ${k}`); continue; }
    if (!(c.bobSpeed > 0) || (k !== 'duck' && !(c.scatterRadius > 8 && c.fleeSeconds > 0 && c.returnSeconds > c.fleeSeconds && c.fleeSpeed > 0))) problems.push(`${k}: numbers`);
  }
  if (!(cfg.pigeon.maxLift > 0)) problems.push('pigeons fly: maxLift');
  if (!(cfg.duck.feedSeconds > 0 && cfg.duck.feedRadius > 10)) problems.push('duck feeding numbers');
  return problems;
}
