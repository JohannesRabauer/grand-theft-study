// The trick service (AD-23, CAP-13): ctx.tricks.forPlayer(i) (also player.tricks) is one skater's trick state and Style
// combo. It scores what the skateboard and the skates do (entities/Skateboards.js and Skates.js, events `trick:ollie`,
// `trick:manual`, and `trick:grab` of entities/GrabTargets.js: a bus ride scores by its length, a jump off it earns a bonus), reads the
// rails, benches, ramps and stairs of the map (the only reader of their grind data, AD-28) and drives the rider on them.
// The maths is vehicles/trickCore.js, the numbers data/tricks.json.
//
// States: roll, ollie, grind, manual, stairs-jump, ramp (`slot.state`). Rails and benches: an airborne rider in the last
// part of a hop that is over a rail, at a fitting angle, lands on it and slides along it (sparks) until the rail ends or
// a jump (ollie off, bonus); rolling down stairs without an ollie rattles and slows, an ollie there is a stairs jump
// worth points per step; a ramp (rolling onto it at speed) launches a longer, higher hop. Everything stays a fake
// height like the ollie: no Matter forces.
//
// Style: every trick adds points to the chain, tricks chain within a time window and grow the multiplier; the chain is
// banked when the window runs out, when the player gets off the board, or leaves the map. A bail (wall hit, being caught,
// a manual falling over while the multiplier is large) banks only part of it. Banking pays money (`wallet.earn`
// 'trick') and XP (`xp.add`) through state actions and emits `style:banked` { player, points, multiplier, tricks, bailed,
// reason, cents, xp, bonus, spot }: rolling slowly over a `bank-spot` object with a chain banks it cleanly with a bonus
// (reason 'bank-spot', data/tricks.json bankSpot). Other events: `style:changed` { player, points (chain value), multiplier }, `style:trick` { player, id,
// name (i18n key), points (0 for a rattle) }, `trick:grind` and `trick:ramp` { player, phase, ... }.
import { addTrick, benchPath, buildPath, bankedValue, canBankAt, captureRail, comboValue, createCombo, facing, hitWall, inRect, isActive, payout, pointAt, rampAirtime, resetCombo, tickCombo, trickPoints } from './trickCore.js';
import { drawTrickObjects, release } from './trickArt.js';

const GRIND_TYPES = new Set(['rail', 'bench']);

