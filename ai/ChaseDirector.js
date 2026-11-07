// Chase director (AD-12): the only writer of the Ärger level (0-2) and the only spawner of
// bullies. It listens on ctx.events for `turf:enter|leave`, `bully:bump` and `prop:hit`, and
// emits `chase:level` { level, reason } and `chase:seen` (bool). Exposed as ctx.chase:
//   level, seen, hidden (every player hidden), hiddenFor(player), hideProgress (0..1 while the hide timer runs), cool(seconds) (level falls to 0 after that long, bullies give up), reset()
//   (level 0, bullies removed at once), playerCaught() (called by entities/Caught.js). Thresholds are in ai/ChaseLevel.js + data/chase.json.
// Bullies target the nearest player they can see (with hysteresis); contact with a bully emits `bully:caught-contact` { bully, player }
// (the player's index) and puts it in CAUGHT. The Ärger level is shared by all players (AD-18). Co-op rules (data/chase.json `coop`):
//  - the level rises from the turf or bumps of either player;
//  - it falls only when EVERY player in play is safe, judged per player by its own Escape timers (hidden long enough, or far and
//    unseen): one player hiding while the other is seen or close keeps the chase, and so does a hider whose partner is still near a bully;
//  - a caught player leaves play for its frame (Player.alive = false, pinned): the catching bully gives up, the other bullies carry on,
//    and the level clears once no bully is chasing any more (or at once when nobody is left in play, as with one player).
import { ChaseLevel } from './ChaseLevel.js';
import { Pathfinder } from './Pathfinding.js';
import { Escape } from './Escape.js';
import { escapeVerdict, wantedKinds, offView } from './chaseLogic.js';
import { Perception } from './Perception.js';
import { BullyFSM, S } from './BullyFSM.js';
import { BullyPool } from '../entities/Bully.js';

