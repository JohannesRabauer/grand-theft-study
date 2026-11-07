// Base of every HUD module (AD-27): bound to one player (`opts.playerIndex`) or to shared state (`opts.shared`).
// A module builds its objects in the constructor, redraws only when its inputs change (events or a cheap
// key compare in update), re-resolves its texts in retext() and releases everything in destroy().
export class HudModule {
  constructor(scene, ctx, opts = {}) {
    this.scene = scene;
    this.ctx = ctx;
    this.playerIndex = opts.playerIndex ?? null;
    this.subs = [];
    this.objects = [];
  }

  // The players array arrives with story 1.5; until then every player index resolves to ctx.player.
  get player() { return this.ctx.player; }

  on(event, fn) {
    this.ctx.events.on(event, fn);
    this.subs.push([event, fn]);
  }

  track(o) { this.objects.push(o); return o; }

  update() {}

  retext() {}

  destroy() {
    for (const [e, fn] of this.subs) this.ctx.events.off(e, fn);
    this.subs.length = 0;
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
