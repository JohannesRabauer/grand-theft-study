// Vehicle ownership (CAP-16, AD-22, AD-23). The family's owned vehicles are `state.shared.ownedVehicles`; walking is always
// owned. Unlock paths all end in an action: a character's own vehicle at the start (`vehicles.unlock` reason 'start'), the shop
// (`shop.buyVehicle`), a race win (event `race:won` { vehicle }, races come in epic 9) and the garage find (entities/Garage.js).
// This service only turns those into one event and toast: `vehicle:unlocked` { id, reason }; and answers `owns` / `refuse`
// for Player.setVehicle. Phaser-free.
export const isOwned = (shared, id) => id === 'foot' || shared.ownedVehicles.includes(id);

export class Ownership {
  constructor(ctx) {
    this.ctx = ctx;
    const { events } = ctx;
    events.on('race:won', ev => this.unlock(ev?.vehicle, 'race'));
    events.on('state:changed', ev => {
      if (ev.action === 'vehicles.unlock' && ev.payload.reason !== 'start') this.announce(ev.payload.id, ev.payload.reason);
      else if (ev.action === 'shop.buyVehicle') this.announce(ev.payload.id, 'bought');
    });
  }

  owns(id) { return isOwned(this.ctx.state.shared, id); }

  // Unlocks `id` unless it is walking, missing or already owned; true when it was newly unlocked.
  unlock(id, reason) {
    return !!id && !this.owns(id) && this.ctx.state.dispatch('vehicles.unlock', { id, reason });
  }

  announce(id, reason) {
    const { events, t } = this.ctx;
    events.emit('vehicle:unlocked', { id, reason });
    events.emit('ui:toast', { key: 'vehicle.unlocked', params: { name: t(`vehicle.${id}`) } });
  }

  // A mount of something not owned: friendly toast, nothing else happens.
  refuse(id) {
    this.ctx.events.emit('vehicle:refused', { id });
    this.ctx.events.emit('ui:toast', { key: 'vehicle.locked' });
  }
}
