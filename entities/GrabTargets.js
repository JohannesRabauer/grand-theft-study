// Grab targets (story 5.3, AD-23, CAP-14): slow road vehicles that follow a looping route (data/routes.json) and can be
// hung on to from behind. Kind 'bus' now; trams and the traffic of epic 12 reuse this class with more kinds in data/grab.json.
// Each vehicle is a pooled kinematic body (a SENSOR body from the bodies factory: it never pushes or harms anything, a comic
// hit by a moving bus is entities/Traffic.js, a geometric query that leaves the rear grab zone safe) with a sprite, and exposes `x, y, heading, vx, vy, speed` (px, rad, px/s).
// A yellow handle sticks out of its rear; inside the rear zone (vehicles/grabLogic.js `inRearZone`) a rider on a profile with
// `grab: true` (the skates) who holds the interact button hangs on: the rider is towed at the vehicle's speed on a rope,
// steering sideways swings it, and the risk meter over its head shows how likely the grip is to give. The numbers are
// data/grab.json; the failure model, duration and release rules are the Phaser-free vehicles/grabLogic.js.
//
// Ends (`grab:end` { player, target, reason, time, risk, x, y }, `grab:start` { player, target, kind, x, y } at the start):
// 'jump' (ollie off: Style bonus), 'release', 'tired' (out of time), 'lost' (the rope snagged), 'fail' (the grip gave:
// a comic tumble with a short slowdown, no harm), 'vehicle' (not on skates any more), 'caught', 'map'. `trick:grab`
// { player, phase: 'start' | 'end', reason, time, score } feeds vehicles/TrickSystem.js (score: the ride counts as a trick).
// Driving (story 17.x): a vehicle never jumps or stops dead. It eases its speed (`yield.accel`, `yield.brake`) towards what is safe:
// the cruise speed, slower for bends (the speed profile of its route), behind a leader of its lane (the vehicle ahead on the same
// `lane` of data/routes.json, safe distance) and before anything in its way (players, pedestrians, props, vehicles of other lanes:
// it can always stop in time at the comfortable deceleration `yield.comfort`). Vehicles are placed on the road out of sight
// (`yield.hideDistance` px from every player), come back where the road has taken them after a map change and are only moved
// further along when they have been stuck for `yield.recoverAfter` s far from all players, so nobody ever sees one pop in or out.
// A prop that stands in the lane (a cone, a crate) is shoved aside by the waiting vehicle after `yield.shoveAfter` s, sliding off the road in
// `yield.shoveSeconds` s with a puff of dust (props only: people and animals are never touched).
//
// Within `armRange` of a vehicle the interact press never gets a skater off the skates (see `claims`), so the button can
// be held early; a toast explains it once per game. Co-op: every player has its own grab state.
import { addSensor } from '../physics/bodies.js';
import { createGrab, inRearZone, mayStart, startGrab, stepGrab } from '../vehicles/grabLogic.js';
import { buildRoute, buildSpeedProfile, easeHeading, profileAt, routeAt } from '../vehicles/routeLogic.js';
import { approachSpeed, arcAhead, followSpeed, gapAhead, stopSpeed, trafficFootprintFree } from '../vehicles/trafficLogic.js';

const DEG = Math.PI / 180;
const CULL = 160; // px around the view where a vehicle's sprite is drawn (the zoomed-out view and its easing included)
const ROPE = 0xe8d9a8;

export class GrabTargets {
  constructor(scene, ctx, routes, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.routes = routes.routes;
    this.pool = [];
    this.random = Math.random; // swappable for seeded runs
    this.slots = Array.from({ length: ctx.maxPlayers }, () => ({ g: createGrab(), target: null, near: false, stumble: 0, sparkIn: 0, perk: 0 }));
    this.pt = { x: 0, y: 0, tx: 1, ty: 0 }; // reused outputs: no allocation per frame
    this.pos = { x: 0, y: 0 };
    this.quad = new Float64Array(8);
    this.hinted = false;
    this.clock = 0; // seconds of traffic time: vehicles of a map left behind keep driving on in it
    this.memo = new Map(); // vehicle id -> { s, at }: where it was when its map was left
    this.profiles = new Map(); // route def id -> speed profile
    this.gfx = scene.add.graphics().setDepth(8700); // ropes, risk bars and the zone hint
    this.drawn = false;
    const { events } = ctx;
    events.on('player:vehicle', e => { if (!ctx.players[e.player].profiles[e.id].grab) this.end(ctx.players[e.player], this.slots[e.player], 'vehicle'); });
    events.on('player:caught', e => this.end(ctx.players[e.player], this.slots[e.player], 'caught'));
    events.on('world:leave', () => { for (const p of ctx.players) this.end(p, this.slots[p.index], 'map'); });
    ctx.grabs = this;
    ctx.pools.register('grab-targets', { live: () => this.pool.filter(t => t.active).length, cap: cfg.maxTargets });
    ctx.world.register(this);
    this.loadMap();
  }

