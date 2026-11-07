import { addCircle } from '../physics/bodies.js';
import { MASK } from '../physics/categories.js';
import { newBalloon, popBalloon, tickBalloon } from './stickWorldLogic.js';

// Kirmes balloons (story 6.2): `balloon` map objects { color } tied to the `fair-stall` (stall art drawn here). Each balloon has a
// static sensor body in the PROP category, so slingshot pebbles (PROJECTILE, which only sees PROP and STATIC, AD-3) report a
// contact with it and the slingshot hands it to `popBody`; nothing is ever pushed and people and animals never touch it.
// A popped balloon bursts into confetti, is gone for `balloon.respawn` seconds and then floats back. They bob and lean with the
// wind (AD-7), only when near the camera. Events: `balloon:popped` { player, color }.
export class Balloons {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg.balloon;
    this.items = [];
    this.byBody = new Map();
    this.stalls = [];
    this.t = 0;
    ctx.balloons = this;
    this.loadMap();
    ctx.world.register(this);
  }

  loadMap() {
    const { ctx, scene, cfg } = this;
    const ts = ctx.map.tileSize;
    this.stalls = ctx.map.objects.filter(o => o.type === 'fair-stall').map(o => {
      const bottom = (o.y + 1) * ts;
      return scene.add.image((o.x + 0.5) * ts, bottom, 'fair-stall').setOrigin(0.5, 1).setScale(ctx.res.inv).setDepth(bottom);
    });
    this.items = ctx.map.objects.filter(o => o.type === 'balloon').map((o, i) => {
      const x = (o.x + 0.5) * ts;
      const y = (o.y + 0.5) * ts;
      const body = addCircle(scene, x, y, cfg.radius, 'PROP', { isStatic: true, isSensor: true });
      return {
        o, color: o.color, x, y, body, state: newBalloon(), grow: 1, phase: i * 1.7,
        sprite: scene.add.image(x, y, `balloon-${o.color}`).setOrigin(0.5, 0.235).setScale(ctx.res.inv).setDepth(8300)
      };
    });
    this.byBody = new Map(this.items.map(b => [b.body.id, b]));
  }

  unloadMap() {
    for (const b of this.items) {
      this.scene.matter.world.remove(b.body);
      b.sprite.destroy();
    }
    for (const s of this.stalls) s.destroy();
    this.items = [];
    this.stalls = [];
    this.byBody.clear();
  }

  // A projectile of `player` touched `body`: pops it when it is a balloon that is still up. Returns whether it popped.
  popBody(body, player) {
    const b = this.byBody.get(body.id);
    if (!b || !popBalloon(b.state, this.cfg.respawn)) return false;
    const { ctx } = this;
    b.sprite.setVisible(false);
    b.body.collisionFilter.mask = 0;
    ctx.particles.emit('confetti', b.x, b.y, { count: this.cfg.confetti });
    ctx.particles.emit('spark', b.x, b.y, { count: 4 });
    ctx.events.emit('balloon:popped', { player, color: b.color });
    return true;
  }

  update(dt) {
    const { cfg, ctx } = this;
    this.t += dt;
    const v = this.scene.cameras.main.worldView;
    const wx = ctx.wind.vector.x;
    for (const b of this.items) {
      if (tickBalloon(b.state, dt)) {
        b.body.collisionFilter.mask = MASK.PROP;
        b.grow = 0;
        b.sprite.setVisible(true);
      }
      if (b.state.popped || b.x < v.x - 32 || b.x > v.right + 32 || b.y < v.y - 32 || b.y > v.bottom + 32) continue;
      const w = this.t * 1.8 + b.phase;
      if (b.grow < 1) b.grow = Math.min(1, b.grow + dt * 2.5);
      b.sprite.setPosition(b.x + wx * cfg.sway * Math.sin(w * 0.7), b.y + Math.sin(w) * cfg.bob)
        .setRotation(wx * 0.12 + Math.sin(w * 0.8) * 0.06).setScale(b.grow * ctx.res.inv);
    }
  }
}
