// A bully borrows a bike that was left unlocked (story 5.5, CAP-16, AD-25). Rules and numbers: vehicles/theftLogic.js and
// data/theft.json. Every `checkInterval` an unlocked bike (entities/Parking.js) that every player has stayed away from long
// enough, out of view, with a motive (Aerger, a bully about, a bully spawn close) may be borrowed: a thief appears at the nearest
// off-view bully spawn, walks to the bike (a player coming close scares it off) and rides it along an A* path to the nearest
// `bike-hideout`. The thief is a plain sprite, no body and no Aerger of its own. Rescue: any player who walks up to the bike
// at the hideout and presses interact mounts it (Bikes), which returns it. Until the epic 9 quest runner exists the theft is
// the saved flag `shared.flags.stolenBike` = { hideout, x, y, bikeId, map }, which the objective arrow follows (ui/ObjectiveArrow.js).
// Events: `bike:stolen` { player, bikeId, hideoutId }, `mission:trigger` { id: 'stolen-bike' }, `bike:theft-foiled` { bike },
// `bike:recovered` { player, bikeId, hideoutId }. The first player near the stolen bike raises Aerger (a guard shows up) via `bully:bump`.
import { awayTime, borrowable, hasMotive, pickHideout, pickOrigin } from '../vehicles/theftLogic.js';

const WALK = 'approach';
const RIDE = 'away';

