// Dog fetch (story 6.1, AD-24): the behaviour that turns a chasing dog into a happy retriever when its player throws a stick.
// Phaser-free: `DogFetch` decides what the dog does from plain data and reports through hooks; entities/NeighborDogs.js is the
// glue that moves a body and draws. Reusable by any dog that can chase (epic 7's neighbor dog). Nothing here can hurt a dog.
//
// States: IDLE -> GO (run to the stick) -> RETURN (carry it back to the thrower) -> HAPPY (drops it near them, celebrates)
// -> IDLE. A stick is a plain object `{ owner, state, x, y }` (tools/ThrowingStick.js): 'landed' ones can be fetched. If the owner picks
// the stick up first, or a fetch takes longer than `giveUp` seconds, the dog drops out of it.
export const F = { IDLE: 'IDLE', GO: 'GO', RETURN: 'RETURN', HAPPY: 'HAPPY' };

export class DogFetch {
  // cfg: { range, pickup, dropDistance, speed, returnSpeed, happy, giveUp }
  // hooks: sticks() -> list, owner(stick) -> { x, y } | null, take(stick, dog), drop(stick, x, y), emit(name, stick)
  // (names: 'start', 'pickup', 'done' when the stick is back, 'end' when the dog is free again)
  constructor(cfg, hooks) {
    this.cfg = cfg;
    this.hooks = hooks;
    this.phase = F.IDLE;
    this.stick = null;
    this.dog = null;
    this.t = 0;
    this.out = { dx: 0, dy: 0, speed: 0 }; // wanted movement: unit direction and speed (0 = stand)
  }

  get active() { return this.phase !== F.IDLE; }

  // Nearest landed stick of anyone that nobody else is after, within `range` of the dog.
  find(dog) {
    let best = null;
    let bestD = this.cfg.range;
    for (const s of this.hooks.sticks()) {
      if (s.state !== 'landed' || s.dog) continue;
      const d = Math.hypot(s.x - dog.x, s.y - dog.y);
      if (d <= bestD) { bestD = d; best = s; }
    }
    return best;
  }

  // One step for `dog` ({ x, y }); `chasing` says whether it may start a fetch. Returns the wanted movement (`out`).
  update(dog, dt, chasing) {
    const { cfg, hooks, out } = this;
    out.speed = 0;
    if (this.phase === F.IDLE) {
      if (!chasing) return out;
      const s = this.find(dog);
      if (!s) return out;
      this.stick = s;
      this.dog = dog;
      s.dog = dog;
      this.phase = F.GO;
      this.t = cfg.giveUp;
      hooks.emit('start', s);
    }
    const s = this.stick;
    if (this.phase === F.HAPPY) {
      if ((this.t -= dt) <= 0) this.finish();
      return out;
    }
    if (this.phase === F.GO) {
      if (s.state !== 'landed' || (this.t -= dt) <= 0) { this.finish(); return out; }
      if (this.head(dog, s.x, s.y, cfg.speed, cfg.pickup)) {
        hooks.take(s, dog);
        this.phase = F.RETURN;
        this.t = cfg.giveUp;
        hooks.emit('pickup', s);
      }
      return out;
    }
    const owner = hooks.owner(s);
    if (!owner || (this.t -= dt) <= 0) { // the thrower is gone: leave the stick where the dog stands
      hooks.drop(s, dog.x, dog.y);
      this.finish();
      return out;
    }
    if (this.head(dog, owner.x, owner.y, cfg.returnSpeed, cfg.dropDistance)) {
      // dropped on the near side, so the thrower does not have to walk through the dog
      const d = Math.hypot(dog.x - owner.x, dog.y - owner.y) || 1;
      hooks.drop(s, owner.x + ((dog.x - owner.x) / d) * cfg.dropDistance * 0.9, owner.y + ((dog.y - owner.y) / d) * cfg.dropDistance * 0.9);
      this.phase = F.HAPPY;
      this.t = cfg.happy;
      hooks.emit('done', s);
    }
    return out;
  }

  // Set `out` to run at (tx, ty); true once within `reach` of it.
  head(dog, tx, ty, speed, reach) {
    const dx = tx - dog.x;
    const dy = ty - dog.y;
    const d = Math.hypot(dx, dy);
    if (d <= reach) return true;
    this.out.dx = dx / d;
    this.out.dy = dy / d;
    this.out.speed = speed;
    return false;
  }

  finish() {
    this.release();
    this.hooks.emit('end', this.stick);
    this.stick = null;
    this.phase = F.IDLE;
  }

  reset() {
    this.release();
    this.stick = null;
    this.phase = F.IDLE;
  }

  // The claim on the stick goes (only if it is still ours).
  release() {
    if (this.stick?.dog === this.dog) this.stick.dog = null;
  }
}
