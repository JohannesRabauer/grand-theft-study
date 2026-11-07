// Crowd director (AD-15): the only spawner and despawner of pedestrians, and the owner of their
// small state machine (WALK, STAND, REACT, FLEE). Exposed as ctx.crowd.
//
// Map markers (AD-5, tile coordinates): `npc-spawn` { district, role, node, face?, gap? } and
// `npc-node` { links[] }, a graph of sidewalk, park and alley waypoints whose links are straight,
// walkable corridors (scripts/check-map.mjs verifies that), so walking is a cheap node-to-node
// steer without any pathfinding. Roles (data/npcs.json): walk, stand, bench, duck, dogwalk, ballkids.
// Spawning picks a weighted marker (district density x role weight) in a ring just outside the
// camera view (the rules are pure, see CrowdLogic.js); pedestrians far outside the view are removed,
// so the population follows the player. The cap is ctx.quality.tier.maxNPCs and is re-applied on
// `quality:changed`. Bodies are in the NPC / ANIMAL categories, tools never touch them (AD-3).
//
// Reactions: `bike:bell` within `bellRadius`, or the player closing in fast (CrowdLogic.approach),
// make a pedestrian step aside (REACT, speech bubble from i18n `npc.react.N`) or dash away (FLEE).
// Emits `npc:react` { x, y, state }.
import { Npc, Dog, S } from '../entities/Npc.js';
import { SpeechBubbles } from '../entities/SpeechBubbles.js';
import { outsideView, pickSpawn, canSpawn, weightedIndex, sideStep, approach } from './CrowdLogic.js';

const STATE_COLORS = { WALK: '#7dff8a', STAND: '#ffe14d', REACT: '#ff9f4d', FLEE: '#ff4d4d' };
const CULL_PAD = 24; // sprites farther than this outside the view are hidden and not animated

export class CrowdDirector {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    const ts = ctx.map.tileSize;

    // graph of waypoints
    const nodeObjs = ctx.map.objects.filter(o => o.type === 'npc-node');
    const index = new Map(nodeObjs.map((o, i) => [o.id, i]));
    this.nx = Float32Array.from(nodeObjs, o => (o.x + 0.5) * ts);
    this.ny = Float32Array.from(nodeObjs, o => (o.y + 0.5) * ts);
    this.links = nodeObjs.map(o => Int16Array.from(o.links, id => index.get(id)));

    // spawn markers as parallel arrays (CrowdLogic.pickSpawn)
    const spawnObjs = ctx.map.objects.filter(o => o.type === 'npc-spawn');
    this.spawns = {
      count: spawnObjs.length,
      xs: Float32Array.from(spawnObjs, o => (o.x + 0.5) * ts),
      ys: Float32Array.from(spawnObjs, o => (o.y + 0.5) * ts),
      weight: Float32Array.from(spawnObjs, o => (cfg.districts[o.district] ?? 1) * cfg.roles[o.role].weight),
      role: spawnObjs.map(o => o.role),
      node: Int16Array.from(spawnObjs, o => index.get(o.node)),
      face: Int8Array.from(spawnObjs, o => o.face ?? 1),
      gap: Float32Array.from(spawnObjs, o => (o.gap ?? 0) * ts)
    };
    this.taken = new Uint8Array(spawnObjs.length);

    // outfits grouped by kind, with texture keys built once
    this.byKind = { adult: [], kid: [], elder: [] };
    for (const o of cfg.outfits) {
      o.keys = [0, 1, 2].map(f => `npc-${o.id}-${f}`);
      this.byKind[o.kind].push(o);
    }
    for (const r of Object.values(cfg.roles)) {
      r.kindNames = Object.keys(r.kinds);
      r.kindWeights = r.kindNames.map(k => r.kinds[k]);
    }