export class BikeTheft {
  constructor(scene, ctx, cfg, bikes, parking, profiles) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.bikes = bikes;
    this.parking = parking;
    this.walkTex = profiles['bully-foot'].texture;
    this.rideTex = profiles['bully-bike'].texture;
    this.path = new Int32Array(ctx.chase.cfg.nav.maxPath);
    this.pathLen = 0;
    this.pathIdx = 0;
    this.sprite = scene.add.image(0, 0, this.walkTex).setScale(ctx.res.inv).setVisible(false);
    this.thief = null; // { bike, hideout, phase } of the theft under way
    this.stolen = null; // the bike image waiting at its hideout
    this.hideouts = [];
    this.checkIn = cfg.checkInterval;
    this.cooldown = 0;
    this.guarded = false;
    this.rng = Math.random; // tests replace it
    this.probe = { locked: false, busy: false, awayT: 0, inView: false, motive: false };
    this.visible = (x, y) => ctx.chase.onScreen(x, y, cfg.viewMargin);
    ctx.events.on('bike:mounted', ev => this.onMounted(ev));
    this.loadMap();
    ctx.world.register(this);
  }

  loadMap() {
    const { ctx } = this;
    const ts = ctx.map.tileSize;
    this.hideouts = ctx.map.objects.filter(o => o.type === 'bike-hideout').map(o => ({ id: o.id, x: (o.x + 0.5) * ts, y: (o.y + 0.5) * ts }));
    const flag = ctx.state.shared.flags.stolenBike;
    const hideout = flag?.map === ctx.world.id ? this.hideouts.find(h => h.id === flag.hideout) : null;
    if (hideout) this.rest(this.bikes.place(hideout.x, hideout.y, flag.bikeId), hideout);
  }

  // Leaving the map ends a theft under way (the family keeps the flag; the bike is put back at its hideout on return).
  unloadMap() {
    this.endThief();
    this.stolen = null;
    this.guarded = false;
  }

  get active() { return this.thief !== null; }

  endThief() {
    if (this.thief) this.thief.bike.busy = false;
    this.thief = null;
    this.sprite.setVisible(false);
  }

  update(dt) {
    this.cooldown -= dt;
    for (const b of this.parking.dropped) {
      if (b.parkState === 'unlocked') b.awayT = awayTime(b.awayT, dt, this.nearestPlayerDist(b.x, b.y), this.cfg);
    }
    if (this.thief) this.stepThief(dt);
    else if ((this.checkIn -= dt) <= 0) {
      this.checkIn = this.cfg.checkInterval;
      this.tryBorrow();
    }
    if (this.stolen && !this.guarded && this.nearestPlayerDist(this.stolen.x, this.stolen.y) <= this.cfg.guardRadius) {
      this.guarded = true;
      this.ctx.events.emit('bully:bump', { bully: null });
    }
  }

  nearestPlayerDist(x, y) {
    const p = this.ctx.nearestPlayer(x, y);
    return Math.hypot(p.x - x, p.y - y);
  }

  tryBorrow() {
    const { ctx, cfg, probe, visible } = this;
    if (this.cooldown > 0 || this.stolen || ctx.state.shared.flags.stolenBike || !this.hideouts.length) return;
    const { chase } = ctx;
    for (const b of this.parking.dropped) {
      if (b.streetId || b.parkState !== 'unlocked' || b.awayT < cfg.awaySeconds) continue;
      const origin = pickOrigin(chase.spawns, b.x, b.y, cfg, visible);
      if (!origin) continue;
      probe.locked = false;
      probe.busy = false;
      probe.awayT = b.awayT;
      probe.inView = visible(b.x, b.y);
      probe.motive = hasMotive(chase.level, chase.pool.live() > 0, origin, b.x, b.y, cfg);
      if (borrowable(probe, cfg) && this.rng() < cfg.chance) { this.begin(b, origin); return; }
    }
  }

  // The thief appears at `origin` and heads for the bike.
  begin(bike, origin) {
    const hideout = pickHideout(this.hideouts, bike.x, bike.y);
    this.pathLen = this.ctx.chase.nav.findPath(origin.x, origin.y, bike.x, bike.y, this.path);
    if (!hideout || !this.pathLen) return;
    this.pathIdx = 1;
    bike.busy = true;
    this.thief = { bike, hideout, phase: WALK };
    this.sprite.setTexture(this.walkTex).setOrigin(0.5, 0.8).setFlipX(false).setRotation(0).setPosition(origin.x, origin.y).setVisible(true);
  }

  stepThief(dt) {
    const { thief, sprite, cfg } = this;
    const walking = thief.phase === WALK;
    if (walking) {
      for (const p of this.ctx.alivePlayers()) {
        if (Math.hypot(p.x - sprite.x, p.y - sprite.y) <= cfg.scareRadius) { this.foil(); return; }
      }
    }
    let reach = (walking ? cfg.walkSpeed : cfg.rideSpeed) * dt;
    while (reach > 0 && this.pathIdx < this.pathLen) {
      const { ts, cols } = this.ctx.chase.nav;
      const n = this.path[this.pathIdx];
      const dx = (n % cols + 0.5) * ts - sprite.x;
      const dy = (((n / cols) | 0) + 0.5) * ts - sprite.y;
      const d = Math.hypot(dx, dy);
      if (d <= reach) { sprite.x += dx; sprite.y += dy; reach -= d; this.pathIdx++; continue; }
      sprite.x += (dx / d) * reach;
      sprite.y += (dy / d) * reach;
      this.face(dx, dy);
      reach = 0;
    }
    sprite.setDepth(sprite.y);
    if (this.pathIdx < this.pathLen) return;
    if (walking) this.takeBike(); else this.arrive();
  }

  face(dx, dy) {
    const { sprite } = this;
    if (this.thief.phase === WALK) { if (Math.abs(dx) > 0.5) sprite.setFlipX(dx < 0); return; }
    const west = dx < 0;
    const h = Math.atan2(dy, dx);
    sprite.setFlipX(west).setRotation(west ? h + (h > 0 ? -Math.PI : Math.PI) : h);
  }

  foil() {
    const { bike } = this.thief;
    bike.awayT = 0;
    this.cooldown = this.cfg.cooldownSeconds;
    this.endThief();
    this.ctx.events.emit('bike:theft-foiled', { bike });
  }

  // At the bike: it leaves the street, the family is told, the ride to the hideout starts.
  takeBike() {
    const { ctx, thief, sprite } = this;
    const { bike, hideout } = thief;
    const { events, state } = ctx;
    this.pathLen = ctx.chase.nav.findPath(bike.x, bike.y, hideout.x, hideout.y, this.path);
    if (!this.pathLen) { this.foil(); return; }
    this.pathIdx = 1;
    this.parking.release(bike);
    bike.setVisible(false);
    thief.phase = RIDE;
    sprite.setTexture(this.rideTex).setOrigin(0.5, 0.5).setPosition(bike.x, bike.y);
    state.dispatch('flags.set', { key: 'stolenBike', value: { hideout: hideout.id, x: hideout.x, y: hideout.y, bikeId: bike.bikeId, map: ctx.world.id } });
    events.emit('bike:stolen', { player: bike.owner, bikeId: bike.bikeId, hideoutId: hideout.id });
    events.emit('ui:toast', { key: 'bike.stolen', style: 'phone' });
    events.emit('mission:trigger', { id: 'stolen-bike' });
  }

  arrive() {
    const { bike, hideout } = this.thief;
    bike.busy = false;
    this.thief = null;
    this.sprite.setVisible(false);
    this.rest(bike, hideout);
  }

  // The bike stands at the hideout, waiting to be fetched.
  rest(bike, hideout) {
    bike.setPosition(hideout.x, hideout.y).setDepth(hideout.y).setRotation(0.4).setVisible(true);
    bike.parkState = undefined;
    bike.hideout = hideout;
    this.stolen = bike;
    this.guarded = false;
  }

  // Mounting the bike at its hideout is the rescue.
  onMounted({ bike, player }) {
    if (bike !== this.stolen) return;
    const { events, state } = this.ctx;
    this.stolen = null;
    state.dispatch('flags.set', { key: 'stolenBike', value: null });
    this.cooldown = this.cfg.cooldownSeconds;
    events.emit('bike:recovered', { player, bikeId: bike.bikeId, hideoutId: bike.hideout.id });
    events.emit('ui:toast', { key: 'bike.recovered' });
    this.ctx.particles.emit('spark', bike.x, bike.y - 4);
  }
}
