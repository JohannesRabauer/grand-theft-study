// The other chasers (story 7.4, ctx.grownups, data/grownups.json): the Hausmeister, the ticket inspector and the neighbor's dog, each
// started by its cause (an event), escapable, harmless in the end and calming down afterwards. Emits `grownup:started` { kind, x, y },
// `grownup:caught` { kind, player, cents } and `grownup:calmed` { kind }. The figures are small drawn people; the dog is a FreeDog.
import { Brain, G, lossFor } from '../services/grownupLogic.js';

export class Grownups {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.active = new Map(); // kind -> { brain, gfx }
    this.rest = { janitor: 0, inspector: 0, dog: 0 };
    ctx.grownups = this;
    for (const kind of ['janitor', 'inspector', 'dog']) {
      const cause = cfg[kind].cause;
      ctx.events.on(cause.event, e => { if (this.matches(cause, e)) this.start(kind, e); });
    }
    ctx.world.register(this);
  }

  matches(cause, e) {
    for (const [k, v] of Object.entries(cause.match ?? {})) if (e?.[k] !== v) return false;
    return true;
  }

  unloadMap() { for (const kind of [...this.active.keys()]) this.remove(kind); }

  loadMap() {}

  // Starts the chaser of `kind` for event `e`; returns whether one started (one per kind, not during its cooldown, never indoors).
  start(kind, e) {
    const { ctx } = this;
    if (ctx.map.indoor || window.SCHULWEG_GAME?.grownupsOff || this.rest[kind] > 0 || ctx.chase.lvl.enabled === false) return false;
    if (kind === 'dog') return this.startDog(e);
    if (this.active.has(kind)) return false;
    const spawn = ctx.chase.pickSpawn();
    if (!spawn) return false;
    const brain = new Brain(this.cfg[kind], spawn.x, spawn.y);
    const gfx = this.scene.add.graphics().setDepth(5);
    this.draw(gfx, this.cfg[kind].outfit);
    this.active.set(kind, { brain, gfx });
    ctx.events.emit('grownup:started', { kind, x: spawn.x, y: spawn.y });
    ctx.events.emit('ui:toast', { key: this.cfg[kind].shout });
    return true;
  }

  startDog(e) {
    const { ctx } = this;
    if (!ctx.dogs || e?.x === undefined) return false;
    const dog = ctx.dogs.spawn(e.x, e.y, 'CHASE');
    if (!dog) return false;
    dog.angry = true; // only a dog set on the kids calms down by itself; the fetching dogs of story 6.1 stay as they are
    dog.angryT = 0;
    this.rest.dog = this.cfg.dog.cooldown;
    ctx.events.emit('grownup:started', { kind: 'dog', x: e.x, y: e.y });
    return true;
  }

  draw(g, o) {
    const hex = s => parseInt(s.slice(1), 16);
    g.fillStyle(0x000000, 0.25).fillEllipse(0, 7, 12, 4);
    g.fillStyle(hex(o.pants)).fillRect(-3, 2, 6, 5);
    g.fillStyle(hex(o.jacket)).fillRect(-4, -5, 8, 8);
    g.fillStyle(0xf2c9a0).fillCircle(0, -8, 3.5);
    g.fillStyle(hex(o.hat)).fillRect(-4, -12, 8, 3);
  }

  update(dt) {
    const { ctx } = this;
    for (const k of Object.keys(this.rest)) if (this.rest[k] > 0) this.rest[k] -= dt;
    const { surfaces } = ctx;
    const solid = (x, y) => surfaces.solid(surfaces.at(x, y));
    for (const [kind, a] of this.active) {
      const target = ctx.nearestPlayer(a.brain.x, a.brain.y);
      const ev = a.brain.update(dt, target, ctx.chase.perception.hiddenFor(target), solid);
      a.gfx.setPosition(a.brain.x, a.brain.y + Math.sin(a.brain.t * 9) * 0.8).setDepth(a.brain.y);
      if (ev === 'caught') this.caught(kind, target);
      else if (ev === 'calmed') { ctx.events.emit('grownup:calmed', { kind }); this.rest[kind] = this.cfg[kind].cooldown; this.remove(kind); break; }
    }
    this.calmDogs(dt);
  }

  caught(kind, player) {
    const { ctx } = this;
    const cents = lossFor(this.cfg[kind], ctx.state.shared.money);
    if (cents > 0) ctx.state.dispatch('wallet.spend', { cents, reason: `grownup-${kind}` });
    ctx.events.emit('grownup:caught', { kind, player: player.index, cents });
    ctx.events.emit('ui:toast', { key: this.cfg[kind].caught });
  }

  // A dog set on the kids trots after them and calms down by itself after a while or when they are far away.
  calmDogs(dt) {
    const { ctx } = this;
    if (!ctx.dogs) return;
    const c = this.cfg.dog;
    for (const d of ctx.dogs.list) {
      if (!d.active || !d.angry) continue;
      d.angryT += dt;
      const p = ctx.nearestPlayer(d.x, d.y);
      if (d.state === 'CHASE' && !d.fetch.active && (d.angryT >= c.chaseSeconds || Math.hypot(p.x - d.x, p.y - d.y) > c.loseDistance)) {
        d.state = 'CALM';
        d.angry = false;
        ctx.events.emit('grownup:calmed', { kind: 'dog' });
      }
    }
  }

  remove(kind) {
    const a = this.active.get(kind);
    if (!a) return;
    a.gfx.destroy();
    this.active.delete(kind);
  }

  // Test hook: a chaser of that kind, or undefined.
  chaser(kind) { return this.active.get(kind)?.brain; }
}

export { G };