    // pools, allocated once at the largest tier size
    this.list = [];
    for (let i = 0; i < ctx.quality.maxOf('maxNPCs'); i++) this.list.push(new Npc(scene, ctx, cfg));
    this.dogs = [];
    for (let i = 0; i < cfg.maxDogs; i++) this.dogs.push(new Dog(scene, ctx, cfg));
    this.benches = [0, 1].map(() => ({ sprite: scene.add.image(0, 0, 'npc-bench').setScale(ctx.res.inv).setOrigin(0.5, 0.75).setVisible(false), used: false }));
    this.ball = { sprite: scene.add.image(0, 0, 'prop-ball').setScale(ctx.res.inv * 0.8).setVisible(false), a: null, b: null, kicker: null, t: 0, flying: false, fx: 0, fy: 0, tx: 0, ty: 0 };
    this.leash = scene.add.graphics().setDepth(9400);
    this.bubbles = new SpeechBubbles(scene, ctx, cfg.maxBubbles);

    this.liveCount = 0;
    this.view = { cx: 0, cy: 0, hw: 0, hh: 0, px: 0, py: 0 };
    this.spawnIn = 0;
    this.side = { x: 0, y: 0 };
    this.evt = { x: 0, y: 0, state: '' };
    this.rand = Math.random;
    ctx.crowd = this;

