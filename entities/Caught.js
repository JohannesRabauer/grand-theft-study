// Getting caught (CAP-7), per player (AD-18). On `bully:caught-contact` { player } that player is pinned (Player.pinned:
// it stands still, the co-op tether lets the other go on) and out of play (Player.alive = false: bullies and the crowd
// ignore it) while UIScene shows the comic frame for it; it loses a little money from the shared wallet, once per catch
// (a `wallet.spend` on ctx.state, AD-16), and ctx.chase.playerCaught() decides about the chase (the level resets only when no bully is
// chasing any more). After `seconds` or on that player's interact / a fresh jump press it is dismounted and put back at home
// (beside the spawn point in co-op, camera.json coop.spawnOffsets; in co-op, when home is far from the sibling still
// playing, next to the sibling instead, so the shared camera and tether never end up stuck). The world freezes only while EVERY player is caught
// (always, with one player); otherwise the other keeps playing. Emits `player:caught` { player, lost, money } (cents) and
// `player:respawn` { player, x, y }.
export class Caught {
  constructor(scene, ctx, cfg, rides) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.rides = rides; // Bikes, Skateboards and Skates
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
    const player = ctx.players[index];
    player.pinned = true;
    player.alive = false;
    player.hold();
    if (this.count >= ctx.players.length) this.scene.freeze(true);
    ctx.chase.playerCaught();
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
    for (const ride of this.rides) if (ride.isMounted(index)) ride.dismount(player); // the bike or board stays where the player was caught
    const coop = ctx.players.length > 1;
    const off = coop ? scene.zoomCfg.coop.spawnOffsets[index] : [0, 0];
    let x = this.home.x + off[0];
    let y = this.home.y + off[1];
    // Co-op: one shared camera and a tether. When home is far from the sibling who is still playing, the view could
    // not show both and the pair got stuck, so the caught player comes back right next to the sibling instead.
    const mate = coop ? ctx.players.find(p => p.index !== index && p.alive && !p.pinned) : null;
    let rejoined = false;
    if (mate && Math.hypot(mate.x - x, mate.y - y) > scene.zoomCfg.tether.maxDistance * 0.6) {
      const { surfaces } = ctx;
      const spot = [[off[0] * 2, off[1] * 2 + 10], [off[0] * 2, off[1] * 2 - 10], [0, 12], [0, 0]]
        .map(([dx, dy]) => [mate.x + dx, mate.y + dy])
        .find(([px, py]) => !surfaces.solid(surfaces.at(px, py))) ?? [mate.x, mate.y];
      [x, y] = spot;
      rejoined = true;
    }
    player.teleport(x, y);
    if (!coop) scene.cameras.main.centerOn(x, y); // with two players the rig eases the view over
    ctx.particles.emit('dust', x, y, { count: 14 });
    this.slots[index].active = false;
    player.pinned = false;
    player.alive = true;
    if (--this.count < ctx.players.length) scene.freeze(false);
    if (rejoined) ctx.events.emit('ui:toast', { key: 'caught.rejoin', params: { who: player.character?.name ?? ctx.t('menu.slot.player', { n: index + 1 }), mate: mate.character?.name ?? ctx.t('menu.slot.player', { n: mate.index + 1 }) } });
    ctx.events.emit('player:respawn', { player: index, x, y, rejoined });
  }
}
