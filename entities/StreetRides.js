import { safeStreetPosition, streetRecord } from '../vehicles/streetLogic.js';

// Provenance belongs to an object, never to the family's unlocked vehicle types.
export class StreetRides {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.services = [];
    this.hints = Array.from({ length: ctx.maxPlayers }, () => scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '8px', color: '#f6efdc', backgroundColor: '#2b3850', resolution: ctx.res.scale
    }).setOrigin(0.5).setDepth(8100).setVisible(false));
    ctx.street = this;
    ctx.state.dispatch('street.restore');
    ctx.events.on('state:saving', () => this.snapshot());
    ctx.events.on('world:leave', () => this.snapshot());
    ctx.events.on('world:enter', () => this.snapshot());
    scene.events.once('shutdown', () => this.snapshot());
  }

  allowed(player, kind) {
    return this.services.some(s => s.id === kind && s.riders[player]?.mounted?.streetId
      && this.ctx.state.shared.streetRides[s.riders[player].mounted.streetId]?.player === player);
  }

  locations(kind) {
    const { state, world } = this.ctx;
    return Object.keys(state.cfg.streetObjects).flatMap(id => {
      const r = streetRecord(state.cfg, state.shared.streetRides, id);
      return r.kind === kind && r.map === world.id && r.status !== 'carried' ? [{ id, ...r }] : [];
    });
  }

  claim(item, player) {
    if (!item.streetId) return player.mayUse(player.profiles.bike && item.bikeId ? 'bike' : item.rideKind);
    const { state, world, events } = this.ctx;
    if (!state.dispatch('street.claim', { id: item.streetId, player: player.index, map: world.id, x: player.x, y: player.y })) {
      player.vehicleSwapped = true;
      events.emit('ui:toast', { key: 'street.unavailable' });
      return false;
    }

    const witness = this.ctx.crowd?.list?.find(n => n.active && Math.hypot(n.x - player.x, n.y - player.y) < 120);
    events.emit('ui:toast', { key: witness ? 'street.witness' : 'street.taken' });
    if (witness) {
      events.emit('street:witnessed', { player: player.index, id: item.streetId });
      events.emit('bully:bump', { bully: null });
    }
    return true;
  }

  unavailable(player) {
    if (!this.services.some(s => s.riders.some((r, index) => index !== player.index && r.mounted?.streetId
      && Math.hypot(this.ctx.players[index]?.x - player.x, this.ctx.players[index]?.y - player.y) <= 36))) return;
    player.vehicleSwapped = true;
    this.ctx.events.emit('ui:toast', { key: 'street.unavailable' });
  }

  safe(player) {
    const { state, world, map } = this.ctx;
    if (safeStreetPosition(state.cfg, world.id, player.x, player.y)) return { x: player.x, y: player.y };
    const ts = map.tileSize;
    for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = (Math.floor(player.x / ts) + dx + 0.5) * ts;
      const y = (Math.floor(player.y / ts) + dy + 0.5) * ts;
      if (safeStreetPosition(state.cfg, world.id, x, y)) return { x, y };
    }
    return world.spawnPoint();
  }

  drop(item, player, returnRequested = false) {
    if (!item.streetId) return;
    const { state, world, events } = this.ctx;
    const o = state.cfg.streetObjects[item.streetId];
    const pos = this.safe(player);
    const returning = returnRequested && world.id === o.map && Math.hypot(player.x - o.x, player.y - o.y) <= 36;
    const action = returning ? 'street.return' : 'street.locate';
    if (state.dispatch(action, { id: item.streetId, player: player.index, map: world.id, ...pos, drop: true })) {
      item.setPosition(returning ? o.x : pos.x, returning ? o.y : pos.y);
      events.emit('ui:toast', { key: returning ? 'street.returned' : 'street.dropped' });
    }
  }

  snapshot() {
    const { state, world } = this.ctx;
    for (const s of this.services) for (const item of s.parked) {
      if (!item.streetId || !item.scene) continue;
      const rider = s.riders.findIndex(r => r.mounted === item);
      const pos = this.safe(rider >= 0 ? this.ctx.players[rider] : item);
      if (rider < 0) item.setPosition(pos.x, pos.y);
      const r = state.shared.streetRides[item.streetId];
      if (!r || r.status === 'available' || (r.map === world.id && r.x === pos.x && r.y === pos.y)) continue;
      state.dispatch('street.locate', { id: item.streetId, player: rider >= 0 ? rider : null, map: world.id, ...pos });
    }
  }

  update() {
    const { ctx } = this;
    for (const p of ctx.players) {
      if (!p.pinned && p.vehicle === 'foot' && !p.vehicleSwapped && ctx.input.intents[p.index].interact) this.unavailable(p);
      let text = '';
      const svc = this.services.find(s => s.isMounted(p.index));
      const item = svc?.riders[p.index].mounted;
      if (item?.streetId) {
        const o = ctx.state.cfg.streetObjects[item.streetId];
        text = ctx.world.id === o.map && Math.hypot(p.x - o.x, p.y - o.y) <= 36 ? 'street.return' : 'street.drop';
      } else if (p.vehicle === 'foot' && this.services.some(s => {
        const nearest = s.nearest(p);
        return (nearest.item ?? nearest.bike)?.streetId;
      })) text = 'street.take';
      const label = this.hints[p.index];
      label.setVisible(!!text && !p.pinned).setPosition(p.x, p.y - 24);
      if (text && (label.streetText !== text || label.streetDevice !== ctx.input.type || label.streetLanguage !== ctx.i18n.lang)) {
        label.setText(`${ctx.t(`world.interact.${ctx.input.type === 'keyboard' && p.index === 1 ? 'keyboardP2' : ctx.input.type}`)} ${ctx.t(text)}`);
        label.streetText = text;
        label.streetDevice = ctx.input.type;
        label.streetLanguage = ctx.i18n.lang;
      }
    }
  }
}
