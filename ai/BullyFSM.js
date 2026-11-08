// Bully state machine (AD-12): IDLE, CHASE, SEARCH, DISTRACTED, GIVE_UP, CAUGHT, and STUMBLE (story 6.3, AD-24: a comic scripted step back
// after a block or a Kiai, no force and no damage; afterwards the bully goes on in `b.resume`).
// One stateless instance drives every bully; per-bully data lives on the Bully (state, t, lastX/Y).
// Numbers come from data/chase.json `bully`. A bully's target is the visible player with the best targetScore
// (nearest, but a player's bullyWeight makes it count as closer: Helena draws bullies more often) (`b.target`), with hysteresis
// (data `coop.switchRatio`) so it sticks to its target; `b.seenMask` has a bit for every player it sees (not only the target);
// CAUGHT only stops the bully (the director has already emitted `bully:caught-contact`).
import { targetScore } from '../characters/attributes.js';
import { interceptPoint, pickTarget } from './chaseLogic.js';

export const S = { IDLE: 'IDLE', CHASE: 'CHASE', SEARCH: 'SEARCH', DISTRACTED: 'DISTRACTED', GIVE_UP: 'GIVE_UP', CAUGHT: 'CAUGHT', STUMBLE: 'STUMBLE' };

export class BullyFSM {
  constructor(director) {
    this.d = director;
    this.cfg = director.cfg.bully;
    this.switchRatio = director.cfg.coop.switchRatio;
    this.scores = new Float64Array(director.ctx.maxPlayers);
    this.aim = { x: 0, y: 0 }; // the gang intercept point of the bully being updated (story 7.1), reused so nothing is allocated per frame
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
    if (!target) b.seenMask = 0;
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
        if (b.sees) this.approach(b);
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
      case S.STUMBLE:
        b.stop();
        b.stumbleStep(dt);
        if (b.t >= b.stumbleDuration) this.enter(b, b.resume);
        break;
      default: // CAUGHT
        b.stop();
    }
  }

  // The way a bully that sees its target comes: straight, or from the gang level on to its own intercept point (story 7.1).
  approach(b) {
    const gang = this.d.cfg.gang;
    const t = b.target;
    if (!gang || this.d.lvl.level < gang.fromLevel) { b.goTo(t.x, t.y); return; }
    let slot = 0;
    for (const o of this.d.pool.list) { if (o === b) break; if (o.active && o.state !== S.GIVE_UP) slot++; }
    b.slot = slot;
    const v = t.body.velocity;
    interceptPoint(gang, slot, t.x, t.y, v.x, v.y, b.x, b.y, this.aim);
    b.aimX = this.aim.x;
    b.aimY = this.aim.y;
    b.goTo(this.aim.x, this.aim.y);
  }

  // Send a bully stumbling away from (fromX, fromY): `o` = { duration, step, distance }. It picks up its old business afterwards
  // (a bully that had just spawned starts chasing). A stumble in progress restarts but keeps what comes after it.
  stumble(b, fromX, fromY, o) {
    if (b.state === S.CAUGHT || b.state === S.GIVE_UP) return false;
    const resume = b.state === S.STUMBLE ? b.resume : b.state === S.IDLE ? S.CHASE : b.state;
    this.enter(b, S.STUMBLE);
    b.resume = resume;
    b.beginStumble(fromX, fromY, o);
    return true;
  }

  // The preferred player this bully can see right now (best targetScore, sticking to the current target), or null.
  nearestVisible(b) {
    const chasing = b.state === S.CHASE;
    const players = this.d.ctx.alivePlayers();
    const { scores } = this;
    scores.fill(Infinity);
    b.seenMask = 0;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!this.d.perception.sees(b, p, chasing)) continue;
      b.seenMask |= 1 << p.index;
      scores[p.index] = targetScore((p.x - b.x) * (p.x - b.x) + (p.y - b.y) * (p.y - b.y), p.bullyWeight);
    }
    const pick = pickTarget(scores, scores.length, b.target ? b.target.index : -1, this.switchRatio);
    return pick < 0 ? null : this.d.ctx.players[pick];
  }

  // A prop was hit at (x, y) (radius: how far it is heard, default distractRadius): bullies in range that are not watching the player go and look.
  distract(b, x, y, radius) {
    const c = this.cfg;
    if (b.state === S.CAUGHT || b.state === S.GIVE_UP || b.state === S.STUMBLE) return false;
    if (b.sees && !c.distractWhileSeen) return false;
    if (Math.hypot(x - b.x, y - b.y) > (radius ?? c.distractRadius)) return false;
    b.targetX = x;
    b.targetY = y;
    this.enter(b, S.DISTRACTED);
    return true;
  }
}
