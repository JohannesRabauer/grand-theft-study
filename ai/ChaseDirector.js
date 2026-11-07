// Chase director (AD-12): the only writer of the Ärger level (0-2) and the only spawner of
// bullies. It listens on ctx.events for `turf:enter|leave`, `bully:bump` and `prop:hit`, and
// emits `chase:level` { level, reason } and `chase:seen` (bool). Exposed as ctx.chase:
//   level, seen, hidden, hideProgress (0..1 while the hide timer runs), cool(seconds) (level falls to 0 after that long, bullies give up), reset()
//   (level 0, bullies removed at once). Thresholds are in ai/ChaseLevel.js + data/chase.json.
// Contact with a bully emits `bully:caught-contact` { bully } for story 1.9 and puts it in CAUGHT.
import { ChaseLevel } from './ChaseLevel.js';
import { Pathfinder } from './Pathfinding.js';
import { Escape } from './Escape.js';
import { Perception } from './Perception.js';
import { BullyFSM, S } from './BullyFSM.js';
import { BullyPool } from '../entities/Bully.js';

const STATE_COLORS = { IDLE: 0xaaaaaa, CHASE: 0xff4d4d, SEARCH: 0xffc24d, DISTRACTED: 0x4dd2ff, GIVE_UP: 0x9a9a9a, CAUGHT: 0xff4dff };

export class ChaseDirector {
  constructor(scene, ctx, cfg, profiles) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.profiles = profiles;
    this.nav = new Pathfinder(ctx.map, ctx.surfaces.data, cfg.nav);
    this.perception = new Perception(ctx, cfg.perception, this.nav);
    this.fsm = new BullyFSM(this);
    this.pool = new BullyPool(scene, ctx, this);
    this.escape = new Escape(cfg.escape);
    this.lvl = new ChaseLevel(cfg.level, cfg.chaseEnabled, (level, reason) => this.onLevel(level, reason));
    const ts = ctx.map.tileSize;
    this.spawns = ctx.map.objects.filter(o => o.type === 'bully-spawn').map(o => ({ x: (o.x + 0.5) * ts, y: (o.y + 0.5) * ts }));
    this.seen = false;
    ctx.chase = this;

