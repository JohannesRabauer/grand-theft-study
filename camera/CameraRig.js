// Co-op camera rig (AD-18), Phaser-free. Each frame it turns the players into what GameScene's camera
// pipeline follows: `focus` { x, y, speed, zoomCap }. The camera still eases and springs exactly as for one
// player (GameScene.followCamera / updateZoom); the rig only supplies the target centre and, with two
// players, a zoom cap that keeps everyone within the margin (the speed zoom and the cap both hold, see
// effectiveZoom). It also runs the tether, writing the speed factor and pull into each player's MovementController,
// and publishes `ctx.coop` { active, distance, tetherRatio }. With one player the focus is that player, the
// cap is Infinity and nothing else is touched.
import { weightedCenter, fitZoom } from './rigMath.js';
import { Tether } from './tetherMath.js';

export class CameraRig {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.focus = { x: 0, y: 0, speed: 0, vx: 0, vy: 0, zoomCap: Infinity };
    this.view = { w: ctx.res.w, h: ctx.res.h };
    this.tether = new Tether(cfg.tether, ctx.res.w / ctx.res.h);
    this.zoomMin = cfg.ladder && ctx.res.scale >= 2 ? cfg.ladder.steps[cfg.ladder.steps.length - 1] : cfg.min; // the lowest zoom stop of the tier
    ctx.coop = { active: false, distance: 0, tetherRatio: 0 };
  }

  update(dt) {
    const { ctx, cfg, focus } = this;
    const players = ctx.players;
    focus.speed = 0;
    focus.vx = focus.vy = 0;
    for (const p of players) {
      focus.speed = Math.max(focus.speed, p.move.velSpeed);
      focus.vx += p.move.vel.x / players.length; // the camera look-ahead (story 16.13) aims along the mean velocity
      focus.vy += p.move.vel.y / players.length;
    }
    weightedCenter(focus, players, cfg.coop.pinnedWeight);
    const coop = ctx.coop;
    coop.active = players.length > 1;
    if (!coop.active) { focus.zoomCap = Infinity; return; }
    focus.zoomCap = fitZoom(players, focus.x, focus.y, this.view, cfg.coop.fitMargin, this.zoomMin, cfg.max);
    const [a, b] = players;
    const th = this.tether;
    const intents = ctx.input.intents;
    th.update(dt, a, b, intents[0].move, intents[1].move);
    coop.distance = th.distance;
    coop.tetherRatio = th.ratio;
    for (let i = 0; i < 2; i++) {
      const mv = players[i].move;
      mv.tetherMult = th.speed[i];
      mv.nudgeX = th.pullX[i];
      mv.nudgeY = th.pullY[i];
    }
  }
}