  loadMap() {
    const ts = this.ctx.map.tileSize;
    for (const r of this.routes) {
      if (r.map !== this.ctx.world.id) continue;
      const route = buildRoute(r.points, ts);
      for (let k = 0; k < r.count; k++) {
        const id = `${r.id}-${k}`;
        const m = this.memo.get(id);
        const s0 = m ? m.s + r.speed * 0.8 * (this.clock - m.at) : route.total * (k / r.count + (r.phase ?? 0));
        this.spawn(r, route, this.spot(r, route, s0), id, k);
      }
    }
  }

  unloadMap() {
    for (const t of this.pool) if (t.active) { this.memo.set(t.id, { s: t.s, at: this.clock }); this.release(t); }
  }

  // Is the road point at arc length `s` out of everybody's sight and clear of the lane mates? >= 0: yes (the distance to the
  // nearest player); negative: no.
  spotScore(def, route, s) {
    const y = this.cfg.yield;
    routeAt(route, s, this.pt);
    let far = Infinity;
    for (const p of this.ctx.players) far = Math.min(far, Math.hypot(p.x - this.pt.x, p.y - this.pt.y));
    if (far < y.hideDistance) return -far - 1;
    const lane = def.lane ?? def.id;
    const kind = this.cfg.targets[def.kind];
    for (const o of this.pool) {
      if (!o.active || o.lane !== lane) continue;
      const d = arcAhead(s, o.s, route.total);
      if (Math.min(d, route.total - d) < (kind.length + o.kcfg.length) / 2 + y.spawnGap) return -1e6;
    }
    const heading = Math.atan2(this.pt.ty, this.pt.tx);
    const solid = (x, z) => this.ctx.surfaces.solid(this.ctx.surfaces.at(x, z));
    return trafficFootprintFree(this.pt.x, this.pt.y, heading, kind.length, kind.width, solid) ? far : -1e6;
  }

