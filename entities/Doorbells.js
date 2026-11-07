import { SpeechBubbles } from './SpeechBubbles.js';
import { PHASE, newSequence, startSequence, advanceSequence, doorOpen, stepToward } from './stickWorldLogic.js';

// Doorbells (story 6.2): `doorbell` map objects on a house wall, `{ houseId, neighborId, side }`. Swinging the stick at one, or
// pressing interact next to it, rings it: `doorbell:ring` { player, houseId } and a comic "Ding-Dong!" bubble. Then the cheeky
// ding-dong-run (pure timers in stickWorldLogic.js, numbers in data/neighbors.json): the door next to the bell opens, the
// neighbor steps out, shouts and follows the nearest player at walking speed for a few seconds, then gives up laughing. If he
// reaches a player nothing happens but a harmless "Erwischt!" bubble. `neighbor:alert` { houseId, player } is the event the real
// angry neighbor of epic 7 (story 7.4) will take over; this class only provides the placeholder behaviour. The neighbor is a
// pooled sprite without a body: nothing collides with him and no tool ever touches him (AD-3, AD-24).
// Other events: `neighbor:caught` { houseId, player }, `neighbor:giveup` { houseId }.
class Neighbor {
  constructor(scene, ctx, cfg) {
    this.cfg = cfg;
    this.x = 0;
    this.y = 0;
    this.active = false;
    this.id = '';
    this.step = 0;
    this.frame = -1;
    this.sprite = scene.add.image(0, 0, `neighbor-${Object.keys(cfg.neighbors)[0]}-2`).setScale(ctx.res.inv).setOrigin(0.5, 0.88).setVisible(false);
  }

  activate(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.step = 0;
    this.frame = -1;
    this.active = true;
    this.show(2, false);
  }

  show(frame, flip) {
    if (frame !== this.frame) {
      this.frame = frame;
      this.sprite.setTexture(`neighbor-${this.id}-${frame}`);
    }
    this.sprite.setFlipX(flip).setPosition(this.x, this.y).setDepth(this.y).setVisible(true);
  }

  deactivate() {
    this.active = false;
    this.sprite.setVisible(false);
  }
}

export class Doorbells {
  constructor(scene, ctx, cfg, neighborCfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg.doorbell;
    this.ncfg = neighborCfg;
    this.items = [];
    this.bubbles = new SpeechBubbles(scene, ctx, 4, 'doorBubbles');
    this.neighbors = [];
    for (let i = 0; i < neighborCfg.pool; i++) this.neighbors.push(new Neighbor(scene, ctx, neighborCfg));
    this.move = { x: 0, y: 0 };
    this.try = { x: 0, y: 0 };
    ctx.swingTargets.doorbell = this;
    this.loadMap();
    ctx.world.register(this);
    const self = this;
    ctx.pools.register('neighbors', { live: () => self.neighbors.filter(n => n.active).length, cap: neighborCfg.pool });
  }

  loadMap() {
    const { ctx, scene } = this;
    const ts = ctx.map.tileSize;
    this.items = ctx.map.objects.filter(o => o.type === 'doorbell').map(o => {
      const up = o.side === 'up';
      const wallY = up ? o.y * ts : (o.y + 1) * ts; // the edge of the house wall the door and the bell sit on
      const bellY = wallY + (up ? 4 : -4);
      const doorX = (o.x + 1.5) * ts;
      const depth = wallY + 1;
      return {
        o, id: o.id, houseId: o.houseId, x: (o.x + 0.5) * ts, y: bellY, // x, y: the bell
        walkY: (o.y + 0.5) * ts, // where the neighbor stands when he steps out (the walkway tile next to the door)
        doorX,
        seq: newSequence(), target: 0, neighbor: null,
        owner: { active: true, x: (o.x + 0.5) * ts, y: o.y * ts + (up ? 4 : 10) },
        bell: scene.add.image((o.x + 0.5) * ts, bellY, 'doorbell').setScale(ctx.res.inv).setDepth(depth),
        door: scene.add.image(doorX, wallY + (up ? 2 : -2), 'door-closed').setOrigin(0.5, up ? 1 : 0).setScale(ctx.res.inv).setDepth(depth)
      };
    });
  }