const STATE_COLORS = { IDLE: 0xaaaaaa, CHASE: 0xff4d4d, SEARCH: 0xffc24d, DISTRACTED: 0x4dd2ff, GIVE_UP: 0x9a9a9a, CAUGHT: 0xff4dff, STUMBLE: 0xffe14d };

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
    this.escapes = Array.from({ length: ctx.maxPlayers }, () => new Escape(cfg.escape)); // one per player
    this.alive = new Uint8Array(ctx.maxPlayers);
    this.nearestBully = new Float64Array(ctx.maxPlayers); // per player: distance to the closest bully
    this.lvl = new ChaseLevel(cfg.level, cfg.chaseEnabled, (level, reason) => this.onLevel(level, reason));
    this.spawns = this.readSpawns();
    this.seen = false;
    this.inTurf = new Uint8Array(ctx.maxPlayers); // per player: standing in bully turf
    ctx.chase = this;

    const { events } = ctx;
    events.on('turf:enter', ev => this.onTurf(ev.player, true));
    events.on('turf:leave', ev => this.onTurf(ev.player, false));
    events.on('bully:bump', () => this.lvl.bump());
    events.on('prop:hit', ev => this.onPropHit(ev));
    events.on('quality:changed', () => this.trim());
    ctx.world.register(this);
    if (window.SCHULWEG_DEBUG) this.makeDebug();
  }

  readSpawns() {
    const ts = this.ctx.map.tileSize;
    return this.ctx.map.objects.filter(o => o.type === 'bully-spawn').map(o => ({ x: (o.x + 0.5) * ts, y: (o.y + 0.5) * ts }));
  }

  // Leaving a map ends the chase; the next map brings its own grid and spawn points (AD-28).
  unloadMap() { this.reset(); }

  loadMap() {
    this.nav.setMap(this.ctx.map, this.ctx.surfaces.data);
    this.spawns = this.readSpawns();
  }

  get level() { return this.lvl.level; }
  get bullies() { return this.pool.list; }
  get hidden() { return this.perception.hidden; }
  hiddenFor(p) { return this.perception.hiddenFor(p); }
  // Hide timer of the slowest player in play (the level drops when the last one is done).
  get hideProgress() {
    let min = 1;
    for (const p of this.ctx.alivePlayers()) min = Math.min(min, this.escapes[p.index].progress);
    return min;
  }

  // The level reacts to turf while any player stands in it.
  onTurf(player, inside) {
    this.inTurf[player] = inside ? 1 : 0;
    if (inside || !this.inTurf.some(Boolean)) this.lvl.turf(inside);
  }

  // Distance from (x, y) to the nearest player.
  nearestDist(x, y) {
    const p = this.ctx.nearestPlayer(x, y);
    return Math.hypot(p.x - x, p.y - y);
  }

  cool(seconds) { this.lvl.cool(seconds); }

  // Story 6.3: the defense module lowers the level. `reason` is for the log only. Returns whether the level changed.
  defend(reason, amount) { return this.lvl.defend(amount, this.cfg.level.defendMaxLevel); }

  // Story 6.3: a bully stumbles away from (x, y) (see BullyFSM.stumble); emits `bully:stumble` { bully (pool id), x, y, reason }.
  stumble(b, x, y, o, reason) {
    if (!this.fsm.stumble(b, x, y, o)) return false;
    this.ctx.events.emit('bully:stumble', { bully: b.id, x: b.x, y: b.y, reason });
    return true;
  }

  reset() {
    for (const b of this.pool.list) this.pool.release(b);
    this.lvl.clear('reset');
    this.lvl.lockout = 0;
    for (const e of this.escapes) e.reset();
    this.setSeen(false);
  }

  onLevel(level, reason) {
    this.ctx.events.emit('chase:level', { level, reason });
    if (level === 0) {
      for (const b of this.pool.list) {
        if (!b.active || b.state === S.CAUGHT) continue;
        if (b.state === S.STUMBLE) b.resume = S.GIVE_UP; // finish the comic step first, then walk off
        else this.fsm.enter(b, S.GIVE_UP);
      }
      return;
    }
    // top up to the kinds this level wants (never past the tier cap); bullies already out stay
    const want = wantedKinds(this.cfg.level, level, this.ctx.players.length > 1, this.ctx.quality.tier.maxBullies);
    for (const b of this.pool.list) {
      if (!b.active || b.state === S.GIVE_UP) continue;
      const i = want.indexOf(b.kind);
      if (i >= 0) want.splice(i, 1);
    }
    for (const kind of want) this.spawn(kind);
  }

  // A caught player has left play (Caught.js): the bully that got it gives up, the others keep chasing whoever is left.
  // Nobody left in play, or no bully still after anyone: the chase is over.
  playerCaught() {
    if (this.ctx.alivePlayers().length === 0) { this.reset(); return; }
    for (const b of this.pool.list) if (b.active && b.state === S.CAUGHT) this.fsm.enter(b, S.GIVE_UP);
    if (this.lvl.level > 0 && !this.pool.list.some(b => b.active && b.state !== S.GIVE_UP)) this.lvl.clear('caught');
  }

  // A bully appears at the nearest spawn point that is outside the camera view and runs for the nearest player.
  spawn(kind) {
    const p = this.pickSpawn();
    if (!p) return null; // a map without bully spawns (an interior) has no chase
    const b = this.pool.get(kind, this.cfg.kinds[kind], p.x, p.y);
    if (!b) return null;
    const player = this.ctx.nearestPlayer(b.x, b.y);
    b.lastX = player.x;
    b.lastY = player.y;
    b.alerted = true;
    this.fsm.enter(b, S.IDLE);
    return b;
  }

  pickSpawn() {
    const cam = this.scene.cameras.main;
    const margin = this.cfg.spawn.margin;
    const need = Math.hypot(cam.width, cam.height) / cam.zoom / 2 + margin;
    const hw = cam.width / cam.zoom / 2;
    const hh = cam.height / cam.zoom / 2;
    const cx = cam.scrollX + cam.width / 2; // the view around both players
    const cy = cam.scrollY + cam.height / 2;
    const sep = this.cfg.spawn.minSeparation;
    let best = null;
    let bestD = Infinity;
    let far = this.spawns[0];
    let farD = -1;
    for (const s of this.spawns) {
      const d = this.nearestDist(s.x, s.y);
      if (d > farD) { farD = d; far = s; }
      if (d < need || d >= bestD || !offView(s.x, s.y, cx, cy, hw, hh, margin) || this.occupied(s, sep)) continue;
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
    let best = this.spawns[0];
    let bestD = -1;
    for (const s of this.spawns) {
      const d = this.nearestDist(s.x, s.y);
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
    const { ctx } = this;
    const { particles, quality, events } = ctx;
    const c = this.cfg.bully;
    const { players } = this.ctx;
    const near = this.nearestBully;
    near.fill(Infinity);
    let seen = false;
    let seenMask = 0; // players some bully sees
    for (const b of this.pool.list) {
      if (!b.active) continue;
      this.fsm.update(b, dt);
      b.step(dt);
      if (b.state !== S.CAUGHT) for (let i = 0; i < players.length; i++) near[i] = Math.min(near[i], Math.hypot(players[i].x - b.x, players[i].y - b.y));
      if (b.sees) seen = true;
      seenMask |= b.seenMask;
      if (b.state === S.CHASE) {
        b.steamIn -= dt;
        if (b.steamIn <= 0 && this.onScreen(b.x, b.y, 16)) {
          b.steamIn = c.steamInterval / quality.tier.particleMul;
          particles.emit('anger', b.x, b.y - c.steamOffsetY);
        }
      }
      if (b.state === S.CAUGHT || b.state === S.STUMBLE) continue;
      const player = this.contactPlayer(b);
      if (!player) continue; // a hidden player is not noticed or bumped
      const d = Math.hypot(player.x - b.x, player.y - b.y);
      if (d < c.catchRadius && b.state !== S.GIVE_UP) {
        if (ctx.defense?.contact(player.index, b)) continue; // blocked, parried or dodged: no catch
        this.fsm.enter(b, S.CAUGHT);
        events.emit('bully:caught-contact', { bully: b, player: player.index });
      } else if (d < c.bumpRadius && b.state !== S.CHASE) {
        if (!b.bumped) events.emit('bully:bump', { bully: b });
        b.bumped = true; // once per approach: re-armed when the player is out of range again
      } else if (d >= c.bumpRadius) b.bumped = false;
    }
    this.setSeen(seen);
    const active = this.lvl.level > 0;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      this.alive[i] = p.alive !== false ? 1 : 0;
      if (this.alive[i]) this.escapes[i].update(dt, active, this.perception.hiddenFor(p), (seenMask >> i & 1) === 1, near[i]);
      else this.escapes[i].reset();
    }
    const gone = escapeVerdict(this.escapes, this.alive, players.length);
    if (gone) this.lvl.clear(gone);
    if (this.dbg) this.drawDebug();
  }

  // The nearest player a bully can bump or catch: hidden players within bump range do not count.
  contactPlayer(b) {
    const players = this.ctx.alivePlayers();
    const bump = this.cfg.bully.bumpRadius;
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < bestD && !(d < bump && this.perception.hiddenFor(p))) { bestD = d; best = p; }
    }
    return best;
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
    const { ts, cols } = this.nav;
    this.pool.list.forEach((b, i) => {
      const label = this.labels[i];
      label.setVisible(b.active);
      if (!b.active) return;
      const col = STATE_COLORS[b.state];
      label.setText(`${b.kind} ${b.state}${b.sees ? ' *' : ''}`).setPosition(b.x - 14, b.y - 24).setColor('#' + col.toString(16).padStart(6, '0'));
      const player = b.target ?? this.ctx.nearestPlayer(b.x, b.y);
      g.lineStyle(1, b.sees ? 0xff4d4d : 0x666666, 0.8).lineBetween(b.x, b.y, player.x, player.y);
      g.lineStyle(1, 0x4dd2ff, 0.9).beginPath().moveTo(b.x, b.y);
      for (let k = b.pathIdx; k < b.pathLen; k++) g.lineTo((b.path[k] % cols + 0.5) * ts, (((b.path[k] / cols) | 0) + 0.5) * ts);
      g.strokePath();
      g.lineStyle(1, 0xffc24d, 0.5).strokeCircle(b.x, b.y, this.cfg.bully.bumpRadius);
    });
  }
}
