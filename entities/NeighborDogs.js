import { addCircle } from '../physics/bodies.js';
import { DogFetch } from '../ai/DogFetch.js';

export const DOG = { CALM: 'CALM', CHASE: 'CHASE', FETCH: 'FETCH' };

// Free-roaming dogs (story 6.1, data/dogs.json): ANIMAL bodies (walls and props only; tools, people and bullies pass them) with
// a state CALM / CHASE / FETCH. A chasing dog that has a landed throwing stick within range runs to it, carries it back to its
// thrower and drops it there (ai/DogFetch.js decides, this class moves the body, carries the stick and draws), then calms down.
// Emits `dog:fetch-start` / `dog:fetch-done` { player, dog }. `ctx.dogs.spawn(x, y, state)` creates one (SCHULWEG_GAME.spawnDog
// in ?debug); the chase itself is a plain trot after the nearest player until epic 7 gives the neighbor dog its real chase.
class FreeDog {
  constructor(scene, ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.matter = scene.matter;
    this.world = scene.matter.world;
    this.sprite = scene.add.image(0, 0, `${cfg.texture}-2`).setScale(ctx.res.inv).setOrigin(0.5, 0.8).setVisible(false);
    this.body = addCircle(scene, 0, 0, cfg.kinds['neighbor-dog'].radius, 'ANIMAL', { frictionAir: 0, friction: 0, inertia: Infinity });
    this.world.remove(this.body);
    this.mv = { x: 0, y: 0 };
    this.kind = null;
    this.state = DOG.CALM;
    this.active = false;
    this.vx = 0; this.vy = 0;
    this.phase = 0;
    this.frame = -1;
    this.flip = false;
    this.hop = 0;
    this.fetch = new DogFetch(cfg.kinds['neighbor-dog'].fetch, this.hooks());
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  // What the fetch behaviour needs from the world (one set per dog).
  hooks() {
    const { ctx } = this;
    return {
      sticks: () => ctx.sticks ?? [],
      owner: stick => ctx.players[stick.owner],
      take: stick => stick.tool.setState('carried'),
      drop: (stick, x, y) => {
        const { surfaces } = ctx;
        const free = !surfaces.solid(surfaces.at(x, y));
        stick.x = free ? x : this.x;
        stick.y = free ? y : this.y;
        stick.tool.setState('landed');
      },
      emit: (name, stick) => {
        if (name === 'start') {
          this.state = DOG.FETCH;
          ctx.events.emit('dog:fetch-start', { player: stick.owner, dog: this });
        } else if (name === 'done') {
          const { particles } = ctx;
          particles.emit('heart', this.x, this.y - 6, { count: 5 });
          particles.emit('spark', this.x, this.y - 4, { count: 6 });
          ctx.events.emit('dog:fetch-done', { player: stick.owner, dog: this });
        } else if (name === 'end') {
          this.state = DOG.CALM;
        }
      }
    };
  }

  activate(kind, x, y, state) {
    this.kind = this.cfg.kinds[kind];
    this.state = state;
    this.vx = this.vy = 0;
    this.hop = 0;
    this.fetch.reset();
    this.matter.body.setPosition(this.body, { x, y });
    this.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    this.world.add(this.body);
    this.sprite.setPosition(x, y).setVisible(true);
    this.active = true;
  }

  deactivate() {
    this.fetch.reset();
    this.active = false;
    this.sprite.setVisible(false);
    this.world.remove(this.body);
  }

  // Wanted velocity: the fetch decides while it is active, a chasing dog trots after the nearest player.
  wish(dt) {
    const w = this.fetch.update(this, dt, this.state === DOG.CHASE);
    if (this.fetch.active) return w;
    const out = this.fetch.out;
    out.speed = 0;
    if (this.state !== DOG.CHASE) return out;
    const p = this.ctx.nearestPlayer(this.x, this.y);
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > this.kind.stopDistance) {
      out.dx = dx / d;
      out.dy = dy / d;
      out.speed = this.kind.chaseSpeed;
    }
    return out;
  }

  update(dt) {
    const w = this.wish(dt);
    const k = Math.min(1, this.cfg.accel * dt);
    this.vx += (w.dx * w.speed - this.vx) * k;
    this.vy += (w.dy * w.speed - this.vy) * k;
    this.mv.x = this.vx / 60;
    this.mv.y = this.vy / 60;
    this.matter.body.setVelocity(this.body, this.mv);
    this.draw(dt);
  }

  draw(dt) {
    const { sprite, cfg } = this;
    const v = Math.hypot(this.vx, this.vy);
    if (v > 3) this.phase += dt * 3.2 * (v / 24);
    const frame = v > 3 ? (this.phase | 0) % 2 : 2;
    if (frame !== this.frame) { this.frame = frame; sprite.setTexture(`${cfg.texture}-${frame}`); }
    if (Math.abs(this.vx) > 3 && this.vx < 0 !== this.flip) { this.flip = this.vx < 0; sprite.setFlipX(this.flip); }
    const happy = this.fetch.phase === 'HAPPY';
    this.hop = happy ? this.hop + dt * 12 : 0;
    const lift = happy ? Math.abs(Math.sin(this.hop)) * 3 : 0;
    sprite.setPosition(this.x, this.y - lift).setDepth(this.y);
    const stick = this.fetch.stick;
    if (stick?.state === 'carried') {
      stick.x = this.x + (this.flip ? -cfg.mouth.x : cfg.mouth.x);
      stick.y = this.y + cfg.mouth.y - lift;
    }
  }
}

export class NeighborDogs {
  constructor(scene, ctx, cfg) {
    this.ctx = ctx;
    this.list = [];
    for (let i = 0; i < cfg.pool; i++) this.list.push(new FreeDog(scene, ctx, cfg));
    ctx.dogs = this;
    ctx.world.register(this);
    const self = this;
    ctx.pools.register('neighborDogs', { live: () => self.list.filter(d => d.active).length, cap: cfg.pool });
  }

  // A dog of `kind` standing at (x, y) in `state` ('CHASE' by default); null when the pool is used up.
  spawn(x, y, state = DOG.CHASE, kind = 'neighbor-dog') {
    const dog = this.list.find(d => !d.active);
    dog?.activate(kind, x, y, state);
    return dog ?? null;
  }

  unloadMap() { for (const d of this.list) if (d.active) d.deactivate(); }

  loadMap() {}

  update(dt) { for (const d of this.list) if (d.active) d.update(dt); }
}
