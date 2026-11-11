// ctx.motion (story 16.13): the reducedMotion switch plus the camera shake and hit-stop presets. GameScene reads `shakeX`
// and `shakeY` (whole base px) after the camera snap and `timeScale()` for the frame's delta; systems and events ask for a
// preset by id. With reducedMotion on (data default or the saved flag, set through the `settings.reducedMotion` action)
// there is no shake and no hit-stop, and the other users (PlayerMotion, look-ahead) read `reduced` too.
import { shakeAt } from './motionMath.js';

export class Motion {
  constructor(ctx, cfg, game = null) {
    this.ctx = ctx;
    this.game = game;
    this.cfg = cfg;
    this.shakeId = null;
    this.shakeT = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.stopT = 0;
    this.stopScale = 1;
    this.off = { x: 0, y: 0 };
    ctx.motion = this;
    for (const [name, rule] of Object.entries(cfg.events)) {
      ctx.events.on(name, ev => {
        if (rule.phase && ev?.phase !== rule.phase) return;
        if (rule.shake) this.shake(rule.shake);
        if (rule.hitStop) this.hitStop(rule.hitStop);
      });
    }
  }

  // Test hook game.motionFxOff: the seeded smoke runs keep shake and hit-stop off (the `motion` scenario turns them on).
  get fxOff() { return !!this.game?.motionFxOff; }

  get reduced() {
    const f = this.ctx.state.shared.flags.reducedMotion;
    return typeof f === 'boolean' ? f : this.cfg.reducedMotion;
  }

  shake(id) {
    if (this.reduced || this.fxOff || !this.cfg.shake[id]) return;
    const cur = this.cfg.shake[this.shakeId];
    if (cur && this.shakeT < cur.time && cur.amp > this.cfg.shake[id].amp) return; // a stronger shake keeps going
    this.shakeId = id;
    this.shakeT = 0;
  }

  hitStop(id) {
    const p = this.cfg.hitStop[id];
    if (this.reduced || this.fxOff || !p) return;
    this.stopT = Math.max(this.stopT, p.time);
    this.stopScale = p.scale;
  }

  // Real seconds in, game-time factor out: 1, or the preset scale while a hit-stop runs.
  timeScale(realDt) {
    if (this.reduced) this.stopT = 0;
    if (this.stopT <= 0) return 1;
    this.stopT = Math.max(0, this.stopT - realDt);
    return this.stopScale;
  }

  update(dt) {
    if (this.reduced) this.shakeId = null; // switched on while a shake runs: it stops
    if (!this.shakeId) { this.shakeX = this.shakeY = 0; return; }
    this.shakeT += dt;
    shakeAt(this.cfg.shake[this.shakeId], this.shakeT, this.off);
    this.shakeX = this.off.x;
    this.shakeY = this.off.y;
    if (this.shakeT >= this.cfg.shake[this.shakeId].time) { this.shakeId = null; this.shakeX = this.shakeY = 0; }
  }
}
