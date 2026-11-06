import { Slingshot } from './Slingshot.js';

// Holds the tools and cycles through them with the toolNext / toolPrev intents. Exposed as
// ctx.toolbelt; emits `tool:changed` { id }. Only the slingshot exists so far.
export class ToolBelt {
  constructor(scene, ctx, cfg) {
    this.ctx = ctx;
    this.tools = [new Slingshot(scene, ctx, cfg)];
    this.index = 0;
    ctx.toolbelt = this;
    this.current.equip();
  }

  get current() { return this.tools[this.index]; }

  cycle(step) {
    const n = this.tools.length;
    if (n < 2) return;
    this.current.unequip();
    this.index = (this.index + step + n) % n;
    this.current.equip();
    this.ctx.events.emit('tool:changed', { id: this.current.id });
  }

  update(dt) {
    const i = this.ctx.input.intent;
    if (i.toolNext) this.cycle(1);
    if (i.toolPrev) this.cycle(-1);
    // every tool updates so shots in flight finish after a switch
    for (const t of this.tools) t.update(dt, i, t === this.current);
  }
}