    const self = this;
    ctx.pools.register('npcs', { live: () => self.liveCount, get cap() { return ctx.quality.tier.maxNPCs; } });
    ctx.pools.register('dogs', { live: () => self.dogs.filter(d => d.active).length, cap: cfg.maxDogs });
    ctx.events.on('bike:bell', ev => this.onBell(ev));
    ctx.events.on('quality:changed', () => this.trim());
    if (window.SCHULWEG_DEBUG) this.makeDebug();
    this.updateView();
    this.fill(true);
  }

  get cap() { return this.ctx.quality.tier.maxNPCs; }

  // View rectangle from scroll and zoom (always current, unlike worldView which refreshes at render time).
  updateView() {
    const cam = this.scene.cameras.main;
    const v = this.view;
    v.hw = cam.width / cam.zoom / 2;
    v.hh = cam.height / cam.zoom / 2;
    v.cx = cam.scrollX + cam.width / 2;
    v.cy = cam.scrollY + cam.height / 2;
    v.px = this.ctx.player.x;
    v.py = this.ctx.player.y;
  }

  // ---------------------------------------------------------------- spawning

  fill(prefill) {
    const cap = this.cap;
    if (prefill) for (let i = 0; i < cap * 4 && this.liveCount < cap * this.cfg.spawn.prefillFill; i++) this.trySpawn(true);
    else for (let i = 0; i < this.cfg.spawn.attempts; i++) this.trySpawn(false);
  }

  trySpawn(prefill) {
    const cap = this.cap;
    if (this.liveCount >= cap) return;
    const idx = pickSpawn(this.spawns, this.taken, this.view, this.cfg.spawn, this.rand, prefill);
    if (idx < 0) return;
    const role = this.spawns.role[idx];
    const def = this.cfg.roles[role];
    if (!canSpawn(this.liveCount, cap, def.slots)) return;
    if (role === 'dogwalk' && !this.dogs.some(d => !d.active)) return;
    if (role === 'ballkids' && this.ball.a) return;
    const { xs, ys } = this.spawns;
    for (const n of this.list) if (n.active && Math.hypot(n.x - xs[idx], n.y - ys[idx]) < this.cfg.spawn.separation) return;
    this.spawnRole(idx, role, def);
  }

  freeNpc() {
    for (const n of this.list) if (!n.active) return n;
    return null;
  }

  newNpc(def, role, x, y, face) {
    const n = this.freeNpc();
    if (!n) return null;
    const kind = def.kindNames[weightedIndex(def.kindWeights, this.rand())];
    const outfits = this.byKind[kind];
    const sp = this.cfg.speed[kind];
    n.activate(outfits[(this.rand() * outfits.length) | 0], role, x, y, sp[0] + this.rand() * (sp[1] - sp[0]), face);
    this.liveCount++;
    return n;
  }

  spawnRole(idx, role, def) {
    const s = this.spawns;
    const x = s.xs[idx];
    const y = s.ys[idx];
    const n = this.newNpc(def, role, x, y, s.face[idx]);
    if (!n) return;
    if (role !== 'walk') { n.marker = idx; this.taken[idx] = 1; } // walkers leave their marker at once
    if (role === 'walk' || role === 'dogwalk') {
      n.node = s.node[idx];
      n.state = n.resume = S.WALK;
      if (role === 'dogwalk') {
        const dog = this.dogs.find(d => !d.active);
        dog.activate(n, x - n.face * this.cfg.dog.leash, y);
        n.dog = dog;
      }
    } else {
      n.state = n.resume = S.STAND;
      n.t = Infinity;
      if (role === 'bench') {
        n.sitting = true;
        const b = this.benches.find(o => !o.used);
        if (b) {
          b.used = true;
          n.bench = b;
          b.sprite.setPosition(x, y + 3).setDepth(y - 0.5).setVisible(false);
        }
      } else if (role === 'ballkids') {
        const m = this.newNpc(def, role, x + s.gap[idx], y, -n.face);
        if (m) {
          m.marker = -1;
          m.state = m.resume = S.STAND;
          m.t = Infinity;
          n.partner = m; m.partner = n;
          const ball = this.ball;
          ball.a = n; ball.b = m; ball.kicker = n; ball.t = 0; ball.flying = false;
        }
      }
    }
  }

  despawn(n) {
    if (!n.active) return;
    this.bubbles.release(n);
    if (n.marker >= 0) this.taken[n.marker] = 0;
    if (n.dog) { n.dog.deactivate(); n.dog = null; }
    if (n.bench) { n.bench.used = false; n.bench.sprite.setVisible(false); n.bench = null; }
    const p = n.partner;
    n.partner = null;
    if (p) {
      p.partner = null;
      if (this.ball.a === n || this.ball.a === p) { this.ball.a = this.ball.b = this.ball.kicker = null; this.ball.sprite.setVisible(false); }
      this.despawn(p);
    }
    n.deactivate();
    this.liveCount--;
  }

  // Tier dropped below the live count: remove the pedestrians farthest from the view first.
  trim() {
    const cap = this.cap;
    this.updateView();
    while (this.liveCount > cap) {
      let worst = null;
      let worstD = -Infinity;
      for (const n of this.list) {
        if (!n.active) continue;
        const d = outsideView(n.x, n.y, this.view);
        if (d > worstD) { worstD = d; worst = n; }
      }
      if (!worst) break;
      this.despawn(worst);
    }
  }

  clear() {
    for (const n of this.list) this.despawn(n);
    for (const d of this.dogs) if (d.active) d.deactivate();
    this.bubbles.clear();
    this.ball.a = this.ball.b = this.ball.kicker = null;
    this.ball.sprite.setVisible(false);
    this.leash.clear();
    this.liveCount = 0;
  }

  // ---------------------------------------------------------------- reactions

  onBell(ev) {
    const r = this.cfg.react;
    const { player } = this.ctx;
    for (const n of this.list) {
      if (!n.active || n.cool > 0 || (n.state !== S.WALK && n.state !== S.STAND)) continue;
      if (Math.hypot(n.x - ev.x, n.y - ev.y) > r.bellRadius) continue;
      this.react(n, 1, player.move.velSpeed > 20 ? player.move.vel.x : Math.cos(player.move.heading), player.move.velSpeed > 20 ? player.move.vel.y : Math.sin(player.move.heading));
    }
  }

  // Step aside (level 1) or dash away (level 2), face the player and shout a line.
  react(n, level, vx, vy) {
    const r = this.cfg.react;
    const { player, events, t } = this.ctx;
    const dx = n.x - player.x;
    const dy = n.y - player.y;
    const side = sideStep(this.side, vx, vy, dx, dy);
    n.resume = n.state;
    n.state = level === 2 ? S.FLEE : S.REACT;
    n.t = level === 2 ? r.fleeSeconds : r.seconds;
    n.cool = r.cooldown;
    n.hop = 1;
    if (level === 2) {
      const l = Math.hypot(dx, dy) || 1;
      let fx = side.x + (dx / l) * 0.5;
      let fy = side.y + (dy / l) * 0.5;
      const fl = Math.hypot(fx, fy) || 1;
      fx /= fl; fy /= fl;
      n.rx = fx; n.ry = fy;
    } else { n.rx = side.x; n.ry = side.y; }
    n.face = player.x < n.x ? -1 : 1;
    if (this.onScreen(n.x, n.y, 0) && Math.hypot(dx, dy) < r.bubbleRadius) {
      this.bubbles.say(n, t(`npc.react.${1 + ((this.rand() * this.cfg.lines) | 0)}`), r.bubbleSeconds);
    }
    this.evt.x = n.x; this.evt.y = n.y; this.evt.state = n.state;
    events.emit('npc:react', this.evt);
  }

  onScreen(x, y, margin) {
    return outsideView(x, y, this.view) < margin;
  }

  // ---------------------------------------------------------------- per frame

  update(dt) {
    this.updateView();
    const { player } = this.ctx;
    const v = this.view;
    const r = this.cfg.react;
    const w = this.cfg.walk;
    const pvx = player.move.vel.x;
    const pvy = player.move.vel.y;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) { this.spawnIn = this.cfg.spawn.interval; this.fill(false); }
    let leashes = false;
    for (const n of this.list) {
      if (!n.active) continue;
      n.cool -= dt;
      const out = outsideView(n.x, n.y, v);
      if (out > this.cfg.despawnDistance) { this.despawn(n); continue; }
      if ((n.state === S.WALK || n.state === S.STAND) && n.cool <= 0 && !n.sitting) {
        const level = approach(pvx, pvy, n.x - player.x, n.y - player.y, r);
        if (level) this.react(n, level, pvx, pvy);
      }
      switch (n.state) {
        case S.WALK: this.walk(n, dt, w); break;
        case S.STAND: this.stand(n, dt); break;
        default: this.reacting(n, dt, r); break;
      }
      n.visible = out < CULL_PAD;
      if (n.visible) {
        if (!n.sprite.visible) n.sprite.setVisible(true);
        n.draw(dt, w.stepRate);
      } else if (n.sprite.visible) n.sprite.setVisible(false);
      if (n.bench) n.bench.sprite.setVisible(n.visible);
      if (n.dog) {
        n.dog.update(dt, n.visible);
        leashes = leashes || n.visible;
      }
    }
    this.updateBall(dt);
    this.drawLeashes(leashes);
    this.bubbles.update(dt);
    if (this.debug) this.drawDebug();
  }

  walk(n, dt, w) {
    const nx = this.nx[n.node];
    const ny = this.ny[n.node];
    const dx = nx - n.x;
    const dy = ny - n.y;
    const d = Math.hypot(dx, dy);
    if (d < w.arrive) { this.arrive(n, w); return; }
    // pushed against a prop or the player for a while: turn around (body.speed is last step's real speed)
    if (n.body.speed * 60 < n.speed * 0.25) n.stuck += dt; else n.stuck = 0;
    n.fx = dx / d;
    n.fy = dy / d;
    n.steer(n.fx, n.fy, n.speed, dt, w.accel);
    if (n.stuck > w.stuckSeconds) {
      const back = n.prev >= 0 ? n.prev : n.node;
      n.prev = n.node;
      n.node = back;
      n.stuck = 0;
    }
  }

  // At a node: choose the next link (never straight back unless it is a dead end), maybe stop to chat.
  arrive(n, w) {
    const links = this.links[n.node];
    let next = links[(this.rand() * links.length) | 0];
    if (links.length > 1 && next === n.prev) next = links[(this.rand() * links.length) | 0];
    if (links.length > 1 && next === n.prev) next = links[(links.indexOf(next) + 1) % links.length];
    n.prev = n.node;
    n.node = next;
    if (this.rand() < w.pauseChance) {
      n.state = S.STAND;
      n.t = w.pauseSeconds[0] + this.rand() * (w.pauseSeconds[1] - w.pauseSeconds[0]);
    }
  }

  stand(n, dt) {
    n.steer(0, 0, 0, dt, 8);
    if (n.role !== 'walk' && n.role !== 'dogwalk') return;
    if ((n.t -= dt) <= 0) n.state = S.WALK;
  }

  // REACT: a short step to the side, then face the player; FLEE: dash. Then back to what it was doing.
  reacting(n, dt, r) {
    const flee = n.state === S.FLEE;
    const moving = !n.sitting && (flee || n.t > r.seconds - r.stepSeconds);
    if (moving) n.steer(n.rx, n.ry, flee ? r.fleeSpeedPx : r.stepSpeed, dt, 12); else n.steer(0, 0, 0, dt, 10);
    if (!flee) n.face = this.ctx.player.x < n.x ? -1 : 1;
    if ((n.t -= dt) <= 0) {
      n.state = n.resume;
      n.t = n.state === S.STAND && (n.role === 'walk' || n.role === 'dogwalk') ? 0 : Infinity;
      n.stuck = 0;
    }
  }

  // The two kids pass the ball back and forth: rest, kick (hop), flight with an arc, land at the other kid's feet.
  updateBall(dt) {
    const b = this.ball;
    const { sprite } = b;
    if (!b.a) return;
    const k = b.kicker;
    const o = k === b.a ? b.b : b.a;
    if (k.state !== S.STAND || o.state !== S.STAND) return;
    const c = this.cfg.ball;
    b.t += dt;
    if (!b.flying) {
      const rx = k.x + k.face * 6;
      const ry = k.y + 1;
      if (b.t >= c.interval) {
        b.flying = true; b.t = 0;
        b.fx = rx; b.fy = ry;
        b.tx = o.x - k.face * 6; b.ty = o.y + 1;
        k.hop = 1;
        k.face = o.x < k.x ? -1 : 1;
      } else {
        sprite.setPosition(rx, ry).setDepth(ry);
      }
    }
    if (b.flying) {
      const u = Math.min(1, b.t / c.flight);
      const y = b.fy + (b.ty - b.fy) * u;
      sprite.setPosition(b.fx + (b.tx - b.fx) * u, y - Math.sin(u * Math.PI) * c.arc).setDepth(y);
      if (u >= 1) { b.flying = false; b.t = 0; b.kicker = o; o.face = k.x < o.x ? -1 : 1; }
    }
    sprite.setVisible(k.visible || o.visible);
  }

  drawLeashes(any) {
    const g = this.leash;
    g.clear();
    if (!any) return;
    g.lineStyle(1, 0x3b2412, 0.9);
    for (const n of this.list) {
      if (!n.active || !n.dog || !n.visible) continue;
      g.lineBetween(n.x + n.face * 5, n.y - 6, n.dog.x - n.face * 4, n.dog.y - 3);
    }
  }

  // ---------------------------------------------------------------- debug (?debug)

  debugText() {
    const c = { WALK: 0, STAND: 0, REACT: 0, FLEE: 0 };
    for (const n of this.list) if (n.active) c[n.state]++;
    return `crowd: walk ${c.WALK}  stand ${c.STAND}  react ${c.REACT}  flee ${c.FLEE}`;
  }

  makeDebug() {
    this.debug = this.scene.add.graphics().setDepth(9600);
    this.labels = this.list.map(() => this.scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '5px', resolution: this.ctx.res.scale * 2 }).setScale(1 / (this.ctx.res.scale * 2)).setDepth(9601).setVisible(false));
  }

  drawDebug() {
    const g = this.debug.clear();
    this.list.forEach((n, i) => {
      const label = this.labels[i];
      label.setVisible(n.active && n.visible);
      if (!n.active || !n.visible) return;
      label.setText(`${n.role} ${n.state}`).setPosition(n.x - 12, n.y - 24).setColor(STATE_COLORS[n.state]);
      if (n.state === S.WALK) g.lineStyle(1, 0x7dff8a, 0.5).lineBetween(n.x, n.y, this.nx[n.node], this.ny[n.node]);
    });
  }
}