  // Where along the road a vehicle can appear without being seen: the wanted spot, else the next one further on that is free.
  spot(def, route, wanted) {
    const step = 24;
    let best = wanted, bestScore = -Infinity;
    for (let i = 0; i * step < route.total; i++) {
      const s = wanted + i * step;
      const score = this.spotScore(def, route, s);
      if (score >= 0) return s;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  spawn(def, route, s, id, index) {
    const kind = this.cfg.targets[def.kind];
    let t = this.pool.find(p => !p.active && p.kind === def.kind);
    if (!t) {
      if (this.pool.length >= this.cfg.maxTargets) return;
      const sprite = this.scene.add.image(0, 0, kind.texture).setOrigin(kind.origin[0], kind.origin[1]).setScale(this.ctx.res.inv);
      t = { kind: def.kind, kcfg: kind, sprite, body: addSensor(this.scene, 0, 0, kind.length, kind.width), active: false, hint: false };
      this.pool.push(t);
    } else this.scene.matter.world.add(t.body); // a released body is out of the physics world
    let profile = this.profiles.get(def.id);
    if (!profile) {
      const y = this.cfg.yield;
      profile = buildSpeedProfile(route, y.profileStep, y.curve, y.comfort, def.speed);
      this.profiles.set(def.id, profile);
    }
    Object.assign(t, { active: true, id, route, profile, lane: def.lane ?? def.id, speed: def.speed, cruise: def.speed, blocked: 0, retry: 0, recoveries: 0, braking: false, propAhead: null, propWait: 0, shove: null, s, x: 0, y: 0, heading: 0, vx: 0, vy: 0 });
    routeAt(route, s, this.pt);
    t.heading = Math.atan2(this.pt.ty, this.pt.tx);
    t.speed = Math.min(def.speed, profileAt(profile, route, s));
    t.sprite.setTexture(this.livery(def, index, kind));
    this.place(t);
    t.sprite.setVisible(true);
  }

  // The texture of a vehicle: cars and vans come in the colours of data/grab.json `colors` (`<texture>-<n>`); the colour follows
  // the vehicle's index on its route (the routes start at different offsets of the palette), so neighbours differ.
  livery(def, index, kind) {
    const list = kind.colors;
    if (!list?.length) return kind.texture;
    let seed = 0;
    for (const c of def.id) seed += c.charCodeAt(0);
    const key = `${kind.texture}-${(seed + index * 3) % list.length}`;
    return this.scene.textures.exists(key) ? key : kind.texture;
  }

  release(t) {
    t.shove = null;
    t.active = false;
    t.sprite.setVisible(false);
    this.scene.matter.world.remove(t.body);
  }

  place(t) {
    t.x = this.pt.x;
    t.y = this.pt.y;
    t.vx = Math.cos(t.heading) * t.speed;
    t.vy = Math.sin(t.heading) * t.speed;
    this.pos.x = t.x;
    this.pos.y = t.y;
    const { matter } = this.scene;
    matter.body.setPosition(t.body, this.pos);
    matter.body.setAngle(t.body, t.heading);
  }

  // Is player `index` busy with a bus (hanging on, or close enough that an interact press is meant as a grab)?
  claims(index) {
    const slot = this.slots[index];
    return slot.target !== null || slot.near;
  }

  update(dt) {
    const { ctx } = this;
    this.clock += dt;
    const y = this.cfg.yield;
    const cam = this.scene.cameras.main;
    const hw = cam.width / cam.zoom / 2 + CULL; // from scroll and zoom: always current, unlike worldView
    const hh = cam.height / cam.zoom / 2 + CULL;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    for (const t of this.pool) {
      if (!t.active) continue;
      const wish = this.wish(t);
      t.braking = wish < t.speed - 3;
      t.speed = approachSpeed(t.speed, wish, y.accel, y.brake, dt);
      if (t.speed < 1) t.speed = 0;
      t.blocked = t.speed === 0 && wish < 1 ? t.blocked + dt : 0;
      if (t.blocked >= y.recoverAfter) this.recover(t, dt);
      if (t.propAhead && t.speed < 5) { if ((t.propWait += dt) >= y.shoveAfter && !t.shove) this.startShove(t, t.propAhead); } else if (!t.propAhead && !t.shove) t.propWait = 0;
      if (t.shove) this.stepShove(t, dt);
      t.s += t.speed * dt;
      routeAt(t.route, t.s, this.pt);
      t.heading = easeHeading(t.heading, Math.atan2(this.pt.ty, this.pt.tx), t.kcfg.turnRate * DEG * dt);
      this.place(t);
      const visible = t.x > cx - hw && t.x < cx + hw && t.y > cy - hh && t.y < cy + hh;
      t.sprite.setVisible(visible);
      if (!visible) continue;
      const west = Math.cos(t.heading) < 0;
      t.sprite.setPosition(t.x, t.y).setDepth(t.y).setFlipX(west).setRotation(west ? t.heading + (t.heading > 0 ? -Math.PI : Math.PI) : t.heading);
    }

    for (const player of ctx.players) {
      const slot = this.slots[player.index];
      if (player.pinned) continue;
      const i = ctx.input.intents[player.index];
      if (slot.target) this.tow(dt, player, slot, i);
      else if (player.move.profile.grab) this.seek(player, slot, i);
      else slot.near = false;
      if (slot.stumble > 0) this.stumble(dt, player, slot);
    }
    this.draw();
  }

  // The speed this vehicle wants right now (px/s): cruise, bends, the leader of its lane, whatever stands in its way.
  wish(t) {
    if (window.SCHULWEG_TESTMAPS && t.testNoYield) return t.cruise;
    const { ctx } = this;
    const y = this.cfg.yield;
    const L = t.kcfg.length, W = t.kcfg.width;
    let v = Math.min(t.cruise, profileAt(t.profile, t.route, t.s + L / 2));
    for (const o of this.pool) {
      if (o === t || !o.active) continue;
      if (o.lane === t.lane) { // the leader of the lane: the vehicle ahead along the road
        const gap = arcAhead(t.s, o.s, t.route.total) - (L + o.kcfg.length) / 2;
        if (gap < y.look + t.speed) v = Math.min(v, followSpeed(gap, o.speed, y.minGap, y.comfort));
      } else v = Math.min(v, this.obstacle(t, o.x, o.y, o.kcfg.width / 2 + 2, L, W));
    }
    for (const p of ctx.players) if (!p.grabbing) v = Math.min(v, this.obstacle(t, p.x, p.y, 5, L, W));
    for (const n of ctx.crowd?.list ?? []) if (n.active) v = Math.min(v, this.obstacle(t, n.x, n.y, 5, L, W));
    let vp = Infinity;
    t.propAhead = null;
    for (const p of ctx.props?.props ?? []) {
      if (!p.alive || p === t.shove?.p) continue;
      const w = this.obstacle(t, p.body.position.x, p.body.position.y, 7, L, W);
      if (w < vp) { vp = w; t.propAhead = p; }
    }
    if (vp >= v) t.propAhead = null; // something else holds it back more
    return Math.min(v, vp);
  }

  // The speed that still lets this vehicle stop before a circle (x, y, r) in its way; Infinity when nothing is in the way.
  obstacle(t, x, y, r, L, W) {
    const cfg = this.cfg.yield;
    const gap = gapAhead(t.x, t.y, t.heading, L, W, x, y, r, cfg.band, cfg.look + t.speed * cfg.reaction);
    return gap === Infinity ? Infinity : stopSpeed(gap - cfg.stopGap, cfg.comfort);
  }

  // The vehicle has waited long enough behind a prop in its lane: the prop is shoved sideways to the kerb on the vehicle's right (the
  // other side only when that is blocked), clear of the hull.
  startShove(t, prop) {
    const y = this.cfg.yield;
    const px = prop.body.position.x, py = prop.body.position.y;
    const c = Math.cos(t.heading), s = Math.sin(t.heading);
    const lat = -(px - t.x) * s + (py - t.y) * c;
    const need = t.kcfg.width / 2 + 7 + y.band + 8; // lateral distance from the lane's centre line where it is clear of the hull
    const solid = (x, z) => this.ctx.surfaces.solid(this.ctx.surfaces.at(x, z));
    for (const side of [1, -1]) { // +lat is the vehicle's right (the kerb side in right-hand traffic): never across the road into the other lane
      const move = need - side * lat;
      const tx = px - s * side * move, ty = py + c * side * move;
      if (move <= 0 || solid(tx, ty) || solid(px - s * side * move * 0.5, py + c * side * move * 0.5)) continue;
      t.shove = { p: prop, x0: px, y0: py, x1: tx, y1: ty, u: 0 };
      this.ctx.particles.emit('dust', px, py, { count: 4 });
      return;
    }
    t.propWait = -y.recoverAfter; // nowhere to put it: wait, the recovery will deal with it
  }

  stepShove(t, dt) {
    const sh = t.shove;
    if (!sh.p.alive) { t.shove = null; return; }
    sh.u = Math.min(1, sh.u + dt / this.cfg.yield.shoveSeconds);
    const e = sh.u * sh.u * (3 - 2 * sh.u);
    this.pos.x = sh.x0 + (sh.x1 - sh.x0) * e;
    this.pos.y = sh.y0 + (sh.y1 - sh.y0) * e;
    const { matter } = this.scene;
    matter.body.setPosition(sh.p.body, this.pos);
    matter.body.setVelocity(sh.p.body, { x: 0, y: 0 });
    this.ctx.props.sync(sh.p);
    if (sh.u >= 1) { t.shove = null; t.propWait = 0; }
  }

  // A vehicle that has been stuck for a long time (a prop in the lane) is moved on, but only where nobody can see it go or arrive.
  recover(t, dt) {
    if ((t.retry -= dt) > 0 || this.slots.some(s => s.target === t)) return;
    const y = this.cfg.yield;
    t.retry = y.retryEvery;
    const away = (x, z) => this.ctx.players.every(p => Math.hypot(p.x - x, p.y - z) >= y.hideDistance);
    if (!away(t.x, t.y)) return;
    const solid = (x, z) => this.ctx.surfaces.solid(this.ctx.surfaces.at(x, z));
    for (let k = 1; k <= y.recoveryProbes; k++) {
      const s = t.s + k * t.route.total / y.recoveryProbes;
      routeAt(t.route, s, this.pt);
      const heading = Math.atan2(this.pt.ty, this.pt.tx);
      if (!trafficFootprintFree(this.pt.x, this.pt.y, heading, t.kcfg.length, t.kcfg.width, solid)
        || !away(this.pt.x, this.pt.y)
        || this.pool.some(o => o !== t && o.active && Math.hypot(o.x - this.pt.x, o.y - this.pt.y) < 90)
        || this.ctx.props?.props.some(p => p.alive && Math.hypot(p.body.position.x - this.pt.x, p.body.position.y - this.pt.y) < 48)) continue;
      t.s = s;
      t.heading = heading;
      t.blocked = 0;
      t.speed = 0;
      t.recoveries++;
      this.place(t);
      return;
    }
  }

  // Looks for a vehicle to hang on to: near ones light up their zone and keep the interact press for the grab.
  seek(player, slot, i) {
    let zoneOf = null;
    slot.near = false;
    for (const t of this.pool) {
      if (!t.active || !t.kcfg.zone || Math.hypot(t.x - player.x, t.y - player.y) > this.cfg.armRange) continue;
      slot.near = t.hint = true;
      if (inRearZone(t.x, t.y, t.heading, t.kcfg.length, t.kcfg.zone, player.x, player.y)) zoneOf = t;
    }
    if (slot.near && !this.hinted) {
      this.hinted = true;
      this.ctx.events.emit('ui:toast', { key: 'grab.hint' });
    }
    if (mayStart(slot.g, i.hold) && zoneOf && slot.stumble <= 0) this.begin(player, slot, zoneOf, i);
  }

  begin(player, slot, t, i) {
    startGrab(slot.g, i.jump);
    slot.target = t;
    slot.sparkIn = 0;
    slot.perk = player.perks.busGrabBonus ?? 0;
    player.grabbing = true;
    const { events } = this.ctx;
    events.emit('grab:start', { player: player.index, target: t.id, kind: t.kind, x: player.x, y: player.y });
    events.emit('trick:grab', { player: player.index, phase: 'start', reason: '', time: 0, score: false });
  }

  // One frame of being towed: the rider's velocity is the vehicle's plus a pull toward the rope's end and the sideways swing.
  tow(dt, player, slot, i) {
    const { cfg, ctx } = this;
    const t = slot.target;
    const m = player.move;
    const c = Math.cos(t.heading);
    const s = Math.sin(t.heading);
    const half = t.kcfg.length / 2;
    const rx = player.x - (t.x - c * half);
    const ry = player.y - (t.y - s * half);
    const along = rx * c + ry * s;
    const lat = -rx * s + ry * c;
    const steer = -i.move.x * s + i.move.y * c;
    let latVel = steer * cfg.swingSpeed - lat * cfg.swingBack * (1 - Math.min(1, Math.abs(steer)));
    if ((lat >= cfg.swingMax && latVel > 0) || (lat <= -cfg.swingMax && latVel < 0)) latVel = 0;
    const err = -cfg.ropeLength - along;
    const pull = Math.max(-cfg.maxPull, Math.min(cfg.maxPull, err * cfg.pullGain));
    const vx = c * (t.speed + pull) - s * latVel;
    const vy = s * (t.speed + pull) + c * latVel;
    const speed = Math.hypot(vx, vy);
    m.speed = m.velSpeed = speed;
    m.heading = Math.atan2(vy, vx);
    m.vel.x = vx;
    m.vel.y = vy;
    m.matterVel.x = vx / 60;
    m.matterVel.y = vy / 60;
    this.scene.matter.body.setVelocity(player.body, m.matterVel);
    player.faceHeading();

    const reason = stepGrab(slot.g, cfg, dt, {
      hold: i.hold, jump: i.jump, speed, bump: ctx.surfaces.props(m.surface).rattle, swing: Math.min(1, Math.abs(lat) / cfg.swingMax),
      slack: Math.hypot(err, Math.max(0, Math.abs(lat) - cfg.swingMax)), perk: slot.perk, rand: this.random()
    });
    if (reason) {
      this.end(player, slot, reason);
      return;
    }
    slot.sparkIn -= dt;
    if (slot.sparkIn <= 0) {
      slot.sparkIn = cfg.sparkInterval / ctx.quality.tier.particleMul;
      ctx.particles.emit('spark', player.x - c * 6, player.y - s * 6, { count: 1 });
    }
  }

  end(player, slot, reason) {
    const t = slot.target;
    if (!t) return;
    const { events } = this.ctx;
    slot.target = null;
    slot.g.active = false;
    player.grabbing = false;
    const g = slot.g;
    events.emit('grab:end', { player: player.index, target: t.id, reason, time: g.time, risk: g.risk, x: player.x, y: player.y });
    events.emit('trick:grab', { player: player.index, phase: 'end', reason, time: g.time, score: reason === 'jump' || reason === 'release' || reason === 'tired' });
    if (reason === 'fail') this.startStumble(player, slot);
    if (reason === 'fail' || reason === 'tired' || reason === 'lost') events.emit('ui:toast', { key: `grab.${reason}` });
  }

  // The grip gave: a short tumble and slowdown, nothing worse.
  startStumble(player, slot) {
    slot.stumble = this.cfg.stumble.time;
    player.stumbling = true;
    this.ctx.particles.emit('dust', player.x, player.y, { count: 8 });
  }

  stumble(dt, player, slot) {
    const k = this.cfg.stumble;
    slot.stumble -= dt;
    const m = player.move;
    m.speed = Math.min(m.speed, m.profile.maxSpeed * k.speedMult);
    const progress = 1 - Math.max(0, slot.stumble) / k.time;
    player.sprite.rotation += progress * k.spins * 2 * Math.PI;
    if (slot.stumble <= 0) player.stumbling = false;
  }

  // Ropes and risk bars of the riders hanging on, and the yellow zone behind vehicles a skater is close to.
  draw() {
    const { gfx } = this;
    let any = false;
    for (const t of this.pool) if (t.active && t.hint) any = true;
    for (const sl of this.slots) if (sl.target) any = true;
    if (!any) {
      if (this.drawn) gfx.clear();
      this.drawn = false;
      return;
    }
    gfx.clear();
    this.drawn = true;
    for (const player of this.ctx.players) if (this.slots[player.index].target) this.drawRope(player, this.slots[player.index]);
    for (const t of this.pool) {
      if (!t.hint) continue;
      t.hint = false;
      this.drawZone(t, t.kcfg.zone);
    }
  }

  drawRope(player, slot) {
    const { gfx, cfg } = this;
    const t = slot.target;
    const c = Math.cos(t.heading);
    const s = Math.sin(t.heading);
    const hx = t.x - c * (t.kcfg.length / 2 + 4);
    const hy = t.y - s * (t.kcfg.length / 2 + 4);
    const px = player.x + Math.cos(player.move.heading) * 4;
    const py = player.sprite.y + Math.sin(player.move.heading) * 4;
    const sag = 2 + Math.abs(Math.hypot(px - hx, py - hy) - cfg.ropeLength) * 0.1;
    gfx.lineStyle(2, ROPE, 1).beginPath().moveTo(hx, hy).lineTo((hx + px) / 2 - s * sag, (hy + py) / 2 + c * sag).lineTo(px, py).strokePath();
    const b = cfg.bar;
    const x = player.x - b.width / 2;
    const y = player.y - b.lift;
    const risk = slot.g.risk;
    gfx.fillStyle(0x16161e, 0.8).fillRect(x - 1, y - 1, b.width + 2, b.height + 2);
    gfx.fillStyle(risk > 0.6 ? 0xe0483c : risk > 0.3 ? 0xf2c14e : 0x6fd06f, 1).fillRect(x, y, Math.max(1, b.width * risk), b.height);
  }

  drawZone(t, zone) {
    const c = Math.cos(t.heading);
    const s = Math.sin(t.heading);
    const rear = -t.kcfg.length / 2;
    const w = zone.width / 2;
    const q = this.quad;
    for (let k = 0; k < 4; k++) {
      const a = k === 0 || k === 3 ? rear - zone.length : rear + zone.reach;
      const l = k < 2 ? -w : w;
      q[k * 2] = t.x + a * c - l * s;
      q[k * 2 + 1] = t.y + a * s + l * c;
    }
    const { gfx } = this;
    gfx.fillStyle(0xffd23f, 0.16).beginPath().moveTo(q[0], q[1]).lineTo(q[2], q[3]).lineTo(q[4], q[5]).lineTo(q[6], q[7]).closePath().fillPath();
    gfx.lineStyle(1, 0xffd23f, 0.7).beginPath().moveTo(q[0], q[1]).lineTo(q[2], q[3]).lineTo(q[4], q[5]).lineTo(q[6], q[7]).closePath().strokePath();
  }
}
