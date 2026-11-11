import { cycleStep, bobAt, squashAt } from '../camera/motionMath.js';

// Body motion of the kids (story 16.13, data/motion.json). On foot the walk and run cycles pick the in-between frames of the
// character texture (`<look>-wa`/`-wb` walk strides, `-ra`/`-rb` run strides, the standing figure between them; the same
// figure, only legs and arms move) and the body bobs by whole pixels; an idle kid breathes. The bike alternates its pedal
// frames (`<look>-pa`/`-pb`). Jumps (the ollie, a ramp), the bike bell and mounting squash and stretch the sprite for a
// moment. Skateboard and skates choose their own push poses (entities/Skateboards.js). reducedMotion keeps the stride
// frames but drops bob, breathing and squash. Runs after the vehicle systems, so it adds to the sprite position they set.
const FRAME = { foot: ['wa', 'wb', 'ra', 'rb'], bike: ['pa', 'pb'] };

// The sprite shows this body (the standing figure or one of its frames) and no other system's pose (karate, board) has taken over.
const owns = (cur, keys) => keys.includes(cur);

export class PlayerMotion {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.slots = [];
    this.keys = new Map();
    this.has = new Map(); // texture key -> exists, so the per-frame lookup never touches the texture manager twice
    const { events } = ctx;
    events.on('trick:ollie', ev => this.squash(ev.player, ev.phase === 'start' ? 'rideJump' : 'rideLand'));
    events.on('trick:ramp', ev => this.squash(ev.player, ev.phase === 'end' ? 'rideLand' : 'rideJump'));
    events.on('bike:bell', ev => this.squash(ev.player, 'hop'));
    events.on('player:vehicle', ev => this.squash(ev.player, ev.id === 'foot' ? 'land' : 'hop'));
  }

  slot(i) {
    return this.slots[i] ?? (this.slots[i] = { phase: 0, life: 0, sq: null, t: 0, scaled: false, out: { sx: 1, sy: 1 } });
  }

  squash(i, id) {
    if (i === undefined || this.ctx.motion.reduced) return;
    const s = this.slot(i);
    s.sq = this.cfg.squash[id];
    s.t = 0;
  }

  // The standing key and the frame keys of a body, built once per texture: [base, base-wa, ...].
  keysOf(base, frames) {
    const id = base + '|' + frames[0];
    let k = this.keys.get(id);
    if (!k) this.keys.set(id, k = [base, ...frames.map(f => `${base}-${f}`)]);
    return k;
  }

  exists(key) {
    let v = this.has.get(key);
    if (v === undefined) this.has.set(key, v = this.scene.textures.exists(key));
    return v;
  }

  update(dt) {
    const { cfg } = this;
    const reduced = this.ctx.motion.reduced;
    for (const p of this.ctx.players) {
      if (p.pinned) continue;
      const s = this.slot(p.index);
      const sprite = p.sprite;
      const speed = p.move.velSpeed;
      const inv = this.ctx.res.inv;
      if (reduced) s.sq = null;
      const k0 = p.character?.spriteScale ?? 1; // the character's own size (the younger kid is a bit smaller)
      let sx = 1;
      let sy = 1;
      if (p.vehicle === 'foot') {
        const base = p.textureFor(p.profiles.foot);
        const keys = this.keysOf(base, FRAME.foot);
        const mine = owns(sprite.texture.key, keys);
        const moving = mine && speed > cfg.cycle.moveFrom;
        const run = speed >= cfg.cycle.runFrom;
        let key = base;
        if (moving) {
          s.phase += (speed * dt) / (run ? cfg.cycle.runStepLen : cfg.cycle.stepLen);
          const step = cycleStep(s.phase);
          if (step % 2 === 0) key = keys[1 + (run ? 2 : 0) + step / 2];
          if (!reduced) sprite.y -= Math.round(bobAt(s.phase, cfg.cycle.bob));
        } else {
          s.phase = 0;
          if (mine && !reduced && Math.sin((s.life += dt) * cfg.breathe.rate * 2 * Math.PI) > cfg.breathe.above) sprite.y -= 1; // one whole base px up on the in-breath: no resampled pixels
        }
        if (mine) {
          if (!this.exists(key)) key = base;
          if (sprite.texture.key !== key) sprite.setTexture(key);
        }
      } else if (p.vehicle === 'bike') {
        const base = p.textureFor(p.profiles.bike);
        const keys = this.keysOf(base, FRAME.bike);
        if (owns(sprite.texture.key, keys)) {
          let key = base;
          if (speed > cfg.cycle.moveFrom) {
            s.phase += (speed * dt) / cfg.cycle.bike.stepLen;
            key = keys[1 + (Math.floor(s.phase) & 1)];
          }
          if (!this.exists(key)) key = base;
          if (sprite.texture.key !== key) sprite.setTexture(key);
        }
      }
      if (s.sq) {
        s.t += dt;
        if (s.t >= s.sq.time) s.sq = null; else { squashAt(s.sq, s.t, s.out); sx = s.out.sx; sy *= s.out.sy; }
      }
      if (sx !== 1 || sy !== 1) { sprite.setScale(inv * k0 * sx, inv * k0 * sy); s.scaled = true; }
      else if (s.scaled) { sprite.setScale(inv * k0); s.scaled = false; }
    }
  }
}