export class TrickSystem {
  // `rollers`: the services that carry trick riders (Skateboards and Skates instances).
  constructor(scene, ctx, cfg, rollers) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.rollers = rollers;
    this.slots = Array.from({ length: ctx.maxPlayers }, (_, index) => ({
      index, combo: createCombo(), state: 'roll', flight: '', steps: 0, rail: null, s: 0, dir: 1, speed: 0, travel: 0,
      skip: null, skipFor: 0, rattling: false, rattleIn: 0, dustIn: 0, sparkIn: 0, fireIn: 0
    }));
    this.rails = [];
    this.ramps = [];
    this.stairs = [];
    this.spots = [];
    this.art = [];
    this.time = 0;
    this.hit = { s: 0, dist: 0, x: 0, y: 0, ux: 1, uy: 0, dir: 1 }; // reused outputs: no allocation per frame
    this.pt = { x: 0, y: 0, ux: 1, uy: 0 };
    this.pos = { x: 0, y: 0 };
    const { events } = ctx;
    events.on('trick:ollie', e => (e.phase === 'start' ? this.onTakeOff(e) : this.onLanded(e)));
    events.on('trick:manual', e => { if (e.phase === 'end') this.onManualEnd(e); });
    events.on('trick:grab', e => { if (e.phase === 'end' && e.score) this.score(this.slots[e.player], 'grab', { seconds: e.time, bonus: e.reason === 'jump' ? cfg.grab.jumpBonus : 0 }); });
    events.on('player:vehicle', e => { if (!rollers.some(r => r.id === e.id)) this.clean(this.slots[e.player]); });
    events.on('player:caught', e => this.bail(this.slots[e.player], 'caught'));
    events.on('world:leave', () => { for (const slot of this.slots) this.clean(slot); });
    ctx.tricks = this;
    ctx.world.register(this);
    this.loadMap();
  }

  forPlayer(index) { return this.slots[index]; }

  // The roller service player `index` is riding (null on foot or a bike).
  rollerOf(index) { return this.rollers.find(r => r.isMounted(index)) ?? null; }

  // ---- map
  loadMap() {
    const { ctx, cfg } = this;
    const ts = ctx.map.tileSize;
    const objects = ctx.map.objects;
    for (const o of objects) {
      if (o.type === 'rail') this.rails.push({ id: o.id, path: buildPath(o.points, ts), half: (o.width * ts) / 2 + cfg.grind.capture });
      else if (o.type === 'bench') this.rails.push({ id: o.id, path: benchPath(o, ts, cfg.bench.inset), half: (cfg.bench.width * ts) / 2 + cfg.grind.capture });
      else if (o.type === 'ramp') this.ramps.push({ id: o.id, ...rect(o, ts), dir: o.dir, height: o.height, in: new Uint8Array(ctx.maxPlayers) });
      else if (o.type === 'stairs') this.stairs.push({ id: o.id, ...rect(o, ts), dir: o.dir, steps: o.steps });
      else if (o.type === 'bank-spot') this.spots.push({ id: o.id, x: (o.x + 0.5) * ts, y: (o.y + 0.5) * ts, r: o.r * ts });
    }
    this.art = drawTrickObjects(this.scene, ctx, objects.filter(o => GRIND_TYPES.has(o.type) || o.type === 'ramp' || o.type === 'stairs'), cfg.bench);
  }

  unloadMap() {
    this.rails.length = this.ramps.length = this.stairs.length = this.spots.length = 0;
    release(this.scene, this.art);
  }

  // ---- events
  // A hop starts: leaving a rail by jumping ends the grind (with the jump-off bonus); a hop that starts while rolling
  // down stairs is a stairs jump.
  onTakeOff(e) {
    const slot = this.slots[e.player];
    if (slot.rail) this.endGrind(slot, 'ollie');
    slot.flight = 'ollie';
    const m = this.ctx.players[e.player].move;
    if (e.speed < this.cfg.stairs.jumpSpeed) return;
    for (const st of this.stairs) {
      if (inRect(st, e.x, e.y) && facing(st.dir, m.heading, this.cfg.stairs.angle)) { slot.flight = 'stairs'; slot.steps = st.steps; return; }
    }
  }

  // A hop ends on the ground or (e.onto) on a rail: it scores as what it was.
  onLanded(e) {
    const slot = this.slots[e.player];
    const kind = slot.flight || 'ollie';
    slot.flight = '';
    if (kind === 'ramp') {
      this.ctx.events.emit('trick:ramp', { player: e.player, phase: 'end', x: e.x, y: e.y, airtime: e.airtime });
      this.score(slot, 'ramp', { air: e.airtime });
    } else if (kind === 'stairs') this.score(slot, 'stairs', { steps: slot.steps });
    else this.score(slot, 'ollie', { air: e.airtime });
  }

  onManualEnd(e) {
    const slot = this.slots[e.player];
    if (e.sweet >= this.cfg.tricks.manual.minSweet) this.score(slot, 'manual', { sweet: e.sweet });
    if ((e.reason === 'over' || e.reason === 'under') && slot.combo.mult >= this.cfg.bank.bailMinMult) this.bail(slot, 'manual');
  }

  // ---- combo
  score(slot, id, info) {
    const { cfg } = this;
    const { events } = this.ctx;
    const perk = this.ctx.players[slot.index].perks?.trickMultiplier ?? 1;
    const added = addTrick(slot.combo, cfg, id, trickPoints(cfg, id, info), perk);
    events.emit('style:trick', { player: slot.index, id, name: cfg.tricks[id].name, points: Math.round(added) });
    this.changed(slot);
  }

  changed(slot) {
    this.ctx.events.emit('style:changed', { player: slot.index, points: comboValue(slot.combo), multiplier: slot.combo.mult });
  }

  // Banks the chain: all of it, or `bailShare` of it after a bail; at a bank spot `bonus` more.
  bank(slot, bailed, reason, bonus = 0, spot = '') {
    const c = slot.combo;
    if (!isActive(c)) return;
    const { ctx, cfg } = this;
    const value = bankedValue(c, cfg, bailed, bonus);
    const mult = c.mult;
    const tricks = c.tricks.slice();
    resetCombo(c);
    const { cents, xp } = payout(cfg, value);
    if (cents > 0 || xp > 0) {
      if (cents > 0) ctx.state.dispatch('wallet.earn', { cents, reason: 'trick' });
      if (xp > 0) ctx.state.dispatch('xp.add', { player: slot.index, amount: xp });
      ctx.events.emit('style:banked', { player: slot.index, points: value, multiplier: mult, tricks, bailed, reason, cents, xp, bonus, spot });
    }
    this.changed(slot);
  }

  bail(slot, reason) {
    if (slot.rail) this.dropGrind(slot, this.ctx.players[slot.index]);
    this.bank(slot, true, reason);
  }

  // The rider stops being a skater (got off, map change): grind and flight forgotten, a chain banks in full.
  clean(slot) {
    if (slot.rail) this.dropGrind(slot, this.ctx.players[slot.index]);
    slot.flight = '';
    slot.rattling = false;
    slot.state = 'roll';
    this.bank(slot, false, 'off');
  }

  // ---- per frame (after Skateboards.update and Skates.update)
  update(dt) {
    const { players } = this.ctx;
    this.time += dt;
    for (let i = 0; i < players.length; i++) {
      const slot = this.slots[i];
      const roller = this.rollerOf(i);
      if (!roller || players[i].pinned) { slot.state = 'roll'; continue; }
      this.step(dt, players[i], slot, roller.riders[i].skate);
    }
  }

  step(dt, p, slot, s) {
    const { cfg } = this;
    const m = p.move;
    const c = slot.combo;
    slot.skipFor -= dt;
    if (slot.rail) this.grind(dt, p, slot, s);
    else {
      if (isActive(c) && hitWall(cfg, slot.speed, m.velSpeed)) this.bail(slot, 'wall');
      const grounded = s.air === 0 && !s.grind;
      this.checkRamps(p, slot, s, grounded);
      if (s.air > 0 && s.air < s.airTime * cfg.grind.descent) this.tryRail(p, slot, s);
      slot.rattling = grounded && this.rattle(dt, p, slot);
      if (grounded && !s.manual && !slot.rattling && isActive(c)) this.checkSpots(p, slot);
    }
    slot.speed = m.velSpeed;
    if (tickCombo(c, cfg, dt, s.air > 0 || s.grind || s.manual || slot.rattling || p.grabbing)) this.bank(slot, false, 'timeout');
    slot.state = slot.rail ? 'grind' : s.air > 0 ? (slot.flight === 'stairs' ? 'stairs-jump' : slot.flight === 'ramp' ? 'ramp' : 'ollie') : s.manual ? 'manual' : 'roll';
    if (isActive(c) && c.mult >= cfg.combo.fireMult) this.fire(dt, p, s, slot);
  }

  // ---- rails
  tryRail(p, slot, s) {
    const { cfg, hit } = this;
    const m = p.move;
    if (m.velSpeed < cfg.grind.minSpeed) return;
    for (const r of this.rails) {
      if (r === slot.skip && slot.skipFor > 0) continue; // just jumped off this one
      if (!captureRail(r.path, r.half, cfg.grind.angle, p.x, p.y, m.heading, hit)) continue;
      const { events } = this.ctx;
      this.rollerOf(p.index).beginGrind(p);
      slot.rail = r;
      slot.s = hit.s;
      slot.dir = hit.dir;
      slot.speed = Math.max(cfg.grind.minSpeed, Math.min(cfg.grind.maxSpeed, m.velSpeed));
      slot.travel = 0;
      slot.sparkIn = 0;
      events.emit('trick:ollie', { player: p.index, phase: 'end', x: p.x, y: p.y, speed: m.velSpeed, airtime: s.airTime, onto: 'rail' }); // the hop ends on the rail
      events.emit('trick:grind', { player: p.index, phase: 'start', rail: r.id, x: p.x, y: p.y });
      return;
    }
  }

  // The rider slides along the rail at a fixed speed; the end of the rail rolls it off.
  grind(dt, p, slot, s) {
    const { cfg, pt, pos } = this;
    const path = slot.rail.path;
    slot.s += slot.dir * slot.speed * dt;
    slot.travel += slot.speed * dt;
    const end = slot.s <= 0 || slot.s >= path.total;
    pointAt(path, slot.s, pt);
    const ux = pt.ux * slot.dir;
    const uy = pt.uy * slot.dir;
    const m = p.move;
    pos.x = pt.x;
    pos.y = pt.y;
    this.scene.matter.body.setPosition(p.body, pos);
    m.heading = Math.atan2(uy, ux);
    m.speed = m.velSpeed = slot.speed;
    m.vel.x = ux * slot.speed;
    m.vel.y = uy * slot.speed;
    m.matterVel.x = m.vel.x / 60;
    m.matterVel.y = m.vel.y / 60;
    this.scene.matter.body.setVelocity(p.body, m.matterVel);
    p.sprite.setPosition(pt.x, pt.y - s.height);
    slot.sparkIn -= dt;
    if (slot.sparkIn <= 0) {
      slot.sparkIn = cfg.grind.sparkInterval;
      this.ctx.particles.emit('spark', pt.x - ux * 5, pt.y - uy * 5, { count: cfg.grind.sparkCount });
    }
    if (end) this.endGrind(slot, 'end');
  }

  // The grind is over and scores: `reason` 'end' rolls off the rail, 'ollie' is the jump off it (stepSkate already started it).
  endGrind(slot, reason) {
    const p = this.ctx.players[slot.index];
    const { cfg } = this;
    const id = slot.rail.id;
    if (reason === 'ollie') { slot.skip = slot.rail; slot.skipFor = cfg.grind.offCool; }
    slot.rail = null;
    if (reason === 'end') this.rollerOf(slot.index).finishGrind(p);
    const meters = (slot.travel / this.ctx.map.tileSize) * this.ctx.map.metersPerTile;
    this.score(slot, 'grind', { meters, bonus: reason === 'ollie' ? cfg.grind.offBonus : 0 });
    this.ctx.events.emit('trick:grind', { player: slot.index, phase: 'end', rail: id, reason, meters, x: p.x, y: p.y });
  }

  // A grind cut short (bail, got off, map change): no score.
  dropGrind(slot, p) {
    slot.rail = null;
    this.rollerOf(slot.index)?.finishGrind(p);
  }

  // ---- bank spots: rolling through one slowly banks the chain cleanly, with a bonus
  checkSpots(p, slot) {
    const k = this.cfg.bankSpot;
    for (const sp of this.spots) {
      if (canBankAt(this.cfg, sp, p.x, p.y, p.move.velSpeed, slot.combo)) { this.bank(slot, false, 'bank-spot', k.bonus, sp.id); return; }
    }
  }

  // ---- ramps and stairs
  checkRamps(p, slot, s, grounded) {
    const k = this.cfg.ramp;
    const m = p.move;
    for (const r of this.ramps) {
      const inside = inRect(r, p.x, p.y);
      const entered = inside && !r.in[slot.index];
      r.in[slot.index] = inside ? 1 : 0;
      if (!entered || !grounded || s.manual || m.velSpeed < k.minSpeed || !facing(r.dir, m.heading, k.angle)) continue;
      const air = rampAirtime(this.cfg, r.height, m.velSpeed);
      this.rollerOf(p.index).launch(p, air, r.height * k.liftScale);
      slot.flight = 'ramp';
      this.ctx.events.emit('trick:ramp', { player: p.index, phase: 'start', x: p.x, y: p.y, airtime: air, height: r.height });
    }
  }

  // Rolling down stairs without an ollie: a comic rattle that slows the board. True while on the stairs.
  rattle(dt, p, slot) {
    const k = this.cfg.stairs;
    const m = p.move;
    let on = false;
    if (m.velSpeed >= k.rattleMinSpeed) for (const st of this.stairs) if (inRect(st, p.x, p.y) && facing(st.dir, m.heading, k.angle)) { on = true; break; }
    if (!on) { slot.rattleIn = 0; return false; }
    m.boostMult *= k.rattleMult;
    m.speed = Math.max(Math.min(m.speed, k.rattleFloor), m.speed - k.rattleDecel * dt);
    p.sprite.y += Math.sin(this.time * 95) * k.rattleJitter;
    slot.dustIn -= dt;
    if (slot.dustIn <= 0) {
      slot.dustIn = k.rattleDust;
      this.ctx.particles.surfaceBurst(m.surface, p.x, p.y, 2);
    }
    slot.rattleIn -= dt;
    if (slot.rattleIn <= 0) {
      slot.rattleIn = k.rattleToast;
      this.ctx.events.emit('style:trick', { player: p.index, id: 'rattle', name: 'trick.rattle', points: 0 });
    }
    return true;
  }

  // ---- fire trail
  fire(dt, p, s, slot) {
    const f = this.cfg.fire;
    slot.fireIn -= dt;
    if (slot.fireIn > 0) return;
    slot.fireIn = f.interval;
    const h = p.move.heading;
    this.ctx.particles.emit('fire', p.x - Math.cos(h) * f.back, p.y - Math.sin(h) * f.back - s.height, { count: f.count });
  }
}

const rect = (o, ts) => ({ x0: o.x * ts, y0: o.y * ts, x1: (o.x + o.w) * ts, y1: (o.y + o.h) * ts });
