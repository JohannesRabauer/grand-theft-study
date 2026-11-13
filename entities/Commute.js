// The commute (story 8.2, ctx.commute): the 08:00 school bell, the tram and the pickups along the routes.
// - Arriving at the school goal (`goal:reached` { id: 'school', player }) in the story clock is judged against the bell:
//   late emits `school:late` { player, minutes } (the Ordnung Kopfnote moves a little through data/kopfnoten.json; nothing is
//   taken away and the toast is kind), in time emits `commute:ontime` { player, early }. The result is stored per player and
//   day as a flag `commute.<day>.<player>` (minutes late). Reminder toasts come at the data's warning times.
// - Tram stops (map objects `tram-stop`): walking up and pressing interact buys a ticket for everyone nearby and rides to the
//   other stop of the line, skipping game minutes. Without money the kids ride black: an inspector may board
//   (`tram:inspector` { player, fine }, the hook for the chaser story 7.4), charging a fine, never more than they have.
// - Pickups: coins appear when a kid comes close to a spot (LootDrops), once per spot per run.
import { arrival, fares, fastTargets, inspected, knownStop, otherStop, rideTarget } from '../services/commuteLogic.js';
import { FastTravelScreen } from '../ui/screens/FastTravelScreen.js';
import { hasDayTicket } from '../services/shopLogic.js';

