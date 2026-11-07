import { addCircle } from '../physics/bodies.js';
import { MovementController } from '../vehicles/MovementController.js';

// A bully: sprite + BULLY body + MovementController, steered along cached A* paths (or straight
// when the way is clear). Kind (foot or bike) is only a movement profile from data/vehicles.json
// (AD-12); the state machine is the same. Bodies are pooled and live in the Matter world only
// while active.
export class Bully {
  constructor(scene, ctx, chase, profileId) {
    this.scene = scene;
    this.chase = chase;
    this.profiles = chase.profiles;
    this.cfg = chase.cfg.bully;
    const profile = this.profiles[profileId];
    this.sprite = scene.add.image(0, 0, profile.texture).setScale(ctx.res.inv).setVisible(false);
    this.body = addCircle(scene, 0, 0, profile.radius, 'BULLY', { frictionAir: 0, friction: 0, inertia: Infinity });
    scene.matter.world.remove(this.body);
    this.move = new MovementController(scene.matter, this.body, profileId, profile, ctx.surfaces);
    this.path = new Int32Array(chase.cfg.nav.maxPath);
    this.active = false;
    this.kind = '';
    this.state = 'IDLE';
    this.t = 0;
    this.sees = false;
    this.target = null; // the player it chases: the best visible one, kept while it stays reasonably close
    this.seenMask = 0; // bit per player index this bully sees right now
    this.lost = 0;
    this.lastX = 0; this.lastY = 0; // last known player position
    this.targetX = 0; this.targetY = 0; // distraction / give-up destination
    this.steamIn = 0;
    this.mx = 0; this.my = 0;
    this.pathLen = 0; this.pathIdx = 0; this.pathPending = false;
    this.goalX = 0; this.goalY = 0; this.goalTile = -1; this.sinceRepath = 0;
    this.bumped = false;
    this.alerted = false;
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  activate(kind, profileId, x, y) {
    const p = this.profiles[profileId];
    this.kind = kind;
    this.move.setProfile(profileId, p);
    this.move.speed = 0;
    this.move.heading = 0;
    this.move.vel.x = this.move.vel.y = 0;
    this.sprite.setTexture(p.texture).setOrigin(0.5, p.faceHeading ? 0.5 : 0.8).setFlipX(false).setRotation(0).setVisible(true);
    this.scene.matter.body.setPosition(this.body, { x, y });
    this.scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    this.scene.matter.world.add(this.body);
    this.active = true;
    this.t = 0;
    this.sees = false;
    this.target = null;
    this.seenMask = 0;
    this.lost = 0;
    this.steamIn = 0;
    this.pathLen = this.pathIdx = 0;
    this.goalTile = -1;
    this.sinceRepath = 1e3;
    this.bumped = false;
    this.mx = this.my = 0;
    this.sprite.setPosition(x, y);
  }

  deactivate() {
    this.active = false;
    this.sprite.setVisible(false);
    this.scene.matter.world.remove(this.body);
  }

  // Called by the path queue (Pathfinder.update) within the shared per-frame budget.
  solvePath(nav) {
    if (!this.active) return;
    this.pathLen = nav.findPath(this.x, this.y, this.goalX, this.goalY, this.path);
    this.pathIdx = this.pathLen > 1 ? 1 : this.pathLen;
  }

  stop() { this.mx = this.my = 0; }

  // Steer toward (x, y): straight when the way is clear, otherwise along the cached path, asking
  // for a fresh one every `repathInterval` or when the goal moved to another tile.
  // Returns the straight-line distance left.
  goTo(x, y) {
    const nav = this.chase.nav;
    const c = this.chase.cfg.nav;
    const dx = x - this.x;
    const dy = y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < this.cfg.arriveRadius) { this.stop(); return d; }
    let tx = x;
    let ty = y;
    const r = this.body.circleRadius;
    if (nav.clearFor(this.x, this.y, x, y, r)) {
      this.pathLen = this.pathIdx = 0;
      this.goalTile = -1;
    } else {
      const gt = nav.tileOf(x, y);
      if (!this.pathPending && (this.sinceRepath >= c.repathInterval || (gt !== this.goalTile && this.sinceRepath >= c.repathMin))) {
        this.goalX = x; this.goalY = y; this.goalTile = gt; this.sinceRepath = 0;
        nav.request(this);
      }
      const { ts, cols } = nav;
      const reach = this.cfg.reachBase + this.move.velSpeed * this.cfg.reachSpeedGain;
      let i = this.pathIdx;
      while (i < this.pathLen) {
        const n = this.path[i];
        const wx = (n % cols + 0.5) * ts;
        const wy = (((n / cols) | 0) + 0.5) * ts;
        const next = this.path[i + 1];
        if (Math.hypot(wx - this.x, wy - this.y) < reach ||
            (i + 1 < this.pathLen && nav.clearFor(this.x, this.y, (next % cols + 0.5) * ts, (((next / cols) | 0) + 0.5) * ts, r))) i++;
        else break;
      }
      this.pathIdx = i;
      if (i < this.pathLen) {
        const n = this.path[i];
        tx = (n % cols + 0.5) * ts;
        ty = (((n / cols) | 0) + 0.5) * ts;
        if (!nav.clearFor(this.x, this.y, tx, ty, r)) {
          // the body would clip a wall corner on the way: first re-centre in the current tile
          const mx = (Math.floor(this.x / ts) + 0.5) * ts;
          const my = (Math.floor(this.y / ts) + 0.5) * ts;
          if (Math.hypot(mx - this.x, my - this.y) > 2) { tx = mx; ty = my; }
        }
      } else if (!this.pathPending && this.pathLen > 0) {
        // path used up but still blocked: wait for the next one instead of ramming the wall
        this.stop();
        return d;
      }
    }
    const ex = tx - this.x;
    const ey = ty - this.y;
    const el = Math.hypot(ex, ey) || 1;
    const slow = tx === x && ty === y ? Math.min(1, d / 14) : 1;
    this.mx = (ex / el) * slow;
    this.my = (ey / el) * slow;
    return d;
  }

  step(dt) {
    this.sinceRepath += dt;
    const m = this.move;
    m.update(dt, this.mx, this.my, false);
    this.mx = this.my = 0;
    const s = this.sprite;
    s.setPosition(this.x, this.y).setDepth(this.y);
    if (m.profile.faceHeading) {
      const h = m.heading;
      const west = Math.cos(h) < 0;
      s.setFlipX(west).setRotation(west ? h + (h > 0 ? -Math.PI : Math.PI) : h);
    } else if (Math.abs(m.vel.x) > 4) s.setFlipX(m.vel.x < 0);
  }
}

// Fixed set of bullies allocated at the largest tier cap; the tier only changes how many may be
// active (AD-8). get() returns null at the cap.
export class BullyPool {
  constructor(scene, ctx, chase) {
    this.ctx = ctx;
    this.list = [];
    const max = ctx.quality.maxOf('maxBullies');
    for (let i = 0; i < max; i++) this.list.push(new Bully(scene, ctx, chase, 'bully-foot'));
    ctx.pools.register('bullies', this);
  }

  get cap() { return this.ctx.quality.tier.maxBullies; }

  live() {
    let n = 0;
    for (const b of this.list) if (b.active) n++;
    return n;
  }

  get(kind, profileId, x, y) {
    if (this.live() >= this.cap) return null;
    const b = this.list.find(o => !o.active);
    if (!b) return null;
    b.activate(kind, profileId, x, y);
    return b;
  }

  release(b) {
    if (b.active) b.deactivate();
  }
}
