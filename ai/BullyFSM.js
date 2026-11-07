// Bully state machine (AD-12): IDLE, CHASE, SEARCH, DISTRACTED, GIVE_UP, CAUGHT.
// One stateless instance drives every bully; per-bully data lives on the Bully (state, t, lastX/Y).
// Numbers come from data/chase.json `bully`. A bully's target is the nearest player it sees (`b.target`);
// CAUGHT only stops the bully (the director has already emitted `bully:caught-contact`).
export const S = { IDLE: 'IDLE', CHASE: 'CHASE', SEARCH: 'SEARCH', DISTRACTED: 'DISTRACTED', GIVE_UP: 'GIVE_UP', CAUGHT: 'CAUGHT' };

export class BullyFSM {
  constructor(director) {
    this.d = director;
    this.cfg = director.cfg.bully;
  }

  enter(b, state) {
    b.state = state;
    b.t = 0;
    if (state === S.GIVE_UP) {
      const p = this.d.farSpawn();
      b.targetX = p.x;
      b.targetY = p.y;
    }
  }

  update(b, dt) {
    const { ctx } = this.d;
    const c = this.cfg;
    b.t += dt;
    const target = b.state !== S.CAUGHT && b.state !== S.GIVE_UP ? this.nearestVisible(b) : null;
    b.target = target;
    b.sees = target !== null;
    // A freshly spawned bully was called to where the player was; it does not give up on the way,
    // only once it is within viewing distance does sight decide.
    if (b.alerted) {
      const near = ctx.nearestPlayer(b.x, b.y);
      if (Math.hypot(near.x - b.x, near.y - b.y) <= this.d.cfg.perception.viewDistance) b.alerted = false;
    }
    if (target) {
      b.lastX = target.x;
      b.lastY = target.y;
    }
    if (b.sees || b.alerted) b.lost = 0;
    else b.lost += dt;

    switch (b.state) {
      case S.IDLE: // a short beat after spawning, then it comes for the player
        b.stop();
        if (b.t >= c.idleSeconds || b.sees) this.enter(b, S.CHASE);
        break;
      case S.CHASE:
        if (b.sees) b.goTo(b.target.x, b.target.y);
        else {
          b.goTo(b.lastX, b.lastY);
          if (b.lost >= c.loseSightSeconds) this.enter(b, S.SEARCH);
        }
        break;
      case S.SEARCH: // walk to where the player was last seen, look around, give up after a while
        if (b.sees) { this.enter(b, S.CHASE); break; }
        b.goTo(b.lastX, b.lastY);
        if (b.t >= c.searchSeconds) this.enter(b, S.GIVE_UP);
        break;
      case S.DISTRACTED:
        if (b.sees) { this.enter(b, S.CHASE); break; }
        b.goTo(b.targetX, b.targetY);
        if (b.t >= c.distractSeconds) this.enter(b, S.SEARCH);
        break;
      case S.GIVE_UP: // walk off to the farthest spawn point, vanish once out of view
        b.goTo(b.targetX, b.targetY);
        if ((b.t >= c.giveUpMinSeconds && !this.d.onScreen(b.x, b.y, c.despawnMargin)) || b.t >= c.giveUpMaxSeconds) this.d.despawn(b, 'gave-up');
        break;
      default: // CAUGHT
        b.stop();
    }
  }

  // The nearest player this bully can see right now, or null.
  nearestVisible(b) {
    const chasing = b.state === S.CHASE;
    const players = this.d.ctx.alivePlayers();
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!this.d.perception.sees(b, p, chasing)) continue;
      const d = (p.x - b.x) * (p.x - b.x) + (p.y - b.y) * (p.y - b.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  // A prop was hit at (x, y) (radius: how far it is heard, default distractRadius): bullies in range that are not watching the player go and look.
  distract(b, x, y, radius) {
    const c = this.cfg;
    if (b.state === S.CAUGHT || b.state === S.GIVE_UP) return false;
    if (b.sees && !c.distractWhileSeen) return false;
    if (Math.hypot(x - b.x, y - b.y) > (radius ?? c.distractRadius)) return false;
    b.targetX = x;
    b.targetY = y;
    this.enter(b, S.DISTRACTED);
    return true;
  }
}