    const { events } = ctx;
    events.on('turf:enter', () => this.lvl.turf(true));
    events.on('turf:leave', () => this.lvl.turf(false));
    events.on('bully:bump', () => this.lvl.bump());
    events.on('prop:hit', ev => this.onPropHit(ev));
    events.on('quality:changed', () => this.trim());
    if (window.SCHULWEG_DEBUG) this.makeDebug();
  }

  get level() { return this.lvl.level; }
  get bullies() { return this.pool.list; }
  get hidden() { return this.perception.hidden; }
  get hideProgress() { return this.escape.progress; }

  cool(seconds) { this.lvl.cool(seconds); }

  reset() {
    for (const b of this.pool.list) this.pool.release(b);
    this.lvl.clear('reset');
    this.lvl.lockout = 0;
    this.escape.reset();
    this.setSeen(false);
  }

  onLevel(level, reason) {
    this.ctx.events.emit('chase:level', { level, reason });
    if (level === 0) {
      for (const b of this.pool.list) if (b.active && b.state !== S.CAUGHT) this.fsm.enter(b, S.GIVE_UP);
      return;
    }
    // top up to the kinds this level wants (never past the tier cap); bullies already out stay
    const want = this.cfg.level.spawnByLevel[level].slice(0, this.ctx.quality.tier.maxBullies);
    for (const b of this.pool.list) {
      if (!b.active || b.state === S.GIVE_UP) continue;
      const i = want.indexOf(b.kind);
      if (i >= 0) want.splice(i, 1);
    }
    for (const kind of want) this.spawn(kind);
  }

  // A bully appears at the nearest spawn point that is outside the camera view and runs for the player.
  spawn(kind) {
    const p = this.pickSpawn();
    const b = this.pool.get(kind, this.cfg.kinds[kind], p.x, p.y);
    if (!b) return null;
    const { player } = this.ctx;
    b.lastX = player.x;
    b.lastY = player.y;
    b.alerted = true;
    this.fsm.enter(b, S.IDLE);
    return b;
  }

  pickSpawn() {
    const { player } = this.ctx;
    const cam = this.scene.cameras.main;
    const need = Math.hypot(cam.width, cam.height) / cam.zoom / 2 + this.cfg.spawn.margin;
    const sep = this.cfg.spawn.minSeparation;
    let best = null;
    let bestD = Infinity;
    let far = this.spawns[0];
    let farD = -1;
    for (const s of this.spawns) {
      const d = Math.hypot(s.x - player.x, s.y - player.y);
      if (d > farD) { farD = d; far = s; }
      if (d < need || d >= bestD || this.occupied(s, sep)) continue;
      bestD = d;
      best = s;
    }
    return best ?? far;
  }

  occupied(s, r) {
    for (const b of this.pool.list) if (b.active && Math.hypot(b.x - s.x, b.y - s.y) < r) return true;
    return false;
  }

  farSpawn() {
    const { player } = this.ctx;
    let best = this.spawns[0];
    let bestD = -1;
    for (const s of this.spawns) {
      const d = Math.hypot(s.x - player.x, s.y - player.y);
      if (d > bestD) { bestD = d; best = s; }
    }
    return best;
  }

  onScreen(x, y, margin) {
    // from scroll and zoom (always current), unlike worldView which is refreshed at render time
    const cam = this.scene.cameras.main;
    const hw = cam.width / cam.zoom / 2 + margin;
    const hh = cam.height / cam.zoom / 2 + margin;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    return Math.abs(x - cx) < hw && Math.abs(y - cy) < hh;
  }

  despawn(b, reason) {
    this.pool.release(b);
    if (this.pool.live() === 0 && this.lvl.level > 0) this.lvl.clear(reason);
  }

  // Tier dropped below the number of live bullies: send the surplus away at once.
  trim() {
    let over = this.pool.live() - this.pool.cap;
    for (let i = this.pool.list.length - 1; i >= 0 && over > 0; i--) {
      if (!this.pool.list[i].active) continue;
      this.pool.release(this.pool.list[i]);
      over--;
    }
  }

  // Slingshot hits and any other strong prop impact lure bullies in range (`ev.radius` overrides the default, e.g. a trash can). Impacts caused by a
  // bully shoving the prop itself (a bully right beside it) are ignored.
  onPropHit(ev) {
    const pos = ev.prop?.body?.position ?? ev;
    const own = this.cfg.bully.ownHitRadius;
    for (const b of this.pool.list) {
      if (b.active && Math.hypot(pos.x - b.x, pos.y - b.y) < own) return;
    }
    for (const b of this.pool.list) if (b.active) this.fsm.distract(b, pos.x, pos.y, ev.radius);
  }

  update(dt) {
    this.lvl.update(dt);
    this.nav.update();
    const { player, particles, quality, events } = this.ctx;
    const c = this.cfg.bully;
    let seen = false;
    let nearest = Infinity;
    for (const b of this.pool.list) {
      if (!b.active) continue;
      this.fsm.update(b, dt);
      b.step(dt);
      if (b.state !== S.CAUGHT) nearest = Math.min(nearest, Math.hypot(player.x - b.x, player.y - b.y));
      if (b.sees) seen = true;
      if (b.state === S.CHASE) {
        b.steamIn -= dt;
        if (b.steamIn <= 0 && this.onScreen(b.x, b.y, 16)) {
          b.steamIn = c.steamInterval / quality.tier.particleMul;
          particles.emit('anger', b.x, b.y - c.steamOffsetY);
        }
      }
      if (b.state === S.CAUGHT) continue;
      const d = Math.hypot(player.x - b.x, player.y - b.y);
      if (this.perception.hidden && d < c.bumpRadius) continue; // a hidden player is not noticed or bumped
      if (d < c.catchRadius && b.state !== S.GIVE_UP) {
        this.fsm.enter(b, S.CAUGHT);
        events.emit('bully:caught-contact', { bully: b });
      } else if (d < c.bumpRadius && b.state !== S.CHASE) {
        if (!b.bumped) events.emit('bully:bump', { bully: b });
        b.bumped = true; // once per approach: re-armed when the player is out of range again
      } else if (d >= c.bumpRadius) b.bumped = false;
    }
    this.setSeen(seen);
    const gone = this.escape.update(dt, this.lvl.level > 0, this.perception.hidden, seen, nearest);
    if (gone) this.lvl.clear(gone);
    if (this.dbg) this.drawDebug();
  }

  setSeen(seen) {
    if (seen === this.seen) return;
    this.seen = seen;
    this.ctx.events.emit('chase:seen', seen);
  }

  // ?debug: state label, path, LOS ray and radii per bully.
  makeDebug() {
    this.dbg = this.scene.add.graphics().setDepth(9600);
    this.labels = this.pool.list.map(() => this.scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '6px', color: '#ffffff', backgroundColor: '#000000aa', resolution: this.ctx.res.scale }).setDepth(9601).setVisible(false));
  }

  drawDebug() {
    const g = this.dbg.clear();
    const { player } = this.ctx;
    const { ts, cols } = this.nav;
    this.pool.list.forEach((b, i) => {
      const label = this.labels[i];
      label.setVisible(b.active);
      if (!b.active) return;
      const col = STATE_COLORS[b.state];
      label.setText(`${b.kind} ${b.state}${b.sees ? ' *' : ''}`).setPosition(b.x - 14, b.y - 24).setColor('#' + col.toString(16).padStart(6, '0'));
      g.lineStyle(1, b.sees ? 0xff4d4d : 0x666666, 0.8).lineBetween(b.x, b.y, player.x, player.y);
      g.lineStyle(1, 0x4dd2ff, 0.9).beginPath().moveTo(b.x, b.y);
      for (let k = b.pathIdx; k < b.pathLen; k++) g.lineTo((b.path[k] % cols + 0.5) * ts, (((b.path[k] / cols) | 0) + 0.5) * ts);
      g.strokePath();
      g.lineStyle(1, 0xffc24d, 0.5).strokeCircle(b.x, b.y, this.cfg.bully.bumpRadius);
    });
  }
}
