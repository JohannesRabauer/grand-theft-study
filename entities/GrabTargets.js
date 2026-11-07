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
// Within `armRange` of a vehicle the interact press never gets a skater off the skates (see `claims`), so the button can
// be held early; a toast explains it once per game. Co-op: every player has its own grab state.
import { addSensor } from '../physics/bodies.js';
import { createGrab, inRearZone, mayStart, startGrab, stepGrab } from '../vehicles/grabLogic.js';
import { buildRoute, easeHeading, routeAt } from '../vehicles/routeLogic.js';

const DEG = Math.PI / 180;
const CULL = 96; // px around the view where a vehicle's sprite is drawn
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
      for (let k = 0; k < r.count; k++) this.spawn(r, route, (route.total * k) / r.count, `${r.id}-${k}`);
    }
  }

  unloadMap() {
    for (const t of this.pool) if (t.active) this.release(t);
  }

  spawn(def, route, s, id) {
    const kind = this.cfg.targets[def.kind];
    let t = this.pool.find(p => !p.active && p.kind === def.kind);
    if (!t) {
      if (this.pool.length >= this.cfg.maxTargets) return;
      const sprite = this.scene.add.image(0, 0, kind.texture).setOrigin(kind.origin[0], kind.origin[1]).setScale(this.ctx.res.inv);
      t = { kind: def.kind, kcfg: kind, sprite, body: addSensor(this.scene, 0, 0, kind.length, kind.width), active: false, hint: false };
      this.pool.push(t);
    } else this.scene.matter.world.add(t.body); // a released body is out of the physics world
    Object.assign(t, { active: true, id, route, speed: def.speed, s, x: 0, y: 0, heading: 0, vx: 0, vy: 0 });
    routeAt(route, s, this.pt);
    t.heading = Math.atan2(this.pt.ty, this.pt.tx);
    this.place(t);
    t.sprite.setVisible(true);
  }

  release(t) {
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
    const view = this.scene.cameras.main.worldView;
    for (const t of this.pool) {
      if (!t.active) continue;
      t.s += t.speed * dt;
      routeAt(t.route, t.s, this.pt);
      t.heading = easeHeading(t.heading, Math.atan2(this.pt.ty, this.pt.tx), t.kcfg.turnRate * DEG * dt);
      this.place(t);
      const visible = t.x > view.x - CULL && t.x < view.right + CULL && t.y > view.y - CULL && t.y < view.bottom + CULL;
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

  // Looks for a vehicle to hang on to: near ones light up their zone and keep the interact press for the grab.
  seek(player, slot, i) {
    let zoneOf = null;
    slot.near = false;
    for (const t of this.pool) {
      if (!t.active || Math.hypot(t.x - player.x, t.y - player.y) > this.cfg.armRange) continue;
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
