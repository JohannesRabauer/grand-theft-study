// Getting caught (CAP-7), per player. On `bully:caught-contact` { player } the world freezes (ctx.frozen, set
// through the scene) while UIScene shows the comic frame; that player loses a little money, the chase is
// reset (director.reset: level 0, bullies back to the pool) and, after `seconds` or on that player's
// interact / a fresh jump press, they are dismounted and put back at home. The world stays frozen until every
// caught player is back. Emits `player:caught` { player, lost, money } (cents) and `player:respawn`
// { player, x, y }; the loss is a `wallet.spend` on ctx.state (AD-16).
export class Caught {
  constructor(scene, ctx, cfg, bikes) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.bikes = bikes;
    this.slots = Array.from({ length: ctx.maxPlayers }, () => ({ active: false, t: 0, jumpPrev: false }));
    this.count = 0; // players currently caught
    ctx.events.on('bully:caught-contact', ev => this.trigger(ev.player ?? 0));
  }

  // Where a caught player goes: the player spawn of the current map.
  get home() { return this.ctx.world.spawnPoint(); }

  trigger(index) {
    const slot = this.slots[index];
    if (slot.active) return;
    const { ctx, cfg } = this;
    slot.active = true;
    slot.t = 0;
    slot.jumpPrev = true; // a jump held while being caught does not skip the frame
    this.count++;
    const lost = Math.min(ctx.state.shared.money, cfg.lossCents);
    if (lost > 0) ctx.state.dispatch('wallet.spend', { cents: lost, reason: 'caught' });
    this.scene.freeze(true);
    ctx.chase.reset();
    ctx.events.emit('player:caught', { player: index, lost, money: ctx.state.shared.money });
  }

  update(dt) {
    if (this.count === 0) return;
    for (let index = 0; index < this.slots.length; index++) {
      const slot = this.slots[index];
      if (!slot.active) continue;
      const i = this.ctx.input.intents[index];
      slot.t += dt;
      const press = i.interact || (i.jump && !slot.jumpPrev);
      slot.jumpPrev = i.jump;
      if (slot.t >= this.cfg.seconds || (press && slot.t >= this.cfg.minSeconds)) this.respawn(index);
    }
  }

  respawn(index) {
    const { ctx, scene } = this;
    const player = ctx.players[index];
    if (this.bikes.isMounted(index)) this.bikes.dismount(player); // the bike stays where the player was caught
    const { x, y } = this.home;
    player.teleport(x, y);
    if (index === 0) scene.cameras.main.centerOn(x, y);
    ctx.particles.emit('dust', x, y, { count: 14 });
    this.slots[index].active = false;
    if (--this.count === 0) scene.freeze(false);
    ctx.events.emit('player:respawn', { player: index, x, y });
  }
}