export class Commute {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    ctx.commute = this;
    this.arrived = new Set();
    this.spawned = new Set();
    this.rng = Math.random; // tests replace it
    this.labels = Array.from({ length: ctx.maxPlayers }, () => scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '8px', color: '#f6efdc', backgroundColor: '#2b3850', resolution: ctx.res.scale
    }).setOrigin(0.5).setDepth(8100).setVisible(false));
    this.timer = 0;
    ctx.events.on('goal:reached', e => { if (e.id === 'school') this.arrive(e.player); });
    ctx.events.on('clock:tick', e => this.warn(e));
  }

  get stops() { return this.ctx.map.objects.filter(o => o.type === 'tram-stop'); }

  stopPos(o) { const ts = this.ctx.map.tileSize; return { x: (o.x + 0.5) * ts, y: (o.y + 0.5) * ts }; }

  warn({ minute, phase }) {
    if (phase !== 'commute' || this.ctx.day.mode !== 'story') return;
    const { ctx } = this;
    const time = ctx.day.time;
    if (!this.cfg.warnings.includes(time)) return;
    if (ctx.players.every(p => this.arrived.has(`${ctx.day.day}:${p.index}`))) return;
    ctx.events.emit('ui:toast', { key: 'commute.warn', params: { min: arrival(this.cfg.deadline, minute).early } });
  }

  arrive(player) {
    const { ctx } = this;
    const key = `${ctx.day.day}:${player}`;
    if (ctx.day.mode !== 'story' || this.arrived.has(key) || !['morning', 'commute', 'school'].includes(ctx.day.phase)) return;
    this.arrived.add(key);
    const { late, early } = arrival(this.cfg.deadline, ctx.day.minute);
    ctx.state.dispatch('flags.set', { key: `commute.${ctx.day.day}.${player}`, value: late });
    if (late > 0) {
      ctx.events.emit('school:late', { player, minutes: late });
      ctx.events.emit('ui:toast', { key: 'commute.late', params: { min: late, who: this.who(player) } });
    } else {
      ctx.events.emit('commute:ontime', { player, early });
      ctx.events.emit('ui:toast', { key: 'commute.ontime', params: { who: this.who(player) } });
    }
  }

  who(index) { return this.ctx.players[index].character?.name ?? this.ctx.t('menu.slot.player', { n: index + 1 }); }

  nearStop(p) {
    const r = this.cfg.tram.boardRadius;
    return this.stops.find(o => { const s = this.stopPos(o); return Math.hypot(p.x - s.x, p.y - s.y) <= r; }) ?? null;
  }

  // Everyone on foot near the stop rides together. Returns what happened, or null when there is nowhere to go.
  ride(stopObject, destObject = null) {
    const { ctx, cfg } = this;
    const destId = destObject ? destObject.id : otherStop(cfg.tram, stopObject.id);
    const dest = this.stops.find(o => o.id === destId);
    if (!dest) return null;
    const from = this.stopPos(stopObject);
    const riders = ctx.players.filter(p => p.alive && !p.pinned && p.vehicle === 'foot' && Math.hypot(p.x - from.x, p.y - from.y) <= cfg.tram.groupRadius);
    if (!riders.length) return null;
    const pass = hasDayTicket(ctx.state.shared); // a day ticket from the bakery covers everybody
    const tickets = pass ? riders.map(() => true) : fares(cfg.tram, ctx.state.shared.money, riders.length);
    const paid = pass ? 0 : tickets.filter(Boolean).length * cfg.tram.priceCents;
    if (paid > 0) ctx.state.dispatch('wallet.spend', { cents: paid, reason: 'tram-ticket' });
    const day = ctx.day;
    if (day.mode === 'story' && day.running) {
      const target = rideTarget(day.minute, day.cfg.phases[day.phaseIndex].end, cfg.tram.rideMinutes);
      if (target > day.minute) day.skipTo(target, 'tram');
    }
    for (const p of riders) { const i = ctx.input.intents[p.index]; i.interact = false; i.hold = false; } // the press boarded the tram; it must not also mount whatever stands at the other stop
    const to = this.stopPos(dest);
    riders.forEach((p, i) => p.teleport(to.x + (i - (riders.length - 1) / 2) * 14, to.y + 12));
    this.scene.snapCamera();
    ctx.particles.emit('dust', to.x, to.y, { count: 10 });
    const info = { players: riders.map(p => p.index), from: stopObject.id, to: dest.id, tickets, paid };
    ctx.events.emit('tram:ride', info);
    if (inspected(cfg.tram, tickets, this.rng())) {
      const blackRider = riders[tickets.findIndex(t => !t)];
      const fine = Math.min(ctx.state.shared.money, cfg.tram.fineCents);
      if (fine > 0) ctx.state.dispatch('wallet.spend', { cents: fine, reason: 'tram-fine' });
      ctx.events.emit('tram:inspector', { player: blackRider.index, fine });
      ctx.events.emit('ui:toast', { key: 'tram.inspector', params: { who: this.who(blackRider.index) } });
    } else {
      ctx.events.emit('ui:toast', { key: paid > 0 ? 'tram.arrived' : 'tram.freeRide' });
    }
    return info;
  }

  known(o) { return knownStop(this.cfg.tram, this.ctx.state.shared.flags, o.id); }

  // Fast travel destinations (stop objects) from a known stop; more than the line partner only after quizzes unlocked other stops.
  targets(o) {
    return fastTargets(this.cfg.tram, this.ctx.state.shared.flags, this.stops.map(s => s.id), o.id).map(id => this.stops.find(s => s.id === id));
  }

  // The press at a stop: an unknown stop asks the map quiz, a known stop with several targets opens the fast travel list, else the line ride.
  press(stop, player) {
    const { ctx } = this;
    if (!this.known(stop)) { ctx.activities.start('tramquiz', player, stop.id); return; }
    const to = this.targets(stop);
    if (to.length > 1 && !ctx.screens?.top()) {
      ctx.screens.push(new FastTravelScreen(this.scene.scene.get('UI'), ctx, ctx.screens, this, stop, to, player));
      return;
    }
    this.ride(stop);
  }

  update(dt) {
    const { ctx, cfg } = this;
    const town = !ctx.map.indoor && this.stops.length > 0;
    for (const p of ctx.players) {
      const stop = town && p.alive && !p.pinned && p.vehicle === 'foot' ? this.nearStop(p) : null;
      const label = this.labels[p.index];
      label.setVisible(!!stop);
      if (!stop) continue;
      if (ctx.input.intents[p.index].interact && !p.vehicleSwapped) { ctx.input.intents[p.index].interact = false; this.press(stop, p.index); continue; }
      label.setPosition(p.x, p.y - 24);
      const known = this.known(stop);
      const dest = known ? otherStop(cfg.tram, stop.id) : true;
      const fast = known && this.targets(stop).length > 1;
      const text = !dest ? '' : `${ctx.t(`world.interact.${ctx.input.type === 'keyboard' && p.index === 1 ? 'keyboardP2' : ctx.input.type}`)} ${!known ? ctx.t('tram.quiz') : fast ? ctx.t('tram.fast') : ctx.t('tram.board', { price: ctx.t('hud.money', { v: (cfg.tram.priceCents / 100).toFixed(2).replace('.', ctx.i18n.lang === 'de' ? ',' : '.') }) })}`;
      if (label.tramText !== text) { label.setText(text); label.tramText = text; }
      label.setVisible(!!dest);
    }
    this.timer -= dt;
    if (this.timer > 0 || ctx.map.indoor || ctx.day.mode !== 'story') return; // pickups belong to the story day, not the free-play sandbox
    this.timer = 0.5;
    const ts = ctx.map.tileSize;
    for (const s of cfg.pickups) {
      if (this.spawned.has(s.id) || ctx.world.id !== 'town') continue;
      const x = (s.x + 0.5) * ts;
      const y = (s.y + 0.5) * ts;
      if (ctx.players.some(p => p.alive && Math.hypot(p.x - x, p.y - y) < cfg.pickupRadius)) {
        this.spawned.add(s.id);
        ctx.loot.drop('coin', x, y, { cents: s.cents });
      }
    }
  }

  // Test hook: the route table for the commute tip and the checks.
  get routes() { return this.cfg.routes; }
}