  unloadMap() {
    for (const d of this.items) {
      d.bell.destroy();
      d.door.destroy();
    }
    this.items = [];
    this.bubbles.clear();
    for (const n of this.neighbors) n.deactivate();
  }

  locate(d, pt) {
    pt.x = d.x;
    pt.y = d.y;
    pt.r = this.cfg.radius;
    return true;
  }

  // The bell was pressed (by the stick or by interact). A bell that is busy only dings.
  ring(d, player) {
    const { ctx } = this;
    ctx.events.emit('doorbell:ring', { player: player.index, houseId: d.houseId });
    this.bubbles.say(d.owner, ctx.t('stick.ding'), this.ncfg.timing.dingSeconds);
    ctx.particles.emit('spark', d.x, d.y, { count: 3 });
    if (startSequence(d.seq)) d.target = player.index;
  }

  update(dt) {
    const { ctx } = this;
    if (this.items.length) {
      for (const p of ctx.players) {
        if (p.pinned || p.vehicleSwapped || !ctx.input.intents[p.index].interact) continue;
        for (const d of this.items) {
          if (Math.hypot(p.x - d.x, p.y - d.walkY) <= this.cfg.interactReach) this.ring(d, p);
        }
      }
    }
    for (const d of this.items) this.advance(d, dt);
    this.bubbles.update(dt);
  }

  advance(d, dt) {
    const { ctx, ncfg } = this;
    const n = d.neighbor;
    const touched = n && d.seq.phase === PHASE.CHASE ? this.chase(n, dt) : false;
    const ev = advanceSequence(d.seq, ncfg.timing, dt, touched);
    if (!ev) return;
    if (ev === 'open') {
      d.neighbor = this.neighbors.find(m => !m.active) ?? null;
      d.neighbor?.activate(d.o.neighborId, d.doorX, d.walkY);
      if (d.neighbor) this.bubbles.say(d.neighbor, ctx.t('stick.neighborShout'), ncfg.timing.shoutSeconds);
      ctx.events.emit('neighbor:alert', { houseId: d.houseId, player: d.target });
    } else if (ev === 'caught') {
      d.neighbor?.show(2, d.neighbor.sprite.flipX);
      this.bubbles.say(d.neighbor ?? d.owner, ctx.t('stick.neighborCaught'), ncfg.bubbleSeconds);
      ctx.events.emit('neighbor:caught', { houseId: d.houseId, player: d.target });
    } else if (ev === 'giveup') {
      if (d.neighbor) {
        d.neighbor.show(2, d.neighbor.sprite.flipX);
        this.bubbles.say(d.neighbor, ctx.t('stick.neighborLaugh'), ncfg.bubbleSeconds);
      }
      ctx.events.emit('neighbor:giveup', { houseId: d.houseId });
    } else if (ev === 'done') {
      if (d.neighbor) {
        this.bubbles.release(d.neighbor);
        d.neighbor.deactivate();
        d.neighbor = null;
      }
    }
    d.door.setTexture(doorOpen(d.seq) ? 'door-open' : 'door-closed');
  }

  free(x, y) {
    const { surfaces } = this.ctx;
    return !surfaces.solid(surfaces.at(x, y));
  }

  // One walking step of the neighbor towards the nearest player (around walls, along one axis if need be); true when he is at a player.
  chase(n, dt) {
    const { ctx, ncfg, move, try: next } = this;
    let target = null;
    let best = Infinity;
    for (const p of ctx.players) {
      const dist = Math.hypot(p.x - n.x, p.y - n.y);
      if (!p.pinned && dist < best) { best = dist; target = p; }
    }
    if (!target) return false;
    stepToward(move, n.x, n.y, target.x, target.y, ncfg.speed, dt);
    next.x = n.x + move.x;
    next.y = n.y + move.y;
    if (this.free(next.x, next.y)) { n.x = next.x; n.y = next.y; } else if (this.free(next.x, n.y)) n.x = next.x;
    else if (this.free(n.x, next.y)) n.y = next.y;
    n.step += dt * ncfg.stepRate;
    n.show(Math.floor(n.step) % 2, move.x < 0);
    return best <= ncfg.catchRadius;
  }
}
