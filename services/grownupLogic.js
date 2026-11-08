// The grown-up chasers (story 7.4: Hausmeister and ticket inspector), Phaser-free. See data/grownups.json. A grown-up walks straight at the
// nearest kid (sliding along walls), is escaped by hiding or by distance, and when he catches a kid, or loses them, he calms down and walks
// off. `update` returns 'caught' once when he touches a kid, 'calmed' once when he is gone; `state` is CHASE, GIVE_UP or GONE.
export const G = { CHASE: 'CHASE', GIVE_UP: 'GIVE_UP', GONE: 'GONE' };

export class Brain {
  constructor(cfg, x, y) {
    this.cfg = cfg;
    this.x = x;
    this.y = y;
    this.state = G.CHASE;
    this.t = 0;
    this.far = 0; // seconds the kid has been farther than loseDistance
    this.hid = 0; // seconds the kid has been hidden
    this.dx = 0;
    this.dy = 0;
    this.caught = false;
  }

  // One step. target {x, y}; hidden: the kid is in a hiding spot; solid(x, y): is the point a wall. Returns an event name or null.
  update(dt, target, hidden, solid) {
    const c = this.cfg;
    this.t += dt;
    const ddx = target.x - this.x;
    const ddy = target.y - this.y;
    const d = Math.hypot(ddx, ddy) || 1;
    let ux = ddx / d;
    let uy = ddy / d;
    if (this.state === G.CHASE) {
      this.far = d > c.loseDistance ? this.far + dt : 0;
      this.hid = hidden ? this.hid + dt : 0;
      if (d <= c.catchRadius) { this.caught = true; this.enter(G.GIVE_UP); return 'caught'; }
      if (this.far >= c.loseSeconds || this.hid >= c.hideSeconds) { this.enter(G.GIVE_UP); return null; }
    } else if (this.state === G.GIVE_UP) {
      ux = -ux;
      uy = -uy; // walks away from the kids
      if (this.t >= c.calmSeconds) { this.state = G.GONE; return 'calmed'; }
    } else return null;
    const speed = this.state === G.CHASE ? c.speed : c.speed * 0.6;
    this.move(ux * speed * dt, uy * speed * dt, solid);
    return null;
  }

  enter(state) { this.state = state; this.t = 0; }

  // Straight, or along one axis when a wall is in the way.
  move(mx, my, solid) {
    if (!solid(this.x + mx, this.y + my)) { this.x += mx; this.y += my; this.dx = mx; this.dy = my; return; }
    if (!solid(this.x + mx, this.y)) { this.x += mx; this.dx = mx; this.dy = 0; return; }
    if (!solid(this.x, this.y + my)) { this.y += my; this.dx = 0; this.dy = my; return; }
    this.dx = this.dy = 0;
  }
}

// The fine for a catch: never more than the family has.
export const lossFor = (cfg, money) => Math.min(money, cfg.lossCents ?? 0);

export function validateGrownups(cfg, i18nKeys) {
  const problems = [];
  for (const id of ['janitor', 'inspector']) {
    const g = cfg[id];
    if (!g) { problems.push(`missing ${id}`); continue; }
    if (!(g.speed > 0 && g.catchRadius > 0 && g.loseDistance > g.catchRadius && g.loseSeconds > 0 && g.hideSeconds > 0 && g.calmSeconds > 0)) problems.push(`${id}: numbers must be positive and loseDistance beyond the catch`);
    if (!g.cause || !g.cause.event) problems.push(`${id}: names no cause`);
    for (const k of ['shout', 'caught', 'calm']) if (!i18nKeys.includes(g[k])) problems.push(`${id}: missing text ${g[k]}`);
  }
  if (!(cfg.dog?.chaseSeconds > 0)) problems.push('dog: chaseSeconds');
  return problems;
}
