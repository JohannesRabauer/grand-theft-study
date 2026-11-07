// Getting caught (CAP-7). On `bully:caught-contact` the world freezes (ctx.frozen, set through the
// scene) while UIScene shows the comic frame; the player loses a little money, the chase is reset
// (director.reset: level 0, bullies back to the pool) and, after `seconds` or on interact / a fresh
// jump press, the player is dismounted and put back at home. Emits `player:caught` { lost, money } (cents)
// and `player:respawn` { x, y }; the loss is a `wallet.spend` on ctx.state (AD-16).
export class Caught {
  constructor(scene, ctx, cfg, bikes) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.bikes = bikes;
    const ts = ctx.map.tileSize;
    const home = ctx.map.objects.find(o => o.type === 'spawn' && o.id === 'player');
    this.home = { x: (home.x + 0.5) * ts, y: (home.y + 0.5) * ts };
    this.active = false;
    this.t = 0;
    this.jumpPrev = false;
    ctx.events.on('bully:caught-contact', () => this.trigger());
  }

  trigger() {
    if (this.active) return;
    const { ctx, cfg } = this;
    this.active = true;
    this.t = 0;
    this.jumpPrev = true; // a jump held while being caught does not skip the frame
    const lost = Math.min(ctx.state.shared.money, cfg.lossCents);
    if (lost > 0) ctx.state.dispatch('wallet.spend', { cents: lost, reason: 'caught' });
    this.scene.freeze(true);
    ctx.chase.reset();
    ctx.events.emit('player:caught', { lost, money: ctx.state.shared.money });
  }

  update(dt) {
    if (!this.active) return;
    const i = this.ctx.input.intent;
    this.t += dt;
    const press = i.interact || (i.jump && !this.jumpPrev);
    this.jumpPrev = i.jump;
    if (this.t >= this.cfg.seconds || (press && this.t >= this.cfg.minSeconds)) this.respawn();
  }

  respawn() {
    const { ctx, scene } = this;
    const { player } = ctx;
    if (this.bikes.mounted) this.bikes.dismount(); // the bike stays where the player was caught
    const { x, y } = this.home;
    scene.matter.body.setPosition(player.body, { x, y });
    scene.matter.body.setVelocity(player.body, { x: 0, y: 0 });
    player.move.speed = 0;
    player.move.vel.x = player.move.vel.y = 0;
    player.sprite.setPosition(x, y);
    scene.cameras.main.centerOn(x, y);
    ctx.particles.emit('dust', x, y, { count: 14 });
    this.active = false;
    scene.freeze(false);
    ctx.events.emit('player:respawn', { x, y });
  }
}
