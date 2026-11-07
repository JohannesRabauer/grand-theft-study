// The karate belt service (story 6.4, AD-24, CAP-18): ctx.karate. The belt of every kid lives in state.players[i].karate (changed only
// through the karate.addPoints and karate.promote actions); the numbers are data/karate.json, the rules defense/beltCore.js.
//
//   beltOf(player)            the belt id ('white' ... 'blue'); statsOf(player) its data row (the effects, applied by story 6.5)
//   trainingPoints(player)    all training points so far
//   canTrain(player)          a session is left today; sessionsLeft(player) how many
//   submit(player, summary)   the karate minigame's end: stores the points (and maybe the new belt) and returns
//                             { points, promote, reason, belt, left }
//
// Events: `karate:trained` { player, score, points } after every session, `karate:belt` { player, belt } on a promotion (the Ordnung
// growth hook of data/attr-growth.json listens), `karate:celebrate` { player, belt } when the cheer is shown. The cheer (a toast with
// the belt's funny line and a confetti burst over the kid) waits until no minigame is open and the world runs again.
// The day for the daily limit is the clock's day; in freeplay (no save slot) the clock never changes day, so a counter that goes up
// whenever the first phase of a day starts stands in for it.
import { beltStats } from './defenseCore.js';
import { evaluateSession, sessionsLeft } from './beltCore.js';

export class Karate {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.freeDay = 0;
    this.pending = [];
    this.wait = 0;
    const { events } = ctx;
    events.on('phase:started', e => {
      if (ctx.day.mode === 'freeplay' && e.reason !== 'freeplay' && e.phase === ctx.day.cfg.phases[0].id) this.freeDay++;
    });
    events.on('karate:belt', e => { if (cfg.belts.some(b => b.id === e.belt)) this.pending.push(e); });
    ctx.karate = this;
  }

  #state(player) { return this.ctx.state.players[player]?.karate; }

  // Player index or Player object.
  #index(player) { return typeof player === 'number' ? player : player.index; }

  get day() { return this.ctx.day.mode === 'freeplay' ? 1 + this.freeDay : this.ctx.day.day; }

  beltOf(player) { return this.#state(this.#index(player))?.belt ?? this.cfg.defaultBelt; }

  statsOf(player) { return beltStats(this.cfg, this.beltOf(player)); }

  trainingPoints(player) { return this.#state(this.#index(player))?.points ?? 0; }

  sessionsLeft(player) {
    const k = this.#state(this.#index(player));
    return k ? sessionsLeft(this.cfg, k, this.day) : 0;
  }

  canTrain(player) { return this.sessionsLeft(player) > 0; }

  submit(player, summary) {
    const { ctx } = this;
    const k = this.#state(player);
    const { day } = this;
    const result = evaluateSession(this.cfg, k, day, summary);
    ctx.state.dispatch('karate.addPoints', { player, amount: result.points, day });
    ctx.events.emit('karate:trained', { player, score: Math.round(summary.score * 100) / 100, points: result.points });
    if (result.promote) {
      if (ctx.state.dispatch('karate.promote', { player, belt: result.promote, day })) ctx.events.emit('karate:belt', { player, belt: result.promote });
      else { result.promote = null; result.reason = 'exam-done'; }
    }
    return { ...result, belt: this.beltOf(player), left: this.sessionsLeft(player) };
  }

  // One promotion cheer at a time, the next one a few seconds later (a toast stays up for about three).
  update(dt) {
    const { ctx } = this;
    if (this.wait > 0) this.wait -= dt;
    if (!this.pending.length || this.wait > 0 || ctx.minigames.active || ctx.frozen || ctx.world.pending) return;
    const { player, belt } = this.pending.shift();
    const p = ctx.players[player];
    if (!p) return;
    this.wait = this.cfg.celebrate.stagger;
    ctx.events.emit('ui:toast', { key: `karate.belt.${belt}.line` });
    ctx.particles.emit('confetti', p.x, p.y - 10, { count: this.cfg.celebrate.confetti });
    ctx.events.emit('karate:celebrate', { player, belt });
  }
}
